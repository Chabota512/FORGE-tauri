/**
 * Unified Context Builder
 * 
 * Aggregates all learner data into a single source of truth for AI generations.
 * This context is used by both schedule generation and mission generation.
 */

import { storage } from "../storage";
import type { LearnerProfile, Mission, MissionFeedback, ScheduleBlockFeedback } from "@shared/schema";
import { db } from "../db";
import { missions, missionFeedback, scheduleBlockFeedback, courses } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export interface MissionHistorySummary {
  totalMissions: number;
  completedMissions: number;
  completionRate: number;
  avgTimeAccuracy: number;
  struggledCourses: { courseCode: string; courseName: string; revisionCount: number }[];
  excelledCourses: { courseCode: string; courseName: string; firstTryApprovalRate: number }[];
  commonBlockers: { blocker: string; count: number }[];
  avgDifficulty: number;
  avgEmotionalState: Record<string, number>;
}

export interface SchedulePerformanceSummary {
  totalBlocks: number;
  completedBlocks: number;
  skippedBlocks: number;
  completionRate: number;
  avgEnergyLevel: number;
  avgDifficulty: number;
  skipReasons: { reason: string; count: number }[];
  energyByHour: { hour: number; avgEnergy: number; completionRate: number }[];
  peakProductivityHours: number[];
  lowEnergyHours: number[];
}

export interface LearnerProfileSummary {
  overallConfidence: number;
  confusionPoints: string[];
  learningStyle: string | null;
  preferredPracticeTypes: string[];
  conceptsNeedingRepetition: string[];
  conceptsWellRetained: string[];
  excitingTopics: string[];
  boringTopics: string[];
  currentPace: string;
  careerGoals: string | null;
  consistencyStreak: number;
}

export interface UnifiedLearnerContext {
  learnerProfile: LearnerProfileSummary | null;
  missionHistory: MissionHistorySummary;
  schedulePerformance: SchedulePerformanceSummary;
  timestamp: string;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getLearnerProfileSummary(userId: number, courseId?: number): Promise<LearnerProfileSummary | null> {
  try {
    if (!courseId) {
      const userCourses = await storage.getCourses(userId);
      if (userCourses.length === 0) return null;
      courseId = userCourses[0].id;
    }

    const profile = await storage.getLearnerProfile(userId, courseId);
    if (!profile) return null;

    return {
      overallConfidence: profile.overallConfidence || 50,
      confusionPoints: parseJsonArray(profile.confusionPoints),
      learningStyle: profile.learningStyle,
      preferredPracticeTypes: parseJsonArray(profile.preferredPracticeTypes),
      conceptsNeedingRepetition: parseJsonArray(profile.conceptsNeedingRepetition),
      conceptsWellRetained: parseJsonArray(profile.conceptsWellRetained),
      excitingTopics: parseJsonArray(profile.excitingTopics),
      boringTopics: parseJsonArray(profile.boringTopics),
      currentPace: profile.currentPace || "moderate",
      careerGoals: profile.careerGoals,
      consistencyStreak: profile.consistencyStreak || 0,
    };
  } catch (error) {
    console.error("Error fetching learner profile summary:", error);
    return null;
  }
}

export async function getMissionHistorySummary(userId: number, days: number = 7): Promise<MissionHistorySummary> {
  const defaultSummary: MissionHistorySummary = {
    totalMissions: 0,
    completedMissions: 0,
    completionRate: 0,
    avgTimeAccuracy: 1,
    struggledCourses: [],
    excelledCourses: [],
    commonBlockers: [],
    avgDifficulty: 2,
    avgEmotionalState: {},
  };

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];

    const recentMissions = await db
      .select({
        mission: missions,
        feedback: missionFeedback,
        course: courses,
      })
      .from(missions)
      .leftJoin(missionFeedback, eq(missions.id, missionFeedback.missionId))
      .leftJoin(courses, eq(missions.courseId, courses.id))
      .where(
        and(
          eq(missions.userId, userId),
          gte(missions.missionDate, startDateStr)
        )
      );

    if (recentMissions.length === 0) return defaultSummary;

    const totalMissions = recentMissions.length;
    const completedMissions = recentMissions.filter(m => m.mission.status === "completed").length;
    const completionRate = totalMissions > 0 ? completedMissions / totalMissions : 0;

    const timeAccuracies: number[] = [];
    const difficulties: number[] = [];
    const emotionalStates: Record<string, number> = {};
    const blockerCounts: Record<string, number> = {};
    const courseStats: Record<number, { 
      code: string; 
      name: string; 
      revisions: number; 
      firstTryApprovals: number; 
      total: number 
    }> = {};

    for (const { mission, feedback, course } of recentMissions) {
      if (course) {
        if (!courseStats[course.id]) {
          courseStats[course.id] = {
            code: course.code,
            name: course.name,
            revisions: 0,
            firstTryApprovals: 0,
            total: 0,
          };
        }
        courseStats[course.id].total++;
      }

      if (feedback) {
        if (feedback.actualTimeMinutes && mission.estimatedDuration) {
          const accuracy = feedback.actualTimeMinutes / mission.estimatedDuration;
          timeAccuracies.push(accuracy);
        }

        if (feedback.emotionalState) {
          emotionalStates[feedback.emotionalState] = (emotionalStates[feedback.emotionalState] || 0) + 1;
        }

        if (feedback.blockers) {
          blockerCounts[feedback.blockers] = (blockerCounts[feedback.blockers] || 0) + 1;
        }

        if (course) {
          if (feedback.aiApproved === false) {
            courseStats[course.id].revisions++;
          } else if (feedback.aiApproved === true) {
            courseStats[course.id].firstTryApprovals++;
          }
        }

        const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
        if (mission.difficulty && difficultyMap[mission.difficulty]) {
          difficulties.push(difficultyMap[mission.difficulty]);
        }
      }
    }

    const avgTimeAccuracy = timeAccuracies.length > 0 
      ? timeAccuracies.reduce((a, b) => a + b, 0) / timeAccuracies.length 
      : 1;

    const avgDifficulty = difficulties.length > 0
      ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
      : 2;

    const struggledCourses = Object.values(courseStats)
      .filter(c => c.revisions > 0)
      .sort((a, b) => b.revisions - a.revisions)
      .slice(0, 3)
      .map(c => ({ courseCode: c.code, courseName: c.name, revisionCount: c.revisions }));

    const excelledCourses = Object.values(courseStats)
      .filter(c => c.total >= 2 && c.firstTryApprovals > 0)
      .map(c => ({
        courseCode: c.code,
        courseName: c.name,
        firstTryApprovalRate: c.firstTryApprovals / c.total,
      }))
      .sort((a, b) => b.firstTryApprovalRate - a.firstTryApprovalRate)
      .slice(0, 3);

    const commonBlockers = Object.entries(blockerCounts)
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalMissions,
      completedMissions,
      completionRate,
      avgTimeAccuracy,
      struggledCourses,
      excelledCourses,
      commonBlockers,
      avgDifficulty,
      avgEmotionalState: emotionalStates,
    };
  } catch (error) {
    console.error("Error fetching mission history summary:", error);
    return defaultSummary;
  }
}

export async function getSchedulePerformanceSummary(userId: number, days: number = 14): Promise<SchedulePerformanceSummary> {
  const defaultSummary: SchedulePerformanceSummary = {
    totalBlocks: 0,
    completedBlocks: 0,
    skippedBlocks: 0,
    completionRate: 0.7,
    avgEnergyLevel: 3,
    avgDifficulty: 2,
    skipReasons: [],
    energyByHour: [],
    peakProductivityHours: [9, 10, 11],
    lowEnergyHours: [14, 15],
  };

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];

    const feedback = await db
      .select()
      .from(scheduleBlockFeedback)
      .where(
        and(
          eq(scheduleBlockFeedback.userId, userId),
          gte(scheduleBlockFeedback.scheduleDate, startDateStr)
        )
      );

    if (feedback.length === 0) return defaultSummary;

    const totalBlocks = feedback.length;
    const completedBlocks = feedback.filter(f => f.completed).length;
    const skippedBlocks = feedback.filter(f => f.skipped).length;
    const completionRate = totalBlocks > 0 ? completedBlocks / totalBlocks : 0.7;

    const energyLevels = feedback.filter(f => f.energyLevel !== null).map(f => f.energyLevel!);
    const avgEnergyLevel = energyLevels.length > 0
      ? energyLevels.reduce((a, b) => a + b, 0) / energyLevels.length
      : 3;

    const difficulties = feedback.filter(f => f.difficulty !== null).map(f => f.difficulty!);
    const avgDifficulty = difficulties.length > 0
      ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
      : 2;

    const skipReasonCounts: Record<string, number> = {};
    for (const f of feedback) {
      if (f.skipped && f.skipReason) {
        skipReasonCounts[f.skipReason] = (skipReasonCounts[f.skipReason] || 0) + 1;
      }
    }
    const skipReasons = Object.entries(skipReasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const hourlyStats: Record<number, { energy: number[]; completed: number; total: number }> = {};
    for (const f of feedback) {
      if (f.blockStartTime) {
        const hour = parseInt(f.blockStartTime.split(":")[0]);
        if (!hourlyStats[hour]) {
          hourlyStats[hour] = { energy: [], completed: 0, total: 0 };
        }
        hourlyStats[hour].total++;
        if (f.completed) hourlyStats[hour].completed++;
        if (f.energyLevel !== null) hourlyStats[hour].energy.push(f.energyLevel);
      }
    }

    const energyByHour = Object.entries(hourlyStats)
      .map(([hour, stats]) => ({
        hour: parseInt(hour),
        avgEnergy: stats.energy.length > 0 ? stats.energy.reduce((a, b) => a + b, 0) / stats.energy.length : 3,
        completionRate: stats.total > 0 ? stats.completed / stats.total : 0,
      }))
      .sort((a, b) => a.hour - b.hour);

    const peakProductivityHours = energyByHour
      .filter(h => h.avgEnergy >= 3.5 && h.completionRate >= 0.7)
      .map(h => h.hour)
      .slice(0, 4);

    const lowEnergyHours = energyByHour
      .filter(h => h.avgEnergy < 3 || h.completionRate < 0.5)
      .map(h => h.hour)
      .slice(0, 3);

    return {
      totalBlocks,
      completedBlocks,
      skippedBlocks,
      completionRate,
      avgEnergyLevel,
      avgDifficulty,
      skipReasons,
      energyByHour,
      peakProductivityHours: peakProductivityHours.length > 0 ? peakProductivityHours : [9, 10, 11],
      lowEnergyHours: lowEnergyHours.length > 0 ? lowEnergyHours : [14, 15],
    };
  } catch (error) {
    console.error("Error fetching schedule performance summary:", error);
    return defaultSummary;
  }
}

export async function buildUnifiedContext(userId: number, courseId?: number): Promise<UnifiedLearnerContext> {
  const [learnerProfile, missionHistory, schedulePerformance] = await Promise.all([
    getLearnerProfileSummary(userId, courseId),
    getMissionHistorySummary(userId, 7),
    getSchedulePerformanceSummary(userId, 14),
  ]);

  return {
    learnerProfile,
    missionHistory,
    schedulePerformance,
    timestamp: new Date().toISOString(),
  };
}

export function formatLearnerProfileForPrompt(profile: LearnerProfileSummary | null): string {
  if (!profile) return "";

  const sections: string[] = [];
  
  sections.push(`**Learner Profile Insights:**`);
  sections.push(`- Overall Confidence: ${profile.overallConfidence}/100`);
  sections.push(`- Current Pace: ${profile.currentPace}`);
  sections.push(`- Learning Style: ${profile.learningStyle || "not determined"}`);
  sections.push(`- Consistency Streak: ${profile.consistencyStreak} days`);

  if (profile.confusionPoints.length > 0) {
    sections.push(`- Areas of Confusion: ${profile.confusionPoints.slice(0, 3).join(", ")}`);
  }

  if (profile.conceptsNeedingRepetition.length > 0) {
    sections.push(`- Concepts Needing Repetition: ${profile.conceptsNeedingRepetition.slice(0, 3).join(", ")}`);
  }

  if (profile.excitingTopics.length > 0) {
    sections.push(`- Topics They Enjoy: ${profile.excitingTopics.slice(0, 3).join(", ")}`);
  }

  if (profile.careerGoals) {
    sections.push(`- Career Goals: ${profile.careerGoals}`);
  }

  return sections.join("\n");
}

export function formatMissionHistoryForPrompt(history: MissionHistorySummary): string {
  if (history.totalMissions === 0) return "";

  const sections: string[] = [];
  
  sections.push(`**Recent Mission Performance (Last 7 Days):**`);
  sections.push(`- Completion Rate: ${Math.round(history.completionRate * 100)}% (${history.completedMissions}/${history.totalMissions} missions)`);
  sections.push(`- Time Accuracy: ${history.avgTimeAccuracy > 1.2 ? "Often takes longer than estimated" : history.avgTimeAccuracy < 0.8 ? "Usually finishes faster than estimated" : "Generally accurate estimates"}`);
  sections.push(`- Average Difficulty Handled: ${history.avgDifficulty <= 1.5 ? "Easy" : history.avgDifficulty <= 2.5 ? "Medium" : "Hard"}`);

  if (history.struggledCourses.length > 0) {
    sections.push(`- Struggled With: ${history.struggledCourses.map(c => `${c.courseCode} (${c.revisionCount} revisions)`).join(", ")}`);
  }

  if (history.excelledCourses.length > 0) {
    sections.push(`- Excelled At: ${history.excelledCourses.map(c => `${c.courseCode} (${Math.round(c.firstTryApprovalRate * 100)}% first-try)`).join(", ")}`);
  }

  if (history.commonBlockers.length > 0) {
    sections.push(`- Common Blockers: ${history.commonBlockers.slice(0, 3).map(b => b.blocker).join(", ")}`);
  }

  const emotionalStates = Object.entries(history.avgEmotionalState);
  if (emotionalStates.length > 0) {
    const dominant = emotionalStates.sort((a, b) => b[1] - a[1])[0];
    sections.push(`- Dominant Emotional State: ${dominant[0]}`);
  }

  return sections.join("\n");
}

export function formatSchedulePerformanceForPrompt(performance: SchedulePerformanceSummary): string {
  if (performance.totalBlocks === 0) return "";

  const sections: string[] = [];
  
  sections.push(`**Schedule Performance Insights (Last 14 Days):**`);
  sections.push(`- Block Completion Rate: ${Math.round(performance.completionRate * 100)}%`);
  sections.push(`- Average Energy Level: ${performance.avgEnergyLevel.toFixed(1)}/5`);
  
  if (performance.peakProductivityHours.length > 0) {
    const peakHours = performance.peakProductivityHours.map(h => `${h}:00`).join(", ");
    sections.push(`- Peak Productivity Hours: ${peakHours}`);
  }

  if (performance.lowEnergyHours.length > 0) {
    const lowHours = performance.lowEnergyHours.map(h => `${h}:00`).join(", ");
    sections.push(`- Low Energy Hours: ${lowHours} (consider breaks/light tasks)`);
  }

  if (performance.skipReasons.length > 0) {
    const topReasons = performance.skipReasons.slice(0, 3).map(r => r.reason).join(", ");
    sections.push(`- Common Skip Reasons: ${topReasons}`);
  }

  return sections.join("\n");
}

export function formatUnifiedContextForPrompt(context: UnifiedLearnerContext): string {
  const sections: string[] = [];

  const profileSection = formatLearnerProfileForPrompt(context.learnerProfile);
  if (profileSection) sections.push(profileSection);

  const historySection = formatMissionHistoryForPrompt(context.missionHistory);
  if (historySection) sections.push(historySection);

  const performanceSection = formatSchedulePerformanceForPrompt(context.schedulePerformance);
  if (performanceSection) sections.push(performanceSection);

  return sections.join("\n\n");
}
