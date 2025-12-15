import { useMemo, useState } from "react";
import { calculateTimeDivisions } from "@/lib/timeCalculator";
import { DailySchedule, TimeBlock } from "@/lib/api";

interface WeeklyBarChartProps {
  schedules: DailySchedule[];
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function WeeklyBarChart({ schedules }: WeeklyBarChartProps) {
  const [daysToShow, setDaysToShow] = useState(7);

  const chartData = useMemo(() => {
    if (schedules.length === 0) return [];

    // Get the last N days
    const recentSchedules = schedules.slice(-daysToShow);

    return recentSchedules.map((schedule) => {
      const date = new Date(schedule.scheduleDate);
      const dayName = DAYS[date.getDay()];
      const divisions = calculateTimeDivisions(schedule.timeBlocks);

      return {
        date: schedule.scheduleDate,
        dayName,
        divisions,
        totalMinutes: divisions.reduce((sum, d) => sum + d.minutes, 0),
      };
    });
  }, [schedules, daysToShow]);

  // Max height for scaling (24 hours = 1440 minutes)
  const maxMinutes = 1440;

  return (
    <div className="space-y-3">
      {/* Day selector */}
      <div className="flex gap-2">
        {[7, 14, 30].map((days) => (
          <button
            key={days}
            onClick={() => setDaysToShow(days)}
            className={`px-2 py-1 text-[9px] font-mono uppercase tracking-tight border rounded transition-colors ${
              daysToShow === days
                ? "border-primary bg-primary/20 text-primary"
                : "border-white/20 text-foreground/60 hover:text-foreground"
            }`}
            data-testid={`button-days-${days}`}
          >
            {days}D
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-32">
        {chartData.map((day, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center">
            {/* Bar container */}
            <div className="w-full h-28 flex flex-col-reverse gap-px bg-black/30 rounded-sm border border-white/5 p-1 overflow-hidden">
              {day.divisions.map((division, divIdx) => {
                const height = (division.minutes / maxMinutes) * 100;
                return (
                  <div
                    key={divIdx}
                    style={{
                      backgroundColor: division.color,
                      height: `${height}%`,
                      opacity: 0.85,
                    }}
                    className="w-full min-h-[1px]"
                    title={`${division.label}: ${Math.floor(division.minutes / 60)}H ${division.minutes % 60}M`}
                  />
                );
              })}
            </div>

            {/* Day label */}
            <p className="text-[8px] font-mono uppercase tracking-tight text-foreground/60 mt-1">
              {day.dayName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
