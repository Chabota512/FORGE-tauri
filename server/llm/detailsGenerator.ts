import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not configured');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export interface ActivityDetails {
  [fieldName: string]: string;
}

// Default suggestions for fields when API fails
const DEFAULT_SUGGESTIONS: Record<string, string> = {
  "Description": "Complete the task as described",
  "Reason": "Important for current commitments and goals",
  "Goal/Outcome": "Achieve the intended result",
  "Resources": "Gather necessary materials and tools",
  "Location": "Choose appropriate location",
  "Predict Difficulty Level": "3",
  "Energy Required": "3",
  "Collaborators": "Work independently or with others as needed",
  "Dependencies": "Complete prerequisites first",
  "Buffer Time": "5",
  "Reminder": "10",
  "Success Metrics": "Measure completion by task standards"
};

export async function generateActivityDetails(
  title: string,
  description: string,
  type: string,
  fieldNames: string[],
  userContext: {
    recentMissions?: string[];
    deadlines?: string[];
    preferences?: Record<string, any>;
    courses?: Array<{ code: string; name: string }>;
    feedbackPatterns?: {
      avgCompletion?: number;
      avgDifficulty?: number;
      commonSkipReasons?: string[];
    };
    knowledgeBase?: Record<string, string[]>;
    scheduleContext?: {
      timeOfDay?: string;
      movedFromTimeSlot?: string;
      previousActivities?: string[];
      upcomingActivities?: string[];
    };
  } = {}
): Promise<ActivityDetails> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const fieldsList = fieldNames.join(', ');
  const missionsContext = userContext.recentMissions?.slice(0, 5).join('; ') || 'none';
  const deadlinesContext = userContext.deadlines?.slice(0, 3).join('; ') || 'none';
  
  const coursesContext = userContext.courses?.map(c => `${c.code}: ${c.name}`).join('; ') || 'none';
  const kbContext = userContext.knowledgeBase 
    ? Object.entries(userContext.knowledgeBase).map(([code, topics]) => `${code}: ${topics.join(', ')}`).join('; ')
    : 'none';
  
  const feedbackContext = userContext.feedbackPatterns
    ? `Completion rate: ${((userContext.feedbackPatterns.avgCompletion || 0) * 100).toFixed(0)}%, Avg difficulty: ${userContext.feedbackPatterns.avgDifficulty?.toFixed(1) || 'N/A'}/5, Common skip reasons: ${userContext.feedbackPatterns.commonSkipReasons?.join(', ') || 'none'}`
    : 'No feedback data';
    
  const scheduleContext = userContext.scheduleContext
    ? `Time of day: ${userContext.scheduleContext.timeOfDay || 'unspecified'}${userContext.scheduleContext.movedFromTimeSlot ? ` (moved from ${userContext.scheduleContext.movedFromTimeSlot})` : ''}, Previous activities: ${userContext.scheduleContext.previousActivities?.join(', ') || 'none'}, Upcoming: ${userContext.scheduleContext.upcomingActivities?.join(', ') || 'none'}`
    : 'No schedule context';

  const prompt = `You are an expert personal schedule planner with deep knowledge of the user's academic courses, past patterns, and preferences. Generate rich, comprehensive activity details that will help the user succeed.

ACTIVITY TO PLAN:
- Title: "${title}"
- Description: "${description}"
- Type: ${type}

USER'S FULL CONTEXT:
- Enrolled Courses: ${coursesContext}
- Recent Missions/Tasks: ${missionsContext}
- Upcoming Deadlines: ${deadlinesContext}
- Course Knowledge Topics: ${kbContext}
- Historical Patterns: ${feedbackContext}
- Schedule Context: ${scheduleContext}
- User Preferences: ${JSON.stringify(userContext.preferences || {})}

FIELDS TO COMPLETE: ${fieldsList}

CRITICAL INSTRUCTIONS:
1. Generate DETAILED, COMPREHENSIVE responses - NOT brief summaries
2. Use the user's actual course names, deadlines, and context when relevant
3. If the activity relates to a course (e.g., "Study MC401"), reference specific topics from their knowledge base
4. Consider the time of day and schedule flow when suggesting approach
5. If activity was moved to a different time slot, acknowledge this and adjust suggestions accordingly
6. For study activities, break down into specific sub-tasks or focus areas
7. For breaks, suggest contextually appropriate recovery based on surrounding activities
8. Be specific and actionable - give real guidance, not generic advice

FIELD-SPECIFIC GUIDANCE:
- "Description": Provide a detailed breakdown of what to do, including specific steps or focus areas (3-5 sentences)
- "Reason": Explain WHY this matters in the context of their goals, courses, and deadlines (2-3 sentences)
- "Goal/Outcome": Define clear, measurable success criteria specific to this session (2-3 bullet points or sentences)
- "Resources": List specific materials, tools, websites, or references needed
- "Success Metrics": Define concrete ways to measure if the activity was successful
- "Location": Suggest optimal location based on activity type
- "Energy Required": Rate 1-5 with brief justification
- "Predict Difficulty Level": Rate 1-5 with brief justification

Return a JSON object with the exact field names as keys. Be thorough and helpful.

Output ONLY valid JSON with the specified fields. No markdown or explanation.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text();

    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as ActivityDetails;
    
    // Filter out empty values and use defaults for empty fields
    const details: ActivityDetails = {};
    for (const field of fieldNames) {
      const value = parsed[field];
      // Use value if non-empty, otherwise use default suggestion
      details[field] = (value && value.trim()) ? value : DEFAULT_SUGGESTIONS[field] || '';
    }
    return details;
  } catch (error) {
    console.error('Gemini generation failed for activity:', title, error instanceof Error ? error.message : 'Unknown error');
    
    // Try Groq as fallback
    if (isGroqConfigured()) {
      try {
        const { generateActivityDetailsWithGroq } = await import('./groqDetailsGenerator');
        const groqDetails = await generateActivityDetailsWithGroq(title, description, type, fieldNames);
        
        // Use Groq results, or defaults if empty
        const details: ActivityDetails = {};
        for (const field of fieldNames) {
          const value = groqDetails[field];
          details[field] = (value && value.trim()) ? value : DEFAULT_SUGGESTIONS[field] || '';
        }
        console.info('Successfully generated activity details via Groq fallback');
        return details;
      } catch (groqError) {
        console.error('Groq fallback also failed:', groqError instanceof Error ? groqError.message : 'Unknown error');
      }
    }
    
    // Final fallback: return default suggestions
    console.warn('Using default suggestions for activity:', title);
    const fallback: ActivityDetails = {};
    for (const field of fieldNames) {
      fallback[field] = DEFAULT_SUGGESTIONS[field] || '';
    }
    return fallback;
  }
}
