/**
 * Tiered Document Extraction System
 * 
 * Uses local extraction for Office documents and text files,
 * reserves Gemini API for images and scanned PDFs.
 */

import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import { analyzeDocumentWithGroq } from "./groq";
import { analyzeDocumentText as analyzeDocumentWithGemini } from "./gemini";
import { trackIngestLLMCall } from "../metrics/counters";

// Dynamic import for pdf-parse (CommonJS module)
let pdfParse: any = null;
async function getPdfParse() {
  if (!pdfParse) {
    const mod: any = await import("pdf-parse");
    pdfParse = mod.default || mod;
  }
  return pdfParse;
}

export interface ExtractionResult {
  text: string;
  imageTexts: string[];
  method: "local" | "gemini" | "groq" | "openai";
  pageCount?: number;
}

/**
 * Extracts text from plain text or markdown files
 */
async function extractText(filePath: string): Promise<ExtractionResult> {
  const content = fs.readFileSync(filePath, "utf-8");
  return {
    text: content,
    imageTexts: [],
    method: "local",
  };
}

/**
 * Extracts text from Word documents (.docx)
 * Also extracts and OCRs embedded images
 */
async function extractDocx(filePath: string): Promise<ExtractionResult> {
  const docBuffer = fs.readFileSync(filePath);
  
  // Extract text from document structure
  const result = await mammoth.extractRawText({ buffer: docBuffer });
  const text = result.value;
  
  // Extract embedded images for vision processing
  const imageTexts: string[] = [];
  try {
    const zip = new AdmZip(filePath);
    const mediaEntries = zip.getEntries().filter((e: any) => 
      e.entryName.includes("word/media/")
    );
    
    if (mediaEntries.length > 0) {
      for (const entry of mediaEntries) {
        const imageBuffer = entry.getData();
        const tempImagePath = path.join("/tmp", `embedded_${Date.now()}_${Math.random()}.png`);
        fs.writeFileSync(tempImagePath, imageBuffer);
        
        try {
          trackIngestLLMCall();
          const ocrText = await analyzeDocumentWithGemini(tempImagePath, "image/png");
          if (ocrText.trim()) {
            imageTexts.push(`[Embedded Image]: ${ocrText}`);
          }
        } catch (err) {
          console.warn(`Failed to OCR embedded image in DOCX: ${err}`);
        } finally {
          try { fs.unlinkSync(tempImagePath); } catch {}
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to extract embedded images from DOCX: ${err}`);
  }
  
  return {
    text,
    imageTexts,
    method: "local",
  };
}

/**
 * Extracts data from Excel files (.xlsx, .xls)
 */
async function extractXlsx(filePath: string): Promise<ExtractionResult> {
  const workbook = XLSX.readFile(filePath);
  const textParts: string[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    textParts.push(`\n[Sheet: ${sheetName}]\n`);
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    textParts.push(csv);
  }
  
  return {
    text: textParts.join("\n"),
    imageTexts: [],
    method: "local",
  };
}

/**
 * Extracts text from PowerPoint files (.pptx, .ppt)
 * Also extracts and OCRs embedded images
 */
async function extractPptx(filePath: string): Promise<ExtractionResult> {
  const textParts: string[] = [];
  const imageTexts: string[] = [];
  
  try {
    const zip = new AdmZip(filePath);
    
    // Extract slide text from XML
    const slideEntries = zip.getEntries().filter((e: any) => 
      e.entryName.includes("ppt/slides/slide") && e.entryName.endsWith(".xml")
    );
    
    for (let i = 0; i < slideEntries.length; i++) {
      const slideXml = slideEntries[i].getData().toString("utf-8");
      // Simple text extraction from slide XML (extracts text between <a:t> tags)
      const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideTexts = textMatches.map((m: string) => m.replace(/<a:t>|<\/a:t>/g, ""));
      
      if (slideTexts.length > 0) {
        textParts.push(`\n[Slide ${i + 1}]\n${slideTexts.join(" ")}`);
      }
    }
    
    // Extract embedded images
    const mediaEntries = zip.getEntries().filter((e: any) => 
      e.entryName.includes("ppt/media/")
    );
    
    if (mediaEntries.length > 0) {
      for (const entry of mediaEntries) {
        const imageBuffer = entry.getData();
        const tempImagePath = path.join("/tmp", `embedded_${Date.now()}_${Math.random()}.png`);
        fs.writeFileSync(tempImagePath, imageBuffer);
        
        try {
          trackIngestLLMCall();
          const ocrText = await analyzeDocumentWithGemini(tempImagePath, "image/png");
          if (ocrText.trim()) {
            imageTexts.push(`[Slide Image]: ${ocrText}`);
          }
        } catch (err) {
          console.warn(`Failed to OCR embedded image in PPTX: ${err}`);
        } finally {
          try { fs.unlinkSync(tempImagePath); } catch {}
        }
      }
    }
  } catch (err) {
    console.error(`Failed to extract from PPTX: ${err}`);
  }
  
  return {
    text: textParts.join("\n"),
    imageTexts,
    method: "local",
  };
}

/**
 * Extracts text from PDF files
 * Uses pdf-parse for regular PDFs, OpenAI GPT-4o mini for scanned/image PDFs
 */
async function extractPdf(filePath: string): Promise<ExtractionResult> {
  try {
    const parse = await getPdfParse();
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await parse(pdfBuffer);
    
    const text = pdfData.text;
    const pageCount = pdfData.numpages || undefined;
    
    // If extracted text is very short, likely a scanned PDF - use Gemini
    if (text.trim().length < 100) {
      console.log("[DocumentExtractor] PDF appears to be scanned, using Gemini for OCR");
      trackIngestLLMCall();
      const geminiText = await analyzeDocumentWithGemini(filePath, "application/pdf");
      return {
        text: geminiText,
        imageTexts: [],
        method: "gemini",
        pageCount,
      };
    }
    
    return {
      text,
      imageTexts: [],
      method: "local",
      pageCount,
    };
  } catch (err) {
    console.warn(`PDF extraction failed, falling back to Gemini: ${err}`);
    trackIngestLLMCall();
    const geminiText = await analyzeDocumentWithGemini(filePath, "application/pdf");
    return {
      text: geminiText,
      imageTexts: [],
      method: "gemini",
    };
  }
}

/**
 * Extracts text from image files using Gemini vision
 */
async function extractImage(filePath: string, mimeType: string): Promise<ExtractionResult> {
  trackIngestLLMCall();
  const text = await analyzeDocumentWithGemini(filePath, mimeType);
  return {
    text,
    imageTexts: [],
    method: "gemini",
  };
}

/**
 * Main extraction dispatcher - routes to appropriate extraction method
 */
export async function extractDocument(filePath: string): Promise<ExtractionResult> {
  const ext = path.extname(filePath).toLowerCase();
  
  console.log(`[DocumentExtractor] Extracting: ${path.basename(filePath)} (${ext})`);
  
  try {
    switch (ext) {
      case ".txt":
      case ".md":
        return await extractText(filePath);
      
      case ".docx":
        return await extractDocx(filePath);
      
      case ".xlsx":
      case ".xls":
        return await extractXlsx(filePath);
      
      case ".pptx":
      case ".ppt":
        return await extractPptx(filePath);
      
      case ".pdf":
        return await extractPdf(filePath);
      
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".gif":
      case ".webp":
        return await extractImage(filePath, getMimeType(ext));
      
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (err) {
    console.error(`[DocumentExtractor] Extraction failed for ${filePath}: ${err}`);
    throw err;
  }
}

function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return types[ext] || "image/jpeg";
}

/**
 * Extract document from a buffer (for database-stored files)
 * Creates a temporary file, extracts, and cleans up
 */
export async function extractDocumentFromBuffer(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<ExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();
  const tempFilePath = path.join("/tmp", `extract_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
  
  try {
    fs.writeFileSync(tempFilePath, buffer);
    console.log(`[DocumentExtractor] Processing buffer as temp file: ${tempFilePath}`);
    
    const result = await extractDocument(tempFilePath);
    return result;
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.warn(`[DocumentExtractor] Failed to cleanup temp file: ${tempFilePath}`);
    }
  }
}
