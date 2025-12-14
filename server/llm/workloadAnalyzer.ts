/**
 * Workload Analyzer
 * 
 * Analyzes user's daily schedule, commitments, and deadlines
 * to determine available study time slots and workload intensity.
 */

import { storage } from "../storage";
import type { AcademicCommitment, Deadline, UserPreferences } from "@shared/schema";

export interface TimeSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  type: "available" | "buffer" | "meal";
  energyLevel?: "high" | "medium" | "low";
}

export interface DayWorkload {
  date: string;
  wakeTime: string;
  sleepTime: string;
  totalCommitmentMinutes: number;
  totalAvailableMinutes: number;
  commitments: {
    title: string;
    startTime: string;
    endTime: string;
    type: string;
    courseCode?: string;
  }[];
  deadlinesApproaching: {
    title: string;
    dueDate: string;
    daysRemaining: number;
    courseCode?: string;
    type: string;
  }[];
  availableSlots: TimeSlot[];
  workloadIntensity: "light" | "moderate" | "heavy" | "overloaded";
  recommendedMissionCount: number;
  recommendedMissionDuration: number;
}

export interface WeeklyWorkloadSummary {
  days: DayWorkload[];
  avgAvailableMinutesPerDay: number;
  busiestDay: string;
  lightestDay: string;
  totalDeadlines: number;
  urgentDeadlines: number;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function getEnergyLevelForTime(timeMinutes: number): "high" | "medium" | "low" {
  const hour = Math.floor(timeMinutes / 60);
  if (hour >= 9 && hour < 12) return "high";
  if (hour >= 14 && hour < 17) return "high";
  if (hour >= 7 && hour < 9) return "medium";
  if (hour >= 12 && hour < 14) return "low";
  if (hour >= 17 && hour < 20) return "medium";
  return "low";
}

function isMealTime(startMinutes: number, endMinutes: number): boolean {
  const mealTimes = [
    { start: 7 * 60, end: 8 * 60 },
    { start: 12 * 60, end: 13 * 60 },
    { start: 18 * 60, end: 19 * 60 },
  ];
  
  for (const meal of mealTimes) {
    if (startMinutes <= meal.start && endMinutes >= meal.end) {
      return true;
    }
    if (startMinutes >= meal.start && startMinutes < meal.end) {
      return true;
    }
  }
  return false;
}

function calculateWorkloadIntensity(
  totalCommitmentMinutes: number,
  totalAvailableMinutes: number,
  deadlineCount: number
): "light" | "moderate" | "heavy" | "overloaded" {
  const commitmentRatio = totalCommitmentMinutes / (totalCommitmentMinutes + totalAvailableMinutes);
  const deadlinePressure = Math.min(deadlineCount * 10, 30);
  const intensityScore = (commitmentRatio * 70) + deadlinePressure;
  
  if (intensityScore < 30) return "light";
  if (intensityScore < 50) return "moderate";
  if (intensityScore < 70) return "heavy";
  return "overloaded";
}

function calculateRecommendedMissions(
  availableMinutes: number,
  workloadIntensity: string,
  deadlineCount: number
): { count: number; duration: number } {
  let baseDuration = 45;
  let baseCount = 3;
  
  switch (workloadIntensity) {
    case "light":
      baseDuration = 60;
      baseCount = 4;
      break;
    case "moderate":
      baseDuration = 45;
      baseCount = 3;
      break;
    case "heavy":
      baseDuration = 30;
      baseCount = 2;
      break;
    case "overloaded":
      baseDuration = 20;
      baseCount = 1;
      break;
  }
  
  if (deadlineCount >= 2) {
    baseCount = Math.min(baseCount + 1, 5);
  }
  
  const maxPossibleMissions = Math.floor(availableMinutes / baseDuration);
  const count = Math.min(baseCount, maxPossibleMissions);
  
  return { count: Math.max(1, count), duration: baseDuration };
}

function findAvailableSlots(
  wakeMinutes: number,
  sleepMinutes: number,
  commitments: { startTime: string; endTime: string }[],
  minSlotDuration: number = 30
): TimeSlot[] {
  const sortedCommitments = [...commitments].sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  
  const slots: TimeSlot[] = [];
  let currentTime = wakeMinutes;
  
  for (const commitment of sortedCommitments) {
    const commitStart = timeToMinutes(commitment.startTime);
    const commitEnd = timeToMinutes(commitment.endTime);
    
    if (commitStart > currentTime) {
      const gapDuration = commitStart - currentTime;
      
      if (gapDuration >= minSlotDuration) {
        const slotType = isMealTime(currentTime, commitStart) ? "meal" : "available";
        slots.push({
          startTime: minutesToTime(currentTime),
          endTime: minutesToTime(commitStart),
          durationMinutes: gapDuration,
          type: slotType as "available" | "meal",
          energyLevel: getEnergyLevelForTime(currentTime),
        });
      }
    }
    
    currentTime = Math.max(currentTime, commitEnd);
  }
  
  if (sleepMinutes > currentTime) {
    const remainingDuration = sleepMinutes - currentTime;
    if (remainingDuration >= minSlotDuration) {
      const slotType = isMealTime(currentTime, sleepMinutes) ? "meal" : "available";
      slots.push({
        startTime: minutesToTime(currentTime),
        endTime: minutesToTime(sleepMinutes),
        durationMinutes: remainingDuration,
        type: slotType as "available" | "meal",
        energyLevel: getEnergyLevelForTime(currentTime),
      });
    }
  }
  
  return slots;
}

export async function analyzeDayWorkload(
  date: string,
  userId: number
): Promise<DayWorkload> {
  const [preferences, commitments, allDeadlines, courses] = await Promise.all([
    storage.getUserPreferences(userId),
    storage.getCommitmentsForDate(date, userId),
    storage.getDeadlines(userId),
    storage.getCourses(userId),
  ]);
  
  const courseMap = new Map(courses.map(c => [c.id, c]));
  
  const wakeTime = preferences?.wakeTime || "06:00";
  const sleepTime = preferences?.sleepTime || "22:00";
  const wakeMinutes = timeToMinutes(wakeTime);
  const sleepMinutes = timeToMinutes(sleepTime);
  
  const formattedCommitments = commitments.map(c => {
    const course = c.courseId ? courseMap.get(c.courseId) : null;
    return {
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      type: c.type,
      courseCode: course?.code,
    };
  });
  
  const totalCommitmentMinutes = formattedCommitments.reduce((sum, c) => {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    return sum + (end - start);
  }, 0);
  
  const targetDate = new Date(date);
  const deadlinesApproaching = allDeadlines
    .filter(d => {
      const dueDate = new Date(d.dueDate);
      const daysRemaining = Math.ceil((dueDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysRemaining >= 0 && daysRemaining <= 7;
    })
    .map(d => {
      const dueDate = new Date(d.dueDate);
      const daysRemaining = Math.ceil((dueDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
      const course = d.courseId ? courseMap.get(d.courseId) : null;
      return {
        title: d.title,
        dueDate: d.dueDate,
        daysRemaining,
        courseCode: course?.code,
        type: d.type,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  
  const availableSlots = findAvailableSlots(
    wakeMinutes,
    sleepMinutes,
    formattedCommitments,
    30
  );
  
  const totalAvailableMinutes = availableSlots
    .filter(s => s.type === "available")
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  
  const workloadIntensity = calculateWorkloadIntensity(
    totalCommitmentMinutes,
    totalAvailableMinutes,
    deadlinesApproaching.length
  );
  
  const { count: recommendedMissionCount, duration: recommendedMissionDuration } = 
    calculateRecommendedMissions(totalAvailableMinutes, workloadIntensity, deadlinesApproaching.length);
  
  return {
    date,
    wakeTime,
    sleepTime,
    totalCommitmentMinutes,
    totalAvailableMinutes,
    commitments: formattedCommitments,
    deadlinesApproaching,
    availableSlots,
    workloadIntensity,
    recommendedMissionCount,
    recommendedMissionDuration,
  };
}

export async function analyzeWeekWorkload(
  startDate: string,
  userId: number
): Promise<WeeklyWorkloadSummary> {
  const days: DayWorkload[] = [];
  const start = new Date(startDate);
  
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const dateStr = currentDate.toISOString().split("T")[0];
    
    const dayWorkload = await analyzeDayWorkload(dateStr, userId);
    days.push(dayWorkload);
  }
  
  const avgAvailableMinutesPerDay = 
    days.reduce((sum, d) => sum + d.totalAvailableMinutes, 0) / days.length;
  
  const sortedByAvailability = [...days].sort((a, b) => 
    a.totalAvailableMinutes - b.totalAvailableMinutes
  );
  
  const busiestDay = sortedByAvailability[0].date;
  const lightestDay = sortedByAvailability[sortedByAvailability.length - 1].date;
  
  const allDeadlines = new Set(
    days.flatMap(d => d.deadlinesApproaching.map(dl => dl.title))
  );
  
  const urgentDeadlines = new Set(
    days.flatMap(d => 
      d.deadlinesApproaching
        .filter(dl => dl.daysRemaining <= 3)
        .map(dl => dl.title)
    )
  );
  
  return {
    days,
    avgAvailableMinutesPerDay: Math.round(avgAvailableMinutesPerDay),
    busiestDay,
    lightestDay,
    totalDeadlines: allDeadlines.size,
    urgentDeadlines: urgentDeadlines.size,
  };
}

export async function getOptimalStudySlots(
  date: string,
  userId: number,
  desiredDuration: number = 60
): Promise<TimeSlot[]> {
  const dayWorkload = await analyzeDayWorkload(date, userId);
  
  const validSlots = dayWorkload.availableSlots
    .filter(s => s.type === "available" && s.durationMinutes >= desiredDuration)
    .sort((a, b) => {
      const energyOrder = { high: 0, medium: 1, low: 2 };
      return (energyOrder[a.energyLevel || "medium"] - energyOrder[b.energyLevel || "medium"]);
    });
  
  return validSlots;
}

export function formatWorkloadForPrompt(workload: DayWorkload): string {
  const sections: string[] = [];
  
  sections.push(`DAILY WORKLOAD ANALYSIS (${workload.date}):`);
  sections.push(`- Wake: ${workload.wakeTime}, Sleep: ${workload.sleepTime}`);
  sections.push(`- Total commitments: ${workload.totalCommitmentMinutes} minutes`);
  sections.push(`- Available study time: ${workload.totalAvailableMinutes} minutes`);
  sections.push(`- Workload intensity: ${workload.workloadIntensity.toUpperCase()}`);
  sections.push(`- Recommended: ${workload.recommendedMissionCount} missions @ ${workload.recommendedMissionDuration} min each`);
  
  if (workload.commitments.length > 0) {
    sections.push(`\nSCHEDULED COMMITMENTS:`);
    for (const c of workload.commitments) {
      sections.push(`- ${c.startTime}-${c.endTime}: ${c.title} (${c.type})${c.courseCode ? ` [${c.courseCode}]` : ""}`);
    }
  }
  
  if (workload.deadlinesApproaching.length > 0) {
    sections.push(`\nAPPROACHING DEADLINES:`);
    for (const d of workload.deadlinesApproaching) {
      sections.push(`- ${d.title} (${d.type}) - ${d.daysRemaining === 0 ? "TODAY!" : `in ${d.daysRemaining} days`}${d.courseCode ? ` [${d.courseCode}]` : ""}`);
    }
  }
  
  if (workload.availableSlots.length > 0) {
    sections.push(`\nAVAILABLE STUDY SLOTS:`);
    for (const s of workload.availableSlots.filter(s => s.type === "available")) {
      sections.push(`- ${s.startTime}-${s.endTime} (${s.durationMinutes} min, ${s.energyLevel} energy)`);
    }
  }
  
  return sections.join("\n");
}
