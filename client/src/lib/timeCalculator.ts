import { TimeBlock } from "./api";

export interface TimeDivision {
  label: string;
  minutes: number;
  percentage: number;
  color: string;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function categorizBlock(block: TimeBlock): "SLEEPING" | "WORKING" | "FREE_TIME" | "OTHER" {
  const typeStr = (block.type || "").toLowerCase();

  // Check if it's sleeping (based on time or explicit type)
  const startMinutes = timeToMinutes(block.startTime);
  const isSleepTime = startMinutes >= 22 * 60 || startMinutes < 8 * 60;
  if (isSleepTime || typeStr.includes("sleep")) {
    return "SLEEPING";
  }

  // Working: study, class, mission, exam, assignment
  if (
    typeStr.includes("study") ||
    typeStr.includes("class") ||
    typeStr.includes("mission") ||
    typeStr.includes("exam") ||
    typeStr.includes("assignment")
  ) {
    return "WORKING";
  }

  // Free time: break, personal
  if (typeStr.includes("break") || typeStr.includes("personal")) {
    return "FREE_TIME";
  }

  return "OTHER";
}

export function calculateTimeDivisions(timeBlocks: TimeBlock[]): TimeDivision[] {
  const divisions: Record<string, number> = {
    SLEEPING: 0,
    WORKING: 0,
    FREE_TIME: 0,
    OTHER: 0,
  };

  // Calculate total minutes per category
  timeBlocks.forEach((block) => {
    const startMin = timeToMinutes(block.startTime);
    const endMin = timeToMinutes(block.endTime);
    const duration = Math.max(0, endMin - startMin);

    const category = categorizBlock(block);
    divisions[category] += duration;
  });

  // Calculate total and percentages
  const total = Object.values(divisions).reduce((a, b) => a + b, 0);
  const totalMinutes = 24 * 60;

  // Add unaccounted time to OTHER
  const unaccounted = totalMinutes - total;
  if (unaccounted > 0) {
    divisions.OTHER += unaccounted;
  }

  // Create result array with colors matching Acid Ops theme
  const result: TimeDivision[] = [
    {
      label: "SLEEPING",
      minutes: divisions.SLEEPING,
      percentage: (divisions.SLEEPING / totalMinutes) * 100,
      color: "#1e3a5f", // Dark blue
    },
    {
      label: "WORKING",
      minutes: divisions.WORKING,
      percentage: (divisions.WORKING / totalMinutes) * 100,
      color: "#00ff00", // Acid green
    },
    {
      label: "FREE_TIME",
      minutes: divisions.FREE_TIME,
      percentage: (divisions.FREE_TIME / totalMinutes) * 100,
      color: "#00ffff", // Cyan
    },
    {
      label: "OTHER",
      minutes: divisions.OTHER,
      percentage: (divisions.OTHER / totalMinutes) * 100,
      color: "#ff6b00", // Orange/red
    },
  ];

  return result.filter((d) => d.minutes > 0);
}
