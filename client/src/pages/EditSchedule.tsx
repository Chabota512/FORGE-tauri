
import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, Save, Sparkles, AlertCircle, ChevronDown } from "lucide-react";
import BackButton from "@/components/BackButton";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useDraftSchedule, useFinalizeSchedule, useEnrichSchedule, useUserPreferences, calculateTimeBalance, useAnalyzeActivityDetails, useUpdateDraftSchedule, type TimeBlock, type UnknownActivity } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProgressDialog } from "@/components/ui/progress-dialog";
import { getApiUrl } from "@/lib/queryClient";

export default function EditSchedulePage() {
  const [location, navigate] = useLocation();
  const [match, params] = useRoute("/edit-schedule/:date");
  const { toast } = useToast();
  const scheduleDate = params?.date || "";
  
  // Extract the 'from' parameter to know which page to go back to
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sourceMethod = urlParams.get('from') || 'builder';
  
  const { data: draftSchedule, isLoading } = useDraftSchedule(scheduleDate);
  const { data: preferences } = useUserPreferences();
  const finalize = useFinalizeSchedule();
  const enrich = useEnrichSchedule();
  const analyzeDetails = useAnalyzeActivityDetails();
  const updateDraft = useUpdateDraftSchedule();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [editPhase, setEditPhase] = useState<"edit_titles" | "review_details">("review_details");
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [draggedBlock, setDraggedBlock] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  
  // Unknown activity dialog state
  const [unknownDialogOpen, setUnknownDialogOpen] = useState(false);
  const [unknownActivities, setUnknownActivities] = useState<UnknownActivity[]>([]);
  const [currentUnknownIndex, setCurrentUnknownIndex] = useState(0);
  const [currentUnknownAnswer, setCurrentUnknownAnswer] = useState("");
  const [unknownAnswers, setUnknownAnswers] = useState<Record<string, string>>({});

  // Phase 2 editing state
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [expandedActivityIndex, setExpandedActivityIndex] = useState<number | null>(null);
  const [relevantFieldsByIndex, setRelevantFieldsByIndex] = useState<Record<number, string[]>>({});
  const [preGeneratedDetails, setPreGeneratedDetails] = useState<Record<number, any>>({}); // Pre-generated from PROCESS
  const [generatedDetailsLoading, setGeneratedDetailsLoading] = useState<Set<number>>(new Set());
  
  // Progress dialog state
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [progressItems, setProgressItems] = useState<Array<{id: string; title: string; status: 'pending' | 'processing' | 'success' | 'error'; message?: string}>>([]);
  const [progressCurrent, setProgressCurrent] = useState(0);

  const toggleActivity = async (idx: number) => {
    setExpandedActivityIndex(expandedActivityIndex === idx ? null : idx);
    // Populate generated details when expanding for the first time
    if (expandedActivityIndex !== idx && !relevantFieldsByIndex[idx]) {
      const block = blocks[idx];
      if (block?.title && block?.description) {
        // Check if we have pre-generated details from PROCESS
        if (preGeneratedDetails[idx]) {
          const { details, fields } = preGeneratedDetails[idx];
          
          // Map field names from API to block properties
          const fieldMap: Record<string, string> = {
            "Description": "description",
            "Reason": "reason",
            "Goal/Outcome": "goal",
            "Resources": "resourcesNeeded",
            "Location": "location",
            "Collaborators": "collaborators",
            "Dependencies": "dependencies",
            "Predict Difficulty Level": "difficultyLevel",
            "Energy Required": "energyRequired",
            "Buffer Time": "bufferTimeAfter",
            "Reminder": "reminder",
            "Success Metrics": "successMetrics"
          };
          
          // Transform generated details to match block properties
          const mappedDetails: Record<string, any> = {};
          for (const [apiName, value] of Object.entries(details)) {
            const blockProp = fieldMap[apiName] || apiName;
            let finalValue = value;
            
            // Normalize numeric fields (divide by 2 if > 5)
            if ((apiName === "Predict Difficulty Level" || apiName === "Energy Required") && typeof value === 'string') {
              const numVal = parseInt(value);
              if (numVal > 5) {
                finalValue = Math.round(numVal / 2).toString();
              }
            }
            
            mappedDetails[blockProp] = finalValue;
          }
          
          // Populate block with pre-generated details
          const updated = { ...block, ...mappedDetails };
          const newBlocks = [...blocks];
          newBlocks[idx] = updated;
          setBlocks(newBlocks);
          
          // Store relevant fields
          setRelevantFieldsByIndex(prev => ({
            ...prev,
            [idx]: fields
          }));
          return;
        }
        
        // Fallback: generate on-demand if not pre-generated
        setGeneratedDetailsLoading(prev => new Set(prev).add(idx));
        
        try {
          // Get generated details from generate-details endpoint (with timeout)
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
          
          const response = await fetch(getApiUrl("/api/activities/generate-details"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: block.title,
              description: block.description,
              type: block.type
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          
          if (response.ok) {
            const data = await response.json();
            const enrichedBlock = {
              generatedDetails: data.generatedDetails,
              detailFields: data.detailFields
            };
            
            if (enrichedBlock?.generatedDetails) {
              // Map field names from API to block properties
              const fieldMap: Record<string, string> = {
                "Description": "description",
                "Reason": "reason",
                "Goal/Outcome": "goal",
                "Resources": "resourcesNeeded",
                "Location": "location",
                "Collaborators": "collaborators",
                "Dependencies": "dependencies",
                "Predict Difficulty Level": "difficultyLevel",
                "Energy Required": "energyRequired",
                "Buffer Time": "bufferTimeAfter",
                "Reminder": "reminder",
                "Success Metrics": "successMetrics"
              };
              
              // Transform generated details to match block properties
              const mappedDetails: Record<string, any> = {};
              for (const [apiName, value] of Object.entries(enrichedBlock.generatedDetails)) {
                const blockProp = fieldMap[apiName] || apiName;
                mappedDetails[blockProp] = value;
              }
              
              // Populate block with generated details
              const updated = { ...block, ...mappedDetails };
              const newBlocks = [...blocks];
              newBlocks[idx] = updated;
              setBlocks(newBlocks);
              
              // Store relevant fields
              if (enrichedBlock.detailFields) {
                setRelevantFieldsByIndex(prev => ({
                  ...prev,
                  [idx]: enrichedBlock.detailFields.map((f: any) => f.name)
                }));
              }
            } else {
              // Fallback: analyze without generation
              analyzeDetails.mutate({
                title: block.title,
                description: block.description,
              }, {
                onSuccess: (data) => {
                  setRelevantFieldsByIndex(prev => ({
                    ...prev,
                    [idx]: data.relevantFields,
                  }));
                },
              });
            }
          }
        } catch (error) {
          console.error("Failed to generate details:", error);
          // Fallback to analyze-only
          analyzeDetails.mutate({
            title: block.title,
            description: block.description,
          }, {
            onSuccess: (data) => {
              setRelevantFieldsByIndex(prev => ({
                ...prev,
                [idx]: data.relevantFields,
              }));
            },
          });
        } finally {
          setGeneratedDetailsLoading(prev => {
            const next = new Set(prev);
            next.delete(idx);
            return next;
          });
        }
      }
    }
  };

  // Helper to check if a field is relevant
  const isFieldRelevant = (idx: number, fieldName: string): boolean => {
    const relevant = relevantFieldsByIndex[idx];
    if (!relevant) return true; // Show all if not analyzed yet
    return relevant.includes(fieldName);
  };

  useEffect(() => {
    if (draftSchedule?.timeBlocks) {
      setBlocks([...draftSchedule.timeBlocks]);
      // If pre-generated details exist (from PROCESS), populate them
      if ((draftSchedule as any).enrichedBlocks) {
        const preGenerated: Record<number, any> = {};
        (draftSchedule as any).enrichedBlocks.forEach((block: any, idx: number) => {
          if (block.generatedDetails && block.detailFields) {
            preGenerated[idx] = {
              details: block.generatedDetails,
              fields: block.detailFields.map((f: any) => f.name)
            };
          }
        });
        setPreGeneratedDetails(preGenerated);
      }
      // If coming from finalized draft, start in review phase
      if (draftSchedule.aiReasoning) {
        setEditPhase("review_details");
      }
    }
  }, [draftSchedule]);

  // Save blocks to localStorage whenever they change for temporary persistence
  useEffect(() => {
    if (blocks.length > 0) {
      localStorage.setItem("draftScheduleBlocks", JSON.stringify(blocks));
      localStorage.setItem("draftScheduleDate", scheduleDate);
    }
  }, [blocks, scheduleDate]);

  // Auto-generate details for all activities when page loads (from batch processing)
  useEffect(() => {
    if (blocks.length > 0 && Object.keys(preGeneratedDetails).length === 0) {
      // Only trigger if we don't already have pre-generated details
      triggerDetailGeneration(blocks);
    }
  }, [blocks.length]);


  const DEFAULT_DETAILS: Record<string, string> = {
    "Description": "Complete the activity as planned",
    "Reason": "Important for progress and development",
    "Goal/Outcome": "Achieve the intended result",
    "Resources": "Gather materials and tools as needed",
    "Location": "Choose appropriate location",
    "Predict Difficulty Level": "3",
    "Energy Required": "3",
    "Collaborators": "Work independently or with partners",
    "Dependencies": "Complete prerequisites first",
    "Buffer Time": "5",
    "Reminder": "10",
    "Success Metrics": "Measure completion by standards"
  };

  const triggerDetailGeneration = async (blocksToProcess?: TimeBlock[]) => {
    const blocksForGeneration = blocksToProcess || blocks;
    
    // Initialize progress dialog
    const initialItems = blocksForGeneration.map((block, idx) => ({
      id: `block-${idx}`,
      title: block.title,
      status: 'pending' as const,
      message: ''
    }));
    setProgressItems(initialItems);
    setProgressCurrent(0);
    setProgressDialogOpen(true);

    const fieldMap: Record<string, string> = {
      "Description": "description",
      "Reason": "reason",
      "Goal/Outcome": "goal",
      "Resources": "resourcesNeeded",
      "Location": "location",
      "Collaborators": "collaborators",
      "Dependencies": "dependencies",
      "Predict Difficulty Level": "difficultyLevel",
      "Energy Required": "energyRequired",
      "Buffer Time": "bufferTimeAfter",
      "Reminder": "reminder",
      "Success Metrics": "successMetrics"
    };

    const preGenerated: Record<number, any> = {};
    const updatedBlocks = [...blocksForGeneration];

    // Process each block sequentially for real-time progress
    for (let idx = 0; idx < blocksForGeneration.length; idx++) {
      const block = blocksForGeneration[idx];
      
      // Update progress: mark as processing
      setProgressItems(prev => prev.map(item => 
        item.id === `block-${idx}` 
          ? { ...item, status: 'processing', message: 'Filtering and generating details...' }
          : item
      ));

      try {
        const response = await fetch(getApiUrl("/api/activities/generate-details"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: block.title,
            description: block.description,
            type: block.type
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.detailFields && data.detailFields.length > 0) {
            const details = data.generatedDetails || {};
            const populatedDetails: Record<string, string> = {};
            
            data.detailFields.forEach((field: any) => {
              const fieldName = field.name;
              let value = details[fieldName];
              
              // Normalize numeric fields
              if (fieldName === "Predict Difficulty Level" && value) {
                const numVal = parseInt(value);
                if (numVal > 5) {
                  value = Math.round(numVal / 2).toString();
                }
              }
              if (fieldName === "Energy Required" && value) {
                const numVal = parseInt(value);
                if (numVal > 5) {
                  value = Math.round(numVal / 2).toString();
                }
              }
              
              populatedDetails[fieldName] = (value && value.toString().trim()) ? value.toString().trim() : DEFAULT_DETAILS[fieldName] || '';
            });
            
            preGenerated[idx] = {
              details: populatedDetails,
              fields: data.detailFields.map((f: any) => f.name)
            };

            // Apply to block
            const mappedDetails: Record<string, any> = {};
            for (const [apiName, value] of Object.entries(populatedDetails)) {
              const blockProp = fieldMap[apiName] || apiName;
              mappedDetails[blockProp] = value;
            }
            updatedBlocks[idx] = { ...block, ...mappedDetails };

            // Update progress: mark as success
            setProgressItems(prev => prev.map(item => 
              item.id === `block-${idx}` 
                ? { ...item, status: 'success', message: `${data.detailFields.length} fields filled` }
                : item
            ));
          } else {
            setProgressItems(prev => prev.map(item => 
              item.id === `block-${idx}` 
                ? { ...item, status: 'success', message: 'No relevant fields' }
                : item
            ));
          }
        } else {
          throw new Error('API request failed');
        }
      } catch (error) {
        console.error(`Error processing block ${idx}:`, error);
        setProgressItems(prev => prev.map(item => 
          item.id === `block-${idx}` 
            ? { ...item, status: 'error', message: 'Failed to generate' }
            : item
        ));
      }

      setProgressCurrent(idx + 1);
    }

    setPreGeneratedDetails(preGenerated);
    
    // Use functional update to merge generated details into current blocks
    // This prevents overwriting user edits made during generation
    setBlocks(currentBlocks => {
      return currentBlocks.map((block, idx) => {
        const generated = preGenerated[idx];
        if (generated?.details) {
          const mappedDetails: Record<string, any> = {};
          for (const [apiName, value] of Object.entries(generated.details)) {
            const blockProp = fieldMap[apiName] || apiName;
            mappedDetails[blockProp] = value;
          }
          return { ...block, ...mappedDetails };
        }
        return block;
      });
    });

    // Persist to database - get latest blocks state
    try {
      await updateDraft.mutateAsync({
        date: scheduleDate,
        timeBlocks: updatedBlocks
      });
      
      toast({
        title: "Details Generated & Saved",
        description: `Successfully processed ${blocksForGeneration.length} activities`,
      });
    } catch (error: any) {
      toast({
        title: "Warning",
        description: "Details generated but not saved to database",
        variant: "destructive",
      });
    }

    // Close progress dialog after a brief delay
    setTimeout(() => {
      setProgressDialogOpen(false);
    }, 1500);
  };

  const handleDragStart = (index: number) => {
    setDraggedBlock(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedBlock === null || draggedBlock === dropIndex) return;

    const newBlocks = [...blocks];
    const draggedItem = newBlocks[draggedBlock];
    
    newBlocks.splice(draggedBlock, 1);
    newBlocks.splice(dropIndex, 0, draggedItem);
    
    setBlocks(newBlocks);
    setDraggedBlock(null);
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
  };

  const handleTitleChange = (index: number, newTitle: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], title: newTitle };
    setBlocks(newBlocks);
  };

  const handleStartTimeChange = (index: number, newStartTime: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], startTime: newStartTime };
    setBlocks(newBlocks);
  };

  const handleEndTimeChange = (index: number, newEndTime: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], endTime: newEndTime };
    setBlocks(newBlocks);
  };

  const handleDescriptionChange = (index: number, newDescription: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], description: newDescription };
    setBlocks(newBlocks);
  };

  const handleReasonChange = (index: number, newReason: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], reason: newReason } as any;
    setBlocks(newBlocks);
  };

  const handleFieldChange = (index: number, field: string, value: any) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    setBlocks(newBlocks);
  };

  // Separate blocking errors from non-blocking warnings
  const [balanceWarnings, setBalanceWarnings] = useState<string[]>([]);
  
  const validateSchedule = (newBlocks: TimeBlock[]): string[] => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!preferences) return errors;

    // Calculate time balance
    const balance = calculateTimeBalance(newBlocks);

    // Time balance checks are now WARNINGS, not blockers
    if (balance.work > preferences.targetWorkHours) {
      warnings.push(`Work hours (${balance.work.toFixed(1)}h) exceed target (${preferences.targetWorkHours}h)`);
    }
    if (balance.free > preferences.targetFreeHours) {
      warnings.push(`Free hours (${balance.free.toFixed(1)}h) exceed target (${preferences.targetFreeHours}h)`);
    }
    if (balance.other > preferences.targetOtherHours) {
      warnings.push(`Other hours (${balance.other.toFixed(1)}h) exceed target (${preferences.targetOtherHours}h)`);
    }

    // Check for overlaps - these ARE blocking errors
    for (let i = 0; i < newBlocks.length - 1; i++) {
      const current = newBlocks[i];
      const next = newBlocks[i + 1];
      if (current.endTime > next.startTime) {
        errors.push(`Block "${current.title}" overlaps with "${next.title}"`);
      }
    }

    // Wake/sleep time bounds are warnings, not blockers
    const wakeMinutes = timeToMinutes(preferences.wakeTime);
    const sleepMinutes = timeToMinutes(preferences.sleepTime);
    
    newBlocks.forEach((block) => {
      const startMin = timeToMinutes(block.startTime);
      const endMin = timeToMinutes(block.endTime);
      
      if (startMin < wakeMinutes) {
        warnings.push(`"${block.title}" starts before wake time (${preferences.wakeTime})`);
      }
      if (endMin > sleepMinutes) {
        warnings.push(`"${block.title}" ends after sleep time (${preferences.sleepTime})`);
      }
    });

    // Consecutive study limit is a warning, not a blocker
    let consecutiveStudyMinutes = 0;
    for (let i = 0; i < newBlocks.length; i++) {
      const block = newBlocks[i];
      const typeStr = (block.type || "").toLowerCase();
      const isStudyWork = typeStr.includes("study") || typeStr.includes("class") || 
                          typeStr.includes("mission") || typeStr.includes("exam") || 
                          typeStr.includes("assignment");
      
      if (isStudyWork) {
        const startMin = timeToMinutes(block.startTime);
        const endMin = timeToMinutes(block.endTime);
        const duration = endMin - startMin;
        consecutiveStudyMinutes += duration;
        
        if (consecutiveStudyMinutes > preferences.consecutiveStudyLimit) {
          warnings.push(`"${block.title}" exceeds consecutive study limit (${preferences.consecutiveStudyLimit} min) without break`);
        }
      } else if (typeStr.includes("break")) {
        consecutiveStudyMinutes = 0;
      }
    }

    // Update warnings state for display
    setBalanceWarnings(warnings);

    // Only return blocking errors (overlaps)
    return errors;
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const handleDurationChange = (index: number, newEndTime: string) => {
    const newBlocks = [...blocks];
    const block = newBlocks[index];
    
    // Validate that end time is after start time
    if (newEndTime <= block.startTime) {
      toast({
        title: "Invalid Duration",
        description: "End time must be after start time",
        variant: "destructive",
      });
      return;
    }

    // Update the block
    newBlocks[index] = { ...block, endTime: newEndTime };
    
    // If not the last block, adjust the next block's start time
    if (index < newBlocks.length - 1) {
      newBlocks[index + 1] = { ...newBlocks[index + 1], startTime: newEndTime };
    }

    // Validate the new schedule
    const errors = validateSchedule(newBlocks);
    setValidationErrors(errors);

    if (errors.length === 0) {
      setBlocks(newBlocks);
    } else {
      // Still update for real-time feedback, but show errors
      setBlocks(newBlocks);
    }
  };

  const handleProcess = async () => {
    try {
      setProcessing(true);
      const response = await enrich.mutateAsync({
        scheduleDate,
        timeBlocks: blocks,
      });

      if (response.unknownActivities && response.unknownActivities.length > 0) {
        setUnknownActivities(response.unknownActivities);
        setCurrentUnknownIndex(0);
        setCurrentUnknownAnswer("");
        setUnknownDialogOpen(true);
        // Store enriched blocks for later
        setBlocks(response.enrichedBlocks);
      } else {
        setBlocks(response.enrichedBlocks);
        // Trigger generation BEFORE moving to Stage 3
        await triggerDetailGeneration(response.enrichedBlocks);
        setEditPhase("review_details");
        toast({
          title: "Schedule Processed",
          description: "Activity details have been enriched",
        });
      }
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

  const handleUnknownActivityNext = () => {
    const currentActivity = unknownActivities[currentUnknownIndex];
    if (!currentUnknownAnswer.trim()) {
      toast({
        title: "Answer Required",
        description: "Please provide a description for this activity",
        variant: "destructive",
      });
      return;
    }

    // Save the answer
    setUnknownAnswers({
      ...unknownAnswers,
      [currentActivity.title]: currentUnknownAnswer,
    });

    if (currentUnknownIndex < unknownActivities.length - 1) {
      setCurrentUnknownIndex(currentUnknownIndex + 1);
      setCurrentUnknownAnswer("");
    } else {
      // All answered, update blocks with descriptions and move to phase 2
      handleCompleteUnknownActivities();
    }
  };

  const handleCompleteUnknownActivities = async () => {
    setUnknownDialogOpen(false);
    
    // Update blocks with user-provided descriptions
    const updatedBlocks = blocks.map(block => {
      const answer = unknownAnswers[block.title];
      if (answer) {
        return { ...block, description: answer };
      }
      return block;
    });

    setBlocks(updatedBlocks);
    // Trigger generation BEFORE moving to Stage 3
    setProcessing(true);
    try {
      await triggerDetailGeneration(updatedBlocks);
    } finally {
      setProcessing(false);
    }
    setEditPhase("review_details");
    toast({
      title: "Schedule Updated",
      description: "All activity details have been added. Review and finalize when ready.",
    });
  };

  const handleFinalize = async () => {
    // Validate before finalizing - only blocking errors (overlaps) will be returned
    const errors = validateSchedule(blocks);
    if (errors.length > 0) {
      toast({
        title: "Cannot Finalize",
        description: "Please fix overlapping blocks first",
        variant: "destructive",
      });
      return;
    }

    // Show warning if there are balance warnings but proceed anyway
    if (balanceWarnings.length > 0) {
      toast({
        title: "Note: Time Balance Exceeded",
        description: `Your schedule has ${balanceWarnings.length} time balance warning(s). Finalizing anyway.`,
      });
    }

    try {
      setFinalizing(true);
      
      // Save any edited blocks before finalizing
      await updateDraft.mutateAsync({
        date: scheduleDate,
        timeBlocks: blocks
      });
      
      await finalize.mutateAsync(scheduleDate);
      
      // Clear temporary draft storage
      localStorage.removeItem("draftScheduleBlocks");
      localStorage.removeItem("draftScheduleDate");
      
      toast({
        title: "Schedule Finalized",
        description: "Your schedule is now active!",
      });
      setTimeout(() => navigate("/timetable"), 1500);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize schedule",
        variant: "destructive",
      });
    } finally {
      setFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading schedule...</p>
      </div>
    );
  }

  if (!draftSchedule) {
    return (
      <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
          <div className="container mx-auto px-4 h-16 flex items-center gap-3">
            <BackButton label="SCHEDULES" onClick={() => navigate("/schedules")} />
            <h1 className="font-display text-lg tracking-widest">EDIT SCHEDULE</h1>
          </div>
        </header>
        <main className="flex-1 container mx-auto px-4 py-8">
          <Card className="border-border bg-black/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-8">
                No schedule found. Please generate a schedule first.
              </p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const currentUnknown = unknownActivities[currentUnknownIndex];
  
  // Calculate current time balance
  const timeBalance = calculateTimeBalance(blocks);
  const targetWork = preferences?.targetWorkHours || 6;
  const targetFree = preferences?.targetFreeHours || 4;
  const targetOther = preferences?.targetOtherHours || 4;

  const getBalanceColor = (actual: number, target: number): string => {
    if (actual > target) return "text-red-500";
    if (actual >= target * 0.9) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center gap-3">
          <BackButton label="SCHEDULES" onClick={() => navigate("/schedules")} />
          <h1 className="font-display text-lg tracking-widest">
            REVIEW DETAILS
          </h1>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Blocking Errors (Overlaps) */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-950/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-semibold text-xs">Blocking Errors (must fix before finalizing):</div>
                  {validationErrors.map((error, idx) => (
                    <div key={idx} className="text-[10px] font-mono">• {error}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Non-blocking Warnings (Balance, Wake/Sleep) */}
          {balanceWarnings.length > 0 && (
            <Alert className="border-yellow-500/50 bg-yellow-950/20">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-semibold text-xs text-yellow-400">Warnings (you can still finalize):</div>
                  {balanceWarnings.map((warning, idx) => (
                    <div key={idx} className="text-[10px] font-mono text-yellow-300">• {warning}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Time Balance Display */}
          {preferences && (
            <Card className="border-border bg-black/50" data-testid="time-balance-card">
              <CardHeader>
                <CardTitle className="font-mono text-sm">Time Balance</CardTitle>
                <CardDescription className="text-xs">
                  Current allocation vs. target preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">
                        Work Hours
                      </div>
                      <div className={`text-lg font-bold ${getBalanceColor(timeBalance.work, targetWork)}`} data-testid="balance-work">
                        {timeBalance.work.toFixed(1)}h / {targetWork}h
                      </div>
                      <div className="w-full bg-background/30 h-2 rounded mt-1">
                        <div
                          className={`h-full rounded transition-all ${
                            timeBalance.work > targetWork ? "bg-red-500" :
                            timeBalance.work >= targetWork * 0.9 ? "bg-yellow-500" :
                            "bg-green-500"
                          }`}
                          style={{ width: `${Math.min((timeBalance.work / targetWork) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">
                        Free Hours
                      </div>
                      <div className={`text-lg font-bold ${getBalanceColor(timeBalance.free, targetFree)}`} data-testid="balance-free">
                        {timeBalance.free.toFixed(1)}h / {targetFree}h
                      </div>
                      <div className="w-full bg-background/30 h-2 rounded mt-1">
                        <div
                          className={`h-full rounded transition-all ${
                            timeBalance.free > targetFree ? "bg-red-500" :
                            timeBalance.free >= targetFree * 0.9 ? "bg-yellow-500" :
                            "bg-green-500"
                          }`}
                          style={{ width: `${Math.min((timeBalance.free / targetFree) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">
                        Other Hours
                      </div>
                      <div className={`text-lg font-bold ${getBalanceColor(timeBalance.other, targetOther)}`} data-testid="balance-other">
                        {timeBalance.other.toFixed(1)}h / {targetOther}h
                      </div>
                      <div className="w-full bg-background/30 h-2 rounded mt-1">
                        <div
                          className={`h-full rounded transition-all ${
                            timeBalance.other > targetOther ? "bg-red-500" :
                            timeBalance.other >= targetOther * 0.9 ? "bg-yellow-500" :
                            "bg-green-500"
                          }`}
                          style={{ width: `${Math.min((timeBalance.other / targetOther) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Reasoning - Show in both phases */}
          {draftSchedule.aiReasoning && (
            <Card className="border-border bg-black/50">
              <CardHeader>
                <CardTitle className="font-display">AI Reasoning</CardTitle>
                <CardDescription className="text-xs mt-2">
                  {draftSchedule.aiReasoning}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Schedule Blocks */}
          <Card className="border-border bg-black/50">
            <CardHeader>
              <CardTitle className="font-mono text-sm mb-2">
                Schedule for {scheduleDate}
              </CardTitle>
              <CardDescription className="text-xs">
                Review and edit enriched details. Click FINALIZE SCHEDULE when ready.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {blocks.map((block, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleActivity(idx)}
                    className={`border-2 rounded transition-all ${expandedActivityIndex === idx ? "p-4 border-primary/50 bg-primary/2" : "p-2 border-border bg-background/30 cursor-pointer hover:border-primary/50"}`}
                    data-testid={`draggable-block-${idx}`}
                  >
                    {expandedActivityIndex !== idx ? (
                      // Collapsed Activity - Summary View
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-mono text-muted-foreground">
                          <span className="text-primary/70">{block.startTime}</span>
                          <span className="mx-2 text-border">→</span>
                          <span className="text-primary/70">{block.endTime}</span>
                          <span className="mx-3 text-border">|</span>
                          <span className="font-semibold text-foreground">{block.title}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </div>
                    ) : (
                      // PHASE 2: Expanded Activity - Full Details (No nested collapsibles)
                      <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                        {generatedDetailsLoading.has(idx) && (
                          <div className="flex items-center gap-2 text-xs text-primary mb-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Generating activity details...</span>
                          </div>
                        )}
                        {/* Header: Time & Title */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">START TIME</label>
                            <Input type="time" value={block.startTime} onMouseDown={(e) => e.stopPropagation()} disabled className="h-8 text-xs font-mono bg-background/30 border-border cursor-not-allowed" data-testid={`input-detail-start-time-${idx}`} />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">END TIME</label>
                            <Input type="time" value={block.endTime} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleDurationChange(idx, e.target.value)} className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-end-time-${idx}`} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">ACTIVITY TITLE</label>
                          <Input value={block.title} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleTitleChange(idx, e.target.value)} className="h-8 text-sm font-mono bg-background border-border" data-testid={`input-detail-title-${idx}`} />
                        </div>

                        {/* All Details - Conditionally Rendered */}
                        {isFieldRelevant(idx, "Description") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">DESCRIPTION</label>
                            <Textarea value={block.description || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleDescriptionChange(idx, e.target.value)} className="min-h-14 text-xs bg-background border-border font-mono" placeholder="Activity description..." data-testid={`textarea-detail-description-${idx}`} />
                          </div>
                        )}
                        {isFieldRelevant(idx, "Reason") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">WHY (REASON)</label>
                            <Textarea value={(block as any).reason || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleReasonChange(idx, e.target.value)} className="min-h-14 text-xs bg-background border-border font-mono" placeholder="Why do this activity?" data-testid={`textarea-detail-reason-${idx}`} />
                          </div>
                        )}
                        {isFieldRelevant(idx, "Goal/Outcome") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">GOAL/OUTCOME</label>
                            <Textarea value={(block as any).goal || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'goal', e.target.value)} className="min-h-14 text-xs bg-background border-border font-mono" placeholder="What should be achieved?" data-testid={`textarea-detail-goal-${idx}`} />
                          </div>
                        )}
                        {isFieldRelevant(idx, "Resources") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">RESOURCES NEEDED</label>
                            <Textarea value={(block as any).resourcesNeeded || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'resourcesNeeded', e.target.value)} className="min-h-14 text-xs bg-background border-border font-mono" placeholder="Materials, tools, software..." data-testid={`textarea-detail-resources-${idx}`} />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {isFieldRelevant(idx, "Location") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">LOCATION</label>
                              <Input value={(block as any).location || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'location', e.target.value)} placeholder="Home, lab, library..." className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-location-${idx}`} />
                            </div>
                          )}
                          {isFieldRelevant(idx, "Collaborators") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">COLLABORATORS</label>
                              <Input value={(block as any).collaborators || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'collaborators', e.target.value)} placeholder="People involved..." className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-collaborators-${idx}`} />
                            </div>
                          )}
                        </div>
                        {isFieldRelevant(idx, "Dependencies") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">DEPENDENCIES</label>
                            <Input value={(block as any).dependencies || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'dependencies', e.target.value)} placeholder="Activities that must be done first..." className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-dependencies-${idx}`} />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {isFieldRelevant(idx, "Predict Difficulty Level") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">PREDICT DIFFICULTY (1-5)</label>
                              <Input type="number" min="1" max="5" value={(block as any).difficultyLevel || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'difficultyLevel', parseInt(e.target.value))} className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-difficulty-${idx}`} />
                            </div>
                          )}
                          {isFieldRelevant(idx, "Energy Required") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">ENERGY REQUIRED</label>
                              <Input value={(block as any).energyRequired || ""} onMouseDown={(e) => e.stopPropagation()} placeholder="Mental, Physical, Both" onChange={(e) => handleFieldChange(idx, 'energyRequired', e.target.value)} className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-energy-${idx}`} />
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {isFieldRelevant(idx, "Buffer Time") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">BUFFER TIME AFTER (min)</label>
                              <Input type="number" value={(block as any).bufferTimeAfter || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'bufferTimeAfter', parseInt(e.target.value))} className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-buffer-${idx}`} />
                            </div>
                          )}
                          {isFieldRelevant(idx, "Reminder") && (
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">REMINDER (min before)</label>
                              <Input type="number" value={(block as any).reminderNotification || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'reminderNotification', parseInt(e.target.value))} className="h-8 text-xs font-mono bg-background border-border" data-testid={`input-detail-reminder-${idx}`} />
                            </div>
                          )}
                        </div>
                        {isFieldRelevant(idx, "Success Metrics") && (
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">SUCCESS METRICS</label>
                            <Textarea value={(block as any).successMetrics || ""} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => handleFieldChange(idx, 'successMetrics', e.target.value)} className="min-h-14 text-xs bg-background border-border font-mono" placeholder="How to measure completion?" data-testid={`textarea-detail-metrics-${idx}`} />
                          </div>
                        )}
                        <div className="border-t border-border pt-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">TYPE</label>
                              <div className="h-8 px-2 flex items-center bg-background/30 border border-border rounded text-xs font-mono text-muted-foreground" data-testid={`readonly-detail-type-${idx}`}>{block.type}</div>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">PRIORITY</label>
                              <div className="h-8 px-2 flex items-center bg-background/30 border border-border rounded text-xs font-mono text-muted-foreground" data-testid={`readonly-detail-priority-${idx}`}>{block.priority}</div>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 block">COURSE</label>
                              <div className="h-8 px-2 flex items-center bg-background/30 border border-border rounded text-xs font-mono text-muted-foreground" data-testid={`readonly-detail-course-${idx}`}>{block.courseCode || "N/A"}</div>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => toggleActivity(idx)} className="w-full h-8 text-xs font-mono uppercase rounded-none border-2 border-primary text-primary bg-transparent hover:bg-primary/10" data-testid={`button-hide-activity-${idx}`}>
                          HIDE
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (sourceMethod === "chat") {
                  navigate(`/chat-builder?date=${scheduleDate}`);
                } else {
                  navigate("/schedule-builder");
                }
              }}
              className="flex-1 border-border font-mono text-xs rounded-none"
              data-testid="button-back-to-builder"
            >
              <ChevronLeft className="w-3 h-3 mr-2" />
              {sourceMethod === "chat" ? "Back to Chat" : "Back to Template"}
            </Button>
            
            <Button
              onClick={handleFinalize}
              disabled={finalizing || validationErrors.length > 0}
              className="flex-1 bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-finalize-schedule"
            >
              {finalizing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Finalizing...
                </>
              ) : validationErrors.length > 0 ? (
                <>
                  <AlertCircle className="w-3 h-3 mr-2" />
                  Fix Errors to Finalize
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 mr-2" />
                  Finalize Schedule
                </>
              )}
            </Button>
          </div>
        </div>
      </main>

      {/* Progress Dialog */}
      <ProgressDialog
        open={progressDialogOpen}
        title="Generating Activity Details"
        description="Processing activities and filtering relevant fields..."
        items={progressItems}
        current={progressCurrent}
        total={blocks.length}
      />

      {/* Unknown Activity Dialog */}
      <Dialog open={unknownDialogOpen} onOpenChange={setUnknownDialogOpen}>
        <DialogContent className="bg-black/95 border border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase text-primary" data-testid="dialog-unknown-title">
              {currentUnknown?.title} - Activity Details
            </DialogTitle>
            <DialogDescription className="text-xs mt-2" data-testid="dialog-unknown-time-range">
              Question {currentUnknownIndex + 1} of {unknownActivities.length}
            </DialogDescription>
          </DialogHeader>
          {currentUnknown && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed" data-testid="dialog-unknown-question">
                  {currentUnknown.question}
                </p>
                <Textarea
                  value={currentUnknownAnswer}
                  onChange={(e) => setCurrentUnknownAnswer(e.target.value)}
                  placeholder="Describe what you'll do during this activity..."
                  className="min-h-24 text-xs bg-background/50 border-border font-mono"
                  data-testid="textarea-unknown-description"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setUnknownDialogOpen(false)}
              className="font-mono text-xs uppercase"
              data-testid="button-unknown-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnknownActivityNext}
              className="bg-green-600 text-white hover:bg-green-700 font-mono text-xs uppercase"
              data-testid="button-unknown-next"
            >
              {currentUnknownIndex < unknownActivities.length - 1 ? "Save & Continue" : "Save & Finish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
