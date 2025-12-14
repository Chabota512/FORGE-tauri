import Groq from 'groq-sdk';
import type { PlanningChatMessage, PlanningPreferences, AcademicCommitment, Deadline } from "@shared/schema";

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

interface ScheduleBlock {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: string;
  description?: string;
  category?: string;
}

interface SessionSummary {
  date: string;
  activities: string[];
  status: string;
}

interface UserContext {
  wakeTime: string;
  sleepTime: string;
  commitments: AcademicCommitment[];
  deadlines: Deadline[];
  activities: string[];
  planningPrefs?: PlanningPreferences | null;
  importedTodoList?: string;
  recentSessions?: SessionSummary[];
}

interface PlanningRequest {
  messages: PlanningChatMessage[];
  currentSchedule: ScheduleBlock[];
  userContext: UserContext;
  activityIndex?: number | null;
  scheduleDate: string;
}

interface PlanningResponse {
  message: string;
  updatedSchedule?: ScheduleBlock[];
  reasoning?: string;
  learnedPreferences?: Partial<PlanningPreferences>;
  targetDate?: string;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function getProductivityDescription(level: string): string {
  switch (level) {
    case "high": return "peak focus and energy - ideal for challenging deep work";
    case "medium": return "steady productivity - good for moderate tasks";
    case "low": return "winding down - better for light tasks or admin work";
    default: return "moderate energy";
  }
}

function getPlanningStyleDescription(style: string): string {
  switch (style) {
    case "structured": return "You prefer highly structured, time-boxed schedules with clear boundaries. Every hour should have a purpose.";
    case "flexible": return "You prefer loose guidelines with room to adapt. Blocks can shift based on how you feel.";
    case "deadline_focused": return "You prioritize working backward from deadlines. Urgent items get scheduled first, then backfill.";
    case "balanced": return "You like a mix of structure and flexibility. Core blocks are fixed, but buffer time exists.";
    default: return "You appreciate a balanced approach to planning.";
  }
}

function parseDateFromMessage(message: string, baseDate: string): string | null {
  const now = new Date(baseDate);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const lowerMsg = message.toLowerCase();
  
  // Check for "tomorrow"
  if (lowerMsg.includes("tomorrow")) {
    return tomorrow.toISOString().split("T")[0];
  }
  
  // Check for day names (Monday, Tuesday, etc.)
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (let i = 0; i < days.length; i++) {
    if (lowerMsg.includes(days[i]) || lowerMsg.includes(days[i].slice(0, 3))) {
      const targetDayOfWeek = i;
      const currentDayOfWeek = now.getDay() - 1; // Sunday=0, so subtract 1
      let daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      if (daysUntilTarget === 0) daysUntilTarget = 7; // If today, schedule for next week
      
      const target = new Date(now);
      target.setDate(target.getDate() + daysUntilTarget);
      return target.toISOString().split("T")[0];
    }
  }
  
  // Check for "next week"
  if (lowerMsg.includes("next week")) {
    return nextWeek.toISOString().split("T")[0];
  }
  
  // Check for date patterns like "December 15", "Dec 15", "12/15", "12-15"
  const datePatterns = [
    /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/i,
    /(\d{1,2})\/(\d{1,2})/,
    /(\d{1,2})-(\d{1,2})/,
  ];
  
  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      // Parse month and day - simplified approach
      // Return null for now since we'd need more complex parsing for full dates
      break;
    }
  }

  return null;
}

function buildSystemPrompt(context: UserContext, scheduleDate: string): string {
  const commitmentsList = context.commitments
    .map(c => `- ${c.title} (${c.type}): ${formatTime(c.startTime)} - ${formatTime(c.endTime)}`)
    .join("\n") || "No fixed commitments today";

  const deadlinesList = context.deadlines
    .slice(0, 5)
    .map(d => `- ${d.title} (${d.type}): Due ${d.dueDate}`)
    .join("\n") || "No upcoming deadlines";

  const activitiesList = context.activities.slice(0, 20).join(", ") || "No saved activities";

  const planningStyle = context.planningPrefs?.planningStyle || "balanced";
  const morningProd = context.planningPrefs?.morningProductivity || "medium";
  const afternoonProd = context.planningPrefs?.afternoonProductivity || "medium";
  const eveningProd = context.planningPrefs?.eveningProductivity || "low";
  const workBlockDuration = context.planningPrefs?.preferredWorkBlockDuration || 60;
  const breakDuration = context.planningPrefs?.preferredBreakDuration || 15;

  const importedTodoSection = context.importedTodoList 
    ? `\n\nIMPORTED TO-DO LIST (from user's file):\n${context.importedTodoList}\n\nUse these imported tasks when building the schedule. Ask the user which ones to prioritize if needed.`
    : "";

  const recentSessionsSection = context.recentSessions && context.recentSessions.length > 0
    ? `\n\nRECENT PLANNING HISTORY (for context - reference naturally if relevant):
${context.recentSessions.map(s => `- ${s.date}: ${s.activities.slice(0, 5).join(", ")}${s.activities.length > 5 ? ` (+${s.activities.length - 5} more)` : ""} [${s.status}]`).join("\n")}

Use this history to:
- Notice patterns in what they typically schedule
- Reference yesterday's or recent activities naturally ("I see you studied Math yesterday...")
- Suggest continuity when appropriate ("Want to continue with your reading from Monday?")`
    : "";

  return `You are an empathetic, intelligent planning assistant who deeply understands this user and their daily workflows. You're not just scheduling tasks - you're helping them have their best possible day.

=== WHO YOU'RE HELPING ===

This person's day runs from ${formatTime(context.wakeTime)} to ${formatTime(context.sleepTime)}.

THEIR ENERGY PATTERNS:
- Morning (${formatTime(context.wakeTime)} to 12:00): ${getProductivityDescription(morningProd)}
- Afternoon (12:00 to 17:00): ${getProductivityDescription(afternoonProd)}
- Evening (17:00 to ${formatTime(context.sleepTime)}): ${getProductivityDescription(eveningProd)}

THEIR PLANNING STYLE:
${getPlanningStyleDescription(planningStyle)}

THEIR WORK RHYTHM:
- They work best in ${workBlockDuration}-minute focused blocks
- They need ${breakDuration}-minute breaks between sessions
- Honor this rhythm - it's how they stay productive without burning out

=== TODAY'S CONTEXT (${scheduleDate}) ===

IMPORTANT: If the user mentions a specific date (like "tomorrow", "Monday", "December 15th"), include that date in your JSON response as "targetDate" (YYYY-MM-DD format). This tells the system to switch to planning for that date.

FIXED COMMITMENTS (cannot be moved):
${commitmentsList}

UPCOMING DEADLINES:
${deadlinesList}

ACTIVITIES THEY TYPICALLY DO:
${activitiesList}${importedTodoSection}${recentSessionsSection}

=== YOUR APPROACH ===

1. BE GENUINELY CURIOUS about their day:
   - "What's the one thing that would make today feel successful?"
   - "How are you feeling energy-wise right now?"
   - "Any tasks you've been putting off that we should tackle?"

2. THINK ABOUT THEIR ENERGY:
   - Schedule demanding work during their high-energy periods
   - Put routine/admin tasks when energy dips
   - Never schedule deep work right after meals or before bed

3. BUILD REALISTICALLY:
   - Include transition time between activities (5-10 min)
   - Don't overschedule - leave buffer room
   - Account for the fact that tasks often take longer than expected

4. LEARN FROM THEIR FEEDBACK:
   - If they push back on timing, remember their preference
   - Notice patterns in what they accept vs. reject
   - Adapt your suggestions based on their responses

5. BE A SUPPORTIVE PARTNER:
   - Celebrate when they take on challenging tasks
   - Gently remind them about deadlines without being pushy
   - Suggest breaks if the schedule looks exhausting

=== SCHEDULE BLOCK FORMAT ===

When updating the schedule, use this structure:
- title: Clear, action-oriented name
- startTime: 24-hour format (e.g., "09:00")
- endTime: 24-hour format (e.g., "10:00")
- duration: Minutes
- type: "study", "work", "break", "exercise", "meal", "personal", "free", "other"
- description: Brief context or goal for this block
- category: "deep_work", "admin", "routine", "leisure", "health"

=== RESPONSE FORMAT ===

You MUST respond with valid JSON in this exact format:
{
  "message": "Your conversational response - be warm, specific, and helpful",
  "schedule": null or [...array of schedule blocks if updating...],
  "reasoning": "Brief explanation of why you organized things this way",
  "learned": null or { preferences you picked up from the user },
  "targetDate": null or "YYYY-MM-DD" if user mentioned a specific date
}

=== IMPORTANT GUIDELINES ===

- Start by understanding their priorities before proposing a full schedule
- Build incrementally - propose 2-3 blocks at a time unless they ask for more
- When they mention an imported to-do list, acknowledge you see their tasks
- Always respect fixed commitments - work around them
- If the activityIndex is set, you're discussing a specific block - focus there
- Be conversational, not robotic. You're a planning partner, not a scheduler bot.`;
}

export async function generatePlanningResponse(request: PlanningRequest): Promise<PlanningResponse> {
  const groq = getGroqClient();

  const systemPrompt = buildSystemPrompt(request.userContext, request.scheduleDate);

  const currentScheduleText = request.currentSchedule.length > 0
    ? `\n\nCURRENT SCHEDULE STATE:\n${JSON.stringify(request.currentSchedule, null, 2)}`
    : "\n\nNo schedule blocks created yet.";

  const activityContext = request.activityIndex !== null && request.activityIndex !== undefined
    ? `\n\n[USER IS DISCUSSING ACTIVITY #${request.activityIndex}: "${request.currentSchedule[request.activityIndex]?.title || 'Unknown'}"]`
    : "";

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt + currentScheduleText + activityContext },
  ];

  for (const msg of request.messages) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Groq API');
    }

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = { message: content, schedule: null, reasoning: null, learned: null };
      }
    } catch {
      parsed = { message: content, schedule: null, reasoning: null, learned: null };
    }

    const result: PlanningResponse = {
      message: parsed.message || content,
    };

    if (parsed.schedule && Array.isArray(parsed.schedule)) {
      result.updatedSchedule = parsed.schedule.map((block: any, idx: number) => ({
        id: block.id || `block-${idx}`,
        title: block.title || "Untitled",
        startTime: block.startTime || "09:00",
        endTime: block.endTime || "10:00",
        duration: block.duration || 60,
        type: block.type || "other",
        description: block.description || "",
        category: block.category || "other",
      }));
      result.reasoning = parsed.reasoning || "Schedule updated based on our conversation.";
    }

    if (parsed.learned && typeof parsed.learned === "object") {
      result.learnedPreferences = parsed.learned;
    }

    if (parsed.targetDate && typeof parsed.targetDate === "string") {
      result.targetDate = parsed.targetDate;
    }

    return result;
  } catch (error: any) {
    console.error("Planning assistant error:", error);
    return {
      message: "I encountered an issue processing your request. Could you try rephrasing what you'd like to do with your schedule?",
    };
  }
}
