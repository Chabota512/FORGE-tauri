import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Home,
  Zap,
  Clock,
  MessageSquare,
  Check,
  ChevronRight,
  Calendar,
  Settings as SettingsIcon,
  Save,
  Target,
  Trash2,
  Lock,
  Unlock,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import {
  useDraftSchedule,
  useGenerateDraftSchedule,
  useRecentScheduleAsDraft,
  useFinalizeSchedule,
  useUserPreferences,
  useUpdateUserPreferences,
  useUpdateDraftSchedule,
  useProcessSchedule,
  useBatchGenerateDetails,
  type DraftSchedule,
} from "@/lib/api";

export default function ScheduleBuilderPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  // Check for date parameter in URL
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const urlDate = urlParams.get('date');
  const [selectedDate, setSelectedDate] = useState(urlDate || today);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [step, setStep] = useState<"builder" | "review">("builder");
  const [selectedOption, setSelectedOption] = useState<
    "ai_template" | "recent" | "chat" | null
  >(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Timeline editing state
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [editedBlocks, setEditedBlocks] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [hoveredTimeOfDay, setHoveredTimeOfDay] = useState<string | null>(null);

  // Schedule settings
  const [wakeTime, setWakeTime] = useState("06:00");
  const [sleepTime, setSleepTime] = useState("22:00");
  const [targetWorkHours, setTargetWorkHours] = useState(6);
  const [targetFreeHours, setTargetFreeHours] = useState(4);
  const [targetOtherHours, setTargetOtherHours] = useState(4);
  const [consecutiveStudyLimit, setConsecutiveStudyLimit] = useState(90);
  const [personalGoals, setPersonalGoals] = useState("");
  const [scheduleGenerationTime, setScheduleGenerationTime] = useState("06:00");
  const [eveningPromptTime, setEveningPromptTime] = useState("18:00");

  // Time balance lock states
  const [isWorkLocked, setIsWorkLocked] = useState(false);
  const [isFreeLocked, setIsFreeLocked] = useState(false);
  const [isOtherLocked, setIsOtherLocked] = useState(false);

  // Settings dialog view state
  const [settingsView, setSettingsView] = useState<'time' | 'goals' | 'prompt'>('time');

  // Goals management state
  const [goalsList, setGoalsList] = useState<string[]>([]);
  const [newGoal, setNewGoal] = useState("");
  const [editingGoalIdx, setEditingGoalIdx] = useState<number | null>(null);
  const [editingGoalText, setEditingGoalText] = useState("");

  const { data: draftSchedule } = useDraftSchedule(selectedDate);
  const { data: preferences, isLoading: prefsLoading } = useUserPreferences();
  const generateDraft = useGenerateDraftSchedule();
  const recentDraft = useRecentScheduleAsDraft();
  const finalize = useFinalizeSchedule();
  const updatePreferences = useUpdateUserPreferences();
  const updateDraft = useUpdateDraftSchedule();
  const processSchedule = useProcessSchedule();
  const batchGenerateDetails = useBatchGenerateDetails();

  useEffect(() => {
    if (preferences) {
      setWakeTime(preferences.wakeTime || "06:00");
      setSleepTime(preferences.sleepTime || "22:00");
      setTargetWorkHours(preferences.targetWorkHours || 6);
      setTargetFreeHours(preferences.targetFreeHours || 4);
      setTargetOtherHours(preferences.targetOtherHours || 4);
      setConsecutiveStudyLimit(preferences.consecutiveStudyLimit || 90);
      setPersonalGoals(preferences.personalGoals || "");
      setScheduleGenerationTime(preferences.scheduleGenerationTime || "06:00");
      setEveningPromptTime(preferences.eveningPromptTime || "18:00");

      // Parse goals from personalGoals JSON string
      try {
        const parsed = preferences.personalGoals ? JSON.parse(preferences.personalGoals) : [];
        setGoalsList(Array.isArray(parsed) ? parsed : []);
      } catch {
        setGoalsList([]);
      }
    }
  }, [preferences]);

  // Load template from localStorage if available
  useEffect(() => {
    const template = localStorage.getItem("scheduleTemplate");
    const templateDate = localStorage.getItem("scheduleTemplateDate");
    
    if (template) {
      try {
        const blocks = JSON.parse(template);
        setEditedBlocks(blocks);
        
        // If template date matches selected date, auto-navigate to review step
        if (templateDate === selectedDate) {
          setStep("review");
        }
        
        // Clean up localStorage
        localStorage.removeItem("scheduleTemplate");
        localStorage.removeItem("scheduleTemplateDate");
      } catch (err) {
        console.error("Failed to load schedule template:", err);
      }
    } else {
      // Check for draft blocks being edited (temporary persistence)
      const draftBlocks = localStorage.getItem("draftScheduleBlocks");
      const draftDate = localStorage.getItem("draftScheduleDate");
      
      if (draftBlocks && draftDate === selectedDate) {
        try {
          const blocks = JSON.parse(draftBlocks);
          setEditedBlocks(blocks);
          setStep("review");
          toast({
            title: "Draft Restored",
            description: "Your previous edit session has been restored.",
          });
        } catch (err) {
          console.error("Failed to load draft schedule:", err);
        }
      }
    }
  }, [selectedDate]);

  // Sync editedBlocks with draftSchedule
  useEffect(() => {
    if (draftSchedule?.timeBlocks && !localStorage.getItem("scheduleTemplate")) {
      setEditedBlocks(draftSchedule.timeBlocks);
    }
  }, [draftSchedule?.timeBlocks]);

  // Save ScheduleBuilder state to localStorage for persistence
  useEffect(() => {
    if (selectedOption || editedBlocks.length > 0) {
      const state = { selectedOption, editedBlocks, step, selectedDate };
      localStorage.setItem("scheduleBuilderState", JSON.stringify(state));
    }
  }, [selectedOption, editedBlocks, step, selectedDate]);

  // Restore ScheduleBuilder state on mount
  useEffect(() => {
    const savedState = localStorage.getItem("scheduleBuilderState");
    const savedDate = localStorage.getItem("scheduleBuilderDate");
    
    if (savedState && savedDate === selectedDate) {
      try {
        const { selectedOption: savedOption, editedBlocks: savedBlocks, step: savedStep } = JSON.parse(savedState);
        setSelectedOption(savedOption);
        setEditedBlocks(savedBlocks);
        setStep(savedStep);
        toast({
          title: "State Restored",
          description: "Your previous schedule builder session has been restored.",
        });
      } catch (err) {
        console.error("Failed to restore schedule builder state:", err);
      }
    } else if (selectedDate) {
      localStorage.setItem("scheduleBuilderDate", selectedDate);
    }
  }, [selectedDate]);

  const handleStartEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingTitle(editedBlocks[idx].title.replace(/^\[.*?\]\s*/, ''));
  };

  const handleSaveTitle = (idx: number) => {
    const updated = [...editedBlocks];
    updated[idx].title = editingTitle;
    setEditedBlocks(updated);
    setEditingIdx(null);
    setHasChanges(true);
  };

  const handleDeleteBlock = (idx: number) => {
    const updated = editedBlocks.filter((_, i) => i !== idx);
    setEditedBlocks(updated);
    setEditingIdx(null);
    setHasChanges(true);
  };

  const handleDragStart = (idx: number, e: React.DragEvent) => {
    setDraggedIdx(idx);
    // Create custom drag image showing only the title, not the time label
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.left = '-9999px';
    dragImage.style.backgroundColor = '#1a1a1a';
    dragImage.style.color = '#ffffff';
    dragImage.style.padding = '8px 12px';
    dragImage.style.borderRadius = '4px';
    dragImage.style.fontFamily = 'monospace';
    dragImage.style.fontSize = '14px';
    dragImage.style.border = '1px solid #84cc16';
    dragImage.textContent = editedBlocks[idx].title.replace(/^\[.*?\]\s*/, '');
    document.body.appendChild(dragImage);
    e.dataTransfer?.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Helper to get time-of-day label for AI context tracking
  const getTimeOfDayLabel = (timeStr: string): string => {
    const [hours] = timeStr.split(":").map(Number);
    const timeConfig = [
      { label: "Early Night", start: 0, end: 4 },
      { label: "Late Night", start: 4, end: 6 },
      { label: "Early Morning", start: 6, end: 7 },
      { label: "Morning", start: 7, end: 9 },
      { label: "Mid-Morning", start: 9, end: 10 },
      { label: "Late Morning", start: 10, end: 12 },
      { label: "Noon", start: 12, end: 13 },
      { label: "Midday", start: 13, end: 14 },
      { label: "Afternoon", start: 14, end: 17 },
      { label: "Late Afternoon", start: 17, end: 19 },
      { label: "Early Evening", start: 19, end: 20 },
      { label: "Evening", start: 20, end: 22 },
      { label: "Late Evening", start: 22, end: 24 },
    ];
    const match = timeConfig.find(t => hours >= t.start && hours < t.end);
    return match?.label || "Unknown";
  };

  const handleDrop = (idx: number) => {
    if (draggedIdx !== null && draggedIdx !== idx) {
      // Store all original time slots before any modifications
      const originalTimeSlots = editedBlocks.map(block => ({
        startTime: block.startTime,
        endTime: block.endTime
      }));

      const updated = [...editedBlocks];
      
      // Remove the dragged activity content (keeping only activity data, not time)
      const [draggedActivity] = updated.splice(draggedIdx, 1);
      
      // Insert it at the new position
      updated.splice(idx, 0, draggedActivity);
      
      // Reassign all time slots to their original positions
      // This ensures time slots stay fixed while activity content shifts
      updated.forEach((block, i) => {
        block.startTime = originalTimeSlots[i].startTime;
        block.endTime = originalTimeSlots[i].endTime;
      });

      setEditedBlocks(updated);
      setHasChanges(true);
    }
    setDraggedIdx(null);
    setHoveredTimeOfDay(null);
  };

  const handleDropOnTimeOfDay = (timeOfDayLabel: string, firstBlockIdx: number) => {
    if (draggedIdx !== null) {
      // Find the target time-of-day configuration
      const targetTimeOfDay = TIME_OF_DAY_CONFIG.find(t => t.label === timeOfDayLabel);
      if (!targetTimeOfDay) return;

      const updated = [...editedBlocks];
      const draggedActivity = updated[draggedIdx];

      // Calculate new time for the dragged activity within target group's time window
      const startHour = targetTimeOfDay.start;
      const endHour = Math.min(targetTimeOfDay.start + 1, targetTimeOfDay.end);
      
      const newStartTime = `${String(startHour).padStart(2, '0')}:00`;
      const newEndTime = `${String(endHour).padStart(2, '0')}:00`;

      // Update only the dragged activity's time, keep all other activities unchanged
      updated[draggedIdx] = {
        ...draggedActivity,
        startTime: newStartTime,
        endTime: newEndTime
      };

      setEditedBlocks(updated);
      setHasChanges(true);
    }
    setDraggedIdx(null);
    setHoveredTimeOfDay(null);
  };

  const handleDoubleClickTimeOfDay = (timeOfDayLabel: string) => {
    // Find the target time-of-day configuration
    const targetTimeOfDay = TIME_OF_DAY_CONFIG.find(t => t.label === timeOfDayLabel);
    if (!targetTimeOfDay) return;

    // Calculate time slot for new activity within target group's time window
    const startHour = targetTimeOfDay.start;
    const endHour = Math.min(targetTimeOfDay.start + 1, targetTimeOfDay.end);
    
    const newStartTime = `${String(startHour).padStart(2, '0')}:00`;
    const newEndTime = `${String(endHour).padStart(2, '0')}:00`;

    // Create new activity block
    const newBlock = {
      title: "New Activity",
      startTime: newStartTime,
      endTime: newEndTime,
      details: ""
    };

    // Find the first activity in this time-of-day group to insert before it
    let insertIdx = editedBlocks.length; // default: append at end if group is empty
    for (let i = 0; i < editedBlocks.length; i++) {
      const blockTimeOfDay = getTimeOfDayLabel(editedBlocks[i].startTime);
      if (blockTimeOfDay === timeOfDayLabel) {
        insertIdx = i; // Insert before the first activity in this group
        break;
      }
    }

    // Insert the new block at the correct position
    const updated = [...editedBlocks];
    updated.splice(insertIdx, 0, newBlock);
    
    setEditedBlocks(updated);
    setEditingIdx(insertIdx);
    setEditingTitle("New Activity");
    setHasChanges(true);
  };

  const handleAITemplate = async () => {
    try {
      setAiLoading(true);
      await generateDraft.mutateAsync(selectedDate);
      setStep("review");
      toast({
        title: "Schedule Generated",
        description: "AI has created a schedule based on your commitments and preferences.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate schedule",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleRecentSchedule = async () => {
    try {
      setRecentLoading(true);
      await recentDraft.mutateAsync(selectedDate);
      setStep("review");
      toast({
        title: "Schedule Loaded",
        description: "Your recent schedule has been loaded as a template.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No recent schedule found",
        variant: "destructive",
      });
    } finally {
      setRecentLoading(false);
    }
  };


  const handleProcessSchedule = async () => {
    try {
      setProcessing(true);
      // Process schedule: save edits, collect data, and prepare for detail generation
      await processSchedule.mutateAsync({
        date: selectedDate,
        timeBlocks: editedBlocks,
      });
      // Reset hasChanges flag after successful processing
      setHasChanges(false);
      toast({
        title: "Schedule Processed",
        description: "Your schedule has been saved and processed. Click 'Edit Schedule Details' to continue.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process schedule",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleEditDetails = async () => {
    try {
      setProcessing(true);
      // Batch generate all details for all activities before navigating
      // This ensures all fields are filtered and filled when user enters the details page
      await batchGenerateDetails.mutateAsync({
        blocks: editedBlocks,
        date: selectedDate,
      });
      
      // Store preGenerated details in localStorage for EditSchedule to access
      localStorage.setItem("preGeneratedDetails", JSON.stringify({
        blocks: editedBlocks,
        timestamp: Date.now()
      }));
      
      toast({
        title: "Details Prepared",
        description: "All activity details have been generated and prepared.",
      });
      
      // Now navigate
      navigate(`/edit-schedule/${selectedDate}?from=builder`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to prepare activity details",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const TIME_OF_DAY_CONFIG = [
    { label: "Early Night", start: 0, end: 4, color: "#1a1a3e", bgColor: "bg-blue-950" },
    { label: "Late Night", start: 4, end: 6, color: "#2d1b4e", bgColor: "bg-purple-950" },
    { label: "Early Morning", start: 6, end: 7, color: "#4c1d95", bgColor: "bg-purple-900" },
    { label: "Morning", start: 7, end: 9, color: "#0369a1", bgColor: "bg-sky-700" },
    { label: "Mid-Morning", start: 9, end: 10, color: "#06b6d4", bgColor: "bg-cyan-500" },
    { label: "Late Morning", start: 10, end: 12, color: "#84cc16", bgColor: "bg-lime-500" },
    { label: "Noon", start: 12, end: 13, color: "#fbbf24", bgColor: "bg-amber-400" },
    { label: "Midday", start: 13, end: 14, color: "#f59e0b", bgColor: "bg-amber-500" },
    { label: "Afternoon", start: 14, end: 17, color: "#f97316", bgColor: "bg-orange-500" },
    { label: "Late Afternoon", start: 17, end: 19, color: "#ea580c", bgColor: "bg-orange-600" },
    { label: "Early Evening", start: 19, end: 20, color: "#d946ef", bgColor: "bg-fuchsia-600" },
    { label: "Evening", start: 20, end: 22, color: "#7c3aed", bgColor: "bg-violet-600" },
    { label: "Late Evening", start: 22, end: 24, color: "#1e40af", bgColor: "bg-blue-800" },
  ];

  const getTimeOfDay = (timeStr: string): { label: string; color: string; bgColor: string } => {
    const [hours] = timeStr.split(":").map(Number);
    const timeOfDay = TIME_OF_DAY_CONFIG.find(t => hours >= t.start && hours < t.end);
    return timeOfDay || TIME_OF_DAY_CONFIG[0];
  };

  // Auto-balancing: only one category is locked (auto-calculated), others are editable
  const handleToggleLock = (category: 'work' | 'free' | 'other') => {
    // If toggling off (unlocking), just toggle
    if (category === 'work' && isWorkLocked) {
      setIsWorkLocked(false);
    } else if (category === 'free' && isFreeLocked) {
      setIsFreeLocked(false);
    } else if (category === 'other' && isOtherLocked) {
      setIsOtherLocked(false);
    } else {
      // Toggling on (locking) - need to unlock the current locked one
      setIsWorkLocked(category === 'work');
      setIsFreeLocked(category === 'free');
      setIsOtherLocked(category === 'other');
    }
  };

  const getSleepHours = () => {
    const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
    const [sleepHour, sleepMin] = sleepTime.split(':').map(Number);
    let hours = wakeHour - sleepHour;
    let minutes = wakeMin - sleepMin;
    if (minutes < 0) {
      hours--;
      minutes += 60;
    }
    if (hours <= 0) hours += 24;
    return hours + minutes / 60;
  };

  const timeLeftForDay = 24 - getSleepHours();

  const handleWorkChange = (v: number) => {
    if (!isWorkLocked) {
      setTargetWorkHours(v);
      // Auto-calculate other = timeLeftForDay - work - free
      const newOther = timeLeftForDay - v - targetFreeHours;
      setTargetOtherHours(Math.max(0, newOther));
    }
  };

  const handleFreeChange = (v: number) => {
    if (!isFreeLocked) {
      setTargetFreeHours(v);
      // Auto-calculate other = timeLeftForDay - work - free
      const newOther = timeLeftForDay - targetWorkHours - v;
      setTargetOtherHours(Math.max(0, newOther));
    }
  };

  const handleOtherChange = (v: number) => {
    if (!isOtherLocked) {
      setTargetOtherHours(v);
      // Auto-calculate free = timeLeftForDay - work - other
      const newFree = timeLeftForDay - targetWorkHours - v;
      setTargetFreeHours(Math.max(0, newFree));
    }
  };

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setGoalsList([...goalsList, newGoal]);
      setNewGoal("");
    }
  };

  const handleDeleteGoal = (idx: number) => {
    setGoalsList(goalsList.filter((_, i) => i !== idx));
  };

  const handleStartEditGoal = (idx: number) => {
    setEditingGoalIdx(idx);
    setEditingGoalText(goalsList[idx]);
  };

  const handleSaveGoal = (idx: number) => {
    if (editingGoalText.trim()) {
      const updated = [...goalsList];
      updated[idx] = editingGoalText;
      setGoalsList(updated);
    }
    setEditingGoalIdx(null);
    setEditingGoalText("");
  };

  const handleSavePreferences = async () => {
    try {
      if (totalHours > timeLeftForDay) {
        toast({
          title: "Invalid",
          description: `Total hours cannot exceed ${Math.floor(timeLeftForDay)}h (time available after sleep)`,
          variant: "destructive",
        });
        return;
      }
      await updatePreferences.mutateAsync({
        wakeTime,
        sleepTime,
        targetWorkHours,
        targetFreeHours,
        targetOtherHours,
        consecutiveStudyLimit,
        personalGoals: JSON.stringify(goalsList),
        scheduleGenerationTime,
        eveningPromptTime,
      });
      toast({
        title: "Preferences Saved",
        description: "Your scheduling preferences have been updated.",
      });
      setSettingsOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save preferences",
        variant: "destructive",
      });
    }
  };

  const totalHours = targetWorkHours + targetFreeHours + targetOtherHours;
  const isBalanceValid = totalHours <= timeLeftForDay;

  return (
    <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
            <button
              data-testid="button-logo"
              onClick={() => navigate("/home")}
              className="flex items-center gap-3 transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)]"
            >
              <div className="w-8 h-8 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg]">
                <span className="skew-x-[10deg]">F</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold font-display leading-none tracking-widest">
                  FORGE
                </h1>
                <span className="text-[9px] text-primary font-mono tracking-[0.2em] uppercase">
                  Acid Ops v3.1
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center text-xs font-mono text-muted-foreground gap-4">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary animate-pulse"></div>
                SYSTEM_ONLINE
              </span>
              <span className="text-white/10">|</span>
              <div className="flex flex-col items-end">
                <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                <span>{currentTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
                <span className="text-[#a7eb42]">{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                data-testid="button-home"
                onClick={() => navigate("/home")}
                size="sm"
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
                variant="outline"
              >
                TIMETABLE
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">
                  Schedule Builder
                </h2>
                <p className="text-sm font-mono text-muted-foreground">
                  {step === "builder"
                    ? "Choose how to build your schedule"
                    : "Review and finalize your schedule"}
                </p>
              </div>
            </div>
            <BackButton label="SCHEDULES" onClick={() => navigate("/schedules")} />
          </div>

          {/* Date Picker & Settings */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="font-mono text-sm text-muted-foreground">SELECT DATE</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setStep("builder");
                }}
                className="max-w-xs font-mono bg-background border-border text-sm accent-primary"
                data-testid="input-schedule-date"
              />
            </div>
            <Button
              data-testid="button-schedule-settings"
              onClick={() => setSettingsOpen(true)}
              variant="outline"
              size="sm"
              className="font-mono text-xs text-muted-foreground border border-border hover:text-black hover:bg-primary hover:border-primary transition-all duration-150 rounded-none uppercase tracking-widest mr-4"
            >
              <SettingsIcon className="w-3 h-3 mr-2" />
              Schedule Settings
            </Button>
          </div>

          {/* Schedule Settings Dialog */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="max-w-md border-border bg-background flex flex-col">
              <DialogHeader>
                <DialogTitle className="font-display">Schedule Settings</DialogTitle>
                <DialogDescription className="text-xs">
                  {settingsView === 'time' && "Configure your scheduling preferences for AI schedule generation"}
                  {settingsView === 'goals' && "Manage your personal goals and aspirations"}
                  {settingsView === 'prompt' && "Configure when you want to be prompted to create schedules"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1">
                {settingsView === "time" ? (
                  <>
                    <div className="space-y-4">
                    {/* Sleep/Wake Time */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono">Sleep Time</Label>
                        <Input
                          data-testid="input-sleep-time"
                          type="time"
                          value={sleepTime}
                          onChange={(e) => setSleepTime(e.target.value)}
                          className="text-xs font-mono bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono">Wake Time</Label>
                        <Input
                          data-testid="input-wake-time"
                          type="time"
                          value={wakeTime}
                          onChange={(e) => setWakeTime(e.target.value)}
                          className="text-xs font-mono bg-background border-border"
                        />
                      </div>
                    </div>

                    {/* Time Balance */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-mono flex items-center gap-1">
                          <Target className="w-3 h-3 text-primary" />
                          Time Balance
                        </Label>
                        <span className={`text-[10px] font-mono ${isBalanceValid ? "text-green-500" : "text-red-500"}`}>
                          {totalHours}h / {Math.floor(timeLeftForDay)}h
                        </span>
                      </div>

                      {/* Sleep and Time Left Report */}
                      <div className="pt-2 border-t border-border/30 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground">TIME SPENT SLEEPING:</span>
                          <span className="text-primary">
                            {(() => {
                              const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
                              const [sleepHour, sleepMin] = sleepTime.split(':').map(Number);
                              let hours = wakeHour - sleepHour;
                              let minutes = wakeMin - sleepMin;
                              if (minutes < 0) {
                                hours--;
                                minutes += 60;
                              }
                              if (hours <= 0) hours += 24;
                              return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground">TIME LEFT FOR DAY:</span>
                          <span className={`${24 - (() => {
                            const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
                            const [sleepHour, sleepMin] = sleepTime.split(':').map(Number);
                            let hours = wakeHour - sleepHour;
                            let minutes = wakeMin - sleepMin;
                            if (minutes < 0) {
                              hours--;
                              minutes += 60;
                            }
                            if (hours <= 0) hours += 24;
                            return hours + minutes / 60;
                          })() >= 0 ? "text-green-500" : "text-red-500"} font-mono`}>
                            {(() => {
                              const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
                              const [sleepHour, sleepMin] = sleepTime.split(':').map(Number);
                              let sleepHours = wakeHour - sleepHour;
                              let sleepMinutes = wakeMin - sleepMin;
                              if (sleepMinutes < 0) {
                                sleepHours--;
                                sleepMinutes += 60;
                              }
                              if (sleepHours <= 0) sleepHours += 24;
                              const totalSleep = sleepHours + sleepMinutes / 60;
                              const timeLeft = 24 - totalSleep;
                              const leftHours = Math.floor(timeLeft);
                              const leftMinutes = Math.round((timeLeft - leftHours) * 60);
                              return `${leftHours}h ${leftMinutes > 0 ? `${leftMinutes}m` : ''}`;
                            })()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span>Work Hours</span>
                          <div className="flex items-center gap-2">
                            <span className="text-primary">{targetWorkHours}h</span>
                            <Button
                              data-testid="button-lock-work"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleLock('work')}
                              className="h-4 w-4 p-0 hover:bg-primary/20"
                              title={isWorkLocked ? "This value auto-calculates" : "Click to auto-calculate this"}
                            >
                              {isWorkLocked ? <Lock className="w-3 h-3 text-primary" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Slider
                          min={0} max={Math.ceil(timeLeftForDay)} step={1}
                          value={[targetWorkHours]}
                          onValueChange={(v) => handleWorkChange(v[0])}
                          disabled={isWorkLocked}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span>Free Time</span>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">{targetFreeHours}h</span>
                            <Button
                              data-testid="button-lock-free"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleLock('free')}
                              className="h-4 w-4 p-0 hover:bg-primary/20"
                              title={isFreeLocked ? "This value auto-calculates" : "Click to auto-calculate this"}
                            >
                              {isFreeLocked ? <Lock className="w-3 h-3 text-primary" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Slider
                          min={0} max={Math.ceil(timeLeftForDay)} step={1}
                          value={[targetFreeHours]}
                          onValueChange={(v) => handleFreeChange(v[0])}
                          disabled={isFreeLocked}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span>Other</span>
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400">{targetOtherHours}h</span>
                            <Button
                              data-testid="button-lock-other"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleLock('other')}
                              className="h-4 w-4 p-0 hover:bg-primary/20"
                              title={isOtherLocked ? "This value auto-calculates" : "Click to auto-calculate this"}
                            >
                              {isOtherLocked ? <Lock className="w-3 h-3 text-primary" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Slider
                          min={0} max={Math.ceil(timeLeftForDay)} step={1}
                          value={[targetOtherHours]}
                          onValueChange={(v) => handleOtherChange(v[0])}
                          disabled={isOtherLocked}
                        />
                      </div>

                      {!isBalanceValid && (
                        <p className="text-[10px] font-mono text-red-500">Total hours exceed available time</p>
                      )}
                    </div>

                    {/* Consecutive Study */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <Label className="text-xs font-mono">Max Study Time Before Taking a Break</Label>
                        <span className="text-primary font-mono text-xs">{consecutiveStudyLimit} min</span>
                      </div>
                      <Slider
                        min={30} max={180} step={15}
                        value={[consecutiveStudyLimit]}
                        onValueChange={(v) => setConsecutiveStudyLimit(v[0])}
                      />
                    </div>
                  </div>
                </>
              ) : settingsView === "goals" ? (
                <>
                  <div className="space-y-4">
                    <Label className="text-xs font-mono">MY GOALS</Label>

                    {/* Goals List */}
                    <div className="space-y-1 max-h-[240px] overflow-y-auto">
                      {goalsList.map((goal, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-primary/10 border border-primary/30 rounded text-xs font-mono group"
                        >
                          {editingGoalIdx === idx ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                autoFocus
                                type="text"
                                value={editingGoalText}
                                onChange={(e) => setEditingGoalText(e.target.value)}
                                onBlur={() => handleSaveGoal(idx)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveGoal(idx);
                                }}
                                className="flex-1 bg-primary/20 text-foreground px-2 py-1 border border-primary/50 rounded text-xs font-mono"
                                data-testid={`input-goal-${idx}`}
                              />
                            </div>
                          ) : (
                            <>
                              <span
                                onClick={() => handleStartEditGoal(idx)}
                                className="flex-1 cursor-pointer hover:text-primary text-foreground"
                                data-testid={`text-goal-${idx}`}
                              >
                                {goal}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteGoal(idx)}
                                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-delete-goal-${idx}`}
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add New Goal */}
                    <div className="flex gap-2 pt-2">
                      <Input
                        type="text"
                        placeholder="Add new goal..."
                        value={newGoal}
                        onChange={(e) => setNewGoal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddGoal();
                        }}
                        className="flex-1 text-xs font-mono bg-background border-border"
                        data-testid="input-new-goal"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddGoal}
                        className="bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none px-3"
                        data-testid="button-add-goal"
                      >
                        ADD
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    <Label className="text-xs font-mono">SCHEDULE GENERATION TIMES</Label>
                    
                    <div className="space-y-4 p-4 border border-primary/30 rounded bg-primary/5">
                      <div className="space-y-2">
                        <Label className="text-xs font-mono text-muted-foreground">
                          Configure automatic schedule generation times
                        </Label>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Set when you want schedules to be automatically generated and when you should be prompted to plan for tomorrow.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-mono">Morning Generation Time</Label>
                          <span className="text-primary font-mono text-sm font-bold">{scheduleGenerationTime}</span>
                        </div>
                        <Input
                          data-testid="input-schedule-generation-time"
                          type="time"
                          value={scheduleGenerationTime}
                          onChange={(e) => setScheduleGenerationTime(e.target.value)}
                          className="text-sm font-mono bg-background border-primary/50 h-12"
                        />
                        <p className="text-[10px] text-muted-foreground mt-2">
                          If you haven't created a schedule by <span className="text-primary font-bold">{scheduleGenerationTime}</span>, 
                          one will be automatically generated for you.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-mono">Evening Prompt Time</Label>
                          <span className="text-primary font-mono text-sm font-bold">{eveningPromptTime}</span>
                        </div>
                        <Input
                          data-testid="input-evening-prompt-time"
                          type="time"
                          value={eveningPromptTime}
                          onChange={(e) => setEveningPromptTime(e.target.value)}
                          className="text-sm font-mono bg-background border-primary/50 h-12"
                        />
                        <p className="text-[10px] text-muted-foreground mt-2">
                          After <span className="text-primary font-bold">{eveningPromptTime}</span>, 
                          you'll be prompted to plan for tomorrow instead of today.
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border/30">
                        <div className="flex items-start gap-2">
                          <div className="w-1 h-1 bg-primary rounded-full mt-1.5"></div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            <span className="text-primary font-bold">Tip:</span> Most people find 6 AM ideal for morning generation 
                            and 6 PM - 8 PM ideal for evening planning, creating a balanced daily rhythm.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSettingsOpen(false)}
                  size="sm"
                  className="border-border font-mono text-[10px] rounded-none h-7 px-2"
                >
                  Cancel
                </Button>
                <div className="flex gap-1">
                  {settingsView !== 'time' && (
                    <Button
                      size="sm"
                      onClick={() => setSettingsView('time')}
                      className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono text-[10px] rounded-none uppercase h-7 px-2"
                      data-testid="button-view-time"
                    >
                      TIME
                    </Button>
                  )}
                  {settingsView !== 'goals' && (
                    <Button
                      size="sm"
                      onClick={() => setSettingsView('goals')}
                      className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono text-[10px] rounded-none uppercase h-7 px-2"
                      data-testid="button-view-goals"
                    >
                      MANAGE GOALS
                    </Button>
                  )}
                  {settingsView !== 'prompt' && (
                    <Button
                      size="sm"
                      onClick={() => setSettingsView('prompt')}
                      className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono text-[10px] rounded-none uppercase h-7 px-2"
                      data-testid="button-view-prompt"
                    >
                      GENERATION TIMES
                    </Button>
                  )}
                </div>
                <Button
                  data-testid="button-save-settings"
                  onClick={handleSavePreferences}
                  disabled={updatePreferences.isPending || !isBalanceValid}
                  size="sm"
                  className="bg-primary text-black hover:bg-primary/90 font-mono text-[10px] rounded-none uppercase h-7 px-2"
                >
                  {updatePreferences.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3 mr-1" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {step === "builder" ? (
            // Builder Options
            (<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* AI Template Option */}
              <Card
                className="border-border bg-black/50 cursor-pointer hover:border-primary/50 transition-all"
                data-testid="card-ai-template"
                onClick={handleAITemplate}
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <CardTitle className="font-display text-base">AI Template</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Let AI generate an optimal schedule based on your commitments and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs text-muted-foreground mb-4">
                    <p>✓ Considers your time balance targets</p>
                    <p>✓ Respects wake/sleep times</p>
                    <p>✓ Prioritizes deadlines</p>
                    <p>✓ Includes activities from library</p>
                  </div>
                  <Button
                    disabled={aiLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAITemplate();
                    }}
                    className="w-full bg-yellow-600 text-white hover:bg-yellow-700 rounded-none font-mono text-xs uppercase"
                    data-testid="button-generate-ai-template"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        Generate
                        <ChevronRight className="w-3 h-3 ml-2" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
              {/* Recent Schedule Option */}
              <Card
                className="border-border bg-black/50 cursor-pointer hover:border-primary/50 transition-all"
                data-testid="card-recent-schedule"
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <CardTitle className="font-display text-base">Recent Schedule</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Use your most recent schedule as a template and customize it
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs text-muted-foreground mb-4">
                    <p>✓ Familiar structure</p>
                    <p>✓ Quick customization</p>
                    <p>✓ Consistent routine</p>
                    <p>✓ Easy to modify</p>
                  </div>
                  <Button
                    disabled={recentLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRecentSchedule();
                    }}
                    className="w-full bg-blue-600 text-white hover:bg-blue-700 rounded-none font-mono text-xs uppercase"
                    data-testid="button-use-recent-schedule"
                  >
                    {recentLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load
                        <ChevronRight className="w-3 h-3 ml-2" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
              {/* Chat to Build Option */}
              <Card
                className="border-border bg-black/50 hover:border-primary/50 transition-all"
                data-testid="card-chat-build"
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <MessageSquare className="w-5 h-5 text-green-400" />
                    <CardTitle className="font-display text-base">Chat to Build</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Describe what you want and let AI build it collaboratively
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs text-muted-foreground mb-4">
                    <p>✓ Full control</p>
                    <p>✓ Custom requests</p>
                    <p>✓ Interactive building</p>
                    <p>✓ Precise schedule</p>
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/chat-builder?date=${selectedDate}`);
                    }}
                    className="w-full bg-green-600 text-white hover:bg-green-700 rounded-none font-mono text-xs uppercase"
                    data-testid="button-chat-build"
                  >
                    Let&apos;s Build
                    <ChevronRight className="w-3 h-3 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>)
          ) : (
            // Review Step
            (<div className="space-y-6">
              {draftSchedule ? (
                <>
                  <Card className="border-border bg-black/50">
                    <CardHeader>
                      <CardTitle className="font-display">AI Reasoning</CardTitle>
                      <CardDescription className="text-xs mt-2">
                        {draftSchedule.aiReasoning}
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="border-border bg-black/50">
                    <CardHeader>
                      <CardTitle className="font-mono text-sm mb-4">
                        Schedule Template for {selectedDate}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Activity timeline - click Edit Schedule to modify titles, times, and reorder
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {(() => {
                          // Group consecutive blocks by time-of-day
                          const groups: Array<{
                            label: string;
                            color: string;
                            blocks: Array<{ block: any; idx: number }>;
                          }> = [];
                          
                          editedBlocks.forEach((block, idx) => {
                            const timeOfDay = getTimeOfDay(block.startTime);
                            const lastGroup = groups[groups.length - 1];
                            
                            if (lastGroup && lastGroup.label === timeOfDay.label) {
                              // Add to existing group
                              lastGroup.blocks.push({ block, idx });
                            } else {
                              // Create new group
                              groups.push({
                                label: timeOfDay.label,
                                color: timeOfDay.color,
                                blocks: [{ block, idx }],
                              });
                            }
                          });
                          
                          return groups.map((group, groupIdx) => (
                            <div key={groupIdx} className="border-l-4 pl-3" style={{ borderLeftColor: group.color }}>
                              {/* Section Header - Drop Zone */}
                              <div 
                                className="mb-2 transition-all duration-200"
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  setHoveredTimeOfDay(group.label);
                                }}
                                onDragLeave={() => setHoveredTimeOfDay(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  handleDropOnTimeOfDay(group.label, group.blocks[0].idx);
                                }}
                              >
                                <span 
                                  onDoubleClick={() => handleDoubleClickTimeOfDay(group.label)}
                                  className={`font-mono text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1 px-2 py-1 rounded transition-all cursor-pointer ${
                                    hoveredTimeOfDay === group.label 
                                      ? 'bg-primary/20 scale-105' 
                                      : ''
                                  }`}
                                  style={{ color: group.color }}
                                  data-testid={`header-${group.label.replace(/\s+/g, '-').toLowerCase()}`}
                                >
                                  {hoveredTimeOfDay === group.label && (
                                    <span className="text-primary font-bold">+</span>
                                  )}
                                  {group.label}
                                </span>
                              </div>
                              
                              {/* Activities in this time period */}
                              <div className="space-y-1">
                                {group.blocks.map(({ block, idx }) => (
                                  <div
                                    key={idx}
                                    draggable
                                    onDragStart={(e) => handleDragStart(idx, e)}
                                    onDragOver={handleDragOver}
                                    onDrop={() => handleDrop(idx)}
                                    className="p-2 hover:bg-primary/5 rounded transition-colors cursor-move"
                                    data-testid={`template-block-${idx}`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-muted-foreground">→</span>
                                      {editingIdx === idx ? (
                                        <div className="flex items-center gap-2 flex-1">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={editingTitle}
                                            onChange={(e) => setEditingTitle(e.target.value)}
                                            onBlur={() => handleSaveTitle(idx)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveTitle(idx);
                                            }}
                                            className="font-mono text-sm bg-primary/20 text-foreground px-2 py-1 border border-primary/50 rounded flex-1"
                                            data-testid={`input-title-${idx}`}
                                          />
                                          <button
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              handleDeleteBlock(idx);
                                            }}
                                            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1 rounded transition-colors cursor-pointer"
                                            data-testid={`button-delete-block-${idx}`}
                                            title="Delete block"
                                            type="button"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ) : (
                                        <span
                                          onClick={() => handleStartEdit(idx)}
                                          className="font-mono text-sm text-foreground cursor-pointer hover:text-primary hover:underline flex-1"
                                          data-testid={`text-title-${idx}`}
                                        >
                                          {block.title.replace(/^\[.*?\]\s*/, '')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep("builder")}
                      className="flex-1 border-border font-mono text-xs rounded-none"
                      data-testid="button-back-to-builder"
                    >
                      Back to Builder
                    </Button>
                    {hasChanges ? (
                      <Button
                        onClick={handleProcessSchedule}
                        disabled={processing}
                        className="flex-1 bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none uppercase"
                        data-testid="button-process-schedule"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-2" />
                            PROCESS
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleEditDetails}
                        disabled={processing}
                        className="flex-1 bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none uppercase"
                        data-testid="button-edit-details"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-2" />
                            EDIT SCHEDULE DETAILS
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <Card className="border-border bg-black/50">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No schedule generated yet. Please try again or choose a different option.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>)
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}