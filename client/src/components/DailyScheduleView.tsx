import { useState, useEffect } from "react";
import { useTodaySchedule, useUserPreferences } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, Loader2, CalendarPlus } from "lucide-react";
import { FeedbackDialog } from "./FeedbackDialog";
import { toast } from "sonner";
import { useLocation } from "wouter";

const TYPE_COLORS: Record<string, string> = {
  class: "bg-blue-500/20 border-blue-500/50 text-blue-200",
  exam: "bg-red-500/20 border-red-500/50 text-red-200",
  assignment: "bg-orange-500/20 border-orange-500/50 text-orange-200",
  personal: "bg-gray-500/20 border-gray-500/50 text-gray-200",
  study: "bg-green-500/20 border-green-500/50 text-green-200",
  mission: "bg-primary/20 border-primary/50 text-primary",
  break: "bg-yellow-500/20 border-yellow-500/50 text-yellow-200",
  reflection: "bg-purple-500/20 border-purple-500/50 text-purple-200",
};

export function DailyScheduleView() {
  const { data: schedule, isLoading, error } = useTodaySchedule();
  const { data: preferences } = useUserPreferences();
  const [, navigate] = useLocation();
  const [groupBy, setGroupBy] = useState<"chronological" | "role" | "timeOfDay" | "time">("chronological");
  const [numColumns, setNumColumns] = useState("4");
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleFeedbackToggle = () => {
    if (!feedbackMode) {
      // Entering feedback mode - trigger animation
      setFeedbackMode(true);
      const timeBlocks = schedule?.timeBlocks || [];
      timeBlocks.forEach((_, idx) => {
        setTimeout(() => {
          setAnimatingIndices((prev) => new Set([...Array.from(prev), idx]));
        }, idx * 100); // 100ms stagger between cards
      });
      // Clear animations after they complete
      setTimeout(() => setAnimatingIndices(new Set()), timeBlocks.length * 100 + 800);
    } else {
      setFeedbackMode(false);
    }
  };

  const handleCreateSchedule = () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Get evening prompt time from preferences (default 18:00)
    const eveningPromptTime = (preferences as any)?.eveningPromptTime || "18:00";
    const [eveningHour] = eveningPromptTime.split(":").map(Number);
    
    // If after evening prompt time, navigate to schedule builder with tomorrow's date
    if (hour >= eveningHour) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];
      navigate(`/schedule-builder?date=${tomorrowDate}`);
    } else {
      navigate("/schedule-builder");
    }
  };

  // Responsive minWidth based on screen size
  const getMinWidth = () => {
    if (windowWidth < 640) return "120px";
    if (windowWidth < 1024) return "140px";
    return "180px";
  };

  if (isLoading) {
    return (
      <Card className="border-white/10 bg-black/50">
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const getSchedulePrompt = () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Get evening prompt time from preferences (default 18:00)
    const eveningPromptTime = (preferences as any)?.eveningPromptTime || "18:00";
    const [eveningHour] = eveningPromptTime.split(":").map(Number);
    
    if (hour >= eveningHour) {
      return {
        title: "Plan Tomorrow",
        message: "Set yourself up for success by creating tomorrow's schedule before bed.",
        buttonText: "CREATE TOMORROW'S SCHEDULE",
      };
    } else if (hour < 12) {
      return {
        title: "Plan Your Day",
        message: "Start your day with intention. Create a schedule to stay focused and productive.",
        buttonText: "CREATE TODAY'S SCHEDULE",
      };
    } else {
      return {
        title: "No Schedule Yet",
        message: "Create a schedule to organize your remaining time today.",
        buttonText: "CREATE SCHEDULE",
      };
    }
  };

  if (error || !schedule || !schedule.timeBlocks || schedule.timeBlocks.length === 0) {
    const prompt = getSchedulePrompt();
    return (
      <Card className="border-white/10 bg-black/50 border-primary/30">
        <CardContent className="pt-6 py-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <CalendarPlus className="w-10 h-10 text-primary/60" />
            <div>
              <h3 className="text-sm font-mono uppercase text-primary font-bold tracking-wide">
                {prompt.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {prompt.message}
              </p>
            </div>
            <Button
              onClick={handleCreateSchedule}
              className="bg-primary text-black hover:bg-primary/80 font-mono text-xs uppercase tracking-wider"
              data-testid="button-create-schedule-prompt"
            >
              {prompt.buttonText}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const timeBlocks = schedule.timeBlocks;
  
  // Helper: Convert time to minutes
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Helper: Get time of day period
  const getTimeOfDayPeriod = (time: string) => {
    const minutes = timeToMinutes(time);
    if (minutes < 360) return "night"; // 0-6
    if (minutes < 720) return "morning"; // 6-12
    if (minutes < 1080) return "afternoon"; // 12-18
    return "evening"; // 18-24
  };

  // Helper: Check if block is currently active
  const isBlockActive = (startTime: string, endTime: string) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  };

  // Organize blocks based on grouping mode
  let organizedData: Record<string, typeof timeBlocks> = {};
  let columnLabels: string[] = [];

  if (groupBy === "role") {
    // Group by type/role
    organizedData = timeBlocks.reduce((acc, block) => {
      const type = block.type || 'study';
      if (!acc[type]) acc[type] = [];
      acc[type].push(block);
      return acc;
    }, {} as Record<string, typeof timeBlocks>);
    columnLabels = Object.keys(organizedData).sort();
  } else if (groupBy === "timeOfDay") {
    // Group by time of day
    const sortedBlocks = [...timeBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    organizedData = sortedBlocks.reduce((acc, block) => {
      const period = getTimeOfDayPeriod(block.startTime);
      if (!acc[period]) acc[period] = [];
      acc[period].push(block);
      return acc;
    }, {} as Record<string, typeof timeBlocks>);
    columnLabels = ["morning", "afternoon", "evening", "night"].filter(k => organizedData[k]);
  } else if (groupBy === "time") {
    // Distribute chronologically into equal columns
    const cols = parseInt(numColumns);
    const sortedBlocks = [...timeBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    columnLabels = Array.from({ length: cols }, (_, i) => `col-${i + 1}`);
    organizedData = Object.fromEntries(columnLabels.map(k => [k, []]));
    sortedBlocks.forEach((block, idx) => {
      const colIdx = idx % cols;
      organizedData[columnLabels[colIdx]].push(block);
    });
  } else {
    // Default: chronological list in 4 columns
    const cols = 4;
    const sortedBlocks = [...timeBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    columnLabels = Array.from({ length: cols }, (_, i) => `col-${i + 1}`);
    organizedData = Object.fromEntries(columnLabels.map(k => [k, []]));
    sortedBlocks.forEach((block, idx) => {
      const colIdx = idx % cols;
      organizedData[columnLabels[colIdx]].push(block);
    });
  }

  return (
    <Card className="border-white/10 bg-black/50">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          TODAY'S SCHEDULE
        </CardTitle>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CardDescription className="text-xs">
              Generated by {schedule.source === "ai_generated" ? "AI" : "User"} • Last updated: {schedule.generatedAt}
            </CardDescription>
            {schedule.source === "ai_generated" && (
              <Button
                onClick={async () => {
                  try {
                    // Save current schedule as a template in localStorage
                    const today = new Date().toISOString().split("T")[0];
                    
                    // Save the schedule blocks to localStorage for the schedule builder to pick up
                    if (schedule?.timeBlocks) {
                      localStorage.setItem("scheduleTemplate", JSON.stringify(schedule.timeBlocks));
                      localStorage.setItem("scheduleTemplateDate", today);
                    }

                    // Navigate to Schedule Builder which will load the template
                    navigate("/schedule-builder");
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to load schedule",
                      variant: "destructive",
                    });
                  }
                }}
                size="sm"
                className="text-[10px] font-mono uppercase h-7 px-2 bg-transparent border border-primary/50 text-primary hover:bg-primary hover:text-black transition-all"
                data-testid="button-edit-auto-schedule"
              >
                EDIT SCHEDULE
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleFeedbackToggle}
              size="sm"
              className={`text-[10px] font-mono uppercase h-7 px-2 transition-all ${
                feedbackMode
                  ? "bg-primary text-black border-primary"
                  : "bg-transparent border border-white/20 text-foreground hover:border-primary"
              }`}
              data-testid="button-feedback-toggle"
            >
              FEEDBACK
            </Button>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="w-40 h-7 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chronological">Chronological (4 cols)</SelectItem>
                <SelectItem value="role">Group by Role</SelectItem>
                <SelectItem value="timeOfDay">Group by Time of Day</SelectItem>
                <SelectItem value="time">Group by Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {groupBy === "time" && (
          <div className="flex gap-4 items-center mt-4">
            <Select value={numColumns} onValueChange={setNumColumns}>
              <SelectTrigger className="w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
                <SelectItem value="4">4 Columns</SelectItem>
                <SelectItem value="5">5 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid gap-4 min-w-max md:min-w-0" style={{ gridTemplateColumns: `repeat(${columnLabels.length}, minmax(${getMinWidth()}, 1fr))` }}>
          {columnLabels.map((label) => {
            const blocks = organizedData[label];
            let headerText = label;
            let headerColor = "bg-primary/20 border-primary/50 text-primary";

            if (groupBy === "role") {
              headerText = label;
              headerColor = TYPE_COLORS[label] || TYPE_COLORS.study;
            } else if (groupBy === "timeOfDay") {
              headerText = label.charAt(0).toUpperCase() + label.slice(1);
              const periodColors: Record<string, string> = {
                morning: "bg-blue-500/20 border-blue-500/50 text-blue-200",
                afternoon: "bg-yellow-500/20 border-yellow-500/50 text-yellow-200",
                evening: "bg-orange-500/20 border-orange-500/50 text-orange-200",
                night: "bg-purple-500/20 border-purple-500/50 text-purple-200",
              };
              headerColor = periodColors[label] || "bg-primary/20 border-primary/50 text-primary";
            }

            return (
              <div key={label} className="space-y-2">
                {blocks.map((block, idx) => {
                    const colorClass = TYPE_COLORS[block.type] || TYPE_COLORS.study;
                    const globalBlockIndex = Object.keys(organizedData).slice(0, Object.keys(organizedData).indexOf(label)).reduce((sum, key) => sum + organizedData[key].length, 0) + idx;
                    const isAnimating = animatingIndices.has(globalBlockIndex);
                    const isActive = isBlockActive(block.startTime, block.endTime);
                    
                    return (
                      <div
                        key={`${label}-${idx}`}
                        data-testid={`timeblock-${label}-${idx}`}
                        onClick={() => {
                          if (feedbackMode) {
                            setSelectedBlock(block);
                            setFeedbackDialogOpen(true);
                          }
                        }}
                        className={`p-2 md:p-3 rounded border-l-4 text-xs md:text-sm ${colorClass} ${
                          isActive ? "shadow-[0_0_12px_2px_rgba(255,255,255,0.4)]" : ""
                        } ${
                          feedbackMode ? "cursor-pointer hover:shadow-[0_0_12px_1px_rgba(190,242,100,0.6)] transition-all duration-200" : ""
                        } ${isAnimating ? "animate-border-flash" : ""}`}
                      >
                        <p className="font-mono font-semibold line-clamp-2">{block.title}</p>
                        <p className="opacity-80 mt-0.5 text-[10px] md:text-xs">
                          {block.startTime} - {block.endTime}
                        </p>
                        {block.description && (
                          <p className="opacity-70 mt-1 text-[9px] md:text-xs line-clamp-2">{block.description}</p>
                        )}
                      </div>
                    );
                })}
              </div>
            );
          })}
        </div>

        {schedule.aiReasoning && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-widest">AI Reasoning</p>
            <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {schedule.aiReasoning}
            </p>
          </div>
        )}
      </CardContent>

      {selectedBlock && (
        <FeedbackDialog
          open={feedbackDialogOpen}
          onOpenChange={setFeedbackDialogOpen}
          block={selectedBlock}
          scheduleDate={new Date().toISOString().split("T")[0]}
        />
      )}
    </Card>
  );
}
