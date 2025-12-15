import Groq from 'groq-sdk';
import type { LearnerProfile, KnowledgeChatMessage } from '@shared/schema';

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

export interface KnowledgeChatParams {
  courseCode: string;
  courseName: string;
  userMessage: string;
  chatHistory: KnowledgeChatMessage[];
  currentProfile: LearnerProfile | null;
}

export interface ProfileUpdates {
  overallConfidence?: number;
  confusionPoints?: string;
  prerequisiteGaps?: string;
  learningStyle?: string;
  preferredPracticeTypes?: string;
  idealSessionLength?: number;
  bestStudyTimes?: string;
  topicsCoveredInClass?: string;
  topicsSelfStudied?: string;
  upcomingDeadlines?: string;
  interestedApplications?: string;
  projectGoals?: string;
  conceptsNeedingRepetition?: string;
  conceptsWellRetained?: string;
  excitingTopics?: string;
  boringTopics?: string;
  deepDiveAreas?: string;
  careerGoals?: string;
  currentPace?: string;
}

export interface KnowledgeChatResult {
  response: string;
  profileUpdates: ProfileUpdates;
}

function formatChatHistory(history: KnowledgeChatMessage[]): string {
  if (history.length === 0) return "No previous messages.";
  
  return history
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'FORGE'}: ${m.content}`)
    .join('\n');
}

function formatCurrentProfile(profile: LearnerProfile | null): string {
  if (!profile) return "No profile data yet - this is a new learner.";

  const sections: string[] = [];
  
  if (profile.overallConfidence) {
    sections.push(`Overall Confidence: ${profile.overallConfidence}/100`);
  }
  
  if (profile.confusionPoints) {
    sections.push(`Areas of Confusion: ${profile.confusionPoints}`);
  }
  
  if (profile.learningStyle) {
    sections.push(`Learning Style: ${profile.learningStyle}`);
  }
  
  if (profile.preferredPracticeTypes) {
    sections.push(`Preferred Practice: ${profile.preferredPracticeTypes}`);
  }
  
  if (profile.topicsCoveredInClass) {
    sections.push(`Topics Covered in Class: ${profile.topicsCoveredInClass}`);
  }
  
  if (profile.topicsSelfStudied) {
    sections.push(`Self-Studied Topics: ${profile.topicsSelfStudied}`);
  }
  
  if (profile.conceptsNeedingRepetition) {
    sections.push(`Needs More Practice: ${profile.conceptsNeedingRepetition}`);
  }
  
  if (profile.conceptsWellRetained) {
    sections.push(`Well Understood: ${profile.conceptsWellRetained}`);
  }
  
  if (profile.excitingTopics) {
    sections.push(`Finds Exciting: ${profile.excitingTopics}`);
  }
  
  if (profile.careerGoals) {
    sections.push(`Career Goals: ${profile.careerGoals}`);
  }
  
  if (profile.currentPace) {
    sections.push(`Current Pace: ${profile.currentPace}`);
  }
  
  if (profile.consistencyStreak) {
    sections.push(`Consistency Streak: ${profile.consistencyStreak} days`);
  }

  return sections.length > 0 ? sections.join('\n') : "Profile exists but no detailed data captured yet.";
}

export async function analyzeKnowledgeChat(params: KnowledgeChatParams): Promise<KnowledgeChatResult> {
  const groq = getGroqClient();
  const { courseCode, courseName, userMessage, chatHistory, currentProfile } = params;

  const systemPrompt = `You are FORGE, an intelligent learning companion that helps engineering students track and improve their understanding of course materials. You're having a conversation about ${courseName} (${courseCode}).

YOUR ROLE:
1. Have natural, supportive conversations about the student's learning progress
2. Help them articulate what they understand and where they're struggling
3. Extract insights about their learning state to personalize future missions
4. Follow the "20-Mile March" philosophy: steady, consistent daily progress beats sprints

CURRENT LEARNER PROFILE:
${formatCurrentProfile(currentProfile)}

RECENT CONVERSATION:
${formatChatHistory(chatHistory)}

WHAT TO EXTRACT FROM THE CONVERSATION:
Listen for signals about:
- Confidence levels (how sure they feel about topics)
- Confusion points (specific concepts or calculations they find hard)
- Topics they've covered in class vs self-studied
- Learning preferences (visual, hands-on, theoretical)
- Areas that need more repetition
- Topics they find exciting or boring
- Career goals and real-world applications they care about
- Study habits and best times for focus
- Upcoming deadlines or exams

RESPONSE GUIDELINES:
1. Be conversational and encouraging, not clinical
2. Ask clarifying questions to understand their learning state better
3. Acknowledge their feelings about difficult topics
4. Suggest practical next steps when appropriate
5. Keep responses concise (2-4 sentences usually)

You must respond in JSON format with two fields:
1. "response": Your conversational reply to the student
2. "profileUpdates": An object containing any learner profile fields that should be updated based on this message. Only include fields that have new information. Use JSON arrays for list fields (like topics).

Example profile update fields (only include if the message reveals new info):
- overallConfidence: number 0-100
- confusionPoints: JSON array of specific areas of confusion
- prerequisiteGaps: JSON array of prerequisite topics they're missing
- learningStyle: "visual" | "hands-on" | "theoretical" | "mixed"
- preferredPracticeTypes: JSON array like ["problems", "projects", "reading"]
- topicsCoveredInClass: JSON array of topics
- topicsSelfStudied: JSON array of topics
- conceptsNeedingRepetition: JSON array of concepts that fade quickly
- conceptsWellRetained: JSON array of concepts that stick
- excitingTopics: JSON array of topics they enjoy
- boringTopics: JSON array of topics they find dull
- careerGoals: text about their career aspirations
- projectGoals: text about projects they want to build
- currentPace: "slow" | "moderate" | "fast"
- upcomingDeadlines: JSON array with format [{"name": "Midterm", "date": "2024-03-15"}]`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content || '{}';
  
  try {
    const parsed = JSON.parse(content);
    return {
      response: parsed.response || "I'm here to help you understand your learning progress. What would you like to discuss about this course?",
      profileUpdates: parsed.profileUpdates || {}
    };
  } catch (error) {
    console.error("Failed to parse knowledge chat response:", error);
    return {
      response: "I'd love to hear about your learning journey in this course. What topics have you been working on?",
      profileUpdates: {}
    };
  }
}

export function isKnowledgeChatConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}
