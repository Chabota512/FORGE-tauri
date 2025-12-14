import { useLocation } from "wouter";
import { useTodayMissions, useTodaySchedule } from "@/lib/api";
import React, { useState, useEffect } from "react";
import { MissionCard } from "@/components/MissionCard";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Calendar, CheckCircle } from "lucide-react";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import Footer from "@/components/Footer";
import { StatsDialog } from "@/components/StatsDialog";

export default function Dashboard() {
  const { data: missions = [], isLoading, error, refetch } = useTodayMissions();
  const { data: schedule } = useTodaySchedule();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Get current activity using same logic as ActivityTimeline
  const currentActivity = React.useMemo(() => {
    if (!schedule?.timeBlocks) return null;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const timeToMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTime);
    const currentBlock = schedule.timeBlocks.find(
      (b) =>
        timeToMinutes(b.startTime) <= currentMinutes &&
        timeToMinutes(b.endTime) > currentMinutes
    );
    return currentBlock?.title?.split(":")[0] || null;
  }, [schedule?.timeBlocks]);

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
      <PageHeader 
        actions={[
          {
            testId: "button-schedules",
            label: "SCHEDULES",
            icon: <Calendar className="w-4 h-4" />,
            onClick: () => navigate("/timetable"),
            variant: "primary",
          },
        ]}
      />

      <main className="container mx-auto px-4 py-8 flex-1">
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
          <div className="space-y-8">
            <ActivityTimeline onStatsClick={() => setStatsOpen(true)} />

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
          </div>
        )}
      </main>
      <Footer />
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />
    </div>
  );
}