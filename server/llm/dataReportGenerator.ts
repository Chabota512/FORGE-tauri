import { IStorage } from "../storage";
import { Course } from "../../shared/schema";
import * as fs from "fs";
import * as path from "path";

export async function generateUserDataReport(storage: IStorage, userId: number, date: string) {
  try {
    const startDate = new Date(new Date(date).setDate(new Date(date).getDate() - 14)).toISOString().split('T')[0];
    const [
      recentSchedules,
      feedbacks,
      patterns,
      missions,
      deadlines,
      preferences,
      commitments,
      activities,
      courses
    ] = await Promise.all([
      storage.getSchedulesForDateRange(14, userId),
      storage.getFeedbackInRange(startDate, date, userId),
      storage.getAllUserPatterns(userId),
      storage.getArchiveData(startDate, date, userId),
      storage.getDeadlines(userId),
      storage.getUserPreferences(userId),
      storage.getCommitments(userId),
      storage.getActiveActivities(userId),
      storage.getCourses(userId)
    ]);

    // Get feedback patterns from daily feedback
    const feedbackPatterns = summarizeDailyFeedback(feedbacks);
    
    // Scan knowledge base for course materials
    const knowledgeBase = await scanKnowledgeBase(courses.map((c: Course) => c.code));

    return {
      recentSchedules: recentSchedules.map((s: { scheduleDate: string; scheduleData: string }) => ({
        date: s.scheduleDate,
        data: typeof s.scheduleData === 'string' ? JSON.parse(s.scheduleData) : s.scheduleData
      })),
      feedbacks,
      feedbackPatterns,
      patterns,
      missions,
      deadlines,
      preferences,
      commitments,
      activities,
      courses,
      knowledgeBase,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error generating user data report:", error);
    throw error;
  }
}

interface DailyFeedbackItem {
  completionRating?: number | null;
  energyLevel?: number | null;
  notes?: string | null;
}

function summarizeDailyFeedback(feedbacks: DailyFeedbackItem[]): {
  avgCompletion: number;
  avgEnergy: number;
  successPatterns: string[];
} {
  if (!feedbacks || feedbacks.length === 0) {
    return {
      avgCompletion: 0,
      avgEnergy: 3,
      successPatterns: []
    };
  }

  const validCompletions = feedbacks.filter(f => f.completionRating != null);
  const validEnergy = feedbacks.filter(f => f.energyLevel != null);
  
  const avgCompletion = validCompletions.length > 0 
    ? validCompletions.reduce((sum, f) => sum + (f.completionRating || 0), 0) / validCompletions.length / 5
    : 0;
  const avgEnergy = validEnergy.length > 0
    ? validEnergy.reduce((sum, f) => sum + (f.energyLevel || 3), 0) / validEnergy.length
    : 3;

  const successPatterns: string[] = [];
  if (avgCompletion > 0.7) successPatterns.push("High completion rate");
  if (avgEnergy > 3.5) successPatterns.push("Good energy levels");

  return {
    avgCompletion,
    avgEnergy,
    successPatterns
  };
}

async function scanKnowledgeBase(courseCodes: string[]): Promise<Record<string, string[]>> {
  const kbPath = path.join(process.cwd(), "forge_kb");
  const result: Record<string, string[]> = {};
  
  try {
    if (!fs.existsSync(kbPath)) {
      return result;
    }
    
    for (const code of courseCodes) {
      const courseDir = path.join(kbPath, code);
      if (fs.existsSync(courseDir)) {
        const files = fs.readdirSync(courseDir);
        const topics: string[] = [];
        
        for (const file of files.slice(0, 5)) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            const content = fs.readFileSync(path.join(courseDir, file), 'utf-8');
            const firstLine = content.split('\n')[0]?.replace(/^#\s*/, '').trim();
            if (firstLine) {
              topics.push(firstLine);
            }
          }
        }
        
        if (topics.length > 0) {
          result[code] = topics;
        }
      }
    }
  } catch (error) {
    console.error("Error scanning knowledge base:", error);
  }
  
  return result;
}
