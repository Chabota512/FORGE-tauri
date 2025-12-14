/**
 * Unified Ingestion Pipeline
 * 
 * Orchestrates the complete document processing flow:
 * 1. Upload + Store → File stored in database as base64
 * 2. Extract + Clean → Parse document, clean text
 * 3. Chunking → Split into semantic chunks
 * 4. Embedding & Storage → Generate embeddings, store in database
 * 5. Context Update → Update course context in database
 * 6. Distribution → Refresh downstream caches
 */

import { db } from "../db";
import { uploadedFiles, courseContexts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { extractDocumentFromBuffer } from "./documentExtractor";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { addChunksToCollection, ChunkMetadata } from "./retriever";
import { extractConcepts, isGeminiConfigured } from "./gemini";
import { logIngestionMetrics } from "../metrics/counters";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;

// Mutex locks per course code to prevent race conditions during context updates
const contextUpdateLocks = new Map<string, Promise<void>>();

export type PipelineStage = 
  | "uploaded"
  | "extracting" 
  | "chunking" 
  | "embedding" 
  | "updating_context"
  | "distributing"
  | "completed"
  | "failed";

export interface PipelineProgress {
  fileId: number;
  stage: PipelineStage;
  stageProgress: number;
  totalStages: number;
  currentStageIndex: number;
  error?: string;
}

const STAGE_ORDER: PipelineStage[] = [
  "uploaded",
  "extracting",
  "chunking",
  "embedding",
  "updating_context",
  "distributing",
  "completed"
];

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

async function updateFileStage(
  fileId: number, 
  stage: PipelineStage, 
  progress: number = 0,
  additionalData: Record<string, any> = {}
): Promise<void> {
  await db.update(uploadedFiles)
    .set({ 
      stage, 
      stageProgress: progress,
      ...additionalData 
    })
    .where(eq(uploadedFiles.id, fileId));
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export async function loadContextForCourse(courseCode: string, userId?: number): Promise<{ concepts: any[]; summary: string; lastUpdated?: string }> {
  try {
    const whereCondition = userId 
      ? and(eq(courseContexts.courseCode, courseCode), eq(courseContexts.userId, userId))
      : eq(courseContexts.courseCode, courseCode);
    
    const [context] = await db.select().from(courseContexts).where(whereCondition).limit(1);
    
    if (context) {
      return {
        concepts: context.concepts ? JSON.parse(context.concepts) : [],
        summary: context.summary || "",
        lastUpdated: context.updatedAt || undefined
      };
    }
  } catch (error) {
    console.error(`[Pipeline] Failed to load context for ${courseCode}:`, error);
  }
  return { concepts: [], summary: "" };
}

export async function saveContextForCourse(
  courseCode: string, 
  userId: number | undefined, 
  concepts: any[], 
  summary: string, 
  sourceFile?: string
): Promise<void> {
  try {
    const whereCondition = userId 
      ? and(eq(courseContexts.courseCode, courseCode), eq(courseContexts.userId, userId))
      : eq(courseContexts.courseCode, courseCode);
    
    const [existing] = await db.select().from(courseContexts).where(whereCondition).limit(1);
    
    if (existing) {
      await db.update(courseContexts)
        .set({
          concepts: JSON.stringify(concepts),
          summary,
          sourceFile,
          updatedAt: new Date().toISOString()
        })
        .where(eq(courseContexts.id, existing.id));
    } else {
      await db.insert(courseContexts).values({
        userId: userId || null,
        courseCode,
        concepts: JSON.stringify(concepts),
        summary,
        sourceFile,
        updatedAt: new Date().toISOString()
      });
    }
    console.log(`[Pipeline] Saved context to database for ${courseCode}`);
  } catch (error) {
    console.error(`[Pipeline] Failed to save context for ${courseCode}:`, error);
  }
}

/**
 * Acquires a lock for context updates for a specific course
 * Ensures only one file updates context.json at a time
 */
async function acquireContextLock(courseCode: string): Promise<void> {
  const existingLock = contextUpdateLocks.get(courseCode);
  if (existingLock) {
    await existingLock;
  }
  
  let resolveLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  
  contextUpdateLocks.set(courseCode, newLock);
  
  // Return a function that releases the lock
  return new Promise<void>((resolve) => {
    resolve();
    contextUpdateLocks.set(courseCode, Promise.resolve());
  });
}

/**
 * Run the complete ingestion pipeline for a file
 */
export async function runPipeline(
  fileId: number,
  userId: number,
  onProgress?: (progress: PipelineProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  
  try {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId));
    if (!file) {
      throw new Error("File not found");
    }

    if (!file.fileData) {
      throw new Error("File data not found in database");
    }

    const emitProgress = (stage: PipelineStage, stageProgress: number) => {
      if (onProgress) {
        onProgress({
          fileId,
          stage,
          stageProgress,
          totalStages: STAGE_ORDER.length - 1,
          currentStageIndex: STAGE_ORDER.indexOf(stage),
        });
      }
    };

    // Stage 1: Extract + Clean
    console.log(`[Pipeline] Stage 1: Extracting ${file.originalName}`);
    await updateFileStage(fileId, "extracting", 0);
    emitProgress("extracting", 0);

    // Decode base64 file data and extract document
    const fileBuffer = Buffer.from(file.fileData, "base64");
    const extractResult = await extractDocumentFromBuffer(fileBuffer, file.originalName, file.mimeType || "application/octet-stream");
    const allText = [extractResult.text, ...extractResult.imageTexts].filter(t => t.trim()).join("\n\n");
    const cleanedText = cleanText(allText);

    if (!cleanedText || cleanedText.length < 50) {
      throw new Error("Insufficient text content extracted from document");
    }

    await updateFileStage(fileId, "extracting", 100, { extractedText: cleanedText });
    emitProgress("extracting", 100);
    console.log(`[Pipeline] Extracted ${cleanedText.length} chars from ${file.originalName}`);

    // Stage 2: Chunking
    console.log(`[Pipeline] Stage 2: Chunking`);
    await updateFileStage(fileId, "chunking", 0);
    emitProgress("chunking", 0);

    const docs = await textSplitter.createDocuments([cleanedText]);
    const chunks = docs.map((doc) => doc.pageContent);
    
    await updateFileStage(fileId, "chunking", 100, { extractedChunks: chunks.length });
    emitProgress("chunking", 100);
    console.log(`[Pipeline] Created ${chunks.length} chunks`);

    // Stage 3: Embedding & Storage
    console.log(`[Pipeline] Stage 3: Embedding`);
    await updateFileStage(fileId, "embedding", 0);
    emitProgress("embedding", 0);

    const chunkMetadata: ChunkMetadata[] = chunks.map((_, i) => ({
      file: file.originalName,
      chunkIndex: i,
    }));

    const embeddedCount = await addChunksToCollection(
      userId,
      file.courseCode,
      chunks,
      chunkMetadata,
      fileId
    );

    await updateFileStage(fileId, "embedding", 100, { embeddedChunks: embeddedCount });
    emitProgress("embedding", 100);
    console.log(`[Pipeline] Embedded ${embeddedCount} chunks to PostgreSQL for user ${userId}`);

    // Stage 4: Context Update (with locking to prevent race conditions)
    console.log(`[Pipeline] Stage 4: Updating context`);
    await updateFileStage(fileId, "updating_context", 0);
    emitProgress("updating_context", 0);

    let concepts: any[] = [];
    let summary = "";

    if (isGeminiConfigured()) {
      // Acquire lock to serialize context updates per course
      const existingLock = contextUpdateLocks.get(file.courseCode);
      if (existingLock) {
        await existingLock;
      }
      
      // Create a new lock promise
      let releaseLock: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      contextUpdateLocks.set(file.courseCode, lockPromise);
      
      try {
        const conceptResult = await extractConcepts(cleanedText.substring(0, 15000), file.courseCode);
        concepts = conceptResult.concepts || [];
        summary = conceptResult.summary || "";
        console.log(`[Pipeline] Extracted ${concepts.length} concepts for ${file.courseCode}`);

        // Save context to database instead of file
        await saveContextForCourse(file.courseCode, userId, concepts, summary, file.originalName);
      } catch (error: any) {
        console.error(`[Pipeline] Context extraction failed:`, error.message || error);
      } finally {
        // Release the lock
        releaseLock!();
      }
    }

    await updateFileStage(fileId, "updating_context", 100, {
      concepts: JSON.stringify(concepts),
      summary,
    });
    emitProgress("updating_context", 100);

    // Stage 5: Distribution
    console.log(`[Pipeline] Stage 5: Distributing`);
    await updateFileStage(fileId, "distributing", 0);
    emitProgress("distributing", 0);

    // Future: trigger mission refresh, schedule suggestions, etc.
    // For now, mark as complete

    await updateFileStage(fileId, "distributing", 100);
    emitProgress("distributing", 100);

    // Complete
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    await updateFileStage(fileId, "completed", 100, {
      completedAt: new Date().toISOString(),
    });
    emitProgress("completed", 100);

    // Clean up file data from database after successful processing
    // The extracted knowledge is now stored in chunks, embeddings, and context
    try {
      await db.update(uploadedFiles)
        .set({ fileData: null })
        .where(eq(uploadedFiles.id, fileId));
      console.log(`[Pipeline] Cleaned up file data from database for file ${fileId}`);
    } catch (cleanupError: any) {
      console.warn(`[Pipeline] Warning: Could not clear file data:`, cleanupError.message);
    }

    logIngestionMetrics(
      file.courseCode,
      file.originalName,
      chunks.length,
      processingTime
    );

    console.log(`[Pipeline] Completed processing ${file.originalName} in ${processingTime}ms`);

    return { success: true };

  } catch (error: any) {
    console.error(`[Pipeline] Error processing file ${fileId}:`, error);
    
    await updateFileStage(fileId, "failed", 0, { error: error.message });
    
    logIngestionMetrics(
      "unknown",
      "unknown",
      0,
      Date.now() - startTime
    );

    return { success: false, error: error.message };
  }
}

/**
 * Get current pipeline status for a file
 */
export async function getPipelineStatus(fileId: number): Promise<PipelineProgress | null> {
  const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId));
  if (!file) return null;

  const stage = (file.stage || "uploaded") as PipelineStage;
  
  return {
    fileId,
    stage,
    stageProgress: file.stageProgress || 0,
    totalStages: STAGE_ORDER.length - 1,
    currentStageIndex: STAGE_ORDER.indexOf(stage),
    error: file.error || undefined,
  };
}

/**
 * Get all files for a course with their pipeline status
 */
export async function getCourseFiles(courseCode: string, userId: number): Promise<any[]> {
  return await db.select().from(uploadedFiles)
    .where(and(eq(uploadedFiles.courseCode, courseCode), eq(uploadedFiles.userId, userId)))
    .orderBy(uploadedFiles.uploadedAt);
}
