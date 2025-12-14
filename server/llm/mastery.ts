/**
 * Mastery Level Management
 * 
 * Handles mastery level adjustments based on mission feedback and 
 * implements spaced repetition decay for concepts not studied recently.
 */

import { db } from "../db";
import { conceptTracking } from "@shared/schema";
import { eq, and, lt, gt, sql } from "drizzle-orm";
import { trackMasteryAdjustment } from "../metrics/counters";

const MIN_MASTERY = 1;
const MAX_MASTERY = 5;
const DECAY_DAYS = 30;

export interface MasteryFeedback {
  missionId: number;
  courseId: number;
  conceptNames: string[];
  isValid: boolean;
  difficulty?: number;
  timeAccuracy?: number;
}

export interface MasteryDelta {
  conceptName: string;
  previousLevel: number;
  newLevel: number;
  reason: string;
}

/**
 * Clamps mastery level between MIN_MASTERY and MAX_MASTERY
 * @param level - Current mastery level
 * @returns Clamped mastery level
 */
function clampMastery(level: number): number {
  return Math.max(MIN_MASTERY, Math.min(MAX_MASTERY, level));
}

/**
 * Calculates the mastery delta based on feedback
 * @param isValid - Whether the proof was validated
 * @param difficulty - Difficulty rating (1-5)
 * @param timeAccuracy - Time accuracy rating (1-5)
 * @returns Delta value to apply to mastery
 */
function calculateDelta(
  isValid: boolean,
  difficulty?: number,
  timeAccuracy?: number
): { delta: number; reason: string } {
  if (!isValid) {
    return { delta: -1, reason: "Invalid proof submission" };
  }
  
  const diff = difficulty ?? 3;
  const time = timeAccuracy ?? 3;
  
  if (diff >= 4 || time >= 4) {
    return { delta: 1, reason: `High performance: difficulty=${diff}, timeAccuracy=${time}` };
  }
  
  if (diff <= 2 && time <= 2) {
    return { delta: -1, reason: `Needs reinforcement: difficulty=${diff}, timeAccuracy=${time}` };
  }
  
  return { delta: 0, reason: "Maintaining current level" };
}

/**
 * Updates mastery levels for concepts based on mission feedback
 * @param feedback - Feedback data from mission completion
 * @returns Array of mastery deltas applied
 */
export async function updateMasteryFromFeedback(
  feedback: MasteryFeedback
): Promise<MasteryDelta[]> {
  const { courseId, conceptNames, isValid, difficulty, timeAccuracy } = feedback;
  
  if (!conceptNames || conceptNames.length === 0) {
    return [];
  }
  
  const { delta, reason } = calculateDelta(isValid, difficulty, timeAccuracy);
  
  if (delta === 0) {
    return [];
  }
  
  const deltas: MasteryDelta[] = [];
  
  for (const conceptName of conceptNames) {
    const existing = await db
      .select()
      .from(conceptTracking)
      .where(
        and(
          eq(conceptTracking.courseId, courseId),
          eq(conceptTracking.conceptName, conceptName)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      const current = existing[0];
      const previousLevel = current.masteryLevel ?? 1;
      const newLevel = clampMastery(previousLevel + delta);
      
      if (newLevel !== previousLevel) {
        await db
          .update(conceptTracking)
          .set({
            masteryLevel: newLevel,
            lastCoveredAt: new Date().toISOString(),
            coverageCount: sql`${conceptTracking.coverageCount} + 1`,
          })
          .where(eq(conceptTracking.id, current.id));
        
        trackMasteryAdjustment();
        
        deltas.push({
          conceptName,
          previousLevel,
          newLevel,
          reason,
        });
        
        console.log(
          `[Mastery] Updated ${conceptName}: ${previousLevel} -> ${newLevel} (${reason})`
        );
      }
    } else {
      const initialLevel = isValid ? 2 : 1;
      
      await db.insert(conceptTracking).values({
        courseId,
        conceptName,
        masteryLevel: initialLevel,
        coverageCount: 1,
      });
      
      trackMasteryAdjustment();
      
      deltas.push({
        conceptName,
        previousLevel: 0,
        newLevel: initialLevel,
        reason: "New concept tracked",
      });
      
      console.log(`[Mastery] Created tracking for ${conceptName} at level ${initialLevel}`);
    }
  }
  
  return deltas;
}

/**
 * Decays mastery for concepts not studied in the last DECAY_DAYS days
 * Should be run nightly via cron or scheduled task
 * @returns Number of concepts decayed
 */
export async function decayUnseenMastery(): Promise<number> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - DECAY_DAYS);
  const thresholdStr = thresholdDate.toISOString();
  
  const result = await db
    .update(conceptTracking)
    .set({
      masteryLevel: sql`${conceptTracking.masteryLevel} - 1`,
    })
    .where(
      and(
        lt(conceptTracking.lastCoveredAt, thresholdStr),
        gt(conceptTracking.masteryLevel, MIN_MASTERY)
      )
    )
    .returning({ id: conceptTracking.id });
  
  const decayedCount = result.length;
  
  if (decayedCount > 0) {
    console.log(`[Mastery] Decayed mastery for ${decayedCount} concepts not seen in ${DECAY_DAYS} days`);
  }
  
  return decayedCount;
}

/**
 * Gets mastery level for a specific concept
 * @param courseId - Course ID
 * @param conceptName - Concept name
 * @returns Current mastery level or null if not tracked
 */
export async function getMasteryLevel(
  courseId: number,
  conceptName: string
): Promise<number | null> {
  const result = await db
    .select({ masteryLevel: conceptTracking.masteryLevel })
    .from(conceptTracking)
    .where(
      and(
        eq(conceptTracking.courseId, courseId),
        eq(conceptTracking.conceptName, conceptName)
      )
    )
    .limit(1);
  
  return result[0]?.masteryLevel ?? null;
}

/**
 * Gets all mastery levels for a course
 * @param courseId - Course ID
 * @returns Array of concept mastery data
 */
export async function getCourseMasteryLevels(
  courseId: number
): Promise<{ conceptName: string; masteryLevel: number; lastCoveredAt: string | null }[]> {
  const results = await db
    .select({
      conceptName: conceptTracking.conceptName,
      masteryLevel: conceptTracking.masteryLevel,
      lastCoveredAt: conceptTracking.lastCoveredAt,
    })
    .from(conceptTracking)
    .where(eq(conceptTracking.courseId, courseId));
  
  return results.map((r) => ({
    conceptName: r.conceptName,
    masteryLevel: r.masteryLevel ?? 1,
    lastCoveredAt: r.lastCoveredAt,
  }));
}

/**
 * Schedules nightly mastery decay
 * Uses setTimeout loop instead of external cron dependency
 */
export function startMasteryDecayScheduler(): void {
  const runDecay = async () => {
    try {
      const decayed = await decayUnseenMastery();
      console.log(`[Mastery Scheduler] Decay complete: ${decayed} concepts affected`);
    } catch (error) {
      console.error("[Mastery Scheduler] Decay failed:", error);
    }
    
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    
    setTimeout(runDecay, msUntilMidnight);
  };
  
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();
  
  console.log(
    `[Mastery Scheduler] First decay scheduled for ${nextMidnight.toISOString()} (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`
  );
  
  setTimeout(runDecay, msUntilMidnight);
}
