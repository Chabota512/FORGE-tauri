import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { geminiRateLimiter } from './rateLimiter';

function getGeminiClient(): GoogleGenerativeAI {
  const currentApiKey = process.env.GEMINI_API_KEY;
  
  if (!currentApiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }
  
  // Always create a fresh client to pick up environment variable changes
  return new GoogleGenerativeAI(currentApiKey);
}

export interface ConceptExtractionResult {
  concepts: Array<{
    name: string;
    description: string;
    relevance: string;
  }>;
  summary: string;
}

export interface ValidationResult {
  isValid: boolean;
  response: 'YES' | 'NO';
  explanation?: string;
}

export async function extractConcepts(text: string, courseCode: string): Promise<ConceptExtractionResult> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

  const result = await geminiRateLimiter.execute(() => model.generateContent(prompt));
  const response = result.response;
  const content = response.text();

  try {
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as ConceptExtractionResult;
    return parsed;
  } catch (error) {
    console.error('Failed to parse Gemini concept extraction response:', content);
    throw new Error('Failed to parse concepts from Gemini response');
  }
}

export async function validateProofWithVision(
  filePath: string,
  proofRequirement: string,
  mimeType: string
): Promise<ValidationResult> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const imagePart: Part = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };

  const prompt = `You are a quality control supervisor. Your only job is to check if the submitted proof is a plausible attempt to meet the requirement.

**Mission Requirement:** ${proofRequirement}

Based ONLY on the content of this image/document, does this appear to be a plausible attempt to fulfill the requirement?

Respond with ONLY one of the following:
- YES: If the content plausibly matches the requirement.
- NO: If the content is clearly irrelevant.

Then on a new line, provide a brief explanation (1 sentence).`;

  const result = await geminiRateLimiter.execute(() => model.generateContent([prompt, imagePart]));
  const response = result.response;
  const content = response.text().trim();

  const lines = content.split('\n').filter((line: string) => line.trim());
  const firstLine = lines[0]?.toUpperCase().trim() || '';
  const explanation = lines.slice(1).join(' ').trim();

  const isYes = firstLine.includes('YES');
  const isNo = firstLine.includes('NO');

  return {
    isValid: isYes && !isNo,
    response: isYes ? 'YES' : 'NO',
    explanation: explanation || undefined,
  };
}

export async function analyzeDocumentText(filePath: string, mimeType: string): Promise<string> {
  const client = getGeminiClient();
  
  if (mimeType.startsWith('image/')) {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const imagePart: Part = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const result = await geminiRateLimiter.execute(() => model.generateContent([
      'Extract all text content from this image. Include handwritten notes, printed text, equations, and any other readable content. Return only the extracted text, no commentary.',
      imagePart
    ]));
    
    return result.response.text();
  }

  if (mimeType === 'application/pdf') {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const pdfPart: Part = {
      inlineData: {
        data: base64Data,
        mimeType: 'application/pdf',
      },
    };

    const result = await geminiRateLimiter.execute(() => model.generateContent([
      'Extract all text content from this PDF document. Include all readable text, equations, and structured content. Return only the extracted text, no commentary.',
      pdfPart
    ]));
    
    return result.response.text();
  }

  const textContent = fs.readFileSync(filePath, 'utf-8');
  return textContent;
}

export async function generateProofFeedback(
  proofDescription: string,
  missionDescription: string,
  difficulty: number,
  timeAccuracy: number,
  notes: string | null,
  requirement: string
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

  const response = await geminiRateLimiter.execute(() => model.generateContent(feedbackPrompt));
  return response.response.text();
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function validateGeminiAPI(): Promise<{valid: boolean; status: string; message: string}> {
  if (!isGeminiConfigured()) {
    return { valid: false, status: 'unconfigured', message: 'Gemini API key is not set.' };
  }
  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    await model.generateContent('test');
    return { valid: true, status: 'valid', message: 'Gemini API is working.' };
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return { valid: false, status: 'invalid', message: 'Gemini API key is invalid.' };
    }
    return { valid: false, status: 'error', message: `Gemini error: ${msg.split('\n')[0]}` };
  }
}

export interface MissionValidationResult {
  approved: boolean;
  analysis: string;
  rejectionReason?: string;
}

export interface UserFeedbackContext {
  emotionalState?: string;
  actualTimeMinutes?: number;
  timeFeeling?: string;
  usedExternalHelp?: boolean;
  helpDetails?: string;
  missionClarity?: string;
  learningType?: string;
  blockers?: string;
  confidenceLevel?: string;
}

export async function validateAndAnalyzeMission(
  proofContent: string,
  missionTitle: string,
  missionDescription: string,
  proofRequirement: string,
  userFeedback: UserFeedbackContext
): Promise<MissionValidationResult> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const feedbackSummary = `
- Emotional state: ${userFeedback.emotionalState || 'Not provided'}
- Time taken: ${userFeedback.actualTimeMinutes ? `${userFeedback.actualTimeMinutes} minutes` : 'Not provided'} (${userFeedback.timeFeeling || 'unknown'})
- Used external help: ${userFeedback.usedExternalHelp ? `Yes - ${userFeedback.helpDetails || 'unspecified'}` : 'No'}
- Mission clarity: ${userFeedback.missionClarity || 'Not rated'}
- Learning type: ${userFeedback.learningType || 'Not specified'}
- Blockers: ${userFeedback.blockers || 'None mentioned'}
- Confidence level: ${userFeedback.confidenceLevel || 'Not rated'}`;

  const prompt = `You are a supportive engineering mentor reviewing a student's mission work. Your goal is to validate their effort and provide constructive guidance.

MISSION: ${missionTitle}
DESCRIPTION: ${missionDescription}
PROOF REQUIREMENT: ${proofRequirement}

SUBMITTED PROOF CONTENT:
${proofContent.substring(0, 8000)}

STUDENT'S SELF-REPORTED FEEDBACK:
${feedbackSummary}

VALIDATION CRITERIA ("NORMAL STRICT" - fair but meaningful):
APPROVE (set approved=true) when:
- The proof directly addresses the core requirement, even if execution is imperfect
- The student shows genuine effort and understanding of the task
- Minor issues exist but the fundamental work is present

REJECT (set approved=false) when:
- The proof is clearly unrelated to the mission requirement
- The submission is obviously incomplete (blank, placeholder text, stub code with no implementation)
- The work fundamentally misunderstands or ignores the requirement
- There is no meaningful content to evaluate

ANALYSIS GUIDELINES:
- Be encouraging but honest
- Acknowledge specific things they did well
- Consider their self-reported experience (if they struggled, provide supportive guidance)
- Provide 2-3 actionable suggestions for improvement
- Keep feedback professional and constructive

RESPONSE FORMAT - You MUST respond with valid JSON in exactly this structure:
{
  "decision": "APPROVE" or "REJECT",
  "analysis": "Your comprehensive feedback (3-5 paragraphs)",
  "rejectionReason": "Only if decision is REJECT - specific explanation of what's missing"
}

Output ONLY the JSON object, no other text.`;

  try {
    const result = await geminiRateLimiter.execute(() => model.generateContent(prompt));
    const response = result.response;
    const content = response.text().trim();

    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let parsed: any;
    try {
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', cleanedContent);
      throw new Error('Invalid JSON response from AI');
    }

    // Validate the response structure
    if (!parsed.decision || !parsed.analysis) {
      console.error('Invalid response structure:', parsed);
      throw new Error('Missing required fields in AI response');
    }

    // Determine approval based on explicit decision field
    const isApproved = parsed.decision === 'APPROVE';
    
    return {
      approved: isApproved,
      analysis: parsed.analysis || 'Your submission has been reviewed.',
      rejectionReason: isApproved ? undefined : (parsed.rejectionReason || 'The submission did not meet the requirements.'),
    };
  } catch (error) {
    console.error('AI validation error:', error);
    // On error, require manual review by rejecting with explanation
    return {
      approved: false,
      analysis: 'We encountered an issue analyzing your submission. Please try resubmitting.',
      rejectionReason: 'Technical error during validation. Please resubmit your proof.',
    };
  }
}
