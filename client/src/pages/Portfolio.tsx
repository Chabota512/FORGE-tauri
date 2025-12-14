import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, FileText, CheckCircle, Calendar, ChevronDown, ChevronRight, FolderOpen, Archive, Tag, BookOpen } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { useExportPortfolio, useArchive, useConcepts } from "@/lib/api";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GroupedArchive {
  courseCode: string;
  courseName: string;
  days: {
    date: string;
    missions: {
      id: number;
      title: string;
      description: string;
      status: string;
      proofs: { fileName: string; uploadedAt?: string }[];
    }[];
  }[];
}

interface TopicGroup {
  courseCode: string;
  courseName: string;
  topics: {
    name: string;
    missions: {
      id: number;
      title: string;
      description: string;
      status: string;
      missionDate: string;
      proofs: { fileName: string; uploadedAt?: string }[];
      aiAnalysis?: string;
    }[];
  }[];
}

export default function PortfolioPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [activeTab, setActiveTab] = useState<"archive" | "topics" | "export">("archive");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const [selectedMission, setSelectedMission] = useState<any>(null);
  
  const { data: archive = [], isLoading: archiveLoading } = useArchive();
  const { data: concepts = [], isLoading: conceptsLoading } = useConcepts();
  const exportPortfolio = useExportPortfolio();

  const completedMissions = archive.filter((m: any) => m.status === "complete");
  const missionsByDate = completedMissions.reduce((acc: any, mission: any) => {
    const date = mission.missionDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(mission);
    return acc;
  }, {});

  const groupedArchives: GroupedArchive[] = (() => {
    const courseMap = new Map<string, GroupedArchive>();

    archive.forEach((mission: any) => {
      const courseKey = mission.courseCode || "UNKNOWN";
      
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, {
          courseCode: courseKey,
          courseName: mission.courseName || courseKey,
          days: [],
        });
      }

      const course = courseMap.get(courseKey)!;
      let day = course.days.find(d => d.date === mission.missionDate);
      
      if (!day) {
        day = { date: mission.missionDate, missions: [] };
        course.days.push(day);
      }

      day.missions.push({
        id: mission.id,
        title: mission.title,
        description: mission.description,
        status: mission.status,
        proofs: mission.proofs || [],
      });
    });

    return Array.from(courseMap.values()).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  })();

  const toggleCourse = (courseCode: string) => {
    setExpandedCourses(prev =>
      prev.includes(courseCode)
        ? prev.filter(c => c !== courseCode)
        : [...prev, courseCode]
    );
  };

  const toggleDay = (dayId: string) => {
    setExpandedDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev =>
      prev.includes(topicId)
        ? prev.filter(t => t !== topicId)
        : [...prev, topicId]
    );
  };

  // Group completed missions by topics/concepts
  const topicGroupedArchives: TopicGroup[] = (() => {
    const courseMap = new Map<string, TopicGroup>();

    // First, create course entries
    completedMissions.forEach((mission: any) => {
      const courseKey = mission.courseCode || "UNKNOWN";
      
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, {
          courseCode: courseKey,
          courseName: mission.courseName || courseKey,
          topics: [],
        });
      }
    });

    // Get concepts for each course and map missions to them
    concepts.forEach((concept: any) => {
      const courseId = concept.courseId;
      // Find course code from completed missions
      const missionForCourse = completedMissions.find((m: any) => m.courseId === courseId);
      if (!missionForCourse) return;

      const courseKey = missionForCourse.courseCode;
      const course = courseMap.get(courseKey);
      if (!course) return;

      // Get missions that relate to this concept (simple keyword matching)
      const conceptWords = concept.conceptName.toLowerCase().split(/[\s_-]+/);
      const relatedMissions = completedMissions.filter((m: any) => {
        if (m.courseCode !== courseKey) return false;
        const missionText = (m.title + " " + m.description).toLowerCase();
        return conceptWords.some((word: string) => word.length > 3 && missionText.includes(word));
      });

      if (relatedMissions.length > 0) {
        course.topics.push({
          name: concept.conceptName,
          missions: relatedMissions.map((m: any) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            status: m.status,
            missionDate: m.missionDate,
            proofs: m.proofs || [],
            aiAnalysis: m.aiAnalysis,
          })),
        });
      }
    });

    // Add "Uncategorized" topic for missions not matched to any concept
    courseMap.forEach((course) => {
      const allMatchedMissionIds = new Set(
        course.topics.flatMap(t => t.missions.map(m => m.id))
      );
      
      const unmatchedMissions = completedMissions.filter((m: any) => 
        m.courseCode === course.courseCode && !allMatchedMissionIds.has(m.id)
      );

      if (unmatchedMissions.length > 0) {
        course.topics.push({
          name: "General",
          missions: unmatchedMissions.map((m: any) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            status: m.status,
            missionDate: m.missionDate,
            proofs: m.proofs || [],
            aiAnalysis: m.aiAnalysis,
          })),
        });
      }
    });

    return Array.from(courseMap.values())
      .filter(c => c.topics.length > 0)
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  })();

  const handleExport = async () => {
    try {
      const result = await exportPortfolio.mutateAsync({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      toast({
        title: "Portfolio Exported Successfully",
        description: `Downloaded portfolio.md (${(result.size / 1024).toFixed(2)} KB)`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Could not generate portfolio. Check console for details.",
        variant: "destructive",
      });
      console.error("Portfolio export error:", error);
    }
  };

  const totalSubmissions = archive.filter((m: any) => m.status === "complete").length;

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
            <button data-testid="button-logo" onClick={() => navigate("/home")} className="flex items-center gap-3 transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)] group-active:drop-shadow-[0_0_16px_rgba(190,242,100,0.8)]">
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
                SYSTEM_ONLINE
              </span>
              <span className="text-white/10">|</span>
              <div className="flex flex-col items-end">
                <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                <span>{currentTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
                <span>{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                data-testid="button-missions"
                onClick={() => navigate("/")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                MISSIONS
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
                <Archive className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">Portfolio & Archives</h2>
                <p className="text-sm font-mono text-muted-foreground">Browse history and export your work</p>
              </div>
            </div>
            <BackButton label="DASHBOARD" onClick={() => navigate("/home")} />
          </div>

          <div className="tech-panel p-3 space-y-2 mb-6">
            <h3 className="text-xs font-display uppercase tracking-widest text-primary border-b border-border pb-1">
              Statistics
            </h3>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-background/50 border border-border text-center">
                <p className="text-lg font-display font-bold text-primary" data-testid="text-total-completed">
                  {completedMissions.length}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Completed</p>
              </div>
              <div className="p-2 bg-background/50 border border-border text-center">
                <p className="text-lg font-display font-bold text-primary" data-testid="text-total-days">
                  {Object.keys(missionsByDate).length}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Active Days</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-6 border-b border-border">
            <button
              data-testid="tab-archive"
              onClick={() => setActiveTab("archive")}
              className={cn(
                "px-6 py-3 font-mono text-sm uppercase tracking-widest transition-all duration-200 border-b-2",
                activeTab === "archive"
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <FolderOpen className="w-4 h-4 inline-block mr-2" />
              Archive
            </button>
            <button
              data-testid="tab-topics"
              onClick={() => setActiveTab("topics")}
              className={cn(
                "px-6 py-3 font-mono text-sm uppercase tracking-widest transition-all duration-200 border-b-2",
                activeTab === "topics"
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <BookOpen className="w-4 h-4 inline-block mr-2" />
              Topics
            </button>
            <button
              data-testid="tab-export"
              onClick={() => setActiveTab("export")}
              className={cn(
                "px-6 py-3 font-mono text-sm uppercase tracking-widest transition-all duration-200 border-b-2",
                activeTab === "export"
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <Download className="w-4 h-4 inline-block mr-2" />
              Export
            </button>
          </div>

          {activeTab === "archive" && (
            <div className="space-y-6">
              {archiveLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                  <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">LOADING_ARCHIVES...</p>
                </div>
              ) : groupedArchives.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-lg">
                  <FolderOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">NO_ARCHIVES_FOUND</p>
                  <p className="text-xs font-mono text-muted-foreground/60 mt-2">Complete missions to populate your knowledge base</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groupedArchives.map((course) => {
                    const isExpanded = expandedCourses.includes(course.courseCode);
                    const completedCount = course.days.flatMap(d => d.missions).filter(m => m.status === "complete").length;
                    const totalCount = course.days.flatMap(d => d.missions).length;
                    
                    return (
                      <div key={course.courseCode} data-testid={`archive-course-${course.courseCode}`} className="tech-panel p-0 border border-border/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCourse(course.courseCode)}
                          className="w-full flex items-center gap-3 p-4 hover:bg-primary/5 transition-colors text-left group"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-primary" />
                          )}
                          <FolderOpen className="w-4 h-4 text-primary" />
                          <div className="flex-1">
                            <div className="font-mono font-bold text-primary">
                              {course.courseName.replace(/ /g, "_").toUpperCase()}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {course.days.length} day{course.days.length !== 1 ? "s" : ""} • {completedCount}/{totalCount} completed
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border/50 divide-y divide-border/50">
                            {course.days.sort((a, b) => b.date.localeCompare(a.date)).map((day) => {
                              const dayId = `${course.courseCode}-${day.date}`;
                              const isDayExpanded = expandedDays.includes(dayId);
                              
                              return (
                                <div key={dayId}>
                                  <button
                                    onClick={() => toggleDay(dayId)}
                                    className="w-full flex items-center gap-3 p-4 pl-12 hover:bg-primary/5 transition-colors text-left group"
                                  >
                                    {isDayExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-primary/60" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-primary/60" />
                                    )}
                                    <Calendar className="w-3 h-3 text-primary/60" />
                                    <div className="flex-1">
                                      <div className="font-mono text-sm text-primary/80 font-medium">
                                        {day.date}
                                      </div>
                                      <div className="text-xs text-muted-foreground font-mono">
                                        {day.missions.map(m => m.title).join(", ")}
                                      </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                      {day.missions.flatMap(m => m.proofs).length} proof{day.missions.flatMap(m => m.proofs).length !== 1 ? "s" : ""}
                                    </div>
                                  </button>

                                  {isDayExpanded && (
                                    <div className="bg-black/20 border-t border-border/30">
                                      {day.missions.map((mission) => (
                                        <div key={mission.id} className="border-b border-border/20 last:border-b-0">
                                          <div className="p-4 pl-20">
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                mission.status === "complete" ? "bg-primary" : "bg-amber-500"
                                              )} />
                                              <span className="font-mono text-sm text-foreground">{mission.title}</span>
                                              <span className="text-xs font-mono text-muted-foreground uppercase">
                                                [{mission.status}]
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground font-mono mb-3 pl-4">
                                              {mission.description}
                                            </p>
                                            
                                            {mission.proofs.length > 0 ? (
                                              <div className="space-y-1 pl-4">
                                                {mission.proofs.map((proof, idx) => (
                                                  <div
                                                    key={idx}
                                                    className="flex items-center gap-2 text-xs font-mono text-foreground/70 hover:text-primary transition-colors"
                                                  >
                                                    <FileText className="w-3 h-3" />
                                                    <span>{proof.fileName}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-muted-foreground/50 font-mono pl-4 italic">
                                                No proofs submitted
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 p-6 tech-panel text-center text-xs font-mono text-muted-foreground border border-border/30 rounded-lg">
                <p className="mb-2">Total Completed Missions: {totalSubmissions}</p>
                <p>Last Updated: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          )}

          {activeTab === "topics" && (
            <div className="space-y-6">
              {archiveLoading || conceptsLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                  <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">LOADING_TOPICS...</p>
                </div>
              ) : topicGroupedArchives.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-lg">
                  <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">NO_COMPLETED_MISSIONS</p>
                  <p className="text-xs font-mono text-muted-foreground/60 mt-2">Complete missions to see them organized by topic</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topicGroupedArchives.map((course) => {
                    const isExpanded = expandedCourses.includes(`topic-${course.courseCode}`);
                    const totalMissions = course.topics.reduce((sum, t) => sum + t.missions.length, 0);
                    
                    return (
                      <div key={`topic-${course.courseCode}`} data-testid={`topic-course-${course.courseCode}`} className="tech-panel p-0 border border-border/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCourse(`topic-${course.courseCode}`)}
                          className="w-full flex items-center gap-3 p-4 hover:bg-primary/5 transition-colors text-left group"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-primary" />
                          )}
                          <FolderOpen className="w-4 h-4 text-primary" />
                          <div className="flex-1">
                            <div className="font-mono font-bold text-primary">
                              {course.courseName.replace(/ /g, "_").toUpperCase()}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {course.topics.length} topic{course.topics.length !== 1 ? "s" : ""} - {totalMissions} mission{totalMissions !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border/50 divide-y divide-border/50">
                            {course.topics.map((topic) => {
                              const topicId = `${course.courseCode}-${topic.name}`;
                              const isTopicExpanded = expandedTopics.includes(topicId);
                              
                              return (
                                <div key={topicId}>
                                  <button
                                    onClick={() => toggleTopic(topicId)}
                                    className="w-full flex items-center gap-3 p-4 pl-12 hover:bg-primary/5 transition-colors text-left group"
                                  >
                                    {isTopicExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-primary/60" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-primary/60" />
                                    )}
                                    <Tag className="w-3 h-3 text-primary/60" />
                                    <div className="flex-1">
                                      <div className="font-mono text-sm text-primary/80 font-medium">
                                        {topic.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground font-mono">
                                        {topic.missions.length} mission{topic.missions.length !== 1 ? "s" : ""}
                                      </div>
                                    </div>
                                  </button>

                                  {isTopicExpanded && (
                                    <div className="bg-black/20 border-t border-border/30">
                                      {topic.missions.map((mission) => (
                                        <div 
                                          key={mission.id} 
                                          className="border-b border-border/20 last:border-b-0 cursor-pointer hover:bg-primary/5 transition-colors"
                                          onClick={() => setSelectedMission(selectedMission?.id === mission.id ? null : mission)}
                                        >
                                          <div className="p-4 pl-20">
                                            <div className="flex items-center gap-2 mb-2">
                                              <CheckCircle className="w-3 h-3 text-primary" />
                                              <span className="font-mono text-sm text-foreground">{mission.title}</span>
                                              <span className="text-xs font-mono text-muted-foreground">
                                                {mission.missionDate}
                                              </span>
                                            </div>
                                            
                                            {selectedMission?.id === mission.id && (
                                              <div className="mt-3 space-y-3">
                                                <p className="text-xs text-muted-foreground font-mono pl-5">
                                                  {mission.description}
                                                </p>
                                                
                                                {mission.proofs.length > 0 && (
                                                  <div className="space-y-1 pl-5">
                                                    <p className="text-[10px] font-mono text-primary/60 uppercase">Proofs:</p>
                                                    {mission.proofs.map((proof, idx) => (
                                                      <div
                                                        key={idx}
                                                        className="flex items-center gap-2 text-xs font-mono text-foreground/70"
                                                      >
                                                        <FileText className="w-3 h-3" />
                                                        <span>{proof.fileName}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 p-6 tech-panel text-center text-xs font-mono text-muted-foreground border border-border/30 rounded-lg">
                <p className="mb-2">Topics are auto-generated based on concept tracking</p>
                <p>Missions may appear in multiple topics if they cover multiple concepts</p>
              </div>
            </div>
          )}

          {activeTab === "export" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="tech-panel p-6 space-y-6">
                  <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                    Export Options
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-mono flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Date Range (Optional)
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs font-mono text-muted-foreground">From</Label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="font-mono text-sm bg-background border-border"
                            data-testid="input-start-date"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-mono text-muted-foreground">To</Label>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="font-mono text-sm bg-background border-border"
                            data-testid="input-end-date"
                          />
                        </div>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        Leave empty to export all completed missions
                      </p>
                    </div>
                  </div>

                  <Button
                    data-testid="button-export"
                    onClick={handleExport}
                    disabled={exportPortfolio.isPending}
                    className="w-full font-mono text-sm bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
                  >
                    {exportPortfolio.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Export Portfolio
                      </>
                    )}
                  </Button>
                </div>

              </div>

              <div className="tech-panel p-6 space-y-4">
                <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                  Completed Missions Preview
                </h3>

                {archiveLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-mono text-muted-foreground">Loading...</span>
                  </div>
                ) : completedMissions.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-sm font-mono text-muted-foreground">No completed missions yet.</p>
                    <p className="text-xs font-mono text-muted-foreground/60 mt-1">Complete missions to build your portfolio.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {Object.entries(missionsByDate)
                      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                      .slice(0, 10)
                      .map(([date, missions]: [string, any]) => (
                        <div key={date} className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          {missions.map((mission: any) => (
                            <div key={mission.id} className="ml-5 p-2 bg-background/50 border border-border">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-sm font-mono">{mission.title}</span>
                              </div>
                              <span className="text-xs font-mono text-primary ml-6">[{mission.courseCode}]</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    
                    {Object.keys(missionsByDate).length > 10 && (
                      <p className="text-xs font-mono text-muted-foreground text-center pt-2">
                        + {Object.keys(missionsByDate).length - 10} more days...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
