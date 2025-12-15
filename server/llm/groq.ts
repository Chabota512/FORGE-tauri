import Groq from 'groq-sdk';
import { MissionIntelligenceContext, formatIntelligenceForPrompt } from './missionIntelligence';
import { storage } from '../storage';

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is not configured');
    }
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
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
  const groq = getGroqClient();
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

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
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
    throw new Error('No response from Groq API');
  }

  try {
    const mission = JSON.parse(content) as GeneratedMission;
    return mission;
  } catch (error) {
    console.error('Failed to parse Groq response:', content);
    throw new Error('Failed to parse mission from Groq response');
  }
}

export async function analyzeProofWithVision(
  base64Data: string,
  mimeType: string,
  proofRequirement: string
): Promise<string> {
  const groq = getGroqClient();
  
  try {
    // Note: This currently doesn't use vision - waiting for stable Groq vision API
    // For now, we just return empty string and rely on text-based proof description
    console.warn('[Groq] Vision analysis not yet implemented for mission proofs');
    return '';
  } catch (error) {
    console.error('Groq proof analysis failed:', error);
    return '';
  }
}

export async function generateProofFeedback(
  proofDescription: string,
  missionDescription: string,
  difficulty: number,
  timeAccuracy: number,
  notes: string | null,
  requirement: string
): Promise<string> {
  const groq = getGroqClient();
  
  const feedbackPrompt = `You are an engineering mentor analyzing a student's mission work.

MISSION: ${missionDescription}
REQUIREMENT: ${requirement}

PROOF CONTENT: ${proofDescription}

STUDENT FEEDBACK:
- Difficulty rating: ${difficulty}/5
- Time estimate accuracy: ${timeAccuracy}/5
- Notes: ${notes || 'None provided'}

Give 2-3 sentences of constructive feedback that:
1. Acknowledges what the student did
2. Uses their feedback (difficulty/time ratings) to give personalized guidance
3. Suggests one specific next step or improvement area

Be encouraging but specific.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'user', content: feedbackPrompt }
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  return response.choices[0]?.message?.content as string || '';
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
  const groq = getGroqClient();

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

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from Groq API');
  }

  try {
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as ConceptExtractionResult;
    return parsed;
  } catch (error) {
    console.error('Failed to parse Groq concept extraction response:', content);
    throw new Error('Failed to parse concepts from Groq response');
  }
}

export async function analyzeDocumentWithGroq(
  filePath: string,
  mimeType: string
): Promise<string> {
  const groq = getGroqClient();
  
  try {
    const fs = await import('fs');
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const response = await groq.chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
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
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ] as any
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content as string || '';
  } catch (error) {
    console.error('Groq document analysis failed:', error);
    throw new Error('Failed to extract document text with Groq');
  }
}

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function validateGroqAPI(): Promise<{valid: boolean; status: string; message: string}> {
  if (!isGroqConfigured()) {
    return { valid: false, status: 'unconfigured', message: 'Groq API key is not set.' };
  }
  try {
    const groq = getGroqClient();
    await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1
    });
    return { valid: true, status: 'valid', message: 'Groq API is working.' };
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return { valid: false, status: 'invalid', message: 'Groq API key is invalid.' };
    }
    return { valid: false, status: 'error', message: `Groq error: ${msg.split('\n')[0]}` };
  }
}
