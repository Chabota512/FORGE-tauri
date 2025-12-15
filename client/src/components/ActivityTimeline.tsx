import { useState, useEffect, useRef, useMemo } from "react";
import { useTodaySchedule, useUserPreferences } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Clock, BookOpen, Zap, Pause, ChevronDown, ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";

const TYPE_ICONS: Record<string, any> = {
  class: Clock,
  study: BookOpen,
  mission: Zap,
  break: Pause,
  exam: Clock,
  assignment: Clock,
  personal: Clock,
  reflection: Clock,
};

export function ActivityTimeline({ onStatsClick }: { onStatsClick?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [detailIndex, setDetailIndex] = useState<Record<string, number>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const allowButtonScrollRef = useRef(false);
  const today = new Date().toISOString().split("T")[0];
  const { data: schedule, isLoading } = useTodaySchedule();
  const { data: userPreferences } = useUserPreferences();
  const activityNotifications = userPreferences?.activityNotifications !== false; // Default true
  const notificationSound = userPreferences?.notificationSound !== false; // Default true
  const { data: blockFeedback } = useQuery<any[]>({
    queryKey: ["/api/schedule-feedback", today],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule-feedback/${today}`));
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { toast } = useToast();
  const previousActivityRef = useRef<string | null>(null);
  const selectedSound = userPreferences?.selectedSound || 'chime';
  const soundVolume = (userPreferences?.soundVolume || 70) / 100;

  // Calculate current block BEFORE any conditional returns
  const currentBlock = useMemo(() => {
    if (!schedule?.timeBlocks) return null;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const timeToMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTime);
    return schedule.timeBlocks.find(
      (b) =>
        timeToMinutes(b.startTime) <= currentMinutes &&
        timeToMinutes(b.endTime) > currentMinutes
    );
  }, [schedule?.timeBlocks]);

  // Create sound generators
  const createSound = (soundName: string, volume: number) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (soundName) {
      case 'bell':
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.setValueAtTime(900, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        break;
      case 'ping':
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;
      case 'alert':
        osc.frequency.setValueAtTime(1500, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        break;
      case 'subtle':
        osc.frequency.value = 700;
        gain.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        break;
      default: // chime
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    }
  };

  // Detect activity change and trigger notification - MUST be before conditional returns
  useEffect(() => {
    if (currentBlock) {
      const currentActivity = currentBlock.title;

      // Check if activity has changed
      if (previousActivityRef.current !== null && previousActivityRef.current !== currentActivity) {
        // Play notification sound (only if enabled)
        if (notificationSound) {
          try {
            createSound(selectedSound, soundVolume);
          } catch (error) {
            console.log("Could not play notification sound:", error);
          }
        }

        // Show toast notification (only if enabled)
        if (activityNotifications) {
          toast({
            title: "Activity Changed",
            description: (
              <div className="space-y-1">
                <p className="font-semibold">{currentActivity}</p>
                <p className="text-xs text-muted-foreground">
                  {currentBlock.startTime} - {currentBlock.endTime}
                </p>
              </div>
            ),
          });
        }
      }

      previousActivityRef.current = currentActivity;
    }
  }, [currentBlock, toast, activityNotifications, notificationSound, createSound, selectedSound, soundVolume]);

  useEffect(() => {
    if (!isExpanded) {
      hasScrolledRef.current = false;
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && scrollContainerRef.current && !hasScrolledRef.current && schedule?.timeBlocks) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const timeToMinutes = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };
      const currentMinutes = timeToMinutes(currentTime);
      let currentIdx = schedule.timeBlocks.findIndex(
        (b) => timeToMinutes(b.startTime) <= currentMinutes && timeToMinutes(b.endTime) > currentMinutes
      );
      if (currentIdx === -1) {
        currentIdx = schedule.timeBlocks.findIndex((b) => timeToMinutes(b.startTime) > currentMinutes);
      }
      if (currentIdx > 0) {
        const scrollAmount = Math.max(0, (currentIdx - 3.2) * 75);
        scrollContainerRef.current.scrollTop = scrollAmount;
        hasScrolledRef.current = true;
      }
    }
  }, [isExpanded, schedule]);

  useEffect(() => {
    if (!isExpanded || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isExpanded]);

  if (isLoading || !schedule?.timeBlocks) {
    return null;
  }

  // Get current time
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Find current and nearby activities
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  const blocks = schedule.timeBlocks;
  const currentMinutes = timeToMinutes(currentTime);

  // Categorize events - show ALL blocks with state
  let currentIdx = blocks.findIndex(
    (b) =>
      timeToMinutes(b.startTime) <= currentMinutes &&
      timeToMinutes(b.endTime) > currentMinutes
  );

  if (currentIdx === -1) {
    currentIdx = blocks.findIndex((b) => timeToMinutes(b.startTime) > currentMinutes);
  }

  const organizedEvents = blocks.map((b, idx) => {
    const feedback = blockFeedback?.find(f => f.blockStartTime === b.startTime);
    const drift = feedback?.actualTimeSpent
      ? feedback.actualTimeSpent - calculateBlockDuration(b)
      : 0;

    if (idx < currentIdx) {
      return { ...b, state: "completed", hasFeedback: !!feedback, drift };
    } else if (idx === currentIdx) {
      return { ...b, state: "current", hasFeedback: !!feedback, drift };
    } else {
      return { ...b, state: "scheduled", hasFeedback: !!feedback, drift };
    }
  });

  function calculateBlockDuration(block: any) {
    const [startH, startM] = block.startTime.split(":").map(Number);
    const [endH, endM] = block.endTime.split(":").map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  }

  if (organizedEvents.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-primary/20 bg-gradient-to-r from-primary/5 via-black/30 to-black/30">
      <style>{`
        @keyframes pulse-dot {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.6;
          }
        }
        .animate-pulse-dot {
          animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-text {
          0%, 100% {
            opacity: 1;
            text-shadow: 0 0 0px rgba(190, 242, 100, 0);
          }
          50% {
            opacity: 0.8;
            text-shadow: 0 0 8px rgba(190, 242, 100, 0.5);
          }
        }
        .animate-pulse-text {
          animation: pulse-text 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .timeline-container::before {
          content: '';
          position: absolute;
          left: -0.5rem;
          top: 0;
          bottom: 0;
          width: 2px;
          background-color: rgba(255, 255, 255, 0.5);
          z-index: 1;
        }
      `}</style>
      <div className="w-full px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center gap-2 hover:opacity-80 transition-opacity"
          data-testid="button-toggle-timeline"
        >
          <div className="w-0.5 h-3 bg-primary" />
          <div className="text-[10px] font-mono uppercase tracking-[0.15em]">
            <span className="text-primary">NOW:</span>
            {(() => {
              const currentEvent = organizedEvents.find(e => e.state === "current");
              return currentEvent ? (
                <span className="text-white" style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.8), 0 0 16px rgba(255, 255, 255, 0.4)' }}>
                  {" " + currentEvent.title}
                </span>
              ) : (
                <span className="text-muted-foreground"> STANDBY</span>
              );
            })()}
          </div>
        </button>
        <button
          onClick={() => onStatsClick?.()}
          className="mr-2 px-1.5 py-0.5 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary transition-all rounded"
          data-testid="button-stats"
        >
          STATS
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hover:opacity-80 transition-opacity"
          data-testid="button-chevron"
        >
          <ChevronDown
            size={14}
            className={`text-primary transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="px-4 py-3 relative z-10 space-y-3 ml-4 max-h-56.5 overflow-y-auto hide-scrollbar timeline-container"
          >
            {organizedEvents.map((event, idx) => {
            const Icon = TYPE_ICONS[event.type] || Clock;
            let dotColor = "bg-slate-700";
            let textColor = "text-muted-foreground";
            let opacity = "opacity-60";

            if (event.state === "completed") {
              dotColor = "bg-slate-700";
              textColor = "text-muted-foreground";
              opacity = "opacity-60";
            } else if (event.state === "current") {
              dotColor = "bg-primary";
              textColor = "text-primary";
              opacity = "opacity-100";
            } else if (event.state === "scheduled") {
              dotColor = "bg-white/40";
              textColor = "text-foreground";
              opacity = "opacity-80";
            }

            const eventKey = `${event.startTime}-${event.title}`;
            const isSelected = selectedEvent === eventKey;
            const currentDetailIdx = detailIndex[eventKey] || 0;

            const details = [
              { label: "Description", value: event.description },
              { label: "Reason", value: event.reason },
              { label: "Goal/Outcome", value: event.goal },
              { label: "Resources", value: event.resourcesNeeded },
              { label: "Location", value: event.location },
              { label: "Difficulty Level", value: event.difficultyLevel ? `${event.difficultyLevel}/5` : null },
              { label: "Energy Required", value: event.energyRequired },
              { label: "Collaborators", value: event.collaborators },
              { label: "Dependencies", value: event.dependencies },
              { label: "Buffer Time", value: event.bufferTimeAfter ? `${event.bufferTimeAfter} min` : null },
              { label: "Reminder", value: event.reminderNotification ? `${event.reminderNotification} min before` : null },
              { label: "Success Metrics", value: event.successMetrics },
            ].filter(d => d.value);

            const currentDetail = details[currentDetailIdx];

            return (
              <PopoverPrimitive.Root key={eventKey} open={isSelected} onOpenChange={(open) => {
                setSelectedEvent(open ? eventKey : null);
                if (!open) {
                  setDetailIndex({ ...detailIndex, [eventKey]: 0 });
                }
              }}>
                <PopoverPrimitive.Trigger asChild>
                  <div className={`relative ${opacity} cursor-pointer hover:opacity-100 transition-opacity`} data-testid={`timeline-item-${eventKey}`}>
                    <div className={`absolute -left-1 top-1.5 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-background flex items-center justify-center z-20 ${event.state === "current" ? "animate-pulse-dot" : ""}`} style={{transform: 'translateX(-50%)'}} />

                    <div className="space-y-0.5 pl-4">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-mono font-semibold uppercase tracking-widest ${textColor} ${event.state === "current" ? "animate-pulse-text" : ""}`}>
                            {event.title}
                          </p>
                          {(event as any).hasFeedback && (event as any).drift > 10 && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/40 rounded">
                              <AlertCircle className="w-2.5 h-2.5 text-orange-400" />
                              <span className="text-[8px] font-mono text-orange-400">+{(event as any).drift}m</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {event.startTime} – {event.endTime}
                          {(event as any).hasFeedback && (event as any).drift > 0 && (
                            <span className="text-orange-400 ml-2">(actual: +{(event as any).drift}m)</span>
                          )}
                        </p>
                        {event.description && (
                          <p className="text-[10px] text-muted-foreground/70 line-clamp-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                  </div>
                </PopoverPrimitive.Trigger>

                <PopoverPrimitive.Portal>
                  <PopoverPrimitive.Content className="z-50 w-80 rounded-lg border border-white/10 bg-black/95 p-4 shadow-lg backdrop-blur-md" sideOffset={8} side="bottom" align="start">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                            {event.title}
                          </h3>
                          <p className="text-[10px] font-mono text-muted-foreground mt-1">
                            {event.startTime} – {event.endTime}
                          </p>
                        </div>
                        <PopoverPrimitive.Close asChild>
                          <button className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-popover">
                            <X size={16} />
                          </button>
                        </PopoverPrimitive.Close>
                      </div>

                      {/* Details Navigation */}
                      {currentDetail && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">{currentDetail.label}</p>
                            {details.length > 1 && (
                              <div className="flex items-center gap-2">
                                <p className="text-[9px] font-mono text-muted-foreground">
                                  {currentDetailIdx + 1}/{details.length}
                                </p>
                                <button
                                  onClick={() => setDetailIndex({ ...detailIndex, [eventKey]: Math.max(0, currentDetailIdx - 1) })}
                                  disabled={currentDetailIdx === 0}
                                  className="px-1.5 py-0.5 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded"
                                  data-testid="button-previous-detail"
                                >
                                  PREVIOUS
                                </button>
                                <button
                                  onClick={() => setDetailIndex({ ...detailIndex, [eventKey]: Math.min(details.length - 1, currentDetailIdx + 1) })}
                                  disabled={currentDetailIdx === details.length - 1}
                                  className="px-1.5 py-0.5 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded"
                                  data-testid="button-next-detail"
                                >
                                  NEXT
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-foreground/80 text-[11px]">{currentDetail.value}</p>
                        </div>
                      )}
                    </div>
                  </PopoverPrimitive.Content>
                </PopoverPrimitive.Portal>
              </PopoverPrimitive.Root>
            );
          })}
          </div>
          <div className="absolute bottom-3 right-4 flex gap-2 z-50 pointer-events-auto">
            <button
              className="px-2 py-1 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 transition-all rounded"
              data-testid="button-scroll-up"
              onClick={() => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollBy({ top: -80, behavior: 'smooth' });
                }
              }}
            >
              <ChevronDown size={14} className="rotate-180" />
            </button>
            <button
              className="px-2 py-1 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 transition-all rounded"
              data-testid="button-scroll-down"
              onClick={() => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollBy({ top: 80, behavior: 'smooth' });
                }
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}