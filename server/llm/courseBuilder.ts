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

export interface GeneratedRoadmap {
  title: string;
  content: string;
}

export async function generateCourseRoadmap(
  courseCode: string,
  courseName: string,
  extractedContent: string
): Promise<GeneratedRoadmap> {
  const groq = getGroqClient();

  const systemPrompt = `You are an expert curriculum designer creating a comprehensive learning roadmap for engineering students.

Given extracted content from course materials, create a structured document that:
1. Outlines what the student will learn
2. Identifies key concepts and skills to develop
3. Suggests practical applications and projects
4. Organizes topics in a logical learning sequence

Format the output as a well-structured markdown document with:
- A compelling title
- An executive summary (2-3 paragraphs)
- Learning objectives (bulleted list)
- Core topics organized by theme or module
- Key skills to develop
- Suggested projects or hands-on exercises
- Resources and next steps

Make it actionable and inspiring. Focus on practical engineering skills, not just theory.`;

  const userPrompt = `Create a comprehensive course roadmap for:
Course: ${courseCode} - ${courseName}

EXTRACTED CONTENT FROM COURSE MATERIALS:
${extractedContent.slice(0, 50000)}

Generate a detailed learning roadmap that will guide the student through mastering this material.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from Groq API');
  }

  const titleMatch = content.match(/^#\s*(.+)/m);
  const title = titleMatch ? titleMatch[1] : `${courseCode} Learning Roadmap`;

  return {
    title,
    content,
  };
}

export async function refineRoadmapWithChat(
  currentContent: string,
  userMessage: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const groq = getGroqClient();

  const systemPrompt = `You are a collaborative curriculum designer helping a student refine their course roadmap.

Current roadmap content:
${currentContent}

Help the user edit and improve this document. You can:
- Add new sections or topics
- Remove or reorganize content
- Make explanations clearer
- Add practical examples
- Adjust difficulty or pacing
- Emphasize specific areas

When you make changes, output the FULL updated document in markdown format.
If the user asks a question, answer it briefly and then provide the updated document.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of chatHistory.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: userMessage });

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from Groq API');
  }

  return content;
}
