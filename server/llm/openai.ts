
import OpenAI from 'openai';
import { MissionIntelligenceContext, formatIntelligenceForPrompt } from './missionIntelligence';
import { storage } from '../storage';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface MissionGenerationParams {
  courseCode: string;
  courseName: string;
  targetDuration: number;
  missionFocus: string;
  concepts: string[];
  intelligenceContext?: MissionIntelligenceContext;
}

export interface GeneratedMission {
  title: string;
  description: string;
  proofRequirement: string;
  estimatedMinutes: number;
  targetedConcept?: string;
  missionType?: "new_learning" | "review" | "deadline_prep" | "gap_filling";
}

export async function generateMission(params: MissionGenerationParams): Promise<GeneratedMission> {
  const client = getOpenAIClient();
  const { courseCode, courseName, targetDuration, missionFocus, concepts, intelligenceContext } = params;
  
  const conceptsText = concepts.length > 0 
    ? `\n\nKEY CONCEPTS FROM COURSE NOTES:\n${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : '';

  let intelligenceSection = '';
  let missionGuidance = '';
  
  if (intelligenceContext) {
    intelligenceSection = `\n\n=== INTELLIGENT CONTEXT ===\n${formatIntelligenceForPrompt(intelligenceContext, courseCode)}`;
    
    const courses = await storage.getCourses();
    const currentCourse = courses.find(c => c.code === courseCode);
    const currentCourseId = currentCourse?.id;
    
    const hasUrgentDeadlines = intelligenceContext.deadlineUrgencies.some(
      d => d.courseCode === courseCode && d.urgencyScore >= 70
    );
    
    const courseConceptGaps = intelligenceContext.conceptGaps.filter(
      g => g.courseId === currentCourseId
    );
    const hasConceptGaps = courseConceptGaps.length > 0;
    
    const courseReviewDue = intelligenceContext.reviewDueConcepts.filter(
      r => r.courseId === currentCourseId && (r.reviewPriority === "urgent" || r.reviewPriority === "high")
    );
    const hasReviewDue = courseReviewDue.length > 0;
    
    missionGuidance = '\n\nMISSION GENERATION GUIDANCE:\n';
    
    if (hasUrgentDeadlines) {
      const urgentDeadline = intelligenceContext.deadlineUrgencies.find(
        d => d.courseCode === courseCode && d.urgencyScore >= 70
      );
      missionGuidance += `- PRIORITY: Focus on preparing for "${urgentDeadline?.deadlineTitle}" (${urgentDeadline?.daysRemaining} days away)\n`;
      missionGuidance += `- Create a mission that directly helps prepare for this ${urgentDeadline?.deadlineType}\n`;
    } else if (hasReviewDue) {
      const topReview = courseReviewDue[0];
      missionGuidance += `- SPACED REPETITION: The concept "${topReview?.conceptName}" needs review (${topReview?.daysSinceLastStudy} days since last study)\n`;
      missionGuidance += `- Create a review mission that reinforces this concept at a deeper level\n`;
    } else if (hasConceptGaps) {
      const topGap = courseConceptGaps[0];
      missionGuidance += `- GAP FILLING: The concept "${topGap?.conceptName}" has never been studied\n`;
      missionGuidance += `- Create an introductory mission for this new concept\n`;
    } else {
      missionGuidance += `- NEW LEARNING: No urgent priorities, focus on advancing knowledge\n`;
    }
    
    missionGuidance += `- Difficulty level: ${intelligenceContext.recommendedDifficulty.toUpperCase()} (based on current energy patterns)\n`;
    
    const courseTrend = intelligenceContext.difficultyTrends.find(t => t.courseCode === courseCode);
    if (courseTrend) {
      if (courseTrend.recommendation === "simplify") {
        missionGuidance += `- User has been struggling (avg difficulty ${courseTrend.avgDifficulty.toFixed(1)}/5) - break down into smaller steps\n`;
      } else if (courseTrend.recommendation === "challenge") {
        missionGuidance += `- User finds tasks easy (avg difficulty ${courseTrend.avgDifficulty.toFixed(1)}/5) - increase complexity\n`;
      }
    }
  }

  const systemPrompt = `You are an intelligent engineering mission generator for the FORGE system. Your job is to create focused, achievable learning missions that follow the Goldilocks Principle and adapt to the student's current context.

GOLDILOCKS PRINCIPLE REQUIREMENTS:
1. Duration: ${targetDuration} minutes (between 15-30 minutes ideal)
2. Output: Must produce a tangible artifact (code, calculation, diagram, etc.)
3. Progression: Should be a meaningful step in engineering mastery
4. Focus Area: ${missionFocus}

COURSE CONTEXT:
- Course Code: ${courseCode}
- Course Name: ${courseName}${conceptsText}${intelligenceSection}${missionGuidance}

Generate a single mission that is:
- Specific and actionable
- Achievable in the target duration
- Produces concrete proof of work
- Aligned with the intelligent context (deadlines, gaps, reviews, energy levels)
- Appropriately challenging based on difficulty trends

Respond with a JSON object containing:
{
  "title": "Brief, action-oriented title (5-8 words)",
  "description": "Clear explanation of what to do and why (2-3 sentences). Reference the specific concept or deadline being addressed.",
  "proofRequirement": "Specific artifact to submit as proof (be specific about format)",
  "estimatedMinutes": ${targetDuration},
  "targetedConcept": "The specific concept this mission addresses (from gaps, reviews, or course notes)",
  "missionType": "new_learning" | "review" | "deadline_prep" | "gap_filling"
}

Output ONLY valid JSON, no markdown or explanation.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate a ${targetDuration}-minute engineering mission for ${courseCode} that considers all the intelligent context provided.` }
    ],
    temperature: 0.7,
    max_tokens: 600,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI API');
  }

  try {
    const mission = JSON.parse(content) as GeneratedMission;
    return mission;
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content);
    throw new Error('Failed to parse mission from OpenAI response');
  }
}

export interface ConceptExtractionResult {
  concepts: Array<{
    name: string;
    description: string;
    relevance: string;
  }>;
  summary: string;
}

export async function extractConcepts(text: string, courseCode: string): Promise<ConceptExtractionResult> {
  const client = getOpenAIClient();

  const prompt = `You are an engineering education specialist analyzing course materials for ${courseCode}.

Analyze the following text and extract the 5 most important, unapplied engineering concepts that would make excellent learning mission topics.

TEXT TO ANALYZE:
${text}

For each concept, provide:
1. A concise name (2-4 words)
2. A brief description of what it involves
3. Why it's relevant for practical engineering work

Respond with a JSON object in this exact format:
{
  "concepts": [
    {
      "name": "Concept Name",
      "description": "What this concept involves and how it works",
      "relevance": "Why this is important for engineering practice"
    }
  ],
  "summary": "A 1-2 sentence overview of the main themes in this material"
}

Output ONLY valid JSON, no markdown code blocks or explanation.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI API');
  }

  try {
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as ConceptExtractionResult;
    return parsed;
  } catch (error) {
    console.error('Failed to parse OpenAI concept extraction response:', content);
    throw new Error('Failed to parse concepts from OpenAI response');
  }
}

export async function analyzeDocumentText(filePath: string, mimeType: string): Promise<string> {
  const client = getOpenAIClient();
  const fs = await import('fs');
  
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const mediaType = mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'application/pdf';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all text content from this document. Include all readable text, handwritten notes, equations, diagrams, and structured content. Return only the extracted text, no commentary.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${base64Data}`
            }
          }
        ] as any
      }
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });

  return response.choices[0]?.message?.content as string || '';
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface APIValidationResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'expired' | 'unconfigured' | 'error';
  message: string;
}

export async function validateOpenAIAPI(): Promise<APIValidationResult> {
  if (!isOpenAIConfigured()) {
    return {
      valid: false,
      status: 'unconfigured',
      message: 'OpenAI API key is not set. Add OPENAI_API_KEY to your environment variables.'
    };
  }

  try {
    const client = getOpenAIClient();
    
    // Make a minimal API call to test the key
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1
    });

    return {
      valid: true,
      status: 'valid',
      message: 'OpenAI API key is valid and working.'
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid_api_key')) {
      return {
        valid: false,
        status: 'invalid',
        message: 'OpenAI API key is invalid. Please check your OPENAI_API_KEY and try again.'
      };
    } else if (message.includes('expired')) {
      return {
        valid: false,
        status: 'expired',
        message: 'OpenAI API key has expired. Please generate a new one.'
      };
    } else {
      return {
        valid: false,
        status: 'error',
        message: `Error validating OpenAI API: ${message}`
      };
    }
  }
}
