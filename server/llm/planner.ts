import { GoogleGenerativeAI } from '@google/generative-ai';
import { isGeminiConfigured } from './gemini';
import { loadContextForCourse as loadContextFromDB } from './ingestPipeline';
import { 
  buildUnifiedContext, 
  formatUnifiedContextForPrompt,
  type UnifiedLearnerContext,
  type LearnerProfileSummary,
  type MissionHistorySummary,
  type SchedulePerformanceSummary
} from './unifiedContext';

interface TimeBlock {
  startTime: string;
  endTime: string;
  type: 'class' | 'exam' | 'assignment' | 'personal' | 'study' | 'mission' | 'break' | 'reflection';
  title: string;
  description?: string;
  courseCode?: string;
  priority: number;
}

interface ScheduleGenerationInput {
  date: string;
  commitments: Array<{
    id: number;
    title: string;
    type: string;
    courseId?: number;
    description?: string;
    startTime: string;
    endTime: string;
    priority?: number;
  }>;
  missions: Array<{
    id: number;
    title: string;
    description: string;
    courseCode: string;
    status: string;
    estimatedDuration?: number;
    difficulty?: string;
    energyLevel?: string;
    materials?: string[];
    proofRequirement?: string;
  }>;
  settings: {
    targetDuration: number;
    missionFocus: string;
  };
  courseContexts: Record<string, {
    concepts: Array<{ name: string; description: string }>;
    summary: string;
  }>;
  deadlines?: Array<{
    id: number;
    title: string;
    dueDate: string;
    priority: number;
  }>;
  books?: Array<{
    id: number;
    title: string;
    author?: string;
    currentChapter: number;
    totalChapters?: number;
    timeCategory: string;
  }>;
  userPatterns?: {
    avgPace: number;
    preferredStartTime: string;
    preferredEndTime: string;
    avgEnergy: number;
    breakFrequency: number;
    restDays: number[];
  };
  // DPM: User Preferences
  userPreferences?: {
    id?: number;
    wakeTime: string | null;
    sleepTime: string | null;
    targetWorkHours: number | null;
    targetFreeHours: number | null;
    targetOtherHours: number | null;
    consecutiveStudyLimit: number | null;
    personalGoals: string | null;
    scheduleGenerationTime: string | null;
    updatedAt?: string | null;
  };
  // DPM: Activity Library
  activities?: Array<{
    id: number;
    name: string;
    category: string;
    defaultDuration: number | null;
    isDefault: boolean | null;
    isActive: boolean | null;
    preferredTime: string | null;
    createdAt?: string | null;
  }>;
  // DPM: Chat prompt for collaborative building
  chatPrompt?: string;
  // Unified Learner Context (connects all feedback loops)
  unifiedContext?: UnifiedLearnerContext;
}

interface GeneratedSchedule {
  timeBlocks: TimeBlock[];
  reasoning: string;
}

async function loadContextForCourse(courseCode: string, userId?: number): Promise<any> {
  return await loadContextFromDB(courseCode, userId);
}

export async function generateDailySchedule(input: ScheduleGenerationInput): Promise<GeneratedSchedule> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API is not configured for schedule generation');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const dayOfWeek = new Date(input.date).toLocaleDateString('en-US', { weekday: 'long' });

  const commitmentsList = input.commitments.map(c => 
    `- ${c.startTime}-${c.endTime}: ${c.title} (${c.type})${c.description ? ` - ${c.description}` : ''}`
  ).join('\n') || 'No fixed commitments for this day.';

  const missionsList = input.missions.map(m => {
    const details: string[] = [];
    if (m.estimatedDuration) details.push(`Duration: ${m.estimatedDuration}min`);
    if (m.difficulty) details.push(`Difficulty: ${m.difficulty}`);
    if (m.energyLevel) details.push(`Energy: ${m.energyLevel}`);
    if (m.materials && m.materials.length > 0) details.push(`Materials: ${m.materials.join(', ')}`);
    if (m.proofRequirement) details.push(`Proof: ${m.proofRequirement}`);
    const detailsStr = details.length > 0 ? ` | ${details.join(' | ')}` : '';
    return `- [${m.courseCode}] ${m.title}: ${m.description} (Status: ${m.status})${detailsStr}`;
  }).join('\n') || 'No active missions.';

  const conceptsList = Object.entries(input.courseContexts).map(([code, ctx]) => {
    const concepts = ctx.concepts?.slice(0, 3).map(c => c.name).join(', ') || 'None';
    return `${code}: ${concepts}`;
  }).join('\n') || 'No course context available.';

  // Upcoming deadlines (within 7 days)
  let deadlineContext = '';
  if (input.deadlines && input.deadlines.length > 0) {
    const today = new Date(input.date);
    const upcomingDeadlines = input.deadlines.filter(d => {
      const dueDate = new Date(d.dueDate);
      const daysUntil = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    if (upcomingDeadlines.length > 0) {
      deadlineContext = `\n\n**Upcoming Deadlines (Next 7 Days):**\n${upcomingDeadlines.map(d => {
        const daysUntil = Math.floor((new Date(d.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return `- ${d.title}: ${d.dueDate} (${daysUntil} days away, Priority: ${d.priority}/3)`;
      }).join('\n')}`;
    }
  }

  // User pattern insights
  let patternContext = '';
  if (input.userPatterns) {
    const patterns = input.userPatterns;
    patternContext = `\n\n**Adaptive Learning Input (from recent feedback):**
- Preferred work hours: ${patterns.preferredStartTime} - ${patterns.preferredEndTime}
- Average energy level: ${patterns.avgEnergy}/5 (${patterns.avgEnergy >= 4 ? 'high' : patterns.avgEnergy >= 3 ? 'medium' : 'low'})
- Typical study pace: ${patterns.avgPace} minutes per focused block
- Optimal break frequency: every ${patterns.breakFrequency} minutes`;
  }

  // DPM: User Preferences Context
  let preferencesContext = '';
  const prefs = input.userPreferences;
  if (prefs) {
    preferencesContext = `\n\n**User Settings (DPM Preferences):**
- Wake Time: ${prefs.wakeTime || '06:00'}
- Sleep Time: ${prefs.sleepTime || '22:00'}
- Target Work Hours: ${prefs.targetWorkHours || 6} hours/day
- Target Free Hours: ${prefs.targetFreeHours || 4} hours/day  
- Target Other Hours: ${prefs.targetOtherHours || 4} hours/day (meals, hygiene, etc.)
- Consecutive Study Limit: ${prefs.consecutiveStudyLimit || 90} minutes max before mandatory break
${prefs.personalGoals ? `- Personal Goals: ${prefs.personalGoals}` : ''}`;
  }

  // DPM: Activity Library Context
  let activitiesContext = '';
  if (input.activities && input.activities.length > 0) {
    const activeActivities = input.activities.filter(a => a.isActive);
    if (activeActivities.length > 0) {
      activitiesContext = `\n\n**Activity Library (Auto-schedule these):**\n${activeActivities.map(a => 
        `- ${a.name} (${a.category}): ${a.defaultDuration || 30} min${a.preferredTime ? `, preferred at ${a.preferredTime}` : ''}`
      ).join('\n')}`;
    }
  }

  // Books Reading Context
  let booksContext = '';
  if (input.books && input.books.length > 0) {
    booksContext = `\n\n**Currently Reading (Schedule reading sessions):**\n${input.books.map(b => {
      const progress = b.totalChapters ? `Chapter ${b.currentChapter}/${b.totalChapters}` : `Chapter ${b.currentChapter}`;
      return `- "${b.title}"${b.author ? ` by ${b.author}` : ''} (${progress}, time category: ${b.timeCategory})`;
    }).join('\n')}`;
  }

  // DPM: Chat prompt for collaborative building
  let chatContext = '';
  if (input.chatPrompt) {
    chatContext = `\n\n**USER REQUEST:**\n"${input.chatPrompt}"\n\nPrioritize this request when building the schedule.`;
  }

  // Unified Learner Context (connects all feedback loops)
  let unifiedContextSection = '';
  if (input.unifiedContext) {
    unifiedContextSection = `\n\n${formatUnifiedContextForPrompt(input.unifiedContext)}`;
  }

  const wakeTime = prefs?.wakeTime || '06:00';
  const sleepTime = prefs?.sleepTime || '22:00';
  const targetWorkHours = prefs?.targetWorkHours || 6;
  const targetFreeHours = prefs?.targetFreeHours || 4;
  const targetOtherHours = prefs?.targetOtherHours || 4;
  const consecutiveLimit = prefs?.consecutiveStudyLimit || 90;

  const prompt = `**Role:** You are the user's **Personal Engineering Advisor** and **Dynamic Planning Module (DPM)**. Your core function is to generate a daily schedule that is **intelligent, adaptive, and balanced**.

**Objective:** Create a **Goldilocks Schedule** that maximizes learning retention, minimizes burnout, and ensures all academic and personal commitments are met. The schedule must be **dynamic**, adjusting based on the user's real-time feedback and pace.

**Key Principles:**
1. **Balance:** The schedule MUST adhere to the user's preferred balance: ${targetWorkHours}h Work, ${targetFreeHours}h Free, ${targetOtherHours}h Other
2. **Adaptation:** Learn from the user's feedback and adjust time allocations accordingly
3. **Goal Alignment:** All activities must align with the user's stated personal goals
4. **Transparency:** Provide clear reasoning for scheduling decisions

**Date:** ${input.date} (${dayOfWeek})

**Fixed Commitments for Today:**
${commitmentsList}${deadlineContext}

**Active Missions to Complete:**
${missionsList}

**Course Focus Areas:**
${conceptsList}${patternContext}${preferencesContext}${activitiesContext}${booksContext}${chatContext}${unifiedContextSection}

**ADAPTIVE SCHEDULING RULES (Based on Learner Data):**
- If learner struggles with a course, schedule it during peak productivity hours
- If missions consistently take longer than estimated, add 20% buffer time
- If common blockers include "materials", schedule prep time before missions
- If low energy hours are identified, schedule breaks or light tasks then
- If learner has high confidence in a topic, allow shorter review blocks
- If consistency streak is high, maintain current scheduling approach

**PLANNING ALGORITHM (Follow This Strict Hierarchy):**

1. **Fixed Blocks First:** Schedule ALL non-negotiable blocks (classes, exams, fixed commitments)

2. **Time Balance Check:** 
   - Calculate remaining available time between ${wakeTime} and ${sleepTime}
   - CRITICAL: DO NOT exceed Target Work Hours (${targetWorkHours}h)
   - Ensure adequate free time (${targetFreeHours}h) and other activities (${targetOtherHours}h)

3. **Deadline-Driven Work:**
   - Prioritize tasks for imminent deadlines
   - Increase study time by 25-50% for deadlines within 1-2 days

4. **Mission Breakdown & Adaptation:**
   - Break down missions into focused blocks (Theory, Practical, Review)
   - Target block duration: ${input.settings.targetDuration} minutes
   - Respect mission dependencies

5. **Activity Library Integration:**
   - Schedule selected activities from the library at their preferred times
   - If no activities selected, automatically include: Meals, Exercise, Hygiene

6. **Book Reading Sessions:**
   - For each "Currently Reading" book, schedule 20-30 minute reading sessions
   - Respect the book's time category (morning/afternoon/evening/free_time)
   - Schedule during low-energy periods or between intense study blocks
   - Reading is passive learning - use for recovery between hard tasks
   - If time category is "free_time", schedule flexibly in available gaps

7. **Balance & Reflection:**
   - Schedule Rest/Naps based on productivity data
   - Include Reflection time at end of day
   - Add Hands-on Practice blocks

8. **Final Check:**
   - NO study block should exceed ${consecutiveLimit} minutes without a mandatory break
   - Verify work/free/other balance is maintained

Generate a daily schedule from ${wakeTime} to ${sleepTime}. Output ONLY valid JSON with this exact structure:
{
  "timeBlocks": [
    {
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "type": "class|exam|assignment|personal|study|mission|break|reflection",
      "title": "Activity Title",
      "description": "Brief description of what to do",
      "courseCode": "Course code if applicable or null",
      "priority": 1-3
    }
  ],
  "reasoning": "A 3-5 sentence justification explaining how the schedule balances workload, deadlines, and personal time, and how it was adjusted based on the user's feedback and personal goals."
}

Output ONLY valid JSON, no markdown code blocks or additional text.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const content = response.text();

  try {
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedContent) as GeneratedSchedule;
    return parsed;
  } catch (error) {
    console.error('Failed to parse Gemini schedule response:', content);
    throw new Error('Failed to parse schedule from Gemini response');
  }
}

export function loadAllCourseContexts(): Record<string, any> {
  const courseCodes = ["MC450", "MC401", "EM411"];
  const contexts: Record<string, any> = {};
  
  for (const code of courseCodes) {
    contexts[code] = loadContextForCourse(code);
  }
  
  return contexts;
}

interface EnrichmentResult {
  enrichedBlocks: TimeBlock[];
  unknownActivities: Array<{
    index: number;
    title: string;
    question: string;
  }>;
}

export async function enrichScheduleBlocks(
  scheduleDate: string,
  editedBlocks: TimeBlock[],
  originalBlocks: TimeBlock[]
): Promise<EnrichmentResult> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API is not configured for schedule enrichment');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const enrichedBlocks: TimeBlock[] = [];
  const unknownActivities: Array<{ index: number; title: string; question: string }> = [];

  for (let i = 0; i < editedBlocks.length; i++) {
    const editedBlock = editedBlocks[i];
    const originalBlock = originalBlocks[i];

    // Check if title changed (needs enrichment)
    const titleChanged = !originalBlock || editedBlock.title !== originalBlock.title;

    if (!titleChanged) {
      // No change, keep original
      enrichedBlocks.push(editedBlock);
      continue;
    }

    // Title changed - enrich with AI
    const timeOfDay = getTimeOfDay(editedBlock.startTime);
    const duration = calculateDuration(editedBlock.startTime, editedBlock.endTime);
    
    const enrichmentPrompt = `You are analyzing a schedule activity that needs detailed description.

**Activity Details:**
- Title: "${editedBlock.title}"
- Time: ${editedBlock.startTime} - ${editedBlock.endTime} (${duration} minutes)
- Time of Day: ${timeOfDay}
- Schedule Date: ${scheduleDate}

**Task:**
Determine if this is a KNOWN activity type (academic work, meal, exercise, hygiene, break, etc.) or an UNKNOWN custom activity.

If KNOWN:
- Generate a concise, contextual description (1-2 sentences)
- Consider the time of day and duration
- Make it actionable and specific

If UNKNOWN (custom/unclear activity):
- Generate a contextual question to ask the user
- Question should help understand what they'll do during this time
- Include time context and duration in the question

Respond with ONLY valid JSON in this format:
{
  "isKnown": true/false,
  "description": "Generated description if known, or null if unknown",
  "question": "Generated question if unknown, or null if known",
  "type": "class|exam|assignment|personal|study|mission|break|reflection",
  "courseCode": "Course code if applicable or null"
}

Output ONLY valid JSON, no markdown or explanation.`;

    try {
      const result = await model.generateContent(enrichmentPrompt);
      const response = result.response;
      const content = response.text();

      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedContent) as {
        isKnown: boolean;
        description: string | null;
        question: string | null;
        type: string;
        courseCode: string | null;
      };

      if (parsed.isKnown && parsed.description) {
        // Known activity - use AI-generated details
        enrichedBlocks.push({
          ...editedBlock,
          description: parsed.description,
          type: parsed.type as TimeBlock['type'],
          courseCode: parsed.courseCode || undefined,
        });
      } else if (!parsed.isKnown && parsed.question) {
        // Unknown activity - collect question
        unknownActivities.push({
          index: i,
          title: editedBlock.title,
          question: parsed.question,
        });
        // Add placeholder for now
        enrichedBlocks.push({
          ...editedBlock,
          description: `[Pending user input: ${parsed.question}]`,
          type: 'personal',
          courseCode: undefined,
        });
      } else {
        // Fallback
        enrichedBlocks.push({
          ...editedBlock,
          description: `Activity from ${editedBlock.startTime} to ${editedBlock.endTime}`,
          type: editedBlock.type || 'personal',
          courseCode: editedBlock.courseCode || undefined,
        });
      }
    } catch (error) {
      console.error('Error enriching block:', error);
      // Fallback on error
      enrichedBlocks.push({
        ...editedBlock,
        description: `Activity from ${editedBlock.startTime} to ${editedBlock.endTime}`,
        type: editedBlock.type || 'personal',
        courseCode: editedBlock.courseCode || undefined,
      });
    }
  }

  return {
    enrichedBlocks,
    unknownActivities,
  };
}

function getTimeOfDay(time: string): string {
  const hour = parseInt(time.split(':')[0]);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  return (endHour * 60 + endMin) - (startHour * 60 + startMin);
}
