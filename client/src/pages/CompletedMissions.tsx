import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCompletedMissions, useMissionReport, useCourses } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ArrowLeft, 
  Home,
  Download,
  CheckCircle2,
  Clock,
  Brain,
  MessageSquare,
  Lightbulb,
  AlertCircle,
  Sparkles
} from "lucide-react";
import Footer from "@/components/Footer";

interface CompletedMission {
  id: number;
  title: string;
  description: string;
  proofRequirement: string;
  missionDate: string;
  completedAt: string;
  status: string;
  courseId: number;
  courseName: string;
  courseCode: string;
  targetedConcepts?: string;
  feedback?: {
    emotionalState?: string;
    actualTimeMinutes?: number;
    timeFeeling?: string;
    usedExternalHelp?: boolean;
    helpDetails?: string;
    missionClarity?: string;
    learningType?: string;
    blockers?: string;
    confidenceLevel?: string;
    fullAiAnalysis?: string;
    aiApproved?: boolean;
  };
}

type NavigationLevel = "courses" | "topics" | "missions" | "report";

interface NavigationState {
  level: NavigationLevel;
  courseId?: number;
  courseCode?: string;
  courseName?: string;
  topic?: string;
  missionId?: number;
}

export default function CompletedMissionsPage() {
  const [, navigate] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const { data: completedMissions = [], isLoading } = useCompletedMissions();
  const { data: courses = [] } = useCourses();
  const [navState, setNavState] = useState<NavigationState>({ level: "courses" });
  const { data: missionReport, isLoading: isLoadingReport } = useMissionReport(
    navState.level === "report" ? navState.missionId ?? null : null
  );

  const getCoursesWithMissions = () => {
    const courseMap = new Map<number, { courseId: number; courseCode: string; courseName: string; missionCount: number }>();
    
    (completedMissions as CompletedMission[]).forEach((mission) => {
      if (!courseMap.has(mission.courseId)) {
        courseMap.set(mission.courseId, {
          courseId: mission.courseId,
          courseCode: mission.courseCode,
          courseName: mission.courseName,
          missionCount: 0,
        });
      }
      courseMap.get(mission.courseId)!.missionCount++;
    });
    
    return Array.from(courseMap.values());
  };

  const getTopicsForCourse = (courseId: number) => {
    const topicMap = new Map<string, { topic: string; missionCount: number; missionIds: number[] }>();
    
    (completedMissions as CompletedMission[])
      .filter((m) => m.courseId === courseId)
      .forEach((mission) => {
        let concepts: string[] = [];
        if (mission.targetedConcepts) {
          try {
            concepts = JSON.parse(mission.targetedConcepts);
          } catch {
            concepts = [mission.targetedConcepts];
          }
        }
        
        if (concepts.length === 0) {
          concepts = ["General"];
        }
        
        concepts.forEach((concept) => {
          if (!topicMap.has(concept)) {
            topicMap.set(concept, { topic: concept, missionCount: 0, missionIds: [] });
          }
          const topicData = topicMap.get(concept)!;
          if (!topicData.missionIds.includes(mission.id)) {
            topicData.missionCount++;
            topicData.missionIds.push(mission.id);
          }
        });
      });
    
    return Array.from(topicMap.values()).sort((a, b) => b.missionCount - a.missionCount);
  };

  const getMissionsForTopic = (courseId: number, topic: string) => {
    return (completedMissions as CompletedMission[]).filter((mission) => {
      if (mission.courseId !== courseId) return false;
      
      let concepts: string[] = [];
      if (mission.targetedConcepts) {
        try {
          concepts = JSON.parse(mission.targetedConcepts);
        } catch {
          concepts = [mission.targetedConcepts];
        }
      }
      
      if (concepts.length === 0 && topic === "General") return true;
      return concepts.includes(topic);
    });
  };

  const handleBack = () => {
    switch (navState.level) {
      case "topics":
        setNavState({ level: "courses" });
        break;
      case "missions":
        setNavState({ 
          level: "topics", 
          courseId: navState.courseId, 
          courseCode: navState.courseCode,
          courseName: navState.courseName 
        });
        break;
      case "report":
        setNavState({ 
          level: "missions", 
          courseId: navState.courseId, 
          courseCode: navState.courseCode,
          courseName: navState.courseName,
          topic: navState.topic 
        });
        break;
    }
  };

  const handleDownloadPDF = () => {
    if (!missionReport) return;
    
    const content = `
MISSION REPORT
==============

Title: ${missionReport.title}
Course: ${missionReport.courseCode} - ${missionReport.courseName}
Completed: ${new Date(missionReport.completedAt).toLocaleDateString()}

ASSIGNMENT
----------
${missionReport.description}

Proof Requirement: ${missionReport.proofRequirement}

YOUR FEEDBACK
-------------
${missionReport.feedback?.emotionalState ? `Emotional State: ${missionReport.feedback.emotionalState}` : ''}
${missionReport.feedback?.actualTimeMinutes ? `Time Spent: ${missionReport.feedback.actualTimeMinutes} minutes` : ''}
${missionReport.feedback?.timeFeeling ? `Time Feeling: ${missionReport.feedback.timeFeeling}` : ''}
${missionReport.feedback?.missionClarity ? `Clarity: ${missionReport.feedback.missionClarity}` : ''}
${missionReport.feedback?.learningType ? `Learning: ${missionReport.feedback.learningType}` : ''}
${missionReport.feedback?.confidenceLevel ? `Confidence: ${missionReport.feedback.confidenceLevel}` : ''}
${missionReport.feedback?.blockers ? `Blockers: ${missionReport.feedback.blockers}` : ''}

AI ANALYSIS
-----------
${missionReport.feedback?.fullAiAnalysis || 'No AI analysis available'}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission_report_${missionReport.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderBreadcrumb = () => {
    const items: { label: string; onClick?: () => void }[] = [
      { label: "Completed", onClick: () => setNavState({ level: "courses" }) }
    ];

    if (navState.level !== "courses" && navState.courseCode) {
      items.push({
        label: navState.courseCode,
        onClick: navState.level !== "topics" ? () => setNavState({ 
          level: "topics", 
          courseId: navState.courseId, 
          courseCode: navState.courseCode,
          courseName: navState.courseName 
        }) : undefined
      });
    }

    if ((navState.level === "missions" || navState.level === "report") && navState.topic) {
      items.push({
        label: navState.topic,
        onClick: navState.level === "report" ? () => setNavState({ 
          level: "missions", 
          courseId: navState.courseId, 
          courseCode: navState.courseCode,
          courseName: navState.courseName,
          topic: navState.topic 
        }) : undefined
      });
    }

    if (navState.level === "report" && missionReport) {
      items.push({ label: missionReport.title });
    }

    return (
      <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground mb-6">
        {items.map((item, index) => (
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="w-4 h-4" />}
            {item.onClick ? (
              <button 
                onClick={item.onClick}
                className="hover:text-primary transition-colors"
                data-testid={`breadcrumb-${index}`}
              >
                {item.label}
              </button>
            ) : (
              <span className="text-foreground">{item.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  const renderCourses = () => {
    const coursesWithMissions = getCoursesWithMissions();

    if (coursesWithMissions.length === 0) {
      return (
        <div className="text-center py-20">
          <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">NO_COMPLETED_MISSIONS</p>
          <p className="text-xs text-muted-foreground mt-2">Complete some missions to see them here</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {coursesWithMissions.map((course) => (
          <Card
            key={course.courseId}
            data-testid={`folder-course-${course.courseId}`}
            onClick={() => setNavState({ 
              level: "topics", 
              courseId: course.courseId, 
              courseCode: course.courseCode,
              courseName: course.courseName 
            })}
            className="p-6 cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
          >
            <div className="flex flex-col items-center text-center">
              <FolderOpen className="w-12 h-12 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-mono font-bold text-foreground text-sm mb-1">{course.courseCode}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{course.courseName}</p>
              <span className="text-xs text-primary mt-2 font-mono">{course.missionCount} mission{course.missionCount !== 1 ? 's' : ''}</span>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderTopics = () => {
    const topics = getTopicsForCourse(navState.courseId!);

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {topics.map((topicData) => (
          <Card
            key={topicData.topic}
            data-testid={`folder-topic-${topicData.topic}`}
            onClick={() => setNavState({ 
              ...navState, 
              level: "missions", 
              topic: topicData.topic 
            })}
            className="p-6 cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
          >
            <div className="flex flex-col items-center text-center">
              <FolderOpen className="w-12 h-12 text-amber-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-mono font-semibold text-foreground text-sm mb-1 line-clamp-2">{topicData.topic}</h3>
              <span className="text-xs text-primary mt-2 font-mono">{topicData.missionCount} mission{topicData.missionCount !== 1 ? 's' : ''}</span>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderMissions = () => {
    const missions = getMissionsForTopic(navState.courseId!, navState.topic!);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {missions.map((mission) => (
          <Card
            key={mission.id}
            data-testid={`mission-card-${mission.id}`}
            onClick={() => setNavState({ 
              ...navState, 
              level: "report", 
              missionId: mission.id 
            })}
            className="p-6 cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
          >
            <div className="flex items-start gap-4">
              <FileText className="w-10 h-10 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <h3 className="font-mono font-semibold text-foreground text-sm mb-1 line-clamp-2">{mission.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{mission.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span>{new Date(mission.completedAt || mission.missionDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderReport = () => {
    if (isLoadingReport) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">LOADING_REPORT...</p>
        </div>
      );
    }

    if (!missionReport) {
      return (
        <div className="text-center py-20">
          <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">REPORT_NOT_FOUND</p>
        </div>
      );
    }

    const feedback = missionReport.feedback;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="p-6 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground mb-2">{missionReport.title}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="font-mono">{missionReport.courseCode}</span>
                <span className="text-white/20">|</span>
                <span>{missionReport.courseName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <span className="text-sm text-green-500 font-mono">COMPLETED</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Completed: {new Date(missionReport.completedAt || missionReport.missionDate).toLocaleDateString(undefined, { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Assignment
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-mono text-muted-foreground mb-1">Description</h4>
              <p className="text-foreground">{missionReport.description}</p>
            </div>
            <div>
              <h4 className="text-sm font-mono text-muted-foreground mb-1">Proof Requirement</h4>
              <p className="text-foreground">{missionReport.proofRequirement}</p>
            </div>
            {missionReport.proofFile && (
              <div>
                <h4 className="text-sm font-mono text-muted-foreground mb-1">Submitted Proof</h4>
                <div className="flex items-center gap-2 text-primary">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">{missionReport.proofFile}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {feedback && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Your Feedback
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {feedback.emotionalState && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Felt</span>
                  <span className="text-sm capitalize">{feedback.emotionalState.replace('_', ' ')}</span>
                </div>
              )}
              {feedback.actualTimeMinutes && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Time Spent</span>
                  <span className="text-sm">{feedback.actualTimeMinutes} minutes</span>
                </div>
              )}
              {feedback.timeFeeling && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Time Feeling</span>
                  <span className="text-sm capitalize">{feedback.timeFeeling.replace('_', ' ')}</span>
                </div>
              )}
              {feedback.missionClarity && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Clarity</span>
                  <span className="text-sm capitalize">{feedback.missionClarity.replace('_', ' ')}</span>
                </div>
              )}
              {feedback.learningType && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Learning</span>
                  <span className="text-sm capitalize">{feedback.learningType.replace('_', ' ')}</span>
                </div>
              )}
              {feedback.confidenceLevel && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Confidence</span>
                  <span className="text-sm capitalize">{feedback.confidenceLevel}</span>
                </div>
              )}
              {feedback.usedExternalHelp && (
                <div className="p-3 rounded bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Help Used</span>
                  <span className="text-sm">{feedback.helpDetails || 'Yes'}</span>
                </div>
              )}
              {feedback.blockers && (
                <div className="p-3 rounded bg-muted/30 col-span-2 md:col-span-3">
                  <span className="text-xs font-mono text-muted-foreground block mb-1">Blockers</span>
                  <span className="text-sm">{feedback.blockers}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {feedback?.fullAiAnalysis && (
          <Card className="p-6 border-primary/30">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Analysis
            </h3>
            <ScrollArea className="h-[300px]">
              <div className="prose prose-sm prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans leading-relaxed">
                  {feedback.fullAiAnalysis}
                </pre>
              </div>
            </ScrollArea>
          </Card>
        )}

        <div className="flex justify-center">
          <Button
            data-testid="button-download-report"
            onClick={handleDownloadPDF}
            className="font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded]">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
            <button 
              data-testid="button-logo" 
              onClick={() => navigate("/home")} 
              className="flex items-center gap-3 transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)] group-active:drop-shadow-[0_0_16px_rgba(190,242,100,0.8)]"
            >
              <div className="w-8 h-8 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg] transition-all duration-200">
                <span className="skew-x-[10deg]">F</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold font-display leading-none tracking-widest text-foreground transition-all duration-200">FORGE</h1>
                <span className="text-[9px] text-primary font-mono tracking-[0.2em] uppercase">Acid Ops v3.1</span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center text-xs font-mono text-muted-foreground gap-4">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary animate-pulse"></div>
                COMPLETED_ARCHIVE
              </span>
              <span className="text-white/10">|</span>
              <div className="flex flex-col items-end">
                <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                <span>{currentTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
                <span className="text-[#a7eb42]">{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {navState.level !== "courses" && (
                <Button 
                  data-testid="button-back"
                  onClick={handleBack} 
                  size="sm" 
                  className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none" 
                  variant="outline"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              <Button 
                data-testid="button-home"
                onClick={() => navigate("/home")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none" 
                variant="outline"
              >
                <Home className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {renderBreadcrumb()}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">LOADING_ARCHIVE...</p>
          </div>
        ) : (
          <>
            {navState.level === "courses" && renderCourses()}
            {navState.level === "topics" && renderTopics()}
            {navState.level === "missions" && renderMissions()}
            {navState.level === "report" && renderReport()}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
