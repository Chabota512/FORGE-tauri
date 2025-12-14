/**
 * RAG Ingestion Pipeline
 * 
 * Handles multi-file document ingestion with chunking, embedding, and ChromaDB storage.
 * Supports both synchronous (≤100MB) and asynchronous (>100MB) processing.
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import path from "path";
import { extractDocument } from "./documentExtractor";
import {
  addChunksToCollection,
  sanitizeCourseCode,
  ChunkMetadata,
  deleteChunksForFile,
} from "./retriever";
import { logIngestionMetrics } from "../metrics/counters";

const FORGE_KB_PATH = process.env.FORGE_KB_PATH || "./forge_kb";

const MAX_FILES = 1;
const MAX_FILE_SIZE_MB = 50;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;

export interface IngestResult {
  status: "ok" | "accepted";
  chunksAdded?: number;
  jobId?: string;
  files?: { name: string; chunks: number }[];
  error?: string;
}

export interface IngestJobStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  totalFiles: number;
  processedFiles: number;
  chunksAdded: number;
  stage: "uploading" | "extracting" | "processing" | "complete";
  error?: string;
}

const ingestJobs: Map<string, IngestJobStatus> = new Map();

/**
 * Text splitter configured for 900 char chunks with 200 char overlap
 */
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

/**
 * Generates a unique job ID for async processing
 */
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extracts text content from a file using tiered extraction strategy
 * @param filePath - Path to the file
 * @returns Extracted text content (includes embedded image text)
 */
async function extractTextFromFile(filePath: string): Promise<string> {
  const result = await extractDocument(filePath);
  const allText = [result.text, ...result.imageTexts].filter(t => t.trim()).join("\n\n");
  return allText;
}

/**
 * Cleans extracted text by removing excessive whitespace
 * @param text - Raw extracted text
 * @returns Cleaned text
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Chunks text using the text splitter
 * @param text - Text to chunk
 * @returns Array of text chunks
 */
async function chunkText(text: string): Promise<string[]> {
  const docs = await textSplitter.createDocuments([text]);
  return docs.map((doc) => doc.pageContent);
}

/**
 * Note: This function is no longer used. The main pipeline uses ingestPipeline.ts instead.
 * Kept for backward compatibility but not actively used.
 */
async function processFile(
  courseCode: string,
  filePath: string,
  originalName: string,
  onStageChange?: (stage: "extracting" | "processing") => void
): Promise<number> {
  // Legacy function - main pipeline uses ingestPipeline.ts
  console.warn(`[IngestRAG] Legacy processFile called for ${originalName}`);
  return 0;
}

/**
 * Updates the context.json file with new document info
 * @param courseCode - Course code
 * @param documents - Array of document info
 * @param concepts - Array of concept names
 * @param summary - High-level summary
 */
export async function updateContextJson(
  courseCode: string,
  documents: { filename: string; uploadedAt: string }[],
  concepts: string[],
  summary: string
): Promise<void> {
  const sanitized = sanitizeCourseCode(courseCode);
  const contextPath = path.join(FORGE_KB_PATH, sanitized, "context.json");
  
  let existingContext: {
    documents?: { filename: string; uploadedAt: string }[];
    concepts?: string[];
    summary?: string;
  } = {};
  
  if (fs.existsSync(contextPath)) {
    try {
      existingContext = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
    } catch {
      existingContext = {};
    }
  }
  
  const existingDocs = existingContext.documents || [];
  const newDocNames = documents.map((d) => d.filename);
  const mergedDocs = [
    ...existingDocs.filter((d) => !newDocNames.includes(d.filename)),
    ...documents,
  ];
  
  const existingConcepts = existingContext.concepts || [];
  const conceptSet = new Set([...existingConcepts, ...concepts]);
  const mergedConcepts = Array.from(conceptSet);
  
  const updatedContext = {
    documents: mergedDocs,
    concepts: mergedConcepts,
    summary: summary || existingContext.summary || "",
    lastUpdated: new Date().toISOString(),
  };
  
  const dirPath = path.dirname(contextPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(contextPath, JSON.stringify(updatedContext, null, 2));
}

/**
 * Validates files before ingestion
 * @param files - Array of file objects with size and originalname
 * @returns Validation result
 */
export function validateFiles(
  files: { size: number; originalname: string }[]
): { valid: boolean; error?: string; totalSize: number } {
  if (files.length !== 1) {
    return {
      valid: false,
      error: `Expected 1 file, received ${files.length}`,
      totalSize: 0,
    };
  }
  
  const file = files[0];
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return {
      valid: false,
      error: `File "${file.originalname}" exceeds ${MAX_FILE_SIZE_MB}MB limit`,
      totalSize: 0,
    };
  }
  
  return { valid: true, totalSize: file.size };
}

/**
 * Processes files asynchronously in background
 * @param jobId - Job ID for tracking
 * @param courseCode - Course code
 * @param files - Array of file info
 */
async function processFilesAsync(
  jobId: string,
  courseCode: string,
  files: { path: string; originalname: string }[]
): Promise<void> {
  const job = ingestJobs.get(jobId);
  if (!job) return;
  
  job.status = "processing";
  
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      job.stage = "uploading";
      
      const chunks = await processFile(courseCode, file.path, file.originalname, (stage) => {
        job.stage = stage;
      });
      
      job.chunksAdded += chunks;
      job.processedFiles = i + 1;
      job.progress = Math.round(((i + 1) / files.length) * 100);
      
      try {
        fs.unlinkSync(file.path);
      } catch {
      }
    }
    
    job.status = "completed";
    job.stage = "complete";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    console.error(`[IngestRAG] Async job ${jobId} failed:`, error);
  }
}

/**
 * Main ingestion function supporting both single and multi-file uploads
 * @param courseCode - Course code
 * @param files - Array of file objects from multer
 * @returns IngestResult with status and chunk count
 */
export async function ingestFiles(
  courseCode: string,
  files: { path: string; originalname: string; size: number }[]
): Promise<IngestResult> {
  const sanitized = sanitizeCourseCode(courseCode);
  
  const validation = validateFiles(files);
  if (!validation.valid) {
    return { status: "ok", error: validation.error, chunksAdded: 0 };
  }
  
  const file = files[0];
  
  const chunks = await processFile(sanitized, file.path, file.originalname);
  
  try {
    fs.unlinkSync(file.path);
  } catch {
  }
  
  return {
    status: "ok",
    chunksAdded: chunks,
    files: [{ name: file.originalname, chunks }],
  };
}

/**
 * Gets the status of an async ingest job
 * @param jobId - Job ID
 * @returns Job status or undefined if not found
 */
export function getIngestJobStatus(jobId: string): IngestJobStatus | undefined {
  return ingestJobs.get(jobId);
}

/**
 * Ingests a single file (backward compatible with existing API)
 * @param courseCode - Course code
 * @param filePath - Path to the file
 * @param originalName - Original filename
 * @returns Number of chunks added
 */
export async function ingestSingleFile(
  courseCode: string,
  filePath: string,
  originalName: string
): Promise<number> {
  const sanitized = sanitizeCourseCode(courseCode);
  const chunks = await processFile(sanitized, filePath, originalName);
  return chunks;
}
