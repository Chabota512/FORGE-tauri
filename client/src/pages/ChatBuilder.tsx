import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, Send, Loader2, MessageSquare, Clock, Check, 
  ChevronRight, Calendar, Sparkles, Play, X, Trash2, Paperclip, Copy, AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { apiRequest, getApiUrl } from "@/lib/queryClient";

interface ScheduleBlock {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: string;
  description?: string;
  category?: string;
}

interface ChatMessage {
  id: number;
  role: string;
  content: string;
  activityIndex?: number | null;
  createdAt: string;
}

interface Session {
  id: number;
  scheduleDate: string;
  status: string;
  currentScheduleData?: string | null;
  aiReasoning?: string | null;
}

interface HistorySession {
  date: string;
  status: string;
  isPast: boolean;
  isToday: boolean;
  hasSchedule: boolean;
}

interface TimeGap {
  startTime: string;
  endTime: string;
  duration: number;
}

function findScheduleGaps(blocks: ScheduleBlock[], wakeTime: string = "07:00", sleepTime: string = "22:00"): TimeGap[] {
  if (blocks.length === 0) return [{ startTime: wakeTime, endTime: sleepTime, duration: timeToMinutes(sleepTime) - timeToMinutes(wakeTime) }];
  
  const gaps: TimeGap[] = [];
  const sortedBlocks = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  
  // Check gap from wake time to first block
  const firstBlock = sortedBlocks[0];
  if (firstBlock.startTime > wakeTime) {
    const gapMinutes = timeToMinutes(firstBlock.startTime) - timeToMinutes(wakeTime);
    if (gapMinutes >= 60) { // Only report gaps >= 1 hour
      gaps.push({ startTime: wakeTime, endTime: firstBlock.startTime, duration: gapMinutes });
    }
  }
  
  // Check gaps between blocks
  for (let i = 0; i < sortedBlocks.length - 1; i++) {
    const current = sortedBlocks[i];
    const next = sortedBlocks[i + 1];
    if (next.startTime > current.endTime) {
      const gapMinutes = timeToMinutes(next.startTime) - timeToMinutes(current.endTime);
      if (gapMinutes >= 60) { // Only report gaps >= 1 hour
        gaps.push({ startTime: current.endTime, endTime: next.startTime, duration: gapMinutes });
      }
    }
  }
  
  // Check gap from last block to sleep time
  const lastBlock = sortedBlocks[sortedBlocks.length - 1];
  if (lastBlock.endTime < sleepTime) {
    const gapMinutes = timeToMinutes(sleepTime) - timeToMinutes(lastBlock.endTime);
    if (gapMinutes >= 60) { // Only report gaps >= 1 hour
      gaps.push({ startTime: lastBlock.endTime, endTime: sleepTime, duration: gapMinutes });
    }
  }
  
  return gaps;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function getTimeOfDayColor(time: string): string {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 6) return "#6366f1";
  if (hour < 12) return "#f59e0b";
  if (hour < 17) return "#10b981";
  if (hour < 21) return "#8b5cf6";
  return "#6366f1";
}

function getTimeOfDayLabel(time: string): string {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 6) return "Night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

export default function ChatBuilder() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const getSelectedDateFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("date") || new Date().toISOString().split("T")[0];
  };
  
  const [selectedDate, setSelectedDate] = useState(getSelectedDateFromUrl());
  
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [focusedActivity, setFocusedActivity] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showGapWarning, setShowGapWarning] = useState(false);
  const [scheduleGaps, setScheduleGaps] = useState<TimeGap[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const today = new Date().toISOString().split("T")[0];
  const isPastDate = selectedDate < today;

  // Save ChatBuilder state to localStorage for persistence
  useEffect(() => {
    if (schedule.length > 0) {
      const state = { schedule, selectedDate };
      localStorage.setItem("chatBuilderState", JSON.stringify(state));
    }
  }, [schedule, selectedDate]);

  // Restore ChatBuilder state on mount
  useEffect(() => {
    const savedState = localStorage.getItem("chatBuilderState");
    const savedDate = localStorage.getItem("chatBuilderDate");
    
    if (savedState && savedDate === selectedDate) {
      try {
        const { schedule: savedSchedule } = JSON.parse(savedState);
        setSchedule(savedSchedule);
        toast({
          title: "Session Restored",
          description: "Your previous chat planning session has been restored.",
        });
      } catch (err) {
        console.error("Failed to restore chat builder state:", err);
      }
    } else if (selectedDate) {
      localStorage.setItem("chatBuilderDate", selectedDate);
    }
  }, [selectedDate]);

  const handleFinalizeWithCheck = () => {
    const gaps = findScheduleGaps(schedule);
    if (gaps.length > 0) {
      setScheduleGaps(gaps);
      setShowGapWarning(true);
    } else {
      finalizeSchedule.mutate();
    }
  };

  const handleConfirmFinalize = () => {
    setShowGapWarning(false);
    finalizeSchedule.mutate();
  };

  const handleFillGaps = () => {
    setShowGapWarning(false);
    const gapDescription = scheduleGaps.map(g => 
      `${formatTime(g.startTime)} - ${formatTime(g.endTime)} (${Math.round(g.duration / 60)} hours)`
    ).join(", ");
    setInputValue(`I have some free time at: ${gapDescription}. Can you suggest activities to fill these gaps?`);
    inputRef.current?.focus();
  };
  
  // Sync selectedDate with URL whenever URL changes (popstate event or hash change)
  useEffect(() => {
    const handleUrlChange = () => {
      const dateFromUrl = getSelectedDateFromUrl();
      if (dateFromUrl !== selectedDate) {
        // Reset state to force a fresh session load
        setSession(null);
        setMessages([]);
        setSchedule([]);
        setFocusedActivity(null);
        setSelectedDate(dateFromUrl);
      }
    };

    // Listen for browser navigation events
    window.addEventListener('popstate', handleUrlChange);
    
    // Also check on mount
    handleUrlChange();
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [selectedDate]);
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/planning-chat/session", { date: selectedDate });
      return res.json();
    },
    onSuccess: (data) => {
      setSession(data.session);
      setMessages(data.messages || []);
      if (data.session.currentScheduleData) {
        try {
          setSchedule(JSON.parse(data.session.currentScheduleData));
        } catch {}
      }
      
      if (data.messages.length === 0) {
        sendSystemGreeting(data.session.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start session",
        variant: "destructive",
      });
    },
  });

  const updateSessionDate = useMutation({
    mutationFn: async (newDate: string) => {
      const res = await apiRequest("POST", "/api/planning-chat/update-date", {
        sessionId: session?.id,
        newDate,
      });
      return res.json();
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ message, activityIndex, sessionId: overrideSessionId }: { message: string; activityIndex?: number | null; sessionId?: number }) => {
      const res = await apiRequest("POST", "/api/planning-chat/message", {
        sessionId: overrideSessionId ?? session?.id,
        message,
        activityIndex,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.message) {
        setMessages(prev => [...prev, data.message]);
      }
      if (data.updatedSchedule) {
        setSchedule(data.updatedSchedule);
      }
      
      // Handle date switching if AI detected a target date
      if (data.targetDate && data.targetDate !== selectedDate) {
        try {
          // Update session date first to preserve chat history
          await updateSessionDate.mutateAsync(data.targetDate);
          
          // Update session state with new date
          if (session) {
            setSession({ ...session, scheduleDate: data.targetDate });
          }
          
          toast({
            title: "Switching to " + data.targetDate,
            description: "Continuing your planning session...",
          });
          
          // Navigate to new date
          setSelectedDate(data.targetDate);
          navigate(`/chat-builder?date=${data.targetDate}`);
        } catch (error: any) {
          toast({
            title: "Error",
            description: "Failed to switch dates",
            variant: "destructive",
          });
        }
      }
      
      setIsLoading(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const finalizeSchedule = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/planning-chat/finalize", {
        sessionId: session?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule Finalized!",
        description: "Your schedule has been saved. Redirecting to edit details...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning-chat/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", selectedDate] });
      setTimeout(() => {
        navigate(`/edit-schedule/${selectedDate}?from=chat`);
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize schedule",
        variant: "destructive",
      });
    },
  });

  const useAsTemplate = useMutation({
    mutationFn: async (sourceDate: string) => {
      const res = await apiRequest("POST", "/api/planning-chat/use-as-template", {
        sourceDate,
        targetDate: today,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Template Applied",
        description: `Copied ${data.copiedBlocks} activities to today's schedule`,
      });
      setShowHistory(false);
      navigate(`/chat-builder?date=${today}`);
      // Force a fresh session load
      setSession(null);
      setMessages([]);
      setSchedule([]);
      startSession.mutate();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to use template",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.id) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch(getApiUrl(`/api/planning-chat/upload-todo/${session.id}`), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      
      // Add file attachment as a message (like ChatGPT - just show the file chip)
      if (data.extractedContent) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "user",
          content: `[Attached file: ${file.name}]`,
          createdAt: new Date().toISOString(),
        }]);
        
        // Send to AI for processing with full extracted content
        setIsLoading(true);
        sendMessage.mutate({ 
          message: `Please help me incorporate these items from my uploaded file into my schedule:\n\n${data.extractedContent}`,
        });
      }
      
      toast({
        title: "File Processed",
        description: `Extracted content from ${file.name}`,
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const sendSystemGreeting = async (sessionId: number) => {
    setIsLoading(true);
    const greeting = "Hello! I'd like to plan my schedule for today.";
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: "user",
      content: greeting,
      createdAt: new Date().toISOString(),
    }]);
    sendMessage.mutate({ message: greeting, sessionId });
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: inputValue,
      activityIndex: focusedActivity,
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    sendMessage.mutate({ message: inputValue, activityIndex: focusedActivity });
    setInputValue("");
  };

  const handleActivityClick = (index: number) => {
    if (focusedActivity === index) {
      setFocusedActivity(null);
    } else {
      setFocusedActivity(index);
      inputRef.current?.focus();
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear the chat history? This cannot be undone.")) {
      try {
        if (session?.id) {
          await apiRequest("DELETE", `/api/planning-chat/messages/${session.id}`);
        }
        setMessages([]);
        setSchedule([]);
        setFocusedActivity(null);
        setInputValue("");
        toast({
          title: "Chat cleared",
          description: "Starting fresh. Send a message to begin planning.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to clear chat",
          variant: "destructive",
        });
      }
    }
  };

  const fetchPlanningHistory = useQuery({
    queryKey: ["/api/planning-chat/history"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/planning-chat/history");
      return res.json();
    },
  });

  const handleNavigateToDate = (date: string) => {
    setShowHistory(false);
    // Reset state to force a fresh session load for the new date
    setSession(null);
    setMessages([]);
    setSchedule([]);
    setFocusedActivity(null);
    setSelectedDate(date);
    navigate(`/chat-builder?date=${date}`);
  };

  useEffect(() => {
    // Only fetch new session if we don't have one for this date
    if (!session || session.scheduleDate !== selectedDate) {
      startSession.mutate();
    }
  }, [selectedDate, session?.scheduleDate]);

  if (startSession.isPending && !session) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground font-mono">Initializing planning session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-foreground">
      <header className="border-b border-border bg-black/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/schedule-builder")}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-display text-lg">Planning Assistant</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">{selectedDate}</span>
          </div>
        </div>
      </header>

      <main className="h-[calc(100vh-3.5rem)]">
        <PanelGroup direction="horizontal" className="w-full h-full">
          <Panel defaultSize={60} minSize={30} className="flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-400" />
                <h2 className="font-display text-lg">Chat</h2>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(true)}
                    disabled={isLoading}
                    className="h-6 w-6 p-0"
                    data-testid="button-history"
                    title="View planning history"
                  >
                    <Clock className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearChat}
                    disabled={isLoading}
                    className="h-6 w-6 p-0"
                    data-testid="button-clear-chat"
                    title="Clear all messages"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {focusedActivity !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Discussing:</span>
                    <span className="text-xs font-mono text-primary">{schedule[focusedActivity]?.title}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFocusedActivity(null)}
                      className="h-6 w-6 p-0"
                      data-testid="button-clear-focus"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-2xl mx-auto">
                {messages.map((msg, idx) => (
                  <div
                    key={msg.id || idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.role}-${idx}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === "user"
                          ? "bg-primary/20 text-foreground"
                          : "bg-muted/50 text-foreground"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.activityIndex !== null && msg.activityIndex !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Re: {schedule[msg.activityIndex]?.title || `Activity #${msg.activityIndex}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2 max-w-2xl mx-auto">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={
                    focusedActivity !== null
                      ? `Discuss "${schedule[focusedActivity]?.title}"...`
                      : "Describe your ideal schedule..."
                  }
                  className="flex-1 bg-background border-border"
                  disabled={isLoading}
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-primary text-black"
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-1 mt-2 max-w-2xl mx-auto flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !session}
                  className="text-[9px] h-5 px-1.5 py-0 border border-border/40 rounded hover:bg-muted/50"
                  data-testid="button-upload"
                  title="Attach a file (to-do list, document, image)"
                >
                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInputValue("Add a 30-minute break")}
                  className="text-[9px] h-5 px-1.5 py-0 border border-border/40 rounded hover:bg-muted/50"
                  data-testid="quick-break"
                >
                  +Break
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInputValue("Schedule deep work in the morning")}
                  className="text-[9px] h-5 px-1.5 py-0 border border-border/40 rounded hover:bg-muted/50"
                  data-testid="quick-deepwork"
                >
                  +Deep Work
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInputValue("What should I prioritize today?")}
                  className="text-[9px] h-5 px-1.5 py-0 border border-border/40 rounded hover:bg-muted/50"
                  data-testid="quick-priorities"
                >
                  Priorities?
                </Button>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />

          <Panel defaultSize={40} minSize={25} className="flex flex-col bg-black/50">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h2 className="font-display text-lg">Timeline</h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {schedule.length} blocks
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {schedule.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-sm text-muted-foreground">
                  Your schedule will appear here as we build it together.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedule.map((block, idx) => {
                  const color = getTimeOfDayColor(block.startTime);
                  const isFocused = focusedActivity === idx;
                  
                  return (
                    <Card
                      key={block.id || idx}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        isFocused ? "border-primary ring-1 ring-primary" : "border-border"
                      }`}
                      onClick={() => handleActivityClick(idx)}
                      data-testid={`timeline-block-${idx}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div 
                            className="w-1 h-full min-h-[40px] rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatTime(block.startTime)} - {formatTime(block.endTime)}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {block.type}
                              </span>
                            </div>
                            <h3 className="font-medium text-sm mt-1 truncate">{block.title}</h3>
                            {block.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {block.description}
                              </p>
                            )}
                          </div>
                          {isFocused && (
                            <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {schedule.length > 0 && (
            <div className="p-4 border-t border-border">
              <Button
                onClick={handleFinalizeWithCheck}
                disabled={finalizeSchedule.isPending || isPastDate}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-mono uppercase text-sm h-9 py-1"
                data-testid="button-finalize"
              >
                {finalizeSchedule.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Finalizing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Finalize Schedule
                  </>
                )}
              </Button>
              {isPastDate && (
                <p className="text-xs text-amber-500 text-center mt-2">
                  This is a past date - view only
                </p>
              )}
              {!isPastDate && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Click to save and add details to each activity
                </p>
              )}
            </div>
          )}
          </Panel>
        </PanelGroup>
      </main>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Planning History</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-80">
            <div className="space-y-2 pr-4">
              {fetchPlanningHistory.isPending ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading history...</span>
                </div>
              ) : fetchPlanningHistory.data?.sessions && fetchPlanningHistory.data.sessions.length > 0 ? (
                fetchPlanningHistory.data.sessions.map((session: HistorySession) => (
                  <div
                    key={session.date}
                    className="border border-border/40 rounded p-1 flex items-center gap-1 flex-wrap"
                  >
                    <div className="flex items-center gap-0.5 flex-1 min-w-0">
                      <span className="font-medium text-xs truncate">
                        {new Date(session.date).toLocaleDateString()}
                      </span>
                      {session.isToday && (
                        <span className="text-[7px] bg-primary/20 text-primary px-0.5 py-0 rounded whitespace-nowrap">Today</span>
                      )}
                      {session.isPast && (
                        <span className="text-[7px] bg-muted text-muted-foreground px-0.5 py-0 rounded whitespace-nowrap">Past</span>
                      )}
                      {session.hasSchedule && (
                        <Check className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-4 px-1 py-0 border border-border/30 rounded text-[10px]"
                      onClick={() => handleNavigateToDate(session.date)}
                      data-testid={`history-date-${session.date}`}
                    >
                      {session.isPast ? "View" : "Continue"}
                    </Button>
                    {session.isPast && session.hasSchedule && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-4 px-0.5 py-0 border border-border/30 rounded text-[10px]"
                        onClick={() => useAsTemplate.mutate(session.date)}
                        disabled={useAsTemplate.isPending}
                        data-testid={`template-${session.date}`}
                      >
                        {useAsTemplate.isPending ? (
                          <Loader2 className="w-2 h-2 animate-spin" />
                        ) : (
                          <>
                            <Copy className="w-2 h-2" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))
              ) : fetchPlanningHistory.data?.dates && fetchPlanningHistory.data.dates.length > 0 ? (
                // Fallback for backwards compat if sessions not available
                fetchPlanningHistory.data.dates.map((date: string) => (
                  <Button
                    key={date}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleNavigateToDate(date)}
                    data-testid={`history-date-${date}`}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {new Date(date).toLocaleDateString()}
                  </Button>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No planning history yet</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showGapWarning} onOpenChange={setShowGapWarning}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Incomplete Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your schedule has unplanned time gaps:
            </p>
            <div className="space-y-1">
              {scheduleGaps.map((gap, idx) => (
                <div key={idx} className="text-xs bg-muted/50 rounded px-2 py-1 font-mono">
                  {formatTime(gap.startTime)} - {formatTime(gap.endTime)} ({Math.round(gap.duration / 60)}h unplanned)
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFillGaps}
                className="flex-1"
                data-testid="button-fill-gaps"
              >
                Let AI Suggest
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmFinalize}
                className="flex-1"
                data-testid="button-finalize-anyway"
              >
                Finalize Anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
