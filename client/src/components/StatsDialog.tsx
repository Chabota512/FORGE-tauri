import { useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTodaySchedule } from "@/lib/api";
import { calculateTimeDivisions } from "@/lib/timeCalculator";
import { RadialChart, ChartLegend } from "@/components/RadialChart";
import { Loader2 } from "lucide-react";

interface StatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatsDialog({ open, onOpenChange }: StatsDialogProps) {
  const [, navigate] = useLocation();
  const { data: schedule, isLoading } = useTodaySchedule();

  const timeDivisions = useMemo(() => {
    if (!schedule?.timeBlocks) return [];
    return calculateTimeDivisions(schedule.timeBlocks);
  }, [schedule?.timeBlocks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border border-primary/20 max-w-sm max-h-[85vh] overflow-y-auto p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-mono uppercase tracking-widest text-primary">
            TIME ANALYSIS
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                ANALYZING_SCHEDULE...
              </p>
            </div>
          ) : timeDivisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
                NO_SCHEDULE_DATA
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/60">
                Schedule will be generated each day
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 items-start">
                <div className="flex items-center justify-center">
                  <RadialChart divisions={timeDivisions} />
                </div>
                <ChartLegend divisions={timeDivisions} />
              </div>
              <button
                onClick={() => {
                  onOpenChange(false);
                  navigate("/statistics");
                }}
                className="w-full px-2 py-1.5 text-[8px] font-mono uppercase tracking-tight border border-white/20 text-foreground/60 hover:text-primary hover:border-primary transition-colors rounded"
                data-testid="button-compare-past"
              >
                COMPARE PAST DATA
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
