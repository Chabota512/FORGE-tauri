import { storage } from "../storage";
import { extractConcepts as extractConceptsFromGemini, isGeminiConfigured } from "./gemini";
import { extractConcepts as extractConceptsFromGroq, isGroqConfigured } from "./groq";
import { analyzeFeedbackPatterns, formatFeedbackPatternsForPrompt, type FeedbackPatterns } from "./feedbackPatterns";
import { getSchedulePerformanceSummary, getMissionHistorySummary, type SchedulePerformanceSummary, type MissionHistorySummary } from "./unifiedContext";
import { loadContextForCourse as loadContextFromDB } from "./ingestPipeline";
import type { LearnerProfile } from "@shared/schema";
import fs from "fs";
import path from "path";

// Types for ingestion
export interface Concept {
  name: string;
  description?: string;
  relevance?: string;
}

export interface CourseContext {
  concepts: Concept[];
  summary: string;
  lastUpdated?: string;
  sourceFile?: string;
}

export interface IngestResult {
  success: boolean;
  courseCode: string;
  extractedConcepts: number;
  totalConcepts: number;
  summary: string;
  concepts: Concept[];
  error?: string;
}

export interface DeadlineUrgency {
  courseId: number;
  courseCode: string;
  courseName: string;
  deadlineTitle: string;
  deadlineType: string;
  dueDate: string;
  daysRemaining: number;
  urgencyScore: number;
}

export interface ConceptGap {
  courseId: number;
  conceptName: string;
  description?: string;
  relevance?: string;
  neverStudied: boolean;
}

export interface ReviewDueConcept {
  courseId: number;
  conceptName: string;
  lastCoveredAt: string;
  daysSinceLastStudy: number;
  coverageCount: number;
  masteryLevel: number;
  reviewPriority: "urgent" | "high" | "medium" | "low";
}

export interface EnergyPattern {
  hour: number;
  avgEnergy: number;
  completionRate: number;
  sampleSize: number;
  recommendation: "high_difficulty" | "medium_difficulty" | "low_difficulty" | "break";
}

export interface DifficultyTrend {
  courseId: number;
  courseCode: string;
  avgDifficulty: number;
  recentTrend: "increasing" | "decreasing" | "stable";
  recommendation: "simplify" | "maintain" | "challenge";
  sampleSize: number;
}

export interface MissionIntelligenceContext {
  deadlineUrgencies: DeadlineUrgency[];
  conceptGaps: ConceptGap[];
  reviewDueConcepts: ReviewDueConcept[];
  energyPatterns: EnergyPattern[];
  difficultyTrends: DifficultyTrend[];
  currentHour: number;
  recommendedDifficulty: "easy" | "medium" | "hard";
  priorityCourses: { courseId: number; courseCode: string; reason: string }[];
  learnerProfile?: LearnerProfile | null;
  feedbackPatterns?: FeedbackPatterns | null;
  schedulePerformance?: SchedulePerformanceSummary | null;
  missionHistory?: MissionHistorySummary | null;
}

async function loadContextForCourse(courseCode: string, userId?: number): Promise<{ concepts: { name: string; description?: string; relevance?: string }[]; summary: string }> {
  return await loadContextFromDB(courseCode, userId);
}

export async function getDeadlineUrgencies(lookAheadDays: number = 30): Promise<DeadlineUrgency[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + lookAheadDays);

  const todayStr = today.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const deadlines = await storage.getDeadlinesInRange(todayStr, endDateStr);
  const courses = await storage.getCourses();
  const courseMap = new Map(courses.map(c => [c.id, c]));

  const urgencies: DeadlineUrgency[] = [];

  for (const deadline of deadlines) {
    const dueDate = new Date(deadline.dueDate);
    const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let urgencyScore = 0;
    if (daysRemaining <= 1) urgencyScore = 100;
    else if (daysRemaining <= 3) urgencyScore = 90;
    else if (daysRemaining <= 7) urgencyScore = 70;
    else if (daysRemaining <= 14) urgencyScore = 50;
    else if (daysRemaining <= 21) urgencyScore = 30;
    else urgencyScore = 10;

    if (deadline.type === "exam") urgencyScore += 10;
    else if (deadline.type === "assignment" || deadline.type === "project") urgencyScore += 5;

    urgencyScore = Math.min(100, urgencyScore);

    const course = deadline.courseId ? courseMap.get(deadline.courseId) : null;

    urgencies.push({
      courseId: deadline.courseId || 0,
      courseCode: course?.code || "GENERAL",
      courseName: course?.name || "General",
      deadlineTitle: deadline.title,
      deadlineType: deadline.type,
      dueDate: deadline.dueDate,
      daysRemaining,
      urgencyScore,
    });
  }

  return urgencies.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

export async function getConceptGaps(courseId: number, courseCode: string): Promise<ConceptGap[]> {
  const context = await loadContextForCourse(courseCode);
  if (!context.concepts || context.concepts.length === 0) {
    return [];
  }

  const trackedConcepts = await storage.getConceptsForCourse(courseId);
  const trackedNames = new Set(trackedConcepts.map(c => c.conceptName.toLowerCase()));

  const gaps: ConceptGap[] = [];

  for (const concept of context.concepts) {
    const isTracked = trackedNames.has(concept.name.toLowerCase());
    if (!isTracked) {
      gaps.push({
        courseId,
        conceptName: concept.name,
        description: concept.description,
        relevance: concept.relevance,
        neverStudied: true,
      });
    }
  }

  return gaps;
}

export async function getReviewDueConcepts(courseId?: number): Promise<ReviewDueConcept[]> {
  const allTracking = courseId 
    ? await storage.getConceptsForCourse(courseId)
    : await storage.getAllConceptTracking();

  const today = new Date();
  const reviewDue: ReviewDueConcept[] = [];

  for (const concept of allTracking) {
    if (!concept.lastCoveredAt) continue;

    const lastCovered = new Date(concept.lastCoveredAt);
    const daysSince = Math.floor((today.getTime() - lastCovered.getTime()) / (1000 * 60 * 60 * 24));

    let reviewPriority: "urgent" | "high" | "medium" | "low" = "low";
    const masteryLevel = concept.masteryLevel || 1;

    const optimalIntervals = [1, 3, 7, 14, 30];
    const targetInterval = optimalIntervals[Math.min(masteryLevel - 1, optimalIntervals.length - 1)];

    if (daysSince >= targetInterval * 2) {
      reviewPriority = "urgent";
    } else if (daysSince >= targetInterval * 1.5) {
      reviewPriority = "high";
    } else if (daysSince >= targetInterval) {
      reviewPriority = "medium";
    } else {
      continue;
    }

    reviewDue.push({
      courseId: concept.courseId || 0,
      conceptName: concept.conceptName,
      lastCoveredAt: concept.lastCoveredAt,
      daysSinceLastStudy: daysSince,
      coverageCount: concept.coverageCount || 1,
      masteryLevel,
      reviewPriority,
    });
  }

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  return reviewDue.sort((a, b) => priorityOrder[a.reviewPriority] - priorityOrder[b.reviewPriority]);
}

export async function getEnergyPatterns(): Promise<EnergyPattern[]> {
  const productivityByHour = await storage.getProductivityByHour();

  const patterns: EnergyPattern[] = productivityByHour.map(hourData => {
    let recommendation: EnergyPattern["recommendation"] = "medium_difficulty";

    if (hourData.avgEnergy >= 4 && hourData.completionRate >= 70) {
      recommendation = "high_difficulty";
    } else if (hourData.avgEnergy >= 3 && hourData.completionRate >= 50) {
      recommendation = "medium_difficulty";
    } else if (hourData.avgEnergy < 2.5 || hourData.completionRate < 30) {
      recommendation = "break";
    } else {
      recommendation = "low_difficulty";
    }

    return {
      hour: hourData.hour,
      avgEnergy: hourData.avgEnergy,
      completionRate: hourData.completionRate,
      sampleSize: 0,
      recommendation,
    };
  });

  return patterns;
}

export async function getDifficultyTrends(): Promise<DifficultyTrend[]> {
  const courses = await storage.getCourses();
  const allFeedback = await storage.getScheduleFeedbackStats();

  const trends: DifficultyTrend[] = [];

  for (const course of courses) {
    const avgDifficulty = allFeedback.avgDifficulty || 3;

    let recommendation: DifficultyTrend["recommendation"] = "maintain";
    if (avgDifficulty >= 4) {
      recommendation = "simplify";
    } else if (avgDifficulty <= 2) {
      recommendation = "challenge";
    }

    trends.push({
      courseId: course.id,
      courseCode: course.code,
      avgDifficulty,
      recentTrend: "stable",
      recommendation,
      sampleSize: allFeedback.totalBlocks,
    });
  }

  return trends;
}

export async function gatherMissionIntelligence(courseId?: number, courseCode?: string, userId?: number): Promise<MissionIntelligenceContext> {
  const currentHour = new Date().getHours();

  const [deadlineUrgencies, energyPatterns, difficultyTrends, allReviewDue] = await Promise.all([
    getDeadlineUrgencies(30),
    getEnergyPatterns(),
    getDifficultyTrends(),
    getReviewDueConcepts(),
  ]);

  let learnerProfile: LearnerProfile | null = null;
  let feedbackPatterns: FeedbackPatterns | null = null;
  let schedulePerformance: SchedulePerformanceSummary | null = null;
  let missionHistory: MissionHistorySummary | null = null;
  
  if (userId) {
    const [patterns, schedPerf, missHistory] = await Promise.all([
      analyzeFeedbackPatterns(userId, 20),
      getSchedulePerformanceSummary(userId, 14),
      getMissionHistorySummary(userId, 7),
    ]);
    feedbackPatterns = patterns;
    schedulePerformance = schedPerf;
    missionHistory = missHistory;
    
    if (courseId) {
      learnerProfile = await storage.getLearnerProfile(userId, courseId) || null;
    }
  }

  let conceptGaps: ConceptGap[] = [];
  let reviewDueConcepts = allReviewDue;

  if (courseId && courseCode) {
    conceptGaps = await getConceptGaps(courseId, courseCode);
    reviewDueConcepts = allReviewDue.filter(c => c.courseId === courseId);
  } else {
    const courses = await storage.getCourses();
    for (const course of courses) {
      const gaps = await getConceptGaps(course.id, course.code);
      conceptGaps.push(...gaps);
    }
  }

  const currentEnergyPattern = energyPatterns.find(p => p.hour === currentHour);
  let recommendedDifficulty: "easy" | "medium" | "hard" = "medium";

  if (currentEnergyPattern) {
    if (currentEnergyPattern.recommendation === "high_difficulty") {
      recommendedDifficulty = "hard";
    } else if (currentEnergyPattern.recommendation === "low_difficulty" || currentEnergyPattern.recommendation === "break") {
      recommendedDifficulty = "easy";
    }
  }

  const priorityCourses: { courseId: number; courseCode: string; reason: string }[] = [];

  const urgentDeadlines = deadlineUrgencies.filter(d => d.urgencyScore >= 70);
  for (const deadline of urgentDeadlines.slice(0, 3)) {
    if (deadline.courseId && !priorityCourses.find(p => p.courseId === deadline.courseId)) {
      priorityCourses.push({
        courseId: deadline.courseId,
        courseCode: deadline.courseCode,
        reason: `${deadline.deadlineType} "${deadline.deadlineTitle}" due in ${deadline.daysRemaining} days`,
      });
    }
  }

  const urgentReviews = reviewDueConcepts.filter(r => r.reviewPriority === "urgent");
  for (const review of urgentReviews.slice(0, 2)) {
    if (!priorityCourses.find(p => p.courseId === review.courseId)) {
      const course = (await storage.getCourses()).find(c => c.id === review.courseId);
      if (course) {
        priorityCourses.push({
          courseId: review.courseId,
          courseCode: course.code,
          reason: `Concept "${review.conceptName}" needs urgent review (${review.daysSinceLastStudy} days since last study)`,
        });
      }
    }
  }

  return {
    deadlineUrgencies,
    conceptGaps,
    reviewDueConcepts,
    energyPatterns,
    difficultyTrends,
    currentHour,
    recommendedDifficulty,
    priorityCourses,
    learnerProfile,
    feedbackPatterns,
    schedulePerformance,
    missionHistory,
  };
}

export function formatIntelligenceForPrompt(context: MissionIntelligenceContext, courseCode?: string): string {
  const sections: string[] = [];

  if (context.deadlineUrgencies.length > 0) {
    const relevant = courseCode 
      ? context.deadlineUrgencies.filter(d => d.courseCode === courseCode)
      : context.deadlineUrgencies.slice(0, 5);

    if (relevant.length > 0) {
      sections.push("UPCOMING DEADLINES:");
      for (const d of relevant) {
        sections.push(`- ${d.deadlineType.toUpperCase()}: "${d.deadlineTitle}" in ${d.daysRemaining} days (urgency: ${d.urgencyScore}%)`);
      }
    }
  }

  if (context.conceptGaps.length > 0) {
    const gaps = context.conceptGaps.slice(0, 5);
    sections.push("\nCONCEPT GAPS (never studied):");
    for (const g of gaps) {
      sections.push(`- ${g.conceptName}${g.description ? `: ${g.description.substring(0, 100)}...` : ""}`);
    }
  }

  if (context.reviewDueConcepts.length > 0) {
    const reviews = context.reviewDueConcepts.slice(0, 5);
    sections.push("\nCONCEPTS DUE FOR REVIEW:");
    for (const r of reviews) {
      sections.push(`- ${r.conceptName} (${r.reviewPriority} priority, ${r.daysSinceLastStudy} days since last study, mastery level ${r.masteryLevel}/5)`);
    }
  }

  sections.push(`\nCURRENT CONDITIONS:`);
  sections.push(`- Time of day: ${context.currentHour}:00`);
  sections.push(`- Recommended difficulty: ${context.recommendedDifficulty.toUpperCase()}`);

  if (context.priorityCourses.length > 0) {
    sections.push("\nPRIORITY FOCUS AREAS:");
    for (const p of context.priorityCourses) {
      sections.push(`- ${p.courseCode}: ${p.reason}`);
    }
  }

  const courseTrend = courseCode 
    ? context.difficultyTrends.find(t => t.courseCode === courseCode)
    : null;

  if (courseTrend && courseTrend.sampleSize > 0) {
    sections.push(`\nDIFFICULTY ADJUSTMENT:`);
    sections.push(`- Recent avg difficulty rating: ${courseTrend.avgDifficulty.toFixed(1)}/5`);
    sections.push(`- Recommendation: ${courseTrend.recommendation === "simplify" ? "Make tasks simpler" : courseTrend.recommendation === "challenge" ? "Increase challenge" : "Maintain current difficulty"}`);
  }

  if (context.learnerProfile) {
    const profile = context.learnerProfile;
    
    const parseJsonArray = (jsonStr: string | null): string[] => {
      if (!jsonStr) return [];
      try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [jsonStr];
      } catch { return jsonStr ? [jsonStr] : []; }
    };
    
    sections.push(`\nLEARNER PROFILE (20-MILE MARCH CALIBRATION):`);
    
    if (profile.overallConfidence) {
      sections.push(`- Self-reported confidence: ${profile.overallConfidence}%`);
    }
    
    const confusionPts = parseJsonArray(profile.confusionPoints);
    if (confusionPts.length > 0) {
      sections.push(`- Current confusion areas: ${confusionPts.slice(0, 3).join(", ")}`);
    }
    
    const needsRepetition = parseJsonArray(profile.conceptsNeedingRepetition);
    if (needsRepetition.length > 0) {
      sections.push(`- Needs more practice: ${needsRepetition.slice(0, 3).join(", ")}`);
    }
    
    const wellRetained = parseJsonArray(profile.conceptsWellRetained);
    if (wellRetained.length > 0) {
      sections.push(`- Well understood: ${wellRetained.slice(0, 3).join(", ")}`);
    }
    
    const prerequisiteGaps = parseJsonArray(profile.prerequisiteGaps);
    if (prerequisiteGaps.length > 0) {
      sections.push(`- Prerequisite gaps: ${prerequisiteGaps.slice(0, 3).join(", ")}`);
    }
    
    if (profile.learningStyle) {
      sections.push(`- Preferred learning style: ${profile.learningStyle}`);
    }
    
    const practiceTypes = parseJsonArray(profile.preferredPracticeTypes);
    if (practiceTypes.length > 0) {
      sections.push(`- Preferred practice types: ${practiceTypes.join(", ")}`);
    }
    
    sections.push(`\nSTUDY PATTERNS:`);
    
    if (profile.idealSessionLength) {
      sections.push(`- Ideal session length: ${profile.idealSessionLength} minutes`);
    }
    
    const studyTimes = parseJsonArray(profile.bestStudyTimes);
    if (studyTimes.length > 0) {
      sections.push(`- Best study times: ${studyTimes.join(", ")}`);
    }
    
    if (profile.averageDailyLoad) {
      sections.push(`- Average daily study load: ${profile.averageDailyLoad} minutes`);
    }
    
    if (profile.currentPace) {
      sections.push(`- Current pace preference: ${profile.currentPace}`);
    }
    
    sections.push(`\n20-MILE MARCH METRICS:`);
    
    if (profile.consistencyStreak !== null && profile.consistencyStreak !== undefined) {
      sections.push(`- Consistency streak: ${profile.consistencyStreak} days`);
    }
    
    if (profile.lastMissionDate) {
      const lastDate = new Date(profile.lastMissionDate);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      sections.push(`- Days since last mission: ${daysSince}`);
    }
    
    sections.push(`\nGOALS & INTERESTS:`);
    
    if (profile.careerGoals) {
      sections.push(`- Career goals: ${profile.careerGoals.substring(0, 100)}`);
    }
    
    if (profile.projectGoals) {
      sections.push(`- Project interests: ${profile.projectGoals.substring(0, 100)}`);
    }
    
    const exciting = parseJsonArray(profile.excitingTopics);
    if (exciting.length > 0) {
      sections.push(`- Topics that excite learner: ${exciting.slice(0, 3).join(", ")}`);
    }
    
    const boring = parseJsonArray(profile.boringTopics);
    if (boring.length > 0) {
      sections.push(`- Topics learner finds difficult/boring: ${boring.slice(0, 3).join(", ")}`);
    }
    
    const deepDive = parseJsonArray(profile.deepDiveAreas);
    if (deepDive.length > 0) {
      sections.push(`- Areas for deep dive: ${deepDive.slice(0, 3).join(", ")}`);
    }
    
    const applications = parseJsonArray(profile.interestedApplications);
    if (applications.length > 0) {
      sections.push(`- Interested applications: ${applications.slice(0, 3).join(", ")}`);
    }
    
    sections.push(`\n20-MILE MARCH PRINCIPLES:`);
    sections.push(`- Create consistent, achievable daily missions (not sprints or cramming)`);
    sections.push(`- Scope missions to learner's ideal session length (${profile.idealSessionLength || 20} min)`);
    sections.push(`- Adjust difficulty based on current confidence (${profile.overallConfidence || "unknown"}%) and confusion points`);
    sections.push(`- Focus on topics needing repetition before introducing new concepts`);
    sections.push(`- Address prerequisite gaps before advanced topics`);
    sections.push(`- Connect missions to learner's career/project goals when relevant`);
    sections.push(`- Maintain steady daily progress regardless of motivation level`);
  }

  if (context.feedbackPatterns && context.feedbackPatterns.sampleSize > 0) {
    sections.push(formatFeedbackPatternsForPrompt(context.feedbackPatterns));
  }

  if (context.schedulePerformance && context.schedulePerformance.totalBlocks > 0) {
    const perf = context.schedulePerformance;
    sections.push(`\nSCHEDULE PERFORMANCE (Last 14 Days):`);
    sections.push(`- Block completion rate: ${Math.round(perf.completionRate * 100)}%`);
    sections.push(`- Average energy level: ${perf.avgEnergyLevel.toFixed(1)}/5`);
    
    if (perf.peakProductivityHours.length > 0) {
      sections.push(`- Peak productivity hours: ${perf.peakProductivityHours.map(h => `${h}:00`).join(", ")}`);
    }
    if (perf.lowEnergyHours.length > 0) {
      sections.push(`- Low energy hours: ${perf.lowEnergyHours.map(h => `${h}:00`).join(", ")}`);
    }
    if (perf.skipReasons.length > 0) {
      sections.push(`- Common skip reasons: ${perf.skipReasons.slice(0, 3).map(r => r.reason).join(", ")}`);
    }
  }

  if (context.missionHistory && context.missionHistory.totalMissions > 0) {
    const hist = context.missionHistory;
    sections.push(`\nMISSION HISTORY (Last 7 Days):`);
    sections.push(`- Completion rate: ${Math.round(hist.completionRate * 100)}% (${hist.completedMissions}/${hist.totalMissions} missions)`);
    sections.push(`- Time accuracy: ${hist.avgTimeAccuracy > 1.2 ? "Often takes longer than estimated" : hist.avgTimeAccuracy < 0.8 ? "Usually finishes faster" : "Generally accurate"}`);
    
    if (hist.struggledCourses.length > 0) {
      sections.push(`- Struggled courses: ${hist.struggledCourses.map(c => `${c.courseCode} (${c.revisionCount} revisions)`).join(", ")}`);
    }
    if (hist.excelledCourses.length > 0) {
      sections.push(`- Excelled courses: ${hist.excelledCourses.map(c => `${c.courseCode} (${Math.round(c.firstTryApprovalRate * 100)}% first-try)`).join(", ")}`);
    }
    if (hist.commonBlockers.length > 0) {
      sections.push(`- Common blockers: ${hist.commonBlockers.slice(0, 3).map(b => b.blocker).join(", ")}`);
    }
  }

  return sections.join("\n");
}

function generateCourseSummary(concepts: Concept[]): string {
  if (concepts.length === 0) {
    return "No concepts have been extracted yet.";
  }
  const conceptNames = concepts.slice(0, 5).map(c => c.name).join(", ");
  return `This course covers ${concepts.length} key concepts including: ${conceptNames}${concepts.length > 5 ? " and more" : ""}.`;
}

export async function ingestNotes(courseCode: string, filePath: string): Promise<IngestResult> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    
    if (!fileContent || fileContent.trim().length === 0) {
      throw new Error("No text could be extracted from the file");
    }

    let result;
    let usedProvider = "unknown";

    // Try Gemini first (primary)
    if (isGeminiConfigured()) {
      try {
        console.log("Attempting concept extraction with Gemini...");
        result = await extractConceptsFromGemini(fileContent, courseCode);
        usedProvider = "Gemini";
        console.log("Successfully extracted concepts with Gemini");
      } catch (geminiError) {
        console.warn("Gemini extraction failed:", geminiError instanceof Error ? geminiError.message : String(geminiError));
        
        // Fall back to Groq
        if (isGroqConfigured()) {
          console.log("Falling back to Groq for concept extraction...");
          try {
            result = await extractConceptsFromGroq(fileContent, courseCode);
            usedProvider = "Groq";
            console.log("Successfully extracted concepts with Groq");
          } catch (groqError) {
            console.error("Both Gemini and Groq extraction failed");
            throw groqError;
          }
        } else {
          console.error("Gemini failed and Groq is not configured");
          throw geminiError;
        }
      }
    } else if (isGroqConfigured()) {
      // If Gemini not configured, use Groq directly
      console.log("Gemini not configured, using Groq for concept extraction...");
      result = await extractConceptsFromGroq(fileContent, courseCode);
      usedProvider = "Groq";
    } else {
      throw new Error("Neither Gemini nor Groq is configured for concept extraction");
    }

    const extractedConcepts: Concept[] = result.concepts.map(c => ({
      name: c.name,
      description: c.description,
      relevance: c.relevance,
    }));

    const coursePath = path.join(storage.getForgeKBPath(), courseCode);
    if (!fs.existsSync(coursePath)) {
      fs.mkdirSync(coursePath, { recursive: true });
    }

    const contextPath = path.join(coursePath, "context.json");
    let existingContext: CourseContext = { concepts: [], summary: "" };

    if (fs.existsSync(contextPath)) {
      try {
        const contextData = fs.readFileSync(contextPath, "utf-8");
        existingContext = JSON.parse(contextData);
      } catch (parseError) {
        console.warn("Could not parse existing context, starting fresh:", parseError);
      }
    }

    const conceptMap = new Map<string, Concept>();
    existingContext.concepts.forEach((c) => conceptMap.set(c.name.toLowerCase(), c));
    extractedConcepts.forEach((c) => conceptMap.set(c.name.toLowerCase(), c));

    const mergedConcepts = Array.from(conceptMap.values());
    const newSummary = result.summary || generateCourseSummary(mergedConcepts);

    const updatedContext: CourseContext = {
      concepts: mergedConcepts,
      summary: newSummary,
      lastUpdated: new Date().toISOString(),
      sourceFile: path.basename(filePath),
    };

    fs.writeFileSync(contextPath, JSON.stringify(updatedContext, null, 2));

    const targetPath = path.join(coursePath, path.basename(filePath));
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, targetPath);
    }

    return {
      success: true,
      courseCode,
      extractedConcepts: extractedConcepts.length,
      totalConcepts: mergedConcepts.length,
      summary: newSummary,
      concepts: extractedConcepts,
    };
  } catch (error: any) {
    console.error("Error in ingestNotes:", error);
    return {
      success: false,
      courseCode,
      extractedConcepts: 0,
      totalConcepts: 0,
      summary: "",
      concepts: [],
      error: error.message || String(error),
    };
  }
}