import { useState, useEffect } from "react";
import { useSubmitDailyFeedback, useDailyFeedback } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";

interface EndOfDayFeedbackProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EndOfDayFeedback({ open, onOpenChange }: EndOfDayFeedbackProps) {
  const today = new Date().toISOString().split("T")[0];
  const { data: existingFeedback } = useDailyFeedback(today);
  const submitFeedback = useSubmitDailyFeedback();

  const [completion, setCompletion] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existingFeedback) {
      setCompletion(existingFeedback.completionRating || null);
      setEnergy(existingFeedback.energyLevel || null);
      setNotes(existingFeedback.notes || "");
    }
  }, [existingFeedback]);

  const onSubmit = async () => {
    if (completion === null || energy === null) {
      return;
    }

    try {
      await submitFeedback.mutateAsync({
        feedbackDate: today,
        completionRating: completion,
        energyLevel: energy,
        notes: notes || null,
      });
      // Only show success and close after mutation completes
      setSaved(true);
      setTimeout(() => {
        onOpenChange(false);
        setSaved(false);
        // Reset form after closing
        setCompletion(null);
        setEnergy(null);
        setNotes("");
      }, 1200);
    } catch (error) {
      console.error("Error saving feedback:", error);
      // Don't clear form on error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black/95 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">End of Day Check-In</DialogTitle>
          <DialogDescription>
            How was your day? This helps me learn your patterns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Completion Rating */}
          <div>
            <label className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3 block">
              How much did you accomplish? (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  data-testid={`button-completion-${rating}`}
                  onClick={() => setCompletion(rating)}
                  className={`w-10 h-10 rounded border font-mono text-sm font-semibold transition-all ${
                    completion === rating
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 border-white/20 text-foreground hover:border-primary"
                  }`}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>

          {/* Energy Level */}
          <div>
            <label className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3 block">
              Your energy level (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  data-testid={`button-energy-${rating}`}
                  onClick={() => setEnergy(rating)}
                  className={`w-10 h-10 rounded border font-mono text-sm font-semibold transition-all ${
                    energy === rating
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 border-white/20 text-foreground hover:border-primary"
                  }`}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2 block">
              Optional notes
            </label>
            <Textarea
              placeholder="What went well? What was challenging? Any observations?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-notes"
              className="bg-white/5 border-white/10 text-foreground placeholder:text-muted-foreground resize-none h-20"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-feedback"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitFeedback.isPending || saved}
            data-testid="button-submit-feedback"
            className={`flex-1 transition-all ${
              saved
                ? "bg-green-600 hover:bg-green-600 text-white"
                : "bg-primary text-black hover:bg-primary/80"
            }`}
          >
            {saved ? (
              <div className="flex items-center justify-center gap-2">
                <Check size={16} className="stroke-[3]" />
                SAVED
              </div>
            ) : submitFeedback.isPending ? (
              "Saving..."
            ) : (
              "Save Feedback"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
