import { useLocation } from "wouter";
import { useTodayMissions, useExportPortfolio, useCourses, useGenerateMission, useLLMStatus, useCourseMaterialsStatus } from "@/lib/api";
import { MissionCard } from "@/components/MissionCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Zap, Home, RefreshCw, Upload, X, AlertTriangle, Archive } from "lucide-react";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import Footer from "@/components/Footer";

export default function MissionsPage() {
  const { data: missions = [], isLoading, error, refetch } = useTodayMissions();
  const { data: courses = [] } = useCourses();
  const { data: llmStatus } = useLLMStatus();
  const { data: materialsStatus } = useCourseMaterialsStatus();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const exportPortfolio = useExportPortfolio();
  const generateMission = useGenerateMission();
  const queryClient = useQueryClient();

  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [timeState, setTimeState] = useState(new Date());
  
  useEffect(() => {
    const dismissed = sessionStorage.getItem("materialsBannerDismissed");
    if (dismissed === "true") {
      setBannerDismissed(true);
    }
  }, []);
  
  useEffect(() => {
    const timer = setInterval(() => setTimeState(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem("materialsBannerDismissed", "true");
  };

  const coursesNeedingUpload = materialsStatus?.coursesNeedingUpload || [];
  const showMaterialsBanner = !bannerDismissed && coursesNeedingUpload.length > 0;

  const handleExport = async () => {
    try {
      const result = await exportPortfolio.mutateAsync({});
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


  const handleGenerateMission = async () => {
    if (!selectedCourse) {
      toast({
        title: "Select a Course",
        description: "Choose a course to generate a mission for.",
        variant: "destructive",
      });
      return;
    }

    try {
      await generateMission.mutateAsync({ courseCode: selectedCourse });
      toast({
        title: "Mission Generated",
        description: `New AI-powered mission created for ${selectedCourse}.`,
      });
      setSelectedCourse("");
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate mission.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded]">
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
                <span>{timeState.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                <span>{timeState.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
                <span>{timeState.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                data-testid="button-home"
                onClick={() => navigate("/home")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none" 
                variant="outline"
              >
                <Home className="w-4 h-4" />
              </Button>
              <Button 
                data-testid="button-completed-missions"
                onClick={() => navigate("/completed")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary/50 text-primary hover:bg-primary/20 hover:border-primary transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <Archive className="w-4 h-4 mr-2" />
                Completed
              </Button>
              <Button 
                data-testid="button-refresh"
                onClick={() => refetch()} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">

        {showMaterialsBanner && (
          <div data-testid="banner-materials-needed" className="mb-6 relative overflow-hidden border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-sm">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.03)_10px,rgba(245,158,11,0.03)_20px)]" />
            <div className="relative p-4 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-500/20 flex items-center justify-center rounded-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-mono font-semibold text-amber-500 uppercase tracking-wider mb-1">
                  Personalize Your Missions
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {coursesNeedingUpload.length === 1 
                    ? `Upload materials for ${coursesNeedingUpload[0].courseCode} to get AI-powered missions based on your actual course content.`
                    : `${coursesNeedingUpload.length} courses don't have materials uploaded. Add lecture notes, slides, or textbooks for personalized AI missions.`
                  }
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    {coursesNeedingUpload.map(c => c.courseCode).slice(0, 4).join(", ")}
                    {coursesNeedingUpload.length > 4 && ` +${coursesNeedingUpload.length - 4} more`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  data-testid="button-upload-materials"
                  onClick={() => navigate("/ingest")}
                  size="sm"
                  className="font-mono text-xs bg-amber-500 text-black hover:bg-amber-400 rounded-none uppercase tracking-widest"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
                <button
                  data-testid="button-dismiss-banner"
                  onClick={handleDismissBanner}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {llmStatus?.groq && (
          <div className="mb-6 tech-panel p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <span className="text-sm font-mono text-muted-foreground">Generate AI Mission:</span>
              </div>
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger data-testid="select-course-generate" className="w-48 font-mono text-sm bg-background border-border">
                  <SelectValue placeholder="Select course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.code} value={course.code} className="font-mono">
                      {course.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                data-testid="button-generate"
                onClick={handleGenerateMission}
                disabled={!selectedCourse || generateMission.isPending}
                size="sm"
                className="font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
              >
                {generateMission.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">LOADING_MISSIONS...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm font-mono text-destructive uppercase tracking-widest mb-4">ERROR_LOADING_MISSIONS</p>
            <Button onClick={() => refetch()} variant="outline" className="font-mono text-xs">
              RETRY
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {missions.length > 0 ? (
              missions.map((mission) => (
                <MissionCard 
                  key={mission.id}
                  mission={mission}
                />
              ))
            ) : (
              <div className="text-center py-20 col-span-full">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">NO_MISSIONS_TODAY</p>
                <p className="text-xs font-mono text-muted-foreground/60 mt-2">Missions are auto-generated each day</p>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
