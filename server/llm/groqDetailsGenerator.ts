import Groq from 'groq-sdk';

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is not configured');
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

export interface ActivityDetails {
  [fieldName: string]: string;
}

export async function generateActivityDetailsWithGroq(
  title: string,
  description: string,
  type: string,
  fieldNames: string[]
): Promise<ActivityDetails> {
  const groq = getGroqClient();

  const prompt = `You are a practical schedule optimizer. Generate brief, actionable activity details. Be concise - 1 sentence max per field.

Activity: ${title}
Type: ${type}
${description ? `Details: ${description}` : ''}

Required fields: ${fieldNames.join(', ')}

CRITICAL: Generate STATEMENTS and ANSWERS, NOT questions or prompts
- For "Reason": provide WHY as a statement (e.g., "To understand electron behavior" NOT "Why study electrons?")
- For "Goal/Outcome": state what success is (e.g., "Master electron configuration" NOT "What should I achieve?")
- For all fields: give actionable content, not instructions

Generate specific, situationally-aware suggestions. Return ONLY valid JSON with these exact field names as keys.

Example:
{"Description":"Study electron orbitals and bonding","Reason":"Required for chemistry exam prep","Goal/Outcome":"Understand electron configuration","Energy Required":"4"}

Important: Be direct. No fluff. Focus on what's actionable right now.`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    // Extract JSON from response
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as ActivityDetails;

    // Ensure all fields are present and non-empty
    const details: ActivityDetails = {};
    for (const field of fieldNames) {
      const value = parsed[field];
      details[field] = (value && value.trim().length > 0) ? value.trim() : '';
    }
    return details;
  } catch (error) {
    console.error('Failed to generate details with Groq:', error);
    throw error;
  }
}
