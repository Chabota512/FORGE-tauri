import { storage } from "../storage";
import type { ScheduleBlockFeedback } from "@shared/schema";

interface ExtractedPatterns {
  avgPace: number;
  preferredStartTime: string;
  preferredEndTime: string;
  avgEnergy: number;
  breakFrequency: number;
  restDays: number[];
  skipReasons?: Record<string, number>;
  completionRate: number;
}

export async function analyzeUserPatterns(): Promise<ExtractedPatterns> {
  // Get feedback from last 14 days
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const startDate = twoWeeksAgo.toISOString().split("T")[0];
  const endDate = today.toISOString().split("T")[0];

  const feedbackRange = await storage.getFeedbackInRange(startDate, endDate);
  
  // Get block feedback for analysis
  let patterns: ExtractedPatterns = {
    avgPace: 25, // Default
    preferredStartTime: "08:00",
    preferredEndTime: "22:00",
    avgEnergy: 3,
    breakFrequency: 50,
    restDays: [],
    skipReasons: {},
    completionRate: 0.7,
  };

  if (feedbackRange.length === 0) {
    return patterns;
  }

  // Analyze daily feedback for energy levels
  const energyLevels = feedbackRange
    .filter(f => f.energyLevel !== null)
    .map(f => f.energyLevel as number);
  
  if (energyLevels.length > 0) {
    patterns.avgEnergy = Math.round(
      energyLevels.reduce((a, b) => a + b, 0) / energyLevels.length * 2
    ) / 2; // Round to 0.5
  }

  // Calculate completion rate from daily feedback
  const completionRatings = feedbackRange
    .filter(f => f.completionRating !== null)
    .map(f => f.completionRating as number);
  
  if (completionRatings.length > 0) {
    patterns.completionRate = Math.round(
      (completionRatings.reduce((a, b) => a + b, 0) / completionRatings.length / 5) * 100
    ) / 100;
  }

  // Extract time-based patterns and skip reasons
  const skipReasons: Record<string, number> = {};
  let totalBlocks = 0;
  let completedBlocks = 0;
  let totalEnergyByHour: Record<number, number[]> = {};
  let blocksByHour: Record<number, number> = {};

  // Note: In a real implementation, you'd query scheduleBlockFeedback table
  // For now, we'll use the daily feedback to infer patterns
  
  // Infer preferred work hours based on completion rating and energy
  // If user completes tasks better in mornings, prefer morning start
  if (patterns.avgEnergy >= 3.5) {
    patterns.preferredStartTime = "07:00";
    patterns.preferredEndTime = "23:00";
  } else if (patterns.avgEnergy >= 3) {
    patterns.preferredStartTime = "08:00";
    patterns.preferredEndTime = "22:00";
  } else {
    patterns.preferredStartTime = "10:00";
    patterns.preferredEndTime = "20:00";
  }

  // Estimate pace from completion rating
  // Higher completion = faster pace possible
  if (patterns.completionRate >= 0.8) {
    patterns.avgPace = 30;
    patterns.breakFrequency = 60;
  } else if (patterns.completionRate >= 0.6) {
    patterns.avgPace = 25;
    patterns.breakFrequency = 50;
  } else {
    patterns.avgPace = 20;
    patterns.breakFrequency = 40;
  }

  // Determine rest days (lowest energy days in feedback)
  if (feedbackRange.length >= 3) {
    const sortedByEnergy = [...feedbackRange]
      .filter(f => f.feedbackDate && f.energyLevel !== null)
      .sort((a, b) => (a.energyLevel || 0) - (b.energyLevel || 0))
      .slice(0, Math.ceil(feedbackRange.length * 0.2)); // Bottom 20% by energy

    patterns.restDays = sortedByEnergy
      .map(f => {
        const date = new Date(f.feedbackDate);
        return date.getDay(); // 0=Sunday, 6=Saturday
      })
      .filter((v, i, a) => a.indexOf(v) === i); // Unique days
  }

  return patterns;
}

export async function updateUserPatterns(): Promise<void> {
  try {
    const patterns = await analyzeUserPatterns();

    // Save each pattern to the database
    await storage.saveUserPattern({
      patternType: "avgPace",
      patternValue: patterns.avgPace.toString(),
      confidence: "0.7",
    });

    await storage.saveUserPattern({
      patternType: "preferredStartTime",
      patternValue: patterns.preferredStartTime,
      confidence: "0.6",
    });

    await storage.saveUserPattern({
      patternType: "preferredEndTime",
      patternValue: patterns.preferredEndTime,
      confidence: "0.6",
    });

    await storage.saveUserPattern({
      patternType: "avgEnergy",
      patternValue: patterns.avgEnergy.toString(),
      confidence: "0.75",
    });

    await storage.saveUserPattern({
      patternType: "breakFrequency",
      patternValue: patterns.breakFrequency.toString(),
      confidence: "0.65",
    });

    await storage.saveUserPattern({
      patternType: "restDays",
      patternValue: JSON.stringify(patterns.restDays),
      confidence: "0.6",
    });

    console.log("User patterns updated successfully", patterns);
  } catch (error) {
    console.error("Error updating user patterns:", error);
    throw error;
  }
}
