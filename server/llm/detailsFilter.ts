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

export interface DetailFieldWithContent {
  name: string;
  placeholder: string;
}

export async function filterRelevantDetails(
  title: string,
  description: string,
  type: string
): Promise<DetailFieldWithContent[]> {
  const groq = getGroqClient();

  const systemPrompt = `You are an expert schedule optimizer. Given an activity, determine which detail fields are TRULY NECESSARY.
  
Activity types: personal, break, study, mission, reflection, class, exam, assignment

Return ONLY a JSON array of field objects with "name" and "placeholder" keys. Be selective - omit fields that don't apply.

Example response for "Morning Run" (personal):
[{"name":"Description","placeholder":"What to do"},{"name":"Energy Required","placeholder":"1-5 scale"}]

Example response for "Weekly Meeting" (personal):
[{"name":"Description","placeholder":"Meeting purpose"},{"name":"Location","placeholder":"Where or virtual link"},{"name":"Collaborators","placeholder":"Who's involved"},{"name":"Success Metrics","placeholder":"How to measure success"}]

Fields available:
- Description: What to do
- Reason: Why do this
- Goal/Outcome: What to achieve
- Resources: Materials needed
- Location: Where to do it
- Predict Difficulty Level: 1-5 difficulty
- Energy Required: 1-5 energy
- Collaborators: People involved
- Dependencies: Prerequisites/blockers
- Buffer Time: Extra time needed
- Reminder: Notification settings
- Success Metrics: How to measure completion

Output ONLY valid JSON array. No markdown, no explanation.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Type: ${type}\nTitle: "${title}"\nDescription: "${description}"\n\nReturn relevant fields as JSON array.` }
    ],
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return [{ name: 'Description', placeholder: 'Activity details' }];
  }

  try {
    const parsed = JSON.parse(content);
    const fields = Array.isArray(parsed) ? parsed : (parsed.fields || []);
    return fields.filter((f: any) => f.name && f.placeholder);
  } catch {
    return [{ name: 'Description', placeholder: 'Activity details' }];
  }
}
