import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSubmitBlockFeedback, useCheckDrift, useRecordChapter } from "@/lib/api";
import { Check, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/queryClient";

interface TimeBlock {
  title: string;
  startTime: string;
  endTime: string;
  type?: string;
  description?: string;
  reason?: string;
  goal?: string;
  resourcesNeeded?: string;
  location?: string;
  difficultyLevel?: string;
  energyRequired?: string;
  collaborators?: string;
  dependencies?: string;
  bufferTimeAfter?: string;
  reminderNotification?: string;
  successMetrics?: string;
  date?: string; // Assuming date is available in TimeBlock for submitFeedback
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: TimeBlock;
  scheduleDate?: string;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  block,
  scheduleDate,
}: FeedbackDialogProps) {
  const submitFeedback = useSubmitBlockFeedback();
  const checkDrift = useCheckDrift();
  const recordChapter = useRecordChapter();
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const feedbackDate = scheduleDate || today;

  const calculatePlannedDuration = () => {
    const [startH, startM] = block.startTime.split(":").map(Number);
    const [endH, endM] = block.endTime.split(":").map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  };

  const [view, setView] = useState<"details" | "feedback">("details");
  const [detailIndex, setDetailIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [skipReason, setSkipReason] = useState<
    "conflicts" | "fatigue" | "priority_change" | "interruption" | "other" | null
  >(null);
  const [customSkipReason, setCustomSkipReason] = useState("");
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [actualTimeSpent, setActualTimeSpent] = useState<string>("");
  const [topicsCovered, setTopicsCovered] = useState("");
  const [comments, setComments] = useState("");
  const [bookChapterCompleted, setBookChapterCompleted] = useState("");

  // Fetch books to check if this activity is a reading activity
  const { data: books = [] } = useQuery({
    queryKey: ["/api/books"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/books"));
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
  });

  // Check if this is a reading activity by matching book title in activity title
  const isReadingActivity = books.some((book: any) =>
    block.title.toLowerCase().includes(book.title.toLowerCase()) &&
    book.status === "reading" &&
    book.totalChapters && book.totalChapters > 0
  );

  const relatedBook = books.find((book: any) =>
    block.title.toLowerCase().includes(book.title.toLowerCase()) &&
    book.status === "reading"
  );


  const [showError, setShowError] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset form and view when dialog opens with a new block
  useEffect(() => {
    if (open) {
      setView("details");
      setDetailIndex(0);
      setCompleted(false);
      setSkipped(false);
      setSkipReason(null);
      setCustomSkipReason("");
      setEnergyLevel(null);
      setAccuracy(null);
      setDifficulty(null);
      setActualTimeSpent("");
      setTopicsCovered("");
      setComments("");
      setBookChapterCompleted(""); // Reset book chapter
      setShowError(false);
      setSaved(false);
    }
  }, [open, block.startTime]);

  const checkValid = () => {
    if (!completed && !skipped) return false;
    if (energyLevel === null) return false;
    if (completed && !accuracy) return false;
    if (completed && difficulty === null) return false;
    if (skipped && !skipReason) return false;
    if (skipped && skipReason === "other" && !customSkipReason.trim()) return false;
    return true;
  };

  const isValid = checkValid();

  const save = async () => {
    if (!isValid) {
      setShowError(true);
      setTimeout(() => setShowError(false), 3000);
      return;
    }

    try {
      const actualMinutes = actualTimeSpent ? parseInt(actualTimeSpent) : undefined;

      await submitFeedback.mutateAsync({
        scheduleDate: feedbackDate,
        blockStartTime: block.startTime,
        completed,
        skipped,
        skipReason: skipReason || undefined,
        customSkipReason: customSkipReason || undefined,
        energyLevel: energyLevel || undefined,
        accuracy: accuracy || undefined,
        difficulty: difficulty || undefined,
        actualTimeSpent: actualMinutes,
        topicsCovered: topicsCovered || undefined,
        comments: comments || undefined,
      });

      // Update book chapter if this is a reading activity and chapter was completed
      if (completed && isReadingActivity && relatedBook && bookChapterCompleted) {
        const chapterNum = parseInt(bookChapterCompleted);
        if (!isNaN(chapterNum) && chapterNum > 0) {
          await recordChapter.mutateAsync({
            bookId: relatedBook.id,
            chapterNumber: chapterNum,
          });
        }
      }

      if (completed && actualMinutes) {
        const plannedDuration = calculatePlannedDuration();
        try {
          const driftResult = await checkDrift.mutateAsync({
            scheduleDate: feedbackDate,
            blockStartTime: block.startTime,
            blockTitle: block.title,
            plannedDuration,
            actualDuration: actualMinutes,
          });

          // If significant drift detected, the DriftContext will auto-show the reschedule modal
          if (driftResult.drift && driftResult.requiresReschedule) {
            console.log("Drift detected:", driftResult);
          }
        } catch (driftError) {
          console.error("Error checking drift:", driftError);
          // Don't block feedback submission if drift check fails
        }
      }

      setSaved(true);
      setTimeout(() => {
        onOpenChange(false);
        setView("details");
        setCompleted(false);
        setSkipped(false);
        setSkipReason(null);
        setCustomSkipReason("");
        setEnergyLevel(null);
        setAccuracy(null);
        setDifficulty(null);
        setActualTimeSpent("");
        setTopicsCovered("");
        setComments("");
        setBookChapterCompleted(""); // Reset book chapter
        setSaved(false);
      }, 1200);
    } catch (error) {
      console.error("Error saving feedback:", error);
    }
  };

  const handleSubmit = async () => {
    if (!completed && !skipped) {
      toast({
        title: "Please select an option",
        description: "Mark the block as completed or skipped",
        variant: "destructive",
      });
      return;
    }

    if (skipped && !skipReason) {
      toast({
        title: "Please select a reason",
        description: "Choose why you skipped this activity",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update book chapter if this is a reading activity and chapter was completed
      if (completed && isReadingActivity && relatedBook && bookChapterCompleted) {
        const chapterNum = parseInt(bookChapterCompleted);
        if (!isNaN(chapterNum) && chapterNum > 0) {
          await recordChapter.mutateAsync({
            bookId: relatedBook.id,
            chapterNumber: chapterNum,
          });
        }
      }

      // Wait for mutation to complete before showing success
      await submitFeedback.mutateAsync({
        scheduleDate: scheduleDate || feedbackDate,
        blockStartTime: block.startTime,
        completed,
        skipped,
        skipReason: skipped ? (skipReason || undefined) : undefined,
        customSkipReason: skipReason === "other" ? customSkipReason : undefined,
        energyLevel: energyLevel || undefined,
        accuracy: accuracy || undefined,
        difficulty: difficulty || undefined,
        topicsCovered: topicsCovered || undefined,
        comments: comments || undefined,
      });

      // Only show success toast after successful save
      toast({
        title: "Feedback Saved",
        description: "Your feedback helps improve future schedules",
      });

      // Close dialog and reset form only after success
      onOpenChange(false);
      setCompleted(false);
      setSkipped(false);
      setSkipReason(null);
      setCustomSkipReason("");
      setEnergyLevel(null);
      setAccuracy(null);
      setDifficulty(null);
      setTopicsCovered("");
      setComments("");
      setBookChapterCompleted(""); // Reset book chapter
    } catch (error) {
      // Don't close or clear form on error
      toast({
        title: "Failed to save feedback",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-96 bg-black/95 border border-white/10 fixed z-[200] tracking-wide">
        {view === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xs font-mono uppercase text-primary">
                ACTIVITY DETAILS
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Details with Pagination */}
              {(() => {
                const details = [
                  { label: "Time", value: `${block.startTime} - ${block.endTime}` },
                  ...(block.type ? [{ label: "Type", value: block.type }] : []),
                  { label: "Title", value: block.title },
                  { label: "Description", value: block.description },
                  { label: "Reason", value: block.reason },
                  { label: "Goal/Outcome", value: block.goal },
                  { label: "Resources", value: block.resourcesNeeded },
                  { label: "Location", value: block.location },
                  { label: "Difficulty Level", value: block.difficultyLevel ? `${block.difficultyLevel}/5` : null },
                  { label: "Energy Required", value: block.energyRequired },
                  { label: "Collaborators", value: block.collaborators },
                  { label: "Dependencies", value: block.dependencies },
                  { label: "Buffer Time", value: block.bufferTimeAfter ? `${block.bufferTimeAfter} min` : null },
                  { label: "Reminder", value: block.reminderNotification ? `${block.reminderNotification} min before` : null },
                  { label: "Success Metrics", value: block.successMetrics },
                ].filter(d => d.value);

                if (details.length === 0) return null;

                const itemsPerPage = 4;
                const visibleDetails = details.slice(detailIndex, detailIndex + itemsPerPage);
                const totalPages = Math.ceil(details.length / itemsPerPage);

                return (
                  <div className="space-y-3 border-t border-white/10 pt-3">
                    <div className="space-y-2">
                      {visibleDetails.map((detail, idx) => (
                        <div key={idx} className="space-y-0.5">
                          <p className="text-[9px] font-mono uppercase text-muted-foreground">{detail.label}</p>
                          <p className="text-[10px] font-mono text-foreground leading-relaxed break-words">{detail.value}</p>
                        </div>
                      ))}
                    </div>
                    {details.length > itemsPerPage && (
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <p className="text-[9px] font-mono text-muted-foreground">
                          {detailIndex + 1}-{Math.min(detailIndex + itemsPerPage, details.length)}/{details.length}
                        </p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setDetailIndex(Math.max(0, detailIndex - itemsPerPage))}
                            disabled={detailIndex === 0}
                            className="px-1.5 py-0.5 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded"
                            data-testid="button-previous-activity-detail"
                          >
                            PREV
                          </button>
                          <button
                            onClick={() => setDetailIndex(Math.min((totalPages - 1) * itemsPerPage, detailIndex + itemsPerPage))}
                            disabled={detailIndex + itemsPerPage >= details.length}
                            className="px-1.5 py-0.5 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded"
                            data-testid="button-next-activity-detail"
                          >
                            NEXT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Button to go to feedback */}
              <Button
                onClick={() => setView("feedback")}
                className="w-full text-[10px] font-mono uppercase bg-primary hover:bg-primary/80 text-black transition-all flex items-center justify-center gap-2"
                data-testid="button-go-to-feedback"
              >
                PROVIDE FEEDBACK
                <ChevronRight size={12} />
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xs font-mono uppercase text-primary">
                {block.startTime}
              </DialogTitle>
              <p className="text-[10px] text-foreground mt-1">{block.title}</p>
              <button
                onClick={() => setView("details")}
                className="text-[9px] font-mono text-foreground hover:text-primary transition-colors mt-2 text-left"
                data-testid="button-back-to-details"
              >
                ← BACK TO DETAILS
              </button>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase text-foreground mb-2">DID YOU COMPLETE THIS ACTIVITY?</p>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="completed"
                    checked={completed}
                    onChange={(e) => {
                      setCompleted(e.target.checked);
                      if (e.target.checked) setSkipped(false);
                    }}
                    className="w-4 h-4 accent-primary"
                    data-testid="feedback-checkbox-completed"
                  />
                  <label htmlFor="completed" className="text-xs font-mono uppercase cursor-pointer">
                    FINISHED
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="skipped"
                    checked={skipped}
                    onChange={(e) => {
                      setSkipped(e.target.checked);
                      if (e.target.checked) setCompleted(false);
                    }}
                    className="w-4 h-4 accent-primary"
                    data-testid="feedback-checkbox-skipped"
                  />
                  <label htmlFor="skipped" className="text-xs font-mono uppercase cursor-pointer">
                    SKIPPED
                  </label>
                </div>
              </div>

              {/* Skip Reason */}
              {skipped && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                    IF SKIPPED, WHAT HAPPENED?
                  </p>
                  <div className="space-y-1">
                    {(["fatigue", "priority_change", "interruption", "conflicts", "other"] as const).map(
                      (reason) => (
                        <label
                          key={reason}
                          className="flex items-center gap-2 text-[10px] font-mono text-foreground cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="skip-reason"
                            value={reason}
                            checked={skipReason === reason}
                            onChange={() => setSkipReason(reason)}
                            className="w-3 h-3"
                            data-testid={`feedback-skip-reason-${reason}`}
                          />
                          {reason === "fatigue" && "TOO TIRED"}
                          {reason === "priority_change" && "HIGHER PRIORITY CAME UP"}
                          {reason === "interruption" && "GOT INTERRUPTED"}
                          {reason === "conflicts" && "JUST DIDN'T GET TO IT"}
                          {reason === "other" && "SOMETHING ELSE"}
                        </label>
                      )
                    )}
                    {skipReason === "other" && (
                      <input
                        type="text"
                        value={customSkipReason}
                        onChange={(e) => setCustomSkipReason(e.target.value)}
                        placeholder="Tell us what happened..."
                        className="w-full text-[10px] font-mono bg-black/50 border border-white/10 rounded p-1.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary mt-2"
                        data-testid="input-custom-skip-reason"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Energy Level */}
              <div>
                <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                  HOW WAS YOUR ENERGY AFTER COMPLETING THE ACTIVITY?
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((level) => (
                    <button
                      key={level}
                      onClick={() => setEnergyLevel(level)}
                      className={`w-6 h-6 flex items-center justify-center text-[8px] font-mono border rounded transition-all ${
                        energyLevel === level
                          ? "bg-primary border-primary text-black"
                          : "border-white/20 text-foreground hover:border-primary"
                      }`}
                      data-testid={`feedback-energy-${level}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Completed section */}
              {completed && (
                <>
                  {/* Accuracy */}
                  <div>
                    <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                      WAS THE TIME ESTIMATE CLOSE?
                    </p>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }, (_, i) => i + 1).map((level) => (
                        <button
                          key={level}
                          onClick={() => setAccuracy(level)}
                          className={`w-6 h-6 flex items-center justify-center text-[8px] font-mono border rounded transition-all ${
                            accuracy === level
                              ? "bg-primary border-primary text-black"
                              : "border-white/20 text-foreground hover:border-primary"
                          }`}
                          data-testid={`feedback-accuracy-${level}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className="text-[7px] font-mono text-foreground mt-1">1 = Quicker | 5 = Much longer</p>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                      HOW DIFFICULT WAS IT?
                    </p>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }, (_, i) => i + 1).map((level) => (
                        <button
                          key={level}
                          onClick={() => setDifficulty(level)}
                          className={`w-6 h-6 flex items-center justify-center text-[8px] font-mono border rounded transition-all ${
                            difficulty === level
                              ? "bg-primary border-primary text-black"
                              : "border-white/20 text-foreground hover:border-primary"
                          }`}
                          data-testid={`feedback-difficulty-${level}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className="text-[7px] font-mono text-foreground mt-1">1 = Easy | 5 = Hard</p>
                  </div>

                  {/* Topics Covered - Show for study activities */}
                  {block.type?.toLowerCase().includes("study") && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                        WHAT TOPICS DID YOU COVER?
                      </p>
                      <input
                        type="text"
                        value={topicsCovered}
                        onChange={(e) => setTopicsCovered(e.target.value)}
                        placeholder="e.g., Chapter 3 - Control Systems, Transfer Functions"
                        className="w-full text-[10px] font-mono bg-black/50 border border-white/10 rounded p-1.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                        data-testid="input-topics-covered"
                      />
                      <p className="text-[7px] font-mono text-muted-foreground mt-1">
                        Helps track your learning progress
                      </p>
                    </div>
                  )}

                  {/* Book Chapter Completion */}
                  {isReadingActivity && relatedBook && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                        CHAPTER/SECTION COMPLETED
                      </p>
                      <input
                        type="number"
                        min="1"
                        max={relatedBook.totalChapters || 999}
                        value={bookChapterCompleted}
                        onChange={(e) => setBookChapterCompleted(e.target.value)}
                        placeholder={`Current: ${relatedBook.currentChapter || 0}/${relatedBook.totalChapters || 0}`}
                        className="w-full text-[10px] font-mono bg-black/50 border border-white/10 rounded p-1.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                        data-testid="input-book-chapter-completed"
                      />
                      <p className="text-[7px] font-mono text-muted-foreground mt-1">
                        Enter the chapter number you just completed
                      </p>
                    </div>
                  )}


                  {/* Actual Time Spent */}
                  <div>
                    <p className="text-[10px] font-mono uppercase text-foreground mb-2">
                      HOW LONG DID IT ACTUALLY TAKE? (OPTIONAL)
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={actualTimeSpent}
                        onChange={(e) => setActualTimeSpent(e.target.value)}
                        placeholder="e.g., 30"
                        className="w-24 text-[10px] font-mono bg-black/50 border border-white/10 rounded p-1.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                        min="1"
                        max="480"
                        data-testid="input-actual-time-spent"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">minutes</span>
                    </div>
                    <p className="text-[7px] font-mono text-muted-foreground mt-1">
                      Helps improve future time estimates
                    </p>
                  </div>
                </>
              )}

              {/* Comments */}
              <div>
                <p className="text-[10px] font-mono uppercase text-foreground mb-1">
                  ANYTHING ELSE TO SHARE?
                </p>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full h-16 text-[10px] font-mono bg-black/50 border border-white/10 rounded p-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                  placeholder="Any comments..."
                  data-testid="feedback-textarea-comments"
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSubmit}
                disabled={submitFeedback.isPending || saved}
                className={`w-full text-[10px] font-mono uppercase transition-all ${
                  saved ? "bg-green-600 hover:bg-green-600 text-white" : "bg-primary hover:bg-primary/80 text-black"
                } cursor-pointer`}
                data-testid="button-feedback-save"
              >
                {saved ? (
                  <div className="flex items-center justify-center gap-2">
                    <Check size={14} className="stroke-[3]" />
                    SAVED
                  </div>
                ) : (
                  "SAVE"
                )}
              </Button>

              {/* Error Message */}
              {showError && (
                <p className="text-[10px] font-mono text-orange-400 text-center animate-pulse">
                  INCOMPLETE - SELECT ALL REQUIRED FIELDS
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}