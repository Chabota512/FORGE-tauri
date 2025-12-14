import { storage } from "./storage";
import { generateDailySchedule, loadAllCourseContexts } from "./llm/planner";
import { buildUnifiedContext } from "./llm/unifiedContext";
import { isGeminiConfigured } from "./llm/gemini";
import { log } from "./index";

let schedulerInterval: NodeJS.Timeout | null = null;
let processedUsers = new Map<number, string>();
let lastProcessedDate: string = "";

function safeParseJsonArray(value: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasGenerationTimePassed(generationTime: string): boolean {
  const currentMinutes = timeToMinutes(getCurrentTimeString());
  const generationMinutes = timeToMinutes(generationTime);
  return currentMinutes >= generationMinutes;
}

function resetProcessedUsersIfNewDay(): void {
  const today = getTodayDateString();
  if (lastProcessedDate !== today) {
    processedUsers.clear();
    lastProcessedDate = today;
    log(`[Scheduler] New day detected (${today}), cleared processed users list`, "scheduler");
  }
}

async function generateScheduleForUser(userId: number): Promise<{ success: boolean; reason: string }> {
  try {
    const today = getTodayDateString();

    const existing = await storage.getFinalizedSchedule(today, userId);
    if (existing) {
      return { success: false, reason: "schedule_exists" };
    }

    const hasCreatedFirst = await storage.hasUserCreatedFirstSchedule(userId);
    if (!hasCreatedFirst) {
      return { success: false, reason: "no_first_schedule" };
    }

    if (!isGeminiConfigured()) {
      log(`[Scheduler] Skipping user ${userId}: GEMINI_API_KEY not configured`, "scheduler");
      return { success: false, reason: "no_api_key" };
    }

    log(`[Scheduler] Auto-generating schedule for user ${userId}`, "scheduler");

    const commitments = await storage.getCommitmentsForDate(today, userId);
    const missions = await storage.getMissionsByDate(today, userId);
    const deadlines = await storage.getDeadlines(userId);
    const books = await storage.getBooks(userId);
    const allSettings = await storage.getSettings(userId);
    const settingsObj: Record<string, string> = {};
    allSettings.forEach(s => { settingsObj[s.key] = s.value; });

    const courseContexts = loadAllCourseContexts();
    const preferences = await storage.getUserPreferences(userId);
    const activities = await storage.getActiveActivities(userId);
    const unifiedContext = await buildUnifiedContext(userId);

    const generated = await generateDailySchedule({
      date: today,
      commitments: commitments.map(c => ({
        id: c.id,
        title: c.title,
        type: c.type,
        courseId: c.courseId || undefined,
        description: c.description || undefined,
        startTime: c.startTime,
        endTime: c.endTime,
        priority: c.priority || 1,
      })),
      missions: missions.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        courseCode: m.courseCode,
        status: m.status || "pending",
        estimatedDuration: m.estimatedDuration || undefined,
        difficulty: m.difficulty || undefined,
        energyLevel: m.energyLevel || undefined,
        materials: safeParseJsonArray(m.materials),
        proofRequirement: m.proofRequirement || undefined,
      })),
      settings: {
        targetDuration: parseInt(settingsObj.targetDuration || "20"),
        missionFocus: settingsObj.missionFocus || "practical application",
      },
      courseContexts,
      deadlines: deadlines.map(d => ({
        id: d.id,
        title: d.title,
        dueDate: d.dueDate,
        priority: d.priority || 2,
      })),
      userPreferences: preferences || undefined,
      activities,
      books: books.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author || undefined,
        currentChapter: b.currentChapter || 0,
        totalChapters: b.totalChapters || undefined,
        timeCategory: b.timeCategory || "medium",
      })),
      unifiedContext,
    });

    await storage.saveDraftSchedule({
      scheduleDate: today,
      scheduleData: JSON.stringify(generated.timeBlocks),
      source: "auto_generated",
      aiReasoning: generated.reasoning,
      isFinalized: false,
      userId,
    });

    await storage.finalizeDraftSchedule(today, userId);

    try {
      const allActivities = await storage.getActivityLibrary(userId);
      const activityMap = new Map(allActivities.map(a => [a.name.toLowerCase(), a.id]));

      for (const block of generated.timeBlocks) {
        const blockTitle = (block.title).toLowerCase();
        const activityId = activityMap.get(blockTitle);
        if (activityId) {
          await storage.incrementActivityUsage(activityId);
        }
      }
    } catch (err) {
      log(`[Scheduler] Note: Could not update activity usage for user ${userId}`, "scheduler");
    }

    log(`[Scheduler] Successfully generated schedule for user ${userId}`, "scheduler");
    return { success: true, reason: "generated" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`[Scheduler] Error generating schedule for user ${userId}: ${errorMessage}`, "scheduler");
    return { success: false, reason: `error: ${errorMessage}` };
  }
}

async function checkAndGenerateSchedules(): Promise<void> {
  try {
    resetProcessedUsersIfNewDay();
    
    const today = getTodayDateString();
    const usersWithGenTime = await storage.getUsersWithScheduleGenerationTime();

    for (const { userId, scheduleGenerationTime } of usersWithGenTime) {
      if (processedUsers.has(userId)) {
        continue;
      }

      if (hasGenerationTimePassed(scheduleGenerationTime)) {
        const result = await generateScheduleForUser(userId);
        
        if (result.success) {
          processedUsers.set(userId, today);
          log(`[Scheduler] Added user ${userId} to processed list (generated)`, "scheduler");
        } else if (result.reason === "schedule_exists") {
          processedUsers.set(userId, today);
          log(`[Scheduler] User ${userId} already has schedule, marked as processed`, "scheduler");
        } else if (result.reason === "no_first_schedule") {
          log(`[Scheduler] User ${userId} hasn't created first schedule yet, skipping`, "scheduler");
        } else if (result.reason === "no_api_key") {
          processedUsers.set(userId, today);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`[Scheduler] Error in schedule check: ${errorMessage}`, "scheduler");
  }
}

export function startScheduler(): void {
  if (schedulerInterval) {
    log("[Scheduler] Scheduler already running", "scheduler");
    return;
  }

  processedUsers.clear();
  lastProcessedDate = getTodayDateString();

  log("[Scheduler] Starting auto-schedule background service", "scheduler");

  checkAndGenerateSchedules();

  schedulerInterval = setInterval(checkAndGenerateSchedules, 60 * 1000);

  log("[Scheduler] Scheduler started - checking every minute", "scheduler");
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("[Scheduler] Scheduler stopped", "scheduler");
  }
}
