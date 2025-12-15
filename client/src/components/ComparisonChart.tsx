import { useMemo } from "react";
import { DailySchedule } from "@/lib/api";

interface ComparisonChartProps {
  schedules: DailySchedule[];
  category: "SLEEPING" | "WORKING" | "FREE_TIME" | "OTHER";
}

const COLORS = {
  SLEEPING: "#1e3a5f",
  WORKING: "#00ff00",
  FREE_TIME: "#00ffff",
  OTHER: "#ff6b00",
};

export function ComparisonChart({ schedules, category }: ComparisonChartProps) {
  const chartData = useMemo(() => {
    const mockData = [
      { dayName: "SUN", hours: 6.5 },
      { dayName: "MON", hours: 8.2 },
      { dayName: "TUE", hours: 7.8 },
      { dayName: "WED", hours: 7.1 },
      { dayName: "THU", hours: 9.5 },
      { dayName: "FRI", hours: 6.3 },
      { dayName: "SAT", hours: 8.9 },
    ];
    return mockData;
  }, [schedules, category]);

  const maxHours = Math.max(...chartData.map((d) => d.hours));

  return (
    <div className="space-y-4 w-full">
      {/* Chart Container */}
      <div className="flex gap-2">
        {/* Y-Axis Labels */}
        <div className="flex flex-col justify-between items-end text-[9px] font-mono text-foreground/50 w-10" style={{ height: "600px" }}>
          <span>{Math.round(maxHours * 10) / 10}</span>
          <span>{Math.round((maxHours / 2) * 10) / 10}</span>
          <span>0</span>
        </div>

        {/* Bars */}
        <div className="flex-1 flex items-end gap-1.5 bg-black/20 p-2 rounded border border-white/10" style={{ height: "600px" }}>
          {chartData.map((day, idx) => {
            const percent = (day.hours / maxHours) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-0">
                <span className="text-[10px] font-mono font-bold text-primary mb-1">{day.hours.toFixed(1)}</span>
                <div
                  style={{
                    width: "100%",
                    height: `${percent}%`,
                    backgroundColor: COLORS[category],
                    opacity: 0.9,
                    border: `1px solid ${COLORS[category]}`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-Axis Labels */}
      <div className="flex gap-2 ml-10">
        {chartData.map((day, idx) => (
          <div key={idx} className="flex-1 text-center text-[9px] font-mono uppercase text-foreground/50">
            {day.dayName}
          </div>
        ))}
      </div>
    </div>
  );
}
