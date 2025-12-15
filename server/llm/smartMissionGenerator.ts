/**
 * Smart Mission Generator
 * 
 * AI-powered mission generation that:
 * - Analyzes available time slots using workload analysis
 * - Uses user history (energy patterns, completion rates)
 * - Decides optimal mission count based on workload intensity
 * - Picks priority courses based on weekly coverage and deadlines
 * - Generates RAG-based missions with full details
 */

import { storage } from "../storage";
import { analyzeDayWorkload, formatWorkloadForPrompt, type DayWorkload } from "./workloadAnalyzer";
import { gatherMissionIntelligence, formatIntelligenceForPrompt, type MissionIntelligenceContext } from "./missionIntelligence";
import { generateRagMissions, type RagMission, type IntelligenceContext } from "./missionRag";
import { getChunkCount, sanitizeCourseCode } from "./retriever";
import type { Course, Mission } from "@shared/schema";

export interface SmartMissionConfig {
  userId: number;
  date: string;
  maxMissions?: number;
  minMissionsPerCourse?: number;
}

export interface CourseSelection {
  course: Course;
  priority: number;
  reason: string;
  hasMaterials: boolean;
  suggestedMissionCount: number;
  suggestedDuration: number;
}

export interface SmartMissionResult {
  missions: (Mission & { courseName: string; courseCode: string })[];
  analysis: {
    workload: DayWorkload;
    totalMissionsGenerated: number;
    coursesSelected: CourseSelection[];
    skippedCourses: { courseCode: string; reason: string }[];
  };
}

async function selectPriorityCourses(
  userId: number,
  date: string,
  workload: DayWorkload,
  intelligence: MissionIntelligenceContext
): Promise<CourseSelection[]> {
  const allCourses = await storage.getCourses(userId);
  
  if (allCourses.length === 0) {
    return [];
  }
  
  const weekStart = getWeekStartDate(date);
  const coursesCoveredThisWeek = await storage.getWeeklyCoursesCovered(userId, weekStart);
  const coveredCourseIds = new Set(coursesCoveredThisWeek.map(c => c.courseId));
  
  const courseSelections: CourseSelection[] = [];
  
  for (const course of allCourses) {
    let priority = 50;
    const reasons: string[] = [];
    
    const urgentDeadline = intelligence.deadlineUrgencies.find(
      d => d.courseId === course.id && d.urgencyScore >= 70
    );
    if (urgentDeadline) {
      priority += 30;
      reasons.push(`Deadline: ${urgentDeadline.deadlineTitle} in ${urgentDeadline.daysRemaining} days`);
    }
    
    const priorityCourse = intelligence.priorityCourses.find(p => p.courseId === course.id);
    if (priorityCourse) {
      priority += 20;
      reasons.push(priorityCourse.reason);
    }
    
    if (!coveredCourseIds.has(course.id)) {
      priority += 15;
      reasons.push("No missions this week");
    }
    
    const reviewDue = intelligence.reviewDueConcepts.filter(
      r => r.courseId === course.id && (r.reviewPriority === "urgent" || r.reviewPriority === "high")
    );
    if (reviewDue.length > 0) {
      priority += 10;
      reasons.push(`${reviewDue.length} concepts need review`);
    }
    
    const conceptGaps = intelligence.conceptGaps.filter(g => g.courseId === course.id);
    if (conceptGaps.length > 0) {
      priority += 5;
      reasons.push(`${conceptGaps.length} unstudied concepts`);
    }
    
    const chunkCount = await getChunkCount(userId, sanitizeCourseCode(course.code));
    const hasMaterials = chunkCount > 0;
    
    if (!hasMaterials) {
      priority -= 10;
    }
    
    courseSelections.push({
      course,
      priority,
      reason: reasons.length > 0 ? reasons.join("; ") : "Regular study",
      hasMaterials,
      suggestedMissionCount: 1,
      suggestedDuration: workload.recommendedMissionDuration,
    });
  }
  
  courseSelections.sort((a, b) => b.priority - a.priority);
  
  return courseSelections;
}

function getWeekStartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(date.setDate(diff));
  return weekStart.toISOString().split("T")[0];
}

function distributeMissionsAcrossCourses(
  courseSelections: CourseSelection[],
  targetMissionCount: number
): CourseSelection[] {
  if (courseSelections.length === 0 || targetMissionCount === 0) {
    return [];
  }
  
  let remainingMissions = targetMissionCount;
  const result: CourseSelection[] = [];
  
  for (const selection of courseSelections) {
    if (remainingMissions <= 0) break;
    
    const missionCount = Math.min(
      selection.priority >= 70 ? 2 : 1,
      remainingMissions
    );
    
    result.push({
      ...selection,
      suggestedMissionCount: missionCount,
    });
    
    remainingMissions -= missionCount;
  }
  
  return result;
}

function convertToRagIntelligence(
  intel: MissionIntelligenceContext,
  courseId: number
): IntelligenceContext {
  return {
    deadlineUrgencies: intel.deadlineUrgencies
      .filter(d => d.courseId === courseId)
      .slice(0, 3)
      .map(d => ({
        deadlineTitle: d.deadlineTitle,
        daysRemaining: d.daysRemaining,
        urgencyScore: d.urgencyScore,
      })),
    conceptGaps: intel.conceptGaps
      .filter(g => g.courseId === courseId)
      .slice(0, 5)
      .map(g => ({ conceptName: g.conceptName })),
    reviewDueConcepts: intel.reviewDueConcepts
      .filter(r => r.courseId === courseId)
      .slice(0, 3)
      .map(r => ({
        conceptName: r.conceptName,
        daysSinceLastStudy: r.daysSinceLastStudy,
      })),
    recommendedDifficulty: intel.recommendedDifficulty,
  };
}

function determineMissionFocus(
  intel: MissionIntelligenceContext,
  courseId: number
): string {
  const urgentDeadline = intel.deadlineUrgencies.find(
    d => d.courseId === courseId && d.urgencyScore >= 80
  );
  if (urgentDeadline) {
    return `preparation for ${urgentDeadline.deadlineType}: ${urgentDeadline.deadlineTitle}`;
  }
  
  const reviewNeeded = intel.reviewDueConcepts.find(
    r => r.courseId === courseId && r.reviewPriority === "urgent"
  );
  if (reviewNeeded) {
    return `review of ${reviewNeeded.conceptName}`;
  }
  
  const conceptGap = intel.conceptGaps.find(g => g.courseId === courseId);
  if (conceptGap) {
    return `learning ${conceptGap.conceptName}`;
  }
  
  return "general learning and practice";
}

export async function generateSmartMissions(
  config: SmartMissionConfig
): Promise<SmartMissionResult> {
  const { userId, date, maxMissions = 5 } = config;
  
  const [workload, intelligence] = await Promise.all([
    analyzeDayWorkload(date, userId),
    gatherMissionIntelligence(undefined, undefined, userId),
  ]);
  
  let targetMissionCount = workload.recommendedMissionCount;
  
  if (workload.workloadIntensity === "overloaded") {
    targetMissionCount = Math.min(targetMissionCount, 1);
  } else if (workload.workloadIntensity === "heavy") {
    targetMissionCount = Math.min(targetMissionCount, 2);
  }
  
  targetMissionCount = Math.min(targetMissionCount, maxMissions);
  
  const courseSelections = await selectPriorityCourses(userId, date, workload, intelligence);
  const selectedCourses = distributeMissionsAcrossCourses(courseSelections, targetMissionCount);
  
  const generatedMissions: (Mission & { courseName: string; courseCode: string })[] = [];
  const skippedCourses: { courseCode: string; reason: string }[] = [];
  
  for (const selection of selectedCourses) {
    try {
      const missionFocus = determineMissionFocus(intelligence, selection.course.id);
      const ragIntelligence = convertToRagIntelligence(intelligence, selection.course.id);
      
      const result = await generateRagMissions(
        userId,
        selection.course.code,
        selection.course.name,
        missionFocus,
        ragIntelligence
      );
      
      const missionsToCreate = result.missions.slice(0, selection.suggestedMissionCount);
      
      for (const ragMission of missionsToCreate) {
        const mission = await storage.createMission({
          userId,
          courseId: selection.course.id,
          title: ragMission.title,
          description: ragMission.description,
          proofRequirement: ragMission.proofRequirement,
          missionDate: date,
          estimatedDuration: ragMission.timeEstimateMinutes || selection.suggestedDuration,
          difficulty: ragMission.difficulty || "medium",
          energyLevel: ragMission.energyLevel || "medium",
          materials: JSON.stringify(ragMission.materials || []),
          source: 'auto',
        });
        
        generatedMissions.push({
          ...mission,
          courseName: selection.course.name,
          courseCode: selection.course.code,
        });
      }
    } catch (error) {
      console.error(`[SmartMissionGenerator] Failed to generate mission for ${selection.course.code}:`, error);
      skippedCourses.push({
        courseCode: selection.course.code,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  const remainingCourses = courseSelections
    .filter(cs => !selectedCourses.find(sc => sc.course.id === cs.course.id))
    .map(cs => ({
      courseCode: cs.course.code,
      reason: cs.priority < 50 ? "Low priority today" : "Mission limit reached",
    }));
  
  skippedCourses.push(...remainingCourses);
  
  return {
    missions: generatedMissions,
    analysis: {
      workload,
      totalMissionsGenerated: generatedMissions.length,
      coursesSelected: selectedCourses,
      skippedCourses,
    },
  };
}

export async function generateDailyMissionsV2(
  date: string,
  userId: number
): Promise<(Mission & { courseName: string; courseCode: string })[]> {
  const result = await generateSmartMissions({
    userId,
    date,
    maxMissions: 5,
  });
  
  console.log(`[SmartMissionGenerator] Generated ${result.analysis.totalMissionsGenerated} missions for ${date}`);
  console.log(`[SmartMissionGenerator] Workload: ${result.analysis.workload.workloadIntensity}`);
  console.log(`[SmartMissionGenerator] Available time: ${result.analysis.workload.totalAvailableMinutes} minutes`);
  
  return result.missions;
}
