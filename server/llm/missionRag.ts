/**
 * RAG-based Mission Generation
 * 
 * Retrieves relevant chunks from ChromaDB and builds prompts for mission generation.
 * Falls back to legacy context.json summary when insufficient chunks are available.
 */

import { retrieveChunks, getChunkCount, sanitizeCourseCode } from "./retriever";
import { trackRagColdStart, trackMissionInputTokens, trackChunksRetrieved } from "../metrics/counters";
import Groq from "groq-sdk";
import { loadContextForCourse as loadContextFromDB } from "./ingestPipeline";

const MIN_CHUNKS_FOR_RAG = 2;
const MAX_CONTEXT_TOKENS = 1000;
const TOP_K_CHUNKS = 4;

export interface RagMission {
  title: string;
  description: string;
  proofRequirement: string;
  timeEstimateMinutes: number;
  difficulty: "easy" | "medium" | "hard";
  energyLevel: "low" | "medium" | "high";
  materials: string[];
  tags: string[];
}

export interface RagMissionResult {
  missions: RagMission[];
  usedRag: boolean;
  chunksRetrieved: number;
}

export interface IntelligenceContext {
  deadlineUrgencies: { deadlineTitle: string; daysRemaining: number; urgencyScore: number }[];
  conceptGaps: { conceptName: string }[];
  reviewDueConcepts: { conceptName: string; daysSinceLastStudy: number }[];
  recommendedDifficulty: "easy" | "medium" | "hard";
  schedulePerformance?: {
    completionRate: number;
    avgEnergyLevel: number;
    peakProductivityHours: number[];
    lowEnergyHours: number[];
    skipReasons: { reason: string; count: number }[];
    avgTimeAccuracy?: number;
    commonBlockers?: string[];
  };
}

/**
 * Loads legacy context from context.json
 * @param courseCode - Course code
 * @returns Context object with concepts and summary
 */
async function loadLegacyContext(courseCode: string, userId?: number): Promise<{ concepts: string[]; summary: string }> {
  const context = await loadContextFromDB(courseCode, userId);
  const concepts = (context.concepts || []).map((c: any) => 
    typeof c === "string" ? c : c.name || ""
  ).filter(Boolean);
  return {
    concepts,
    summary: context.summary || "",
  };
}

/**
 * Estimates token count for a string (rough approximation)
 * @param text - Text to estimate
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncates chunks to fit within token budget
 * @param chunks - Array of chunk texts
 * @param maxTokens - Maximum tokens allowed
 * @returns Truncated chunks that fit the budget
 */
function truncateChunksToTokenBudget(chunks: string[], maxTokens: number): string[] {
  const result: string[] = [];
  let totalTokens = 0;
  
  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk);
    if (totalTokens + chunkTokens > maxTokens) {
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 50) {
        const truncatedChunk = chunk.substring(0, remainingTokens * 4);
        result.push(truncatedChunk + "...");
      }
      break;
    }
    result.push(chunk);
    totalTokens += chunkTokens;
  }
  
  return result;
}

/**
 * Formats intelligence context for inclusion in prompts
 */
function formatIntelligenceSection(intelligence?: IntelligenceContext): string {
  if (!intelligence) return "";
  
  const sections: string[] = [];
  
  if (intelligence.deadlineUrgencies.length > 0) {
    const urgent = intelligence.deadlineUrgencies.slice(0, 3);
    sections.push(`DEADLINES:\n${urgent.map(d => 
      `- ${d.deadlineTitle} (${d.daysRemaining} days, urgency: ${d.urgencyScore}%)`
    ).join("\n")}`);
  }
  
  if (intelligence.conceptGaps.length > 0) {
    const gaps = intelligence.conceptGaps.slice(0, 5);
    sections.push(`UNSTUDIED CONCEPTS:\n${gaps.map(g => `- ${g.conceptName}`).join("\n")}`);
  }
  
  if (intelligence.reviewDueConcepts.length > 0) {
    const reviews = intelligence.reviewDueConcepts.slice(0, 3);
    sections.push(`NEEDS REVIEW:\n${reviews.map(r => 
      `- ${r.conceptName} (${r.daysSinceLastStudy} days ago)`
    ).join("\n")}`);
  }
  
  sections.push(`RECOMMENDED DIFFICULTY: ${intelligence.recommendedDifficulty}`);
  
  if (intelligence.schedulePerformance) {
    const perf = intelligence.schedulePerformance;
    const perfLines: string[] = [`SCHEDULE PERFORMANCE INSIGHTS:`];
    perfLines.push(`- Block completion rate: ${Math.round(perf.completionRate * 100)}%`);
    perfLines.push(`- Average energy level: ${perf.avgEnergyLevel.toFixed(1)}/5`);
    
    if (perf.peakProductivityHours.length > 0) {
      perfLines.push(`- Peak hours: ${perf.peakProductivityHours.map(h => `${h}:00`).join(", ")}`);
    }
    if (perf.lowEnergyHours.length > 0) {
      perfLines.push(`- Low energy hours: ${perf.lowEnergyHours.map(h => `${h}:00`).join(", ")}`);
    }
    if (perf.avgTimeAccuracy && perf.avgTimeAccuracy > 1.2) {
      perfLines.push(`- Missions often take longer than estimated (${Math.round(perf.avgTimeAccuracy * 100)}% of estimate)`);
    }
    if (perf.skipReasons.length > 0) {
      perfLines.push(`- Common skip reasons: ${perf.skipReasons.slice(0, 2).map(r => r.reason).join(", ")}`);
    }
    if (perf.commonBlockers && perf.commonBlockers.length > 0) {
      perfLines.push(`- Common blockers: ${perf.commonBlockers.slice(0, 3).join(", ")}`);
    }
    
    sections.push(perfLines.join("\n"));
  }
  
  return sections.length > 0 ? `\n\nINTELLIGENCE:\n${sections.join("\n\n")}` : "";
}

/**
 * Builds the RAG prompt for mission generation
 * @param courseName - Course name
 * @param concepts - Array of concept names
 * @param chunks - Retrieved chunk texts
 * @param missionFocus - Focus area for the mission
 * @param intelligence - Optional intelligence context for personalization
 * @returns Formatted prompt string
 */
function buildRagPrompt(
  courseName: string,
  concepts: string[],
  chunks: string[],
  missionFocus: string,
  intelligence?: IntelligenceContext
): string {
  const conceptsList = concepts.slice(0, 10).join(", ");
  const chunksText = chunks.join("\n---\n");
  const intelligenceSection = formatIntelligenceSection(intelligence);
  
  return `SYSTEM: You are an engineering study assistant. Use only the CONTEXT below.

METADATA:
Course: ${courseName}
Concepts: ${conceptsList}${intelligenceSection}

CONTEXT:
${chunksText}

INSTRUCTION:
Create exactly 3 progressive missions to help the student learn "${missionFocus}".
${intelligence?.deadlineUrgencies.length ? "PRIORITY: Focus on preparing for upcoming deadlines." : ""}
${intelligence?.reviewDueConcepts.length ? "Include review activities for concepts that need reinforcement." : ""}
Output valid JSON:
{
  "missions": [
    {
      "title": "...",
      "description": "...",
      "proofRequirement": "upload a photo of ...",
      "timeEstimateMinutes": 60,
      "difficulty": "easy|medium|hard",
      "energyLevel": "low|medium|high",
      "materials": ["lecture slides", "textbook chapter X", "lab equipment"],
      "tags": ["concept1", "concept2"]
    }
  ]
}

RULES:
- First mission should be easy, second medium, third hard (progressive difficulty)
- If student struggles (recommended: ${intelligence?.recommendedDifficulty || "medium"}), bias toward easier overall
- Each mission should build on the previous one
- proofRequirement must be actionable and verifiable
- Tags should reference relevant concepts from the CONTEXT
- timeEstimateMinutes should be realistic (15-120 minutes)
- energyLevel: "low" for review/reading, "medium" for practice, "high" for challenging problems
- materials: list specific resources needed (lecture notes, textbook, software, equipment)`;
}

/**
 * Builds a fallback prompt using legacy summary
 * @param courseName - Course name
 * @param concepts - Array of concept names
 * @param summary - Course summary from context.json
 * @param missionFocus - Focus area for the mission
 * @param intelligence - Optional intelligence context for personalization
 * @returns Formatted prompt string
 */
function buildFallbackPrompt(
  courseName: string,
  concepts: string[],
  summary: string,
  missionFocus: string,
  intelligence?: IntelligenceContext
): string {
  const conceptsList = concepts.slice(0, 10).join(", ");
  const intelligenceSection = formatIntelligenceSection(intelligence);
  
  return `SYSTEM: You are an engineering study assistant.

METADATA:
Course: ${courseName}
Concepts: ${conceptsList}${intelligenceSection}

SUMMARY:
${summary || "No course summary available."}

INSTRUCTION:
Create exactly 3 progressive missions to help the student learn "${missionFocus}".
${intelligence?.deadlineUrgencies.length ? "PRIORITY: Focus on preparing for upcoming deadlines." : ""}
${intelligence?.reviewDueConcepts.length ? "Include review activities for concepts that need reinforcement." : ""}
Output valid JSON:
{
  "missions": [
    {
      "title": "...",
      "description": "...",
      "proofRequirement": "upload a photo of ...",
      "timeEstimateMinutes": 60,
      "difficulty": "easy|medium|hard",
      "energyLevel": "low|medium|high",
      "materials": ["lecture slides", "textbook chapter X", "lab equipment"],
      "tags": ["concept1", "concept2"]
    }
  ]
}

RULES:
- First mission should be easy, second medium, third hard (progressive difficulty)
- If student struggles (recommended: ${intelligence?.recommendedDifficulty || "medium"}), bias toward easier overall
- Each mission should build on the previous one
- proofRequirement must be actionable and verifiable
- Tags should reference relevant concepts
- timeEstimateMinutes should be realistic (15-120 minutes)
- energyLevel: "low" for review/reading, "medium" for practice, "high" for challenging problems
- materials: list specific resources needed (lecture notes, textbook, software, equipment)`;
}

/**
 * Parses the LLM response to extract missions
 * @param response - Raw LLM response text
 * @returns Array of parsed missions
 */
function parseRagResponse(response: string): RagMission[] {
  const jsonMatch = response.match(/\{[\s\S]*"missions"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse mission JSON from response");
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.missions || !Array.isArray(parsed.missions)) {
    throw new Error("Invalid mission response format");
  }
  
  return parsed.missions.map((m: any) => ({
    title: m.title || "Untitled Mission",
    description: m.description || "",
    proofRequirement: m.proofRequirement || "Submit proof of completion",
    timeEstimateMinutes: m.timeEstimateMinutes || 60,
    difficulty: ["easy", "medium", "hard"].includes(m.difficulty) ? m.difficulty : "medium",
    tags: Array.isArray(m.tags) ? m.tags : [],
  }));
}

/**
 * Gets the Groq client instance
 */
function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }
  return new Groq({ apiKey });
}

/**
 * Generates missions using RAG-enhanced prompts
 * @param userId - User ID for chunk retrieval
 * @param courseCode - Course code
 * @param courseName - Course name
 * @param missionFocus - Focus area for missions
 * @param intelligence - Optional intelligence context for personalization
 * @returns Mission result with RAG metadata
 */
export async function generateRagMissions(
  userId: number,
  courseCode: string,
  courseName: string,
  missionFocus: string,
  intelligence?: IntelligenceContext
): Promise<RagMissionResult> {
  const sanitized = sanitizeCourseCode(courseCode);
  const legacyContext = await loadLegacyContext(courseCode);
  
  let usedRag = false;
  let chunksRetrieved = 0;
  let prompt: string;
  
  const chunkCount = await getChunkCount(userId, sanitized);
  
  if (chunkCount >= MIN_CHUNKS_FOR_RAG) {
    const searchQuery = `${missionFocus} ${courseName}`;
    const retrievedChunks = await retrieveChunks(userId, sanitized, searchQuery, TOP_K_CHUNKS);
    
    chunksRetrieved = retrievedChunks.length;
    trackChunksRetrieved(chunksRetrieved);
    
    if (chunksRetrieved >= MIN_CHUNKS_FOR_RAG) {
      const chunkTexts = retrievedChunks.map((c) => c.text);
      const truncatedChunks = truncateChunksToTokenBudget(chunkTexts, MAX_CONTEXT_TOKENS);
      
      prompt = buildRagPrompt(
        courseName,
        legacyContext.concepts,
        truncatedChunks,
        missionFocus,
        intelligence
      );
      usedRag = true;
    } else {
      trackRagColdStart();
      prompt = buildFallbackPrompt(
        courseName,
        legacyContext.concepts,
        legacyContext.summary,
        missionFocus,
        intelligence
      );
    }
  } else {
    trackRagColdStart();
    prompt = buildFallbackPrompt(
      courseName,
      legacyContext.concepts,
      legacyContext.summary,
      missionFocus,
      intelligence
    );
  }
  
  const inputTokens = estimateTokens(prompt);
  trackMissionInputTokens(inputTokens);
  
  const groq = getGroqClient();
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });
  
  const content = response.choices[0]?.message?.content || "";
  const missions = parseRagResponse(content);
  
  return {
    missions,
    usedRag,
    chunksRetrieved,
  };
}

/**
 * Retrieves a single mission (first mission from generation)
 * For backward compatibility with existing generateMission API
 * @param userId - User ID for chunk retrieval
 * @param courseCode - Course code
 * @param courseName - Course name
 * @param missionFocus - Focus area for the mission
 * @param targetDuration - Target duration in minutes
 * @param intelligence - Optional intelligence context for personalization
 */
export async function generateSingleRagMission(
  userId: number,
  courseCode: string,
  courseName: string,
  missionFocus: string,
  targetDuration: number,
  intelligence?: IntelligenceContext
): Promise<{
  title: string;
  description: string;
  proofRequirement: string;
  estimatedMinutes: number;
  targetedConcept: string;
  missionType: string;
}> {
  const result = await generateRagMissions(userId, courseCode, courseName, missionFocus, intelligence);
  
  const firstMission = result.missions[0];
  if (!firstMission) {
    throw new Error("No missions generated");
  }
  
  return {
    title: firstMission.title,
    description: firstMission.description,
    proofRequirement: firstMission.proofRequirement,
    estimatedMinutes: firstMission.timeEstimateMinutes,
    targetedConcept: firstMission.tags[0] || missionFocus,
    missionType: result.usedRag ? "rag_enhanced" : "legacy",
  };
}
