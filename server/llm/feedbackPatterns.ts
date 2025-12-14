import { storage } from "../storage";
import type { MissionFeedback } from "@shared/schema";

export interface EmotionalTrend {
  state: string;
  count: number;
  percentage: number;
}

export interface ConfidenceTrend {
  level: string;
  count: number;
  percentage: number;
}

export interface BlockerPattern {
  blocker: string;
  frequency: number;
}

export interface ClarityIssue {
  missionId: number;
  clarity: string;
}

export interface FeedbackPatterns {
  emotionalTrends: EmotionalTrend[];
  confidenceTrends: ConfidenceTrend[];
  commonBlockers: BlockerPattern[];
  clarityIssues: ClarityIssue[];
  learningTypeDistribution: { type: string; count: number; percentage: number }[];
  externalHelpRate: number;
  averageTimeDelta: number;
  sampleSize: number;
  recentEmotionalState: string | null;
  recentConfidenceLevel: string | null;
  struggleIndicators: {
    highConfusionRate: boolean;
    frequentExternalHelp: boolean;
    lowConfidence: boolean;
    clarityProblems: boolean;
  };
}

export async function analyzeFeedbackPatterns(userId: number, limit: number = 20): Promise<FeedbackPatterns> {
  const feedbackList = await storage.getRecentMissionFeedback(userId, limit);
  
  if (feedbackList.length === 0) {
    return {
      emotionalTrends: [],
      confidenceTrends: [],
      commonBlockers: [],
      clarityIssues: [],
      learningTypeDistribution: [],
      externalHelpRate: 0,
      averageTimeDelta: 0,
      sampleSize: 0,
      recentEmotionalState: null,
      recentConfidenceLevel: null,
      struggleIndicators: {
        highConfusionRate: false,
        frequentExternalHelp: false,
        lowConfidence: false,
        clarityProblems: false,
      },
    };
  }

  const emotionalCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  const learningTypeCounts: Record<string, number> = {};
  const blockerTexts: string[] = [];
  const clarityIssues: ClarityIssue[] = [];
  let externalHelpYesCount = 0;
  let externalHelpTotalAnswered = 0;
  let timeDeltaSum = 0;
  let timeDeltaCount = 0;

  for (const feedback of feedbackList) {
    if (feedback.emotionalState) {
      emotionalCounts[feedback.emotionalState] = (emotionalCounts[feedback.emotionalState] || 0) + 1;
    }

    if (feedback.confidenceLevel) {
      confidenceCounts[feedback.confidenceLevel] = (confidenceCounts[feedback.confidenceLevel] || 0) + 1;
    }

    if (feedback.learningType) {
      learningTypeCounts[feedback.learningType] = (learningTypeCounts[feedback.learningType] || 0) + 1;
    }

    if (feedback.blockers && feedback.blockers.trim()) {
      blockerTexts.push(feedback.blockers.trim());
    }

    if (feedback.missionClarity && feedback.missionClarity !== "crystal_clear") {
      clarityIssues.push({
        missionId: feedback.missionId,
        clarity: feedback.missionClarity,
      });
    }

    if (feedback.usedExternalHelp === true) {
      externalHelpYesCount++;
      externalHelpTotalAnswered++;
    } else if (feedback.usedExternalHelp === false) {
      externalHelpTotalAnswered++;
    }

    if (feedback.timeFeeling) {
      if (feedback.timeFeeling === "faster") {
        timeDeltaSum -= 1;
        timeDeltaCount++;
      } else if (feedback.timeFeeling === "about_right") {
        timeDeltaCount++;
      } else if (feedback.timeFeeling === "much_longer") {
        timeDeltaSum += 2;
        timeDeltaCount++;
      }
    }
  }

  const total = feedbackList.length;

  const emotionalTrends: EmotionalTrend[] = Object.entries(emotionalCounts)
    .map(([state, count]) => ({
      state,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const confidenceTrends: ConfidenceTrend[] = Object.entries(confidenceCounts)
    .map(([level, count]) => ({
      level,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const learningTypeDistribution = Object.entries(learningTypeCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const commonBlockers = extractBlockerPatterns(blockerTexts);

  const confusedCount = emotionalCounts["confused"] || 0;
  const frustratedCount = emotionalCounts["frustrated"] || 0;
  const shakyCount = confidenceCounts["shaky"] || 0;
  const unclearCount = clarityIssues.filter(c => c.clarity === "unclear").length;

  const externalHelpRate = externalHelpTotalAnswered > 0 
    ? Math.round((externalHelpYesCount / externalHelpTotalAnswered) * 100) 
    : 0;

  const struggleIndicators = {
    highConfusionRate: (confusedCount + frustratedCount) / total > 0.3,
    frequentExternalHelp: externalHelpTotalAnswered > 0 && externalHelpYesCount / externalHelpTotalAnswered > 0.5,
    lowConfidence: shakyCount / total > 0.3,
    clarityProblems: unclearCount / total > 0.2,
  };

  const mostRecent = feedbackList[0];

  return {
    emotionalTrends,
    confidenceTrends,
    commonBlockers,
    clarityIssues,
    learningTypeDistribution,
    externalHelpRate,
    averageTimeDelta: timeDeltaCount > 0 ? timeDeltaSum / timeDeltaCount : 0,
    sampleSize: total,
    recentEmotionalState: mostRecent?.emotionalState || null,
    recentConfidenceLevel: mostRecent?.confidenceLevel || null,
    struggleIndicators,
  };
}

function extractBlockerPatterns(blockerTexts: string[]): BlockerPattern[] {
  if (blockerTexts.length === 0) return [];

  const wordCounts: Record<string, number> = {};
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "is", "was", "were", "been", "be",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "it", "i",
    "that", "this", "my", "me", "so", "just", "not", "very", "really", "had",
    "have", "has", "did", "do", "does", "would", "could", "should", "too"
  ]);

  for (const text of blockerTexts) {
    const words = text.toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  return Object.entries(wordCounts)
    .filter(([_, count]) => count >= 2)
    .map(([blocker, frequency]) => ({ blocker, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
}

export function formatFeedbackPatternsForPrompt(patterns: FeedbackPatterns): string {
  if (patterns.sampleSize === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push(`\n=== LEARNER FEEDBACK PATTERNS (last ${patterns.sampleSize} missions) ===`);

  if (patterns.recentEmotionalState) {
    sections.push(`\nMOST RECENT STATE: ${patterns.recentEmotionalState}`);
  }
  if (patterns.recentConfidenceLevel) {
    sections.push(`MOST RECENT CONFIDENCE: ${patterns.recentConfidenceLevel}`);
  }

  if (patterns.emotionalTrends.length > 0) {
    sections.push(`\nEMOTIONAL PATTERNS:`);
    for (const trend of patterns.emotionalTrends.slice(0, 3)) {
      const emoji = getEmotionalEmoji(trend.state);
      sections.push(`- ${emoji} ${trend.state}: ${trend.percentage}% of missions`);
    }
  }

  if (patterns.confidenceTrends.length > 0) {
    sections.push(`\nCONFIDENCE PATTERNS:`);
    for (const trend of patterns.confidenceTrends) {
      sections.push(`- ${trend.level}: ${trend.percentage}%`);
    }
  }

  if (patterns.externalHelpRate > 0) {
    sections.push(`\nEXTERNAL HELP USAGE: ${patterns.externalHelpRate}%`);
  }

  if (patterns.commonBlockers.length > 0) {
    sections.push(`\nCOMMON BLOCKERS (extracted from feedback):`);
    for (const blocker of patterns.commonBlockers) {
      sections.push(`- "${blocker.blocker}" (mentioned ${blocker.frequency}x)`);
    }
  }

  if (patterns.clarityIssues.length > 0) {
    const unclearCount = patterns.clarityIssues.filter(c => c.clarity === "unclear").length;
    const somewhatCount = patterns.clarityIssues.filter(c => c.clarity === "somewhat_clear").length;
    sections.push(`\nCLARITY ISSUES: ${unclearCount} unclear, ${somewhatCount} somewhat clear`);
  }

  if (patterns.averageTimeDelta !== 0) {
    const timeNote = patterns.averageTimeDelta > 0.5 
      ? "Missions often take LONGER than expected - consider shorter tasks"
      : patterns.averageTimeDelta < -0.5 
        ? "Missions often finish FASTER than expected - can increase scope"
        : "Time estimates are generally accurate";
    sections.push(`\nTIME ACCURACY: ${timeNote}`);
  }

  const { struggleIndicators } = patterns;
  const struggles: string[] = [];
  
  if (struggleIndicators.highConfusionRate) {
    struggles.push("frequently confused/frustrated");
  }
  if (struggleIndicators.frequentExternalHelp) {
    struggles.push("relies heavily on external help");
  }
  if (struggleIndicators.lowConfidence) {
    struggles.push("often feels shaky/uncertain");
  }
  if (struggleIndicators.clarityProblems) {
    struggles.push("finds missions unclear");
  }

  if (struggles.length > 0) {
    sections.push(`\n⚠️ STRUGGLE INDICATORS: ${struggles.join(", ")}`);
    sections.push(`RECOMMENDATION: Generate SIMPLER missions with:`);
    
    if (struggleIndicators.clarityProblems) {
      sections.push(`  - More detailed step-by-step instructions`);
    }
    if (struggleIndicators.highConfusionRate) {
      sections.push(`  - Easier difficulty, focus on building confidence`);
    }
    if (struggleIndicators.frequentExternalHelp) {
      sections.push(`  - More guidance and hints in the mission description`);
    }
    if (struggleIndicators.lowConfidence) {
      sections.push(`  - Smaller scope, quick wins to build momentum`);
    }
  } else if (patterns.sampleSize >= 5) {
    const flowCount = patterns.emotionalTrends.find(t => t.state === "flow")?.percentage || 0;
    const solidCount = patterns.confidenceTrends.find(t => t.level === "solid")?.percentage || 0;
    
    if (flowCount >= 40 && solidCount >= 40) {
      sections.push(`\n✅ LEARNER THRIVING: Often in flow state with solid confidence`);
      sections.push(`RECOMMENDATION: Can increase challenge level gradually`);
    }
  }

  return sections.join("\n");
}

function getEmotionalEmoji(state: string): string {
  const emojiMap: Record<string, string> = {
    confused: "😕",
    frustrated: "😤",
    flow: "🌊",
    bored: "😴",
    focused: "🎯",
    tired: "😩",
  };
  return emojiMap[state] || "•";
}
