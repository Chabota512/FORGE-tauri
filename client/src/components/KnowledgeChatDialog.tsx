import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Brain, Sparkles, Target, Clock, TrendingUp } from "lucide-react";
import { useKnowledgeChatHistory, useSendKnowledgeChat, useLearnerProfile, type KnowledgeChatMessage, type LearnerProfile } from "@/lib/api";

interface KnowledgeChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: number;
  courseName: string;
  courseCode: string;
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

function ProfileSummary({ profile }: { profile: LearnerProfile | null | undefined }) {
  if (!profile) {
    return (
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg" data-testid="profile-summary-empty">
        <span className="text-sm text-muted-foreground">No learning profile yet. Chat to build your profile!</span>
      </div>
    );
  }

  const badges: { icon: typeof Brain; label: string; variant: BadgeVariant }[] = [];
  
  if (profile.overallConfidence) {
    const confidenceLevel = profile.overallConfidence >= 70 ? "high" : profile.overallConfidence >= 40 ? "medium" : "low";
    const variant: BadgeVariant = confidenceLevel === "high" ? "default" : confidenceLevel === "medium" ? "secondary" : "outline";
    badges.push({
      icon: Brain,
      label: `${profile.overallConfidence}% confident`,
      variant,
    });
  }
  
  if (profile.currentPace) {
    badges.push({
      icon: TrendingUp,
      label: `${profile.currentPace} pace`,
      variant: "secondary",
    });
  }
  
  if (profile.consistencyStreak && profile.consistencyStreak > 0) {
    badges.push({
      icon: Target,
      label: `${profile.consistencyStreak} day streak`,
      variant: "default",
    });
  }
  
  if (profile.idealSessionLength) {
    badges.push({
      icon: Clock,
      label: `${profile.idealSessionLength}min sessions`,
      variant: "outline",
    });
  }

  if (badges.length === 0) {
    return (
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg" data-testid="profile-summary-partial">
        <span className="text-sm text-muted-foreground">Learning profile started. Keep chatting to add more details!</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg" data-testid="profile-summary">
      {badges.map((badge, i) => (
        <Badge key={i} variant={badge.variant} className="flex items-center gap-1">
          <badge.icon className="h-3 w-3" />
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}

function ChatMessage({ message }: { message: KnowledgeChatMessage }) {
  const isUser = message.role === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`} data-testid={`chat-message-${message.id}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            FORGE
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function KnowledgeChatDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
  courseCode,
}: KnowledgeChatDialogProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: chatHistory = [], isLoading: historyLoading } = useKnowledgeChatHistory(courseId);
  const { data: profile } = useLearnerProfile(courseId);
  const sendMessage = useSendKnowledgeChat();

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = async () => {
    if (!input.trim() || sendMessage.isPending) return;

    const message = input.trim();
    setInput("");

    try {
      await sendMessage.mutateAsync({ courseId, message });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedPrompts = [
    "I just finished the lecture on...",
    "I'm struggling to understand...",
    "I feel confident about...",
    "My upcoming exam covers...",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="chat-dialog-title">
            <Brain className="h-5 w-5 text-primary" />
            Chat about {courseName}
          </DialogTitle>
        </DialogHeader>

        <ProfileSummary profile={profile} />

        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chatHistory.length === 0 ? (
            <div className="py-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">Start a conversation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Tell me about your learning progress in {courseCode}. What topics have you covered? Where do you need more practice?
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((prompt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setInput(prompt)}
                    data-testid={`suggested-prompt-${i}`}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-2">
              {chatHistory.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {sendMessage.isPending && (
                <div className="flex justify-start mb-3">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">FORGE is thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 pt-4 border-t">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me about your learning..."
            disabled={sendMessage.isPending}
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            data-testid="chat-send-button"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
