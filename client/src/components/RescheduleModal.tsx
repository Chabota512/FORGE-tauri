import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Bot, Edit, Check, Loader2, ChevronRight } from "lucide-react";
import { useAIReschedule, useResolveDriftEvent, useTodaySchedule, useUpdateDraftSchedule } from "@/lib/api";
import type { ScheduleDriftEvent, TimeBlock } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/**
 * RescheduleModal - Intelligent drift handling interface
 * 
 * Testing Flow:
 * 1. Complete an activity and mark actual time spent (e.g., planned 20m, actual 35m = +15m drift)
 * 2. Submit feedback via FeedbackDialog
 * 3. If drift > 10 minutes, this modal should auto-appear after ~1 second
 * 4. User can choose:
 *    - "LET AI HANDLE IT" → Shows preview of AI-rearranged remaining tasks
 *    - "FIX IT MYSELF" → Navigates to /schedule-builder for manual editing
 *    - "DISMISS FOR NOW" → Closes modal without resolving
 * 5. In AI preview, user can:
 *    - Review adjusted blocks (marked with ADJUSTED badge)
 *    - See original vs new times
 *    - See duration reductions if needed
 *    - "APPLY CHANGES" → Updates draft schedule and marks drift as resolved
 */
interface RescheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driftEvent: ScheduleDriftEvent;
  onManualEdit?: () => void;
}

export function RescheduleModal({
  open,
  onOpenChange,
  driftEvent,
  onManualEdit,
}: RescheduleModalProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"choice" | "preview" | "success">("choice");
  const [aiSuggestion, setAiSuggestion] = useState<TimeBlock[] | null>(null);
  
  const { data: schedule } = useTodaySchedule();
  const aiReschedule = useAIReschedule();
  const resolveDrift = useResolveDriftEvent();
  const updateDraft = useUpdateDraftSchedule();

  const formatDrift = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const getRemainingBlocks = (): TimeBlock[] => {
    if (!schedule?.timeBlocks) return [];
    
    const currentTime = getCurrentTime();
    const timeToMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTime);
    
    return schedule.timeBlocks.filter(block => 
      timeToMinutes(block.startTime) >= currentMinutes
    );
  };

  const handleAIReschedule = async () => {
    const remainingBlocks = getRemainingBlocks();
    
    if (remainingBlocks.length === 0) {
      toast({
        title: "No remaining blocks",
        description: "There are no more activities to reschedule today.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await aiReschedule.mutateAsync({
        id: driftEvent.id,
        scheduleDate: driftEvent.scheduleDate,
        currentTime: getCurrentTime(),
        remainingBlocks,
      });

      setAiSuggestion(result.rescheduledBlocks);
      setView("preview");
    } catch (error) {
      toast({
        title: "AI reschedule failed",
        description: "Could not generate a new schedule. Try manual adjustments.",
        variant: "destructive",
      });
    }
  };

  const handleApplyAI = async () => {
    if (!aiSuggestion || !schedule) return;

    try {
      const currentTime = getCurrentTime();
      const timeToMinutes = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };
      const currentMinutes = timeToMinutes(currentTime);
      
      const pastBlocks = schedule.timeBlocks.filter(block => 
        timeToMinutes(block.endTime) < currentMinutes
      );
      
      const newBlocks = [...pastBlocks, ...aiSuggestion];
      
      await updateDraft.mutateAsync({
        date: driftEvent.scheduleDate,
        timeBlocks: newBlocks,
      });

      await resolveDrift.mutateAsync({
        id: driftEvent.id,
        userChoice: "ai",
        newScheduleData: JSON.stringify(newBlocks),
      });

      setView("success");
      toast({
        title: "Schedule updated",
        description: "Your schedule has been adjusted based on AI recommendations.",
      });

      setTimeout(() => {
        onOpenChange(false);
        setView("choice");
        setAiSuggestion(null);
      }, 1500);
    } catch (error) {
      toast({
        title: "Failed to apply changes",
        description: "Could not update the schedule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleManual = async () => {
    try {
      await resolveDrift.mutateAsync({
        id: driftEvent.id,
        userChoice: "manual",
      });

      onOpenChange(false);
      onManualEdit?.();
      
      toast({
        title: "Manual mode",
        description: "You can now adjust your schedule in the timeline editor.",
      });
    } catch (error) {
      toast({
        title: "Failed",
        description: "Could not proceed. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = async () => {
    try {
      await resolveDrift.mutateAsync({
        id: driftEvent.id,
        userChoice: "dismissed",
      });
      onOpenChange(false);
    } catch (error) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] bg-black/95 border border-orange-500/30 fixed z-[200] tracking-wide">
        {view === "choice" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <DialogTitle className="text-xs font-mono uppercase text-orange-400">
                  SCHEDULE DRIFT DETECTED
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-orange-400" />
                  <span className="text-[10px] font-mono uppercase text-orange-400">DRIFT SUMMARY</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                  <div>
                    <p className="text-muted-foreground">Activity</p>
                    <p className="text-foreground truncate">{driftEvent.blockTitle}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Block Time</p>
                    <p className="text-foreground">{driftEvent.blockStartTime}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Planned</p>
                    <p className="text-foreground">{formatDrift(driftEvent.plannedDuration)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Actual</p>
                    <p className="text-orange-400">{formatDrift(driftEvent.actualDuration)}</p>
                  </div>
                </div>

                <div className="border-t border-orange-500/20 pt-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">TOTAL DRIFT</span>
                    <span className="text-sm font-mono font-bold text-orange-400">
                      +{formatDrift(driftEvent.cumulativeDrift)}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {driftEvent.affectedBlocksCount} remaining activities affected
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase text-foreground">
                  HOW WOULD YOU LIKE TO HANDLE THIS?
                </p>

                <Button
                  onClick={handleAIReschedule}
                  disabled={aiReschedule.isPending}
                  className="w-full h-auto py-3 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-left justify-start"
                  variant="ghost"
                  data-testid="button-ai-reschedule"
                >
                  <div className="flex items-start gap-3">
                    <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-mono font-semibold text-primary">LET AI HANDLE IT</p>
                      <p className="text-[9px] text-muted-foreground">
                        AI will adjust remaining tasks to fit your time constraints
                      </p>
                    </div>
                    {aiReschedule.isPending ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin ml-auto" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </div>
                </Button>

                <Button
                  onClick={handleManual}
                  disabled={resolveDrift.isPending}
                  className="w-full h-auto py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-left justify-start"
                  variant="ghost"
                  data-testid="button-manual-edit"
                >
                  <div className="flex items-start gap-3">
                    <Edit className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-mono font-semibold text-foreground">FIX IT MYSELF</p>
                      <p className="text-[9px] text-muted-foreground">
                        Open the timeline editor to manually adjust your schedule
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                </Button>
              </div>

              <Button
                onClick={handleDismiss}
                variant="ghost"
                className="w-full text-[10px] font-mono text-muted-foreground hover:text-foreground"
                data-testid="button-dismiss-drift"
              >
                DISMISS FOR NOW
              </Button>
            </div>
          </>
        )}

        {view === "preview" && aiSuggestion && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <DialogTitle className="text-xs font-mono uppercase text-primary">
                  AI RESCHEDULE PREVIEW
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {aiSuggestion.map((block, idx) => (
                  <div
                    key={`${block.startTime}-${idx}`}
                    className={`p-2 rounded border text-[10px] font-mono ${
                      (block as any).wasRescheduled
                        ? "border-primary/40 bg-primary/10"
                        : "border-white/10 bg-white/5"
                    }`}
                    data-testid={`preview-block-${idx}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium truncate flex-1">{block.title}</span>
                      <span className="text-muted-foreground ml-2">
                        {block.startTime} - {block.endTime}
                      </span>
                    </div>
                    {(block as any).wasRescheduled && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[8px] px-1 py-0.5 rounded bg-primary/20 text-primary">ADJUSTED</span>
                        {(block as any).originalStartTime && (
                          <span className="text-[8px] text-muted-foreground line-through">
                            was {(block as any).originalStartTime}
                          </span>
                        )}
                        {(block as any).durationChange && (block as any).durationChange < 0 && (
                          <span className="text-[8px] text-orange-400">
                            ({(block as any).durationChange}m)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setView("choice")}
                  variant="outline"
                  className="flex-1 text-[10px] font-mono uppercase border-white/20 hover:border-white/40"
                  data-testid="button-back-to-choice"
                >
                  BACK
                </Button>
                <Button
                  onClick={handleApplyAI}
                  disabled={updateDraft.isPending || resolveDrift.isPending}
                  className="flex-1 text-[10px] font-mono uppercase bg-primary hover:bg-primary/80 text-black"
                  data-testid="button-apply-ai"
                >
                  {updateDraft.isPending || resolveDrift.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "APPLY CHANGES"
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {view === "success" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-mono font-semibold text-green-500">SCHEDULE UPDATED</p>
              <p className="text-[10px] text-muted-foreground mt-1">Your day has been reorganized</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
