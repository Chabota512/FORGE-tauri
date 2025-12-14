/**
 * RAG Retriever Module
 * 
 * Handles embedding generation with all-MiniLM-L6-v2 and chunk storage/retrieval
 * using PostgreSQL with cosine similarity search. All embeddings are user-isolated.
 */

import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";
import { db } from "../db";
import { documentChunks, uploadedFiles } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Chunk metadata stored alongside embeddings in PostgreSQL
 */
export interface ChunkMetadata {
  file: string;
  chunkIndex: number;
  page?: number;
}

/**
 * Retrieved chunk with text and metadata
 */
export interface RetrievedChunk {
  text: string;
  metadata: ChunkMetadata;
  distance: number;
}

/**
 * Sanitizes course code to prevent directory traversal attacks
 * @param courseCode - Raw course code from user input
 * @returns Sanitized course code safe for filesystem operations
 */
export function sanitizeCourseCode(courseCode: string): string {
  return courseCode
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\.\./g, "")
    .trim()
    .toUpperCase();
}

/**
 * Lazily initializes and returns the embedding pipeline
 * Uses Xenova/all-MiniLM-L6-v2 (14MB, runs in-process)
 * @returns Promise resolving to the embedding pipeline
 */
async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    console.log("[Retriever] Loading embedding model: Xenova/all-MiniLM-L6-v2");
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    ) as FeatureExtractionPipeline;
    console.log("[Retriever] Embedding model loaded successfully");
  }
  return embeddingPipeline;
}

/**
 * Generates embeddings for an array of text chunks
 * @param texts - Array of text strings to embed
 * @returns Promise resolving to array of embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
  }
  
  return embeddings;
}

/**
 * Computes cosine similarity between two embedding vectors
 * @param embedding1 - First embedding vector
 * @param embedding2 - Second embedding vector
 * @returns Cosine similarity score (0-1, higher is more similar)
 */
function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Adds chunks to PostgreSQL for a course (user-isolated)
 * @param userId - User ID for isolation
 * @param courseCode - Course code
 * @param chunks - Array of text chunks
 * @param metadatas - Array of chunk metadata objects
 * @param fileId - ID of the uploaded file
 * @returns Promise resolving to number of chunks added
 */
export async function addChunksToCollection(
  userId: number,
  courseCode: string,
  chunks: string[],
  metadatas: ChunkMetadata[],
  fileId?: number
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }
  
  try {
    const embeddings = await generateEmbeddings(chunks);
    
    // Insert all chunks in a single batch operation
    const chunkRecords = chunks.map((text, i) => ({
      userId,
      fileId: fileId || 0,
      courseCode: sanitizeCourseCode(courseCode),
      chunkIndex: metadatas[i].chunkIndex,
      text,
      embedding: JSON.stringify(embeddings[i]), // Store as JSON string
      page: metadatas[i].page,
    }));
    
    // Batch insert
    for (const record of chunkRecords) {
      await db.insert(documentChunks).values(record);
    }
    
    console.log(`[Retriever] Added ${chunks.length} chunks to PostgreSQL for ${courseCode} (user: ${userId})`);
    return chunks.length;
  } catch (error) {
    console.error("[Retriever] Error adding chunks:", error);
    throw error;
  }
}

/**
 * Retrieves top-k most similar chunks from PostgreSQL (user-isolated)
 * @param userId - User ID for isolation
 * @param courseCode - Course code to search within
 * @param query - Search query text
 * @param topK - Number of results to return (default: 4)
 * @returns Promise resolving to array of retrieved chunks with similarity scores
 */
export async function retrieveChunks(
  userId: number,
  courseCode: string,
  query: string,
  topK: number = 4
): Promise<RetrievedChunk[]> {
  try {
    const sanitized = sanitizeCourseCode(courseCode);
    
    // Generate query embedding
    const queryEmbedding = await generateEmbeddings([query]);
    const queryVector = queryEmbedding[0];
    
    // Fetch all chunks for this user and course
    const allChunks = await db.select().from(documentChunks)
      .where(and(
        eq(documentChunks.userId, userId),
        eq(documentChunks.courseCode, sanitized)
      ));
    
    if (allChunks.length === 0) {
      return [];
    }
    
    // Calculate similarity for each chunk
    const chunksWithSimilarity = allChunks.map(chunk => {
      const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
      const similarity = cosineSimilarity(queryVector, chunkEmbedding);
      
      return {
        chunk,
        similarity,
      };
    });
    
    // Sort by similarity (descending) and take top k
    const topChunks = chunksWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    // Convert to RetrievedChunk format
    const retrievedChunks: RetrievedChunk[] = topChunks.map(({ chunk, similarity }) => ({
      text: chunk.text,
      metadata: {
        file: `file_${chunk.fileId}`,
        chunkIndex: chunk.chunkIndex,
        page: chunk.page ?? undefined,
      },
      distance: 1 - similarity, // Convert similarity to distance (lower is better for distance)
    }));
    
    return retrievedChunks;
  } catch (error) {
    console.error("[Retriever] Error retrieving chunks:", error);
    return [];
  }
}

/**
 * Gets the count of chunks stored for a user and course
 * @param userId - User ID
 * @param courseCode - Course code
 * @returns Promise resolving to chunk count
 */
export async function getChunkCount(userId: number, courseCode: string): Promise<number> {
  try {
    const sanitized = sanitizeCourseCode(courseCode);
    const result = await db.select({ count: sql`count(*)` })
      .from(documentChunks)
      .where(and(
        eq(documentChunks.userId, userId),
        eq(documentChunks.courseCode, sanitized)
      ));
    
    return parseInt(result[0]?.count?.toString() || "0", 10);
  } catch {
    return 0;
  }
}

/**
 * Deletes all chunks for a specific file from PostgreSQL
 * Useful for re-ingesting updated documents
 * @param fileId - File ID to remove chunks for
 */
export async function deleteChunksForFile(fileId: number): Promise<void> {
  try {
    await db.delete(documentChunks).where(eq(documentChunks.fileId, fileId));
    console.log(`[Retriever] Deleted chunks for file ${fileId}`);
  } catch (error) {
    console.error("[Retriever] Error deleting chunks:", error);
  }
}
