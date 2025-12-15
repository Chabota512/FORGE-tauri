import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import Footer from "@/components/Footer";
import { useComprehensiveAnalytics, useTimeAllocation, useReadingStats } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Flame, Clock, Target, AlertTriangle, Lightbulb, BookOpen, Zap, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type TimeCategory = "working" | "sleeping" | "freeTime" | "other";

const CATEGORY_COLORS: Record<TimeCategory, string> = {
  working: "#00ff00",
  sleeping: "#1e3a5f",
  freeTime: "#00ffff",
  other: "#ff6b00",
};

const CATEGORY_LABELS: Record<TimeCategory, string> = {
  working: "WORKING",
  sleeping: "SLEEPING",
  freeTime: "FREE TIME",
  other: "OTHER",
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export default function StatisticsPage() {
  const { data: analytics, isLoading, isError } = useComprehensiveAnalytics();
  const { data: timeAllocation = [] } = useTimeAllocation(7);
  const { data: readingStats } = useReadingStats();
  const [selectedCategory, setSelectedCategory] = useState<TimeCategory>("working");

  if (isLoading) {
    return (
      <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col">
        <PageHeader />
        <main className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              LOADING_ANALYTICS...
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col">
        <PageHeader />
        <main className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
            <p className="text-sm font-mono text-foreground uppercase mb-2">
              FAILED TO LOAD ANALYTICS
            </p>
            <p className="text-xs font-mono text-muted-foreground">
              Please try again later
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const summary = analytics?.summary || {
    totalBlocks: 0,
    completedBlocks: 0,
    skippedBlocks: 0,
    completionRate: 0,
    avgEnergyLevel: 0,
    avgDifficulty: 0,
    currentStreak: 0,
    totalStudyMinutes: 0,
  };

  const chartData = timeAllocation.map(day => {
    const date = new Date(day.date);
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    return {
      dayName,
      hours: day[selectedCategory] || 0,
    };
  });

  const maxHours = Math.max(...chartData.map(d => d.hours), 1);

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
      <PageHeader />

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-mono uppercase tracking-widest text-primary font-bold">
              ANALYTICS DASHBOARD
            </h1>
            <p className="text-sm font-mono text-muted-foreground">
              Your study patterns, performance metrics, and AI-powered insights
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-black/40 p-4 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-mono text-muted-foreground uppercase">STREAK</span>
              </div>
              <div className="text-2xl font-mono font-bold text-primary" data-testid="text-streak">
                {summary.currentStreak} DAYS
              </div>
            </div>

            <div className="bg-black/40 p-4 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-500" />
                <span className="text-xs font-mono text-muted-foreground uppercase">COMPLETION</span>
              </div>
              <div className="text-2xl font-mono font-bold text-primary" data-testid="text-completion-rate">
                {summary.completionRate}%
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {summary.completedBlocks}/{summary.totalBlocks} blocks
              </div>
            </div>

            <div className="bg-black/40 p-4 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-mono text-muted-foreground uppercase">AVG ENERGY</span>
              </div>
              <div className="text-2xl font-mono font-bold text-primary" data-testid="text-avg-energy">
                {summary.avgEnergyLevel}/5
              </div>
            </div>

            <div className="bg-black/40 p-4 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-mono text-muted-foreground uppercase">TOTAL STUDY</span>
              </div>
              <div className="text-2xl font-mono font-bold text-primary" data-testid="text-total-study">
                {formatMinutes(summary.totalStudyMinutes)}
              </div>
            </div>
          </div>

          {/* Compact Reading Stats Card */}
          {readingStats && (
            <div className="bg-black/40 p-4 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">READING ACTIVITY</span>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-bold text-primary" data-testid="text-books-month">
                    {readingStats.booksCompletedMonth}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">books this month</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-bold text-primary" data-testid="text-books-year">
                    {readingStats.booksCompletedYear}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">this year</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-bold text-orange-400" data-testid="text-reading-streak">
                    {readingStats.streakDays}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">day streak</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-bold text-cyan-400" data-testid="text-reading-pace">
                    {readingStats.paceChaptersPerWeek}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">chapters/wk</span>
                </div>
                <div className="flex items-center gap-1 ml-auto" data-testid="reading-activity-dots">
                  {readingStats.last7Days.map((day, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full ${
                        day.hasReading ? "bg-cyan-500" : "bg-white/10"
                      }`}
                      title={`${day.date}: ${day.count} chapters`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {analytics?.recommendations && analytics.recommendations.length > 0 && (
            <div className="bg-black/40 p-4 rounded border border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-mono uppercase tracking-wide text-primary font-bold">
                  AI RECOMMENDATIONS
                </h2>
              </div>
              <ul className="space-y-2">
                {analytics.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm font-mono text-foreground/80" data-testid={`text-recommendation-${idx}`}>
                    <span className="text-primary">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-black/40 p-6 rounded border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-mono uppercase tracking-wide text-primary font-bold">
                TIME ALLOCATION (LAST 7 DAYS)
              </h2>
              <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val as TimeCategory)}>
                <SelectTrigger className="w-32 h-8 text-xs font-mono" data-testid="select-time-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-black/95 border-white/10">
                  {(Object.keys(CATEGORY_LABELS) as TimeCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs font-mono uppercase">
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {chartData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex flex-col justify-between items-end text-[9px] font-mono text-foreground/50 w-8" style={{ height: "200px" }}>
                    <span>{Math.round(maxHours * 10) / 10}h</span>
                    <span>{Math.round((maxHours / 2) * 10) / 10}h</span>
                    <span>0</span>
                  </div>
                  <div className="flex-1 flex items-end gap-2 bg-black/20 p-2 rounded border border-white/10" style={{ height: "200px" }}>
                    {chartData.map((day, idx) => {
                      const percent = (day.hours / maxHours) * 100;
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1">
                          <span className="text-[10px] font-mono font-bold text-primary">{day.hours.toFixed(1)}</span>
                          <div
                            style={{
                              width: "100%",
                              height: `${Math.max(percent, 2)}%`,
                              backgroundColor: CATEGORY_COLORS[selectedCategory],
                              opacity: 0.9,
                              border: `1px solid ${CATEGORY_COLORS[selectedCategory]}`,
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 ml-8">
                  {chartData.map((day, idx) => (
                    <div key={idx} className="flex-1 text-center text-[9px] font-mono uppercase text-foreground/50">
                      {day.dayName}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                NO SCHEDULE DATA AVAILABLE YET
              </div>
            )}
          </div>

          {analytics?.courseAnalytics && analytics.courseAnalytics.length > 0 && (
            <div className="bg-black/40 p-6 rounded border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-mono uppercase tracking-wide text-primary font-bold">
                  COURSE ANALYTICS
                </h2>
              </div>
              <div className="space-y-4">
                {analytics.courseAnalytics.map((course) => (
                  <div key={course.courseId} className="space-y-2" data-testid={`course-analytics-${course.courseCode}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-bold text-foreground">
                        {course.courseCode}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatMinutes(course.totalMinutes)} studied
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={course.progressPercent} className="flex-1 h-2" />
                      <span className="text-xs font-mono text-primary w-16 text-right">
                        {course.conceptsCovered}/{course.totalConcepts} concepts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {analytics?.productivityByHour && analytics.productivityByHour.length > 0 && (
              <div className="bg-black/40 p-4 rounded border border-white/10">
                <h2 className="text-sm font-mono uppercase tracking-wide text-primary font-bold mb-3">
                  PEAK PRODUCTIVITY HOURS
                </h2>
                <div className="space-y-2">
                  {analytics.peakHours.slice(0, 3).map((hour) => {
                    const data = analytics.productivityByHour.find(p => p.hour === hour);
                    return (
                      <div key={hour} className="flex items-center justify-between text-sm font-mono">
                        <span className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          {hour}:00 - {hour + 1}:00
                        </span>
                        <span className="text-primary">{Math.round(data?.completionRate || 0)}% completion</span>
                      </div>
                    );
                  })}
                  {analytics.peakHours.length === 0 && (
                    <div className="text-sm font-mono text-muted-foreground">
                      Not enough data yet
                    </div>
                  )}
                </div>
              </div>
            )}

            {analytics?.skipReasons && Object.keys(analytics.skipReasons).length > 0 && (
              <div className="bg-black/40 p-4 rounded border border-white/10">
                <h2 className="text-sm font-mono uppercase tracking-wide text-primary font-bold mb-3">
                  SKIP REASONS
                </h2>
                <div className="space-y-2">
                  {Object.entries(analytics.skipReasons)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-sm font-mono">
                        <span className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          {reason.replace(/_/g, " ").toUpperCase()}
                        </span>
                        <span className="text-muted-foreground">{count}x</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {analytics?.upcomingDeadlines && analytics.upcomingDeadlines.length > 0 && (
            <div className="bg-black/40 p-4 rounded border border-orange-500/30">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-orange-500" />
                <h2 className="text-sm font-mono uppercase tracking-wide text-orange-500 font-bold">
                  UPCOMING DEADLINES
                </h2>
              </div>
              <div className="space-y-2">
                {analytics.upcomingDeadlines.slice(0, 5).map((deadline) => (
                  <div key={deadline.id} className="flex items-center justify-between text-sm font-mono" data-testid={`deadline-${deadline.id}`}>
                    <span className="flex items-center gap-2">
                      {deadline.daysRemaining <= 3 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      {deadline.title}
                    </span>
                    <span className={`${deadline.daysRemaining <= 3 ? "text-red-500" : "text-muted-foreground"}`}>
                      {deadline.daysRemaining} days
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.totalBlocks === 0 && (
            <div className="bg-black/40 p-8 rounded border border-white/10 text-center">
              <div className="text-muted-foreground font-mono space-y-2">
                <p className="text-lg">NO DATA YET</p>
                <p className="text-sm">Complete some scheduled activities to see your analytics here.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
