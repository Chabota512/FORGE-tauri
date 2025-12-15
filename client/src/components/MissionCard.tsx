import { Mission, useUploadProof, useSubmitMissionFeedback, useDeleteMission, useCourses, useConfirmMissionComplete, MissionFeedbackData, useDeleteProof } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, Circle, Clock, Loader2, Trash2, Download, AlertTriangle, X, ChevronLeft, ChevronRight, Sparkles, Target } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface MissionCardProps {
  mission: Mission;
}

type FeedbackStep = 1 | 2 | 3 | "analyzing" | "result";

const STEP_TITLES = {
  1: "How Did It Feel?",
  2: "How Did You Learn?", 
  3: "Blockers & Confidence"
} as const;

export function MissionCard({ mission }: MissionCardProps) {
  const { toast } = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const uploadProof = useUploadProof();
  const submitMissionFeedback = useSubmitMissionFeedback();
  const confirmComplete = useConfirmMissionComplete();
  const deleteMission = useDeleteMission();
  const deleteProof = useDeleteProof();
  const { data: courses = [] } = useCourses();
  
  const course = courses.find(c => c.code === mission.courseCode);
  const CourseIcon = course?.icon ? (Icons[course.icon as keyof typeof Icons] as any) : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<FeedbackStep>(1);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [expandedProofReq, setExpandedProofReq] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // New feedback fields
  const [emotionalState, setEmotionalState] = useState<string[]>([]);
  const [actualTimeMinutes, setActualTimeMinutes] = useState<string>("");
  const [timeFeeling, setTimeFeeling] = useState<string | null>(null);
  const [usedExternalHelp, setUsedExternalHelp] = useState<boolean | null>(null);
  const [helpDetails, setHelpDetails] = useState("");
  const [missionClarity, setMissionClarity] = useState<string | null>(null);
  const [learningType, setLearningType] = useState<string | null>(null);
  const [blockers, setBlockers] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState<string | null>(null);

  // AI result state
  const [aiApproved, setAiApproved] = useState<boolean | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiRejectionReason, setAiRejectionReason] = useState<string>("");

  const resetFeedback = () => {
    setFeedbackStep(1);
    setEmotionalState([]);
    setActualTimeMinutes("");
    setTimeFeeling(null);
    setUsedExternalHelp(null);
    setHelpDetails("");
    setMissionClarity(null);
    setLearningType(null);
    setBlockers("");
    setConfidenceLevel(null);
    setAiApproved(null);
    setAiAnalysis("");
    setAiRejectionReason("");
  };

  const canGoToStep2 = () => emotionalState.length > 0 && timeFeeling;
  const canGoToStep3 = () => usedExternalHelp !== null && missionClarity && learningType;
  const canSubmit = () => {
    return emotionalState.length > 0 && 
           timeFeeling && 
           usedExternalHelp !== null && 
           missionClarity && 
           learningType && 
           confidenceLevel;
  };

  const handleNextStep = () => {
    if (feedbackStep === 1 && canGoToStep2()) {
      setFeedbackStep(2);
    } else if (feedbackStep === 2 && canGoToStep3()) {
      setFeedbackStep(3);
    }
  };

  const handlePrevStep = () => {
    if (feedbackStep === 2) setFeedbackStep(1);
    if (feedbackStep === 3) setFeedbackStep(2);
  };

  const getStepProgress = () => {
    if (typeof feedbackStep === "number") {
      return (feedbackStep / 3) * 100;
    }
    return 100;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        await uploadProof.mutateAsync({
          missionId: mission.id,
          courseCode: mission.courseCode,
          file: e.target.files[0],
        });
        toast({
          title: "Proof Uploaded",
          description: "Now tell us about your experience.",
        });
        resetFeedback();
        setFeedbackOpen(true);
      } catch (error: any) {
        toast({
          title: "Upload Failed",
          description: error.message || "Could not save proof file.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSubmitFeedback = async () => {
    if (!canSubmit()) return;

    setFeedbackStep("analyzing");

    try {
      const feedbackData: MissionFeedbackData = {
        missionId: mission.id,
        emotionalState: emotionalState.length > 0 ? emotionalState.join(",") : undefined,
        actualTimeMinutes: actualTimeMinutes ? parseInt(actualTimeMinutes) : undefined,
        timeFeeling: timeFeeling || undefined,
        usedExternalHelp: usedExternalHelp ?? undefined,
        helpDetails: usedExternalHelp ? (helpDetails || undefined) : undefined,
        missionClarity: missionClarity || undefined,
        learningType: learningType || undefined,
        blockers: blockers || undefined,
        confidenceLevel: confidenceLevel || undefined,
      };

      const result = await submitMissionFeedback.mutateAsync(feedbackData);
      
      setAiApproved(result.aiApproved);
      setAiAnalysis(result.aiAnalysis);
      if (result.aiRejectionReason) {
        setAiRejectionReason(result.aiRejectionReason);
      }
      setFeedbackStep("result");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit feedback",
        variant: "destructive",
      });
      setFeedbackStep(3);
    }
  };

  const handleConfirmComplete = async () => {
    try {
      await confirmComplete.mutateAsync({ missionId: mission.id });
      toast({
        title: "Mission Complete",
        description: "Great work! This mission has been marked as complete.",
      });
      setFeedbackOpen(false);
      resetFeedback();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete mission",
        variant: "destructive",
      });
    }
  };

  const handleCloseRejection = () => {
    setFeedbackOpen(false);
    resetFeedback();
    toast({
      title: "Revision Needed",
      description: "Please review the feedback and upload an updated proof.",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-primary drop-shadow-[0_0_8px_rgba(190,242,100,0.5)]";
      case "proof_uploaded": return "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]";
      case "needs_revision": return "text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]";
      default: return "text-amber-700 drop-shadow-[0_0_5px_rgba(180,83,9,0.5)]";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4" />;
      case "proof_uploaded": return <Clock className="w-4 h-4" />;
      case "needs_revision": return <AlertTriangle className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  const handleTitleDoubleClick = () => {
    setMenuOpen(true);
  };

  const handleDeleteMission = async () => {
    try {
      await deleteMission.mutateAsync({ missionId: mission.id });
      setMenuOpen(false);
      toast({
        title: "Mission Deleted",
        description: `${mission.title} has been removed.`,
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete mission.",
        variant: "destructive",
      });
    }
  };

  const ChipButton = ({ 
    selected, 
    onClick, 
    children 
  }: { 
    selected: boolean; 
    onClick: () => void; 
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg border text-xs font-mono transition-all",
        selected
          ? "bg-primary text-black border-primary"
          : "bg-white/5 border-white/20 text-foreground/80 hover:border-primary/50 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );

  return (
    <>
      <Card 
        data-testid={`card-mission-${mission.id}`}
        className="rounded-xl text-card-foreground shadow group relative overflow-hidden border transition-all duration-300 glass-panel hover:bg-card/80 hover:shadow-[0_0_20px_rgba(190,242,100,0.15)] border-white/10 hover:border-primary/30 bg-[#0c0c0c] h-[345px] flex flex-col"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
        {CourseIcon ? <CourseIcon className="w-24 h-24 text-primary" /> : null}
      </div>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-primary/70 uppercase tracking-wider">
                {(() => {
                  const courseName = mission.courseName || "";
                  const courseCode = courseName.split("_")[0];
                  const displayName = courseName.replace(/_/g, " ").split(" ").slice(1).join(" ");
                  return `[${courseCode}]${displayName}`;
                })()}
              </p>
              <span 
                data-testid={`badge-source-${mission.id}`}
                className={cn(
                  "text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider",
                  mission.source === 'manual' 
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-primary/10 text-primary/60 border border-primary/20"
                )}
              >
                {mission.source === 'manual' ? 'MANUAL' : 'AUTO'}
              </span>
            </div>
            <CardTitle 
              onDoubleClick={handleTitleDoubleClick}
              className="text-lg font-bold font-display leading-tight tracking-wide text-foreground cursor-pointer hover:text-primary/80 transition-colors user-select-none"
            >
              {mission.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <div />
              </PopoverTrigger>
              <PopoverContent className="w-32 p-1 bg-black/95 border-white/10">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-destructive hover:bg-destructive/20 hover:text-destructive font-mono"
                  onClick={handleDeleteMission}
                  disabled={deleteMission.isPending}
                  data-testid={`button-delete-mission-${mission.id}`}
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  DELETE
                </Button>
              </PopoverContent>
            </Popover>
            <div className={cn("flex items-center space-x-1 transition-all duration-300", getStatusColor(mission.status))}>
              {getStatusIcon(mission.status)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 flex-1 flex flex-col">
        <div className="flex-1 flex flex-col">
          <p 
            onClick={() => setExpandedDescription(!expandedDescription)}
            className={`text-sm text-foreground/80 leading-relaxed mb-4 font-mono cursor-pointer hover:text-foreground/90 transition-colors ${!expandedDescription ? 'line-clamp-2' : ''}`}
          >
            {mission.description}
          </p>
        </div>
        
        <div 
          onClick={() => setExpandedProofReq(!expandedProofReq)}
          className="bg-black/40 p-3 rounded border border-white/5 backdrop-blur-sm cursor-pointer hover:border-white/10 transition-colors mt-auto"
        >
          <p className="text-[10px] font-mono text-primary/60 mb-1 uppercase tracking-widest">PROOF_REQ_ID_{String(mission.id).padStart(3, '0')}</p>
          <p className={`text-xs text-foreground font-medium font-mono ${!expandedProofReq ? 'line-clamp-2' : ''}`}>{mission.proofRequirement}</p>
        </div>

        {mission.proofFile && (
          <div className="mt-3 bg-primary/5 p-2 rounded border border-primary/20">
            <p className="text-[10px] font-mono text-primary uppercase tracking-widest">PROOF_SUBMITTED</p>
            <p className="text-xs text-foreground/80 font-mono truncate">{mission.proofFile}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        {mission.status === "completed" ? (
          <div className="w-full py-2 bg-primary/10 border border-primary/30 rounded flex items-center justify-center text-primary text-sm font-bold font-display tracking-wider shadow-[0_0_10px_rgba(190,242,100,0.1)]">
            <CheckCircle className="w-4 h-4 mr-2" />
            MISSION COMPLETE
          </div>
        ) : mission.status === "needs_revision" ? (
          <div className="w-full relative">
            <input
              ref={fileInputRef}
              type="file"
              id={`upload-${mission.id}`}
              data-testid={`input-upload-${mission.id}`}
              className="hidden"
              onChange={handleFileChange}
              disabled={uploadProof.isPending}
            />
            <label htmlFor={`upload-${mission.id}`} className="w-full block">
              <Button 
                data-testid={`button-reupload-${mission.id}`}
                variant="outline" 
                className="w-full cursor-pointer hover:bg-red-500/20 hover:text-red-400 hover:border-red-500 transition-all duration-300 border-dashed border-red-500/50 text-red-400 font-mono text-xs uppercase tracking-wider"
                asChild
                disabled={uploadProof.isPending}
              >
                <span>
                  {uploadProof.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploadProof.isPending ? "UPLOADING..." : "RESUBMIT_PROOF"}
                </span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="w-full relative">
            <input
              ref={fileInputRef}
              type="file"
              id={`upload-${mission.id}`}
              data-testid={`input-upload-${mission.id}`}
              className="hidden"
              onChange={handleFileChange}
              disabled={uploadProof.isPending}
            />
            <label htmlFor={`upload-${mission.id}`} className="w-full block">
              <Button 
                data-testid={`button-upload-${mission.id}`}
                variant="outline" 
                className="w-full cursor-pointer hover:bg-primary/20 hover:text-primary hover:border-primary transition-all duration-300 border-dashed border-white/20 font-mono text-xs uppercase tracking-wider"
                asChild
                disabled={uploadProof.isPending}
              >
                <span>
                  {uploadProof.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploadProof.isPending ? "UPLOADING..." : "UPLOAD_PROOF"}
                </span>
              </Button>
            </label>
          </div>
        )}
      </CardFooter>
    </Card>

    <Dialog open={feedbackOpen} onOpenChange={(open) => {
      if (!open && feedbackStep !== "analyzing") {
        if (mission.proofFile && feedbackStep !== "result") {
          deleteProof.mutate({ missionId: mission.id });
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setFeedbackOpen(false);
      }
    }}>
      <DialogContent className="border-[#5a6f23] border-2 bg-black/95 max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:max-w-lg">
        {/* Mission Context Header */}
        {typeof feedbackStep === "number" && (
          <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-white/10 p-4 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-primary/70 uppercase tracking-wider mb-1">
                  MISSION FEEDBACK
                </p>
                <p className="text-sm font-medium text-foreground truncate">
                  {mission.title}
                </p>
                <p className="text-xs text-foreground/60 font-mono mt-1 line-clamp-1">
                  {mission.proofRequirement}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        {typeof feedbackStep === "number" && (
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-foreground/60">
                STEP {feedbackStep} OF 3
              </span>
              <span className="text-xs font-mono text-primary">
                {STEP_TITLES[feedbackStep as 1 | 2 | 3]}
              </span>
            </div>
            <Progress value={getStepProgress()} className="h-1.5 bg-white/10" />
            <div className="flex justify-between mt-2">
              {[1, 2, 3].map((step) => (
                <div 
                  key={step}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-mono transition-all",
                    feedbackStep >= step ? "text-primary" : "text-foreground/40"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                    feedbackStep > step 
                      ? "bg-primary text-black" 
                      : feedbackStep === step 
                        ? "bg-primary/20 text-primary border border-primary" 
                        : "bg-white/5 text-foreground/40 border border-white/10"
                  )}>
                    {feedbackStep > step ? <Check className="w-3 h-3" /> : step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogHeader className={cn(
          "px-6 pt-4 shrink-0",
          typeof feedbackStep !== "number" && "border-b-0"
        )}>
          <DialogTitle className="font-display text-lg">
            {feedbackStep === "analyzing" ? "Analyzing Your Work..." : 
             feedbackStep === "result" ? (aiApproved ? "Mission Approved!" : "Revision Needed") :
             STEP_TITLES[feedbackStep as 1 | 2 | 3]}
          </DialogTitle>
          {typeof feedbackStep === "number" && (
            <DialogDescription className="text-foreground/60 text-sm">
              {feedbackStep === 1 && "Tell us about your emotional experience and time spent."}
              {feedbackStep === 2 && "Help us understand how you approached the learning."}
              {feedbackStep === 3 && "Almost done! Share any blockers and your confidence level."}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {/* Analyzing State */}
            {feedbackStep === "analyzing" && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <Loader2 className="w-16 h-16 animate-spin text-primary relative" />
                </div>
                <p className="text-sm text-foreground/70 font-mono mt-6">Reviewing your submission...</p>
                <p className="text-xs text-foreground/50 font-mono mt-2">This usually takes a few seconds</p>
              </div>
            )}

            {/* AI Result */}
            {feedbackStep === "result" && (
              <div className="space-y-4">
                <div className={cn(
                  "p-4 rounded-xl border-2 transition-all",
                  aiApproved 
                    ? "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/40" 
                    : "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/40"
                )}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      aiApproved ? "bg-primary/20" : "bg-red-500/20"
                    )}>
                      {aiApproved ? (
                        <Sparkles className="w-6 h-6 text-primary" />
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className={cn(
                        "text-lg font-bold",
                        aiApproved ? "text-primary" : "text-red-400"
                      )}>
                        {aiApproved ? "Great Work!" : "Needs Improvement"}
                      </p>
                      <p className="text-xs text-foreground/60 font-mono">
                        {aiApproved ? "Your proof meets the requirements" : "Some adjustments needed"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-mono text-foreground/60 uppercase tracking-widest">
                        AI ANALYSIS
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs font-mono hover:bg-white/10"
                        onClick={() => {
                          toast({
                            title: "Download Coming Soon",
                            description: "PDF report generation will be available soon.",
                          });
                        }}
                        data-testid="button-download-report"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        PDF
                      </Button>
                    </div>
                    
                    <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {aiApproved ? aiAnalysis : aiRejectionReason || aiAnalysis}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  {aiApproved ? (
                    <Button
                      onClick={handleConfirmComplete}
                      disabled={confirmComplete.isPending}
                      className="w-full h-12 bg-primary text-black hover:bg-primary/80 font-mono text-sm uppercase tracking-wide"
                      data-testid="button-got-it"
                    >
                      {confirmComplete.isPending ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5 mr-2" />
                      )}
                      Complete Mission
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCloseRejection}
                      variant="outline"
                      className="w-full h-12 border-red-500/50 text-red-400 hover:bg-red-500/10 font-mono text-sm uppercase tracking-wide"
                      data-testid="button-close-rejection"
                    >
                      <X className="w-5 h-5 mr-2" />
                      I'll Revise and Resubmit
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Step 1: Experience */}
            {feedbackStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                    How were you feeling during this mission?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "confused" },
                      { value: "frustrated" },
                      { value: "flow" },
                      { value: "bored" },
                      { value: "focused" },
                      { value: "tired" }
                    ].map((state) => (
                      <ChipButton
                        key={state.value}
                        selected={emotionalState.includes(state.value)}
                        onClick={() => {
                          setEmotionalState(prev =>
                            prev.includes(state.value)
                              ? prev.filter(s => s !== state.value)
                              : [...prev, state.value]
                          );
                        }}
                      >
                        {state.value}
                      </ChipButton>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                    How did the time compare to your expectations?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "faster", label: "Faster than expected" },
                      { value: "about_right", label: "About right" },
                      { value: "much_longer", label: "Took much longer" },
                    ].map((option) => (
                      <ChipButton
                        key={option.value}
                        selected={timeFeeling === option.value}
                        onClick={() => setTimeFeeling(option.value)}
                      >
                        {option.label}
                      </ChipButton>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <Clock className="w-4 h-4 text-foreground/60" />
                    <span className="text-xs text-foreground/60 font-mono">Actual time:</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={actualTimeMinutes}
                      onChange={(e) => setActualTimeMinutes(e.target.value)}
                      className="w-20 h-8 text-sm bg-transparent border-white/20 text-center"
                      data-testid="input-actual-time"
                    />
                    <span className="text-xs text-foreground/60 font-mono">minutes</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Learning */}
            {feedbackStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                    Did you need external help?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <ChipButton
                      selected={usedExternalHelp === false}
                      onClick={() => {
                        setUsedExternalHelp(false);
                        setHelpDetails("");
                      }}
                    >
                      Figured it out myself
                    </ChipButton>
                    <ChipButton
                      selected={usedExternalHelp === true}
                      onClick={() => setUsedExternalHelp(true)}
                    >
                      Yes, I got help
                    </ChipButton>
                  </div>
                  {usedExternalHelp && (
                    <Input
                      placeholder="What helped? (notes, YouTube, ChatGPT, friend...)"
                      value={helpDetails}
                      onChange={(e) => setHelpDetails(e.target.value)}
                      className="mt-2 bg-white/5 border-white/10"
                      data-testid="input-help-details"
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                    Was the mission clear?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "unclear", label: "Unclear" },
                      { value: "somewhat_clear", label: "Somewhat clear" },
                      { value: "crystal_clear", label: "Crystal clear" },
                    ].map((option) => (
                      <ChipButton
                        key={option.value}
                        selected={missionClarity === option.value}
                        onClick={() => setMissionClarity(option.value)}
                      >
                        {option.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
                    What type of learning was this?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "new", label: "Learned something new" },
                      { value: "mixed", label: "Mix of new and review" },
                      { value: "already_knew", label: "Already knew this" },
                    ].map((option) => (
                      <ChipButton
                        key={option.value}
                        selected={learningType === option.value}
                        onClick={() => setLearningType(option.value)}
                      >
                        {option.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Blockers & Confidence */}
            {feedbackStep === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                    What slowed you down? (optional)
                  </label>
                  <Textarea
                    placeholder="Nothing specific, or describe what got in your way..."
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                    className="bg-white/5 border-white/10 text-foreground placeholder:text-muted-foreground resize-none h-24 text-sm"
                    data-testid="textarea-blockers"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                    How confident do you feel about this topic now?
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "shaky", label: "Shaky", desc: "Still uncertain" },
                      { value: "moderate", label: "Moderate", desc: "Getting there" },
                      { value: "solid", label: "Solid", desc: "Got it!" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setConfidenceLevel(option.value)}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-center",
                          confidenceLevel === option.value
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-white/5 border-white/10 text-foreground/80 hover:border-primary/50 hover:bg-white/10"
                        )}
                      >
                        <span className="text-sm font-medium block">{option.label}</span>
                        <span className="text-xs text-foreground/50 block mt-0.5">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Footer */}
        {typeof feedbackStep === "number" && (
          <div className="flex gap-3 p-4 border-t border-white/10 bg-black/50 shrink-0">
            {feedbackStep === 1 ? (
              <Button
                variant="outline"
                onClick={() => {
                  setFeedbackOpen(false);
                  resetFeedback();
                }}
                data-testid="button-cancel-feedback"
                className="flex-1"
              >
                Cancel
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handlePrevStep}
                data-testid="button-prev-step"
                className="flex-1"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            
            {feedbackStep < 3 ? (
              <Button
                onClick={handleNextStep}
                disabled={
                  (feedbackStep === 1 && !canGoToStep2()) ||
                  (feedbackStep === 2 && !canGoToStep3())
                }
                data-testid="button-next-step"
                className="flex-1 bg-primary text-black hover:bg-primary/80"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmitFeedback}
                disabled={!canSubmit() || submitMissionFeedback.isPending}
                data-testid="button-submit-feedback"
                className="flex-1 bg-primary text-black hover:bg-primary/80"
              >
                {submitMissionFeedback.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Submit for Review
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
