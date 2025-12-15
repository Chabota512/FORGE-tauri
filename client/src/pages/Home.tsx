import React, { useState } from "react";
import { useLocation } from "wouter";
import { useTodayMissions, useExportPortfolio, useTodaySchedule, useGenerateDraftSchedule } from "@/lib/api";
import { CourseColumn } from "@/components/CourseColumn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileDown, Loader2, Settings as SettingsIcon, Upload, BookOpen, Activity, Download, Calendar, BookMarked, Zap, CheckCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/queryClient";

export default function HomePage() {
  const { data: missions = [], isLoading, error, refetch } = useTodayMissions();
  const { data: schedule, refetch: refetchSchedule } = useTodaySchedule();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const exportPortfolio = useExportPortfolio();
  const queryClient = useQueryClient();
  const generateDraft = useGenerateDraftSchedule();

  const courseNames = Array.from(new Set(missions.map(m => m.courseName)));

  const handleGenerateSchedule = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      // Generate draft schedule
      await generateDraft.mutateAsync(today);
      
      // Automatically finalize it
      const response = await fetch(getApiUrl("/api/schedule/draft/finalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to finalize schedule");
      }
      
      // Refresh the schedule view
      await refetchSchedule();
      await queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
      
      toast({
        title: "Schedule Generated & Saved",
        description: "Your schedule is now active and ready to use.",
      });
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate schedule",
        variant: "destructive",
      });
    }
  };

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

  const DashboardCard = ({ icon: Icon, title, description, testId, path }: any) => (
    <button
      data-testid={testId}
      onClick={() => navigate(path)}
      className="tech-panel p-8 hover:border-primary transition-all duration-200 hover:drop-shadow-[0_0_12px_rgba(190,242,100,0.3)] text-left group min-h-[200px] flex flex-col justify-center"
    >
      <div className="flex items-center gap-5 mb-4">
        <div className="p-4 bg-primary/20 group-hover:bg-primary/30 transition-all">
          <Icon className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-base font-display uppercase tracking-widest font-bold">{title}</h3>
      </div>
      <p className="text-sm font-mono text-muted-foreground leading-relaxed">{description}</p>
    </button>
  );


  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
      <PageHeader />

      <main className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[minmax(200px,auto)] w-full max-w-6xl">
          {/* Row 1: Core Daily Operations */}
          <DashboardCard
            icon={FileDown}
            title="Daily Missions"
            description="View and complete today's engineering missions"
            testId="card-daily-missions"
            path="/missions"
          />
          <DashboardCard
            icon={Calendar}
            title="Timetable Manager"
            description="Manage weekly classes and deadlines"
            testId="card-timetable"
            path="/timetable"
          />
          <DashboardCard
            icon={BookOpen}
            title="My Knowledge Base"
            description="Browse course materials and context"
            testId="card-knowledge-base"
            path="/knowledge"
          />

          {/* Row 2: Planning & Analysis */}
          <DashboardCard
            icon={BookMarked}
            title="Reading Library"
            description="Track your self-development reading list"
            testId="card-library"
            path="/library"
          />
          <DashboardCard
            icon={Download}
            title="Portfolio Exporter"
            description="Generate and download your portfolio"
            testId="card-portfolio"
            path="/portfolio"
          />
          <DashboardCard
            icon={SettingsIcon}
            title="Settings"
            description="Configure mission parameters and preferences"
            testId="card-settings"
            path="/settings"
          />

        </div>
      </main>
      <Footer />
    </div>
  );
}