import Groq from 'groq-sdk';

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

export async function analyzeActivityDetails(
  title: string,
  description: string
): Promise<string[]> {
  const groq = getGroqClient();

  const allFields = [
    "Description",
    "Reason",
    "Goal/Outcome",
    "Resources",
    "Location",
    "Predict Difficulty Level",
    "Energy Required",
    "Collaborators",
    "Dependencies",
    "Buffer Time",
    "Reminder",
    "Success Metrics"
  ];

  const systemPrompt = `You are an expert schedule optimizer. Analyze an activity and determine which detail fields are ESSENTIAL for that activity type.

Available fields:
1. Description - activity details
2. Reason - why do this activity
3. Goal/Outcome - what to achieve
4. Resources - materials/tools needed
5. Location - where to do it
6. Predict Difficulty Level - 1-5 difficulty
7. Energy Required - 1-5 energy
8. Collaborators - people involved
9. Dependencies - prerequisites/blockers
10. Buffer Time - extra time needed
11. Reminder - notification settings
12. Success Metrics - how to measure completion

You MUST respond with a valid JSON object containing a "fields" array with ONLY the field names that are relevant.

Example responses:
{"fields": ["Description", "Success Metrics", "Buffer Time"]}
{"fields": ["Description", "Reason", "Goal/Outcome", "Resources", "Predict Difficulty Level", "Energy Required", "Dependencies", "Success Metrics"]}
{"fields": ["Description", "Location", "Collaborators", "Goal/Outcome"]}

Output ONLY valid JSON object with "fields" array. No markdown, no explanation.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Activity Title: "${title}"\nActivity Description: "${description}"\n\nReturn the relevant fields as JSON.` }
    ],
    temperature: 0.3,
    max_tokens: 300,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return allFields;
  }

  try {
    const parsed = JSON.parse(content);
    const relevantFields = Array.isArray(parsed) ? parsed : (parsed.fields || allFields);
    return relevantFields.filter((f: string) => allFields.includes(f));
  } catch {
    return allFields;
  }
}
