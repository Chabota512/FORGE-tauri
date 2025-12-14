import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Plus, Download, CheckCircle, Loader2, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import BackButton from "@/components/BackButton";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useScheduleDates, useScheduleByDate } from "@/lib/api";
import type { TimeBlock } from "@/lib/api";
import jsPDF from "jspdf";

export default function SchedulesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [showRecentView, setShowRecentView] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);

  const { data: scheduleDates = [] } = useScheduleDates();
  const { data: schedule } = useScheduleByDate(selectedDate);

  const handleBuildNew = () => {
    if (schedule?.timeBlocks) {
      localStorage.setItem("scheduleTemplate", JSON.stringify(schedule.timeBlocks));
    }
    navigate("/schedule-builder");
  };

  const getPastDates = () => {
    const dates = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  };

  const handleDownloadPDF = async () => {
    if (!schedule?.timeBlocks || schedule.timeBlocks.length === 0) {
      toast({ title: "No schedule to download" });
      return;
    }

    setIsDownloading(true);
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - 2 * margin;
      let yPosition = margin;

      // Title
      pdf.setFontSize(16);
      pdf.text(`FORGE SCHEDULE`, margin, yPosition);
      yPosition += 8;

      // Date
      pdf.setFontSize(10);
      const dateObj = new Date(selectedDate);
      const dateStr = dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      pdf.text(`Date: ${dateStr}`, margin, yPosition);
      yPosition += 8;

      // Separator line
      pdf.setDrawColor(190, 242, 100);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 8;

      // Schedule blocks
      pdf.setFontSize(9);
      schedule.timeBlocks.forEach((block: TimeBlock, idx: number) => {
        // Check if we need a new page
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = margin;
        }

        // Time slot
        pdf.setFont(undefined, "bold");
        pdf.text(`${block.startTime} - ${block.endTime}`, margin, yPosition);
        yPosition += 5;

        // Title
        pdf.setFont(undefined, "bold");
        const titleLines = pdf.splitTextToSize(block.title, contentWidth - 5);
        pdf.text(titleLines, margin + 3, yPosition);
        yPosition += titleLines.length * 4 + 1;

        // Type and course
        pdf.setFont(undefined, "normal");
        pdf.setTextColor(150, 150, 150);
        let infoLine = `[${block.type}]`;
        if (block.courseCode) {
          infoLine += ` ${block.courseCode}`;
        }
        if (block.priority) {
          infoLine += ` P${block.priority}`;
        }
        pdf.text(infoLine, margin + 3, yPosition);
        yPosition += 4;

        // Description
        if (block.description) {
          pdf.setTextColor(100, 100, 100);
          const descLines = pdf.splitTextToSize(block.description, contentWidth - 5);
          pdf.text(descLines, margin + 3, yPosition);
          yPosition += descLines.length * 3 + 2;
        } else {
          yPosition += 2;
        }

        // Goal
        if ((block as any).goal) {
          pdf.setFont(undefined, "bold");
          pdf.setTextColor(200, 200, 200);
          pdf.text("Goal:", margin + 3, yPosition);
          yPosition += 3;
          pdf.setFont(undefined, "normal");
          pdf.setTextColor(100, 100, 100);
          const goalLines = pdf.splitTextToSize((block as any).goal, contentWidth - 5);
          pdf.text(goalLines, margin + 3, yPosition);
          yPosition += goalLines.length * 3 + 2;
        }

        // Separator between blocks
        pdf.setTextColor(0, 0, 0);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 4;
      });

      // Download
      pdf.save(`schedule_${selectedDate}.pdf`);
      toast({ title: "Schedule downloaded successfully" });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({ title: "Failed to generate PDF", description: "Please try again" });
    } finally {
      setIsDownloading(false);
    }
  };

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
                <span>{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                data-testid="button-home"
                onClick={() => navigate("/timetable")}
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
                <CalendarIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">
                  Schedules
                </h2>
                <p className="text-sm font-mono text-muted-foreground">
                  View and manage your daily schedules
                </p>
              </div>
            </div>
            <BackButton label="TIMETABLE" onClick={() => navigate("/timetable")} />
          </div>

          <div className="space-y-6">
            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border bg-black/50">
                <CardHeader>
                  <CardTitle className="font-display text-sm">View Schedules</CardTitle>
                  <CardDescription className="text-xs">Browse your schedule history</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    data-testid="button-view-recent"
                    onClick={() => setShowRecentView(!showRecentView)}
                    variant="outline"
                    className="w-full font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
                  >
                    {showRecentView ? "Hide Recent" : "Show Recent"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border bg-black/50">
                <CardHeader>
                  <CardTitle className="font-display text-sm">Build New Schedule</CardTitle>
                  <CardDescription className="text-xs">
                    Create a new schedule using AI, recent template, or chat
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    data-testid="button-build-new"
                    onClick={handleBuildNew}
                    variant="outline"
                    className="w-full font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    Build New
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Recent Schedules List */}
            {showRecentView && (
              <Card className="border-border bg-black/50">
                <CardHeader>
                  <CardTitle className="font-display text-sm">All Schedules</CardTitle>
                  <CardDescription className="text-xs">Click a date to view that schedule</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {scheduleDates.length > 0 ? (
                      scheduleDates.map((date) => (
                        <Button
                          key={date}
                          onClick={() => {
                            setSelectedDate(date);
                            setHasSelectedDate(true);
                            setShowRecentView(false);
                          }}
                          variant={selectedDate === date ? "default" : "outline"}
                          className="text-[10px] font-mono rounded-none uppercase h-auto py-2"
                          data-testid={`button-schedule-date-${date}`}
                        >
                          {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No schedules yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Schedule Viewer - Only show if a date has been explicitly selected */}
            {hasSelectedDate && (
            <Card className="border-border bg-black/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-sm">
                      Schedule for {selectedDate}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {schedule ? "Tap any block to provide feedback" : "No schedule for this date"}
                    </CardDescription>
                  </div>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-xs font-mono bg-background border border-border rounded px-2 py-1"
                        data-testid="button-open-calendar"
                      >
                        {selectedDate}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={new Date(selectedDate)}
                        onSelect={(date) => {
                          if (date) {
                            setSelectedDate(date.toISOString().split("T")[0]);
                            setCalendarOpen(false);
                          }
                        }}
                        disabled={(date) => {
                          const dateStr = date.toISOString().split("T")[0];
                          const isToday = dateStr === today;
                          const isFuture = dateStr > today;
                          const hasSchedule = scheduleDates.includes(dateStr);
                          
                          // Disable if: past date without schedule, or before today
                          return !isToday && !isFuture && !hasSchedule;
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              {schedule?.timeBlocks && schedule.timeBlocks.length > 0 ? (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {schedule.timeBlocks.map((block: TimeBlock, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 border border-border rounded bg-background/50 hover:border-primary/50 transition-colors cursor-pointer"
                        data-testid={`schedule-block-${idx}`}
                        onClick={() => setSelectedBlock(block)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {block.startTime} - {block.endTime}
                              </span>
                              <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono bg-primary/20 text-primary">
                                {block.type}
                              </span>
                            </div>
                            <p className="font-mono text-sm font-semibold mt-1">{block.title}</p>
                            {block.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {block.description}
                              </p>
                            )}
                            {block.courseCode && (
                              <p className="text-xs text-blue-400 mt-1">{block.courseCode}</p>
                            )}
                          </div>
                          {block.priority && (
                            <span className="text-xs font-mono text-orange-400">P{block.priority}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {schedule.aiReasoning && (
                    <div className="p-3 bg-background/50 border border-border rounded">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase mb-1">
                        AI Reasoning
                      </p>
                      <p className="text-xs text-foreground">{schedule.aiReasoning}</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button
                      data-testid="button-download-schedule"
                      onClick={handleDownloadPDF}
                      disabled={isDownloading}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-border font-mono text-xs rounded-none"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Please wait...
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 mr-2" />
                          Download PDF
                        </>
                      )}
                    </Button>
                    <Button
                      data-testid="button-build-another"
                      onClick={handleBuildNew}
                      size="sm"
                      className="flex-1 bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none uppercase"
                    >
                      <Plus className="w-3 h-3 mr-2" />
                      Build Another
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-8 gap-4">
                    <p className="text-sm text-muted-foreground text-center">
                      No schedule set for {selectedDate}. Would you like to create one?
                    </p>
                    <Button
                      onClick={handleBuildNew}
                      className="bg-primary text-black hover:bg-primary/90 font-mono text-xs rounded-none uppercase"
                      data-testid="button-create-schedule-for-date"
                    >
                      <Plus className="w-3 h-3 mr-2" />
                      CREATE SCHEDULE
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
            )}

            {/* Info Card */}
            <Card className="border-border bg-primary/5">
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <p className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Use the Schedule Builder to create optimized schedules with AI assistance</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Select dates above to view any of your saved schedules</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Dialog open={!!selectedBlock} onOpenChange={(open) => !open && setSelectedBlock(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border border-primary/40 rounded-none p-4">
          {selectedBlock && (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-primary/20">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-primary text-black text-[9px] font-mono font-bold tracking-widest">
                      {selectedBlock.type}
                    </span>
                    {selectedBlock.priority && (
                      <span className="text-[9px] font-mono text-orange-400">P{selectedBlock.priority}</span>
                    )}
                  </div>
                  <h2 className="text-lg font-display font-bold uppercase tracking-widest">
                    {selectedBlock.title}
                  </h2>
                  <p className="text-[10px] font-mono text-primary mt-1">
                    {selectedBlock.startTime} — {selectedBlock.endTime}
                  </p>
                </div>
              </div>

              {/* Content Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedBlock.courseCode && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Course</p>
                    <p className="text-xs font-mono text-primary">{selectedBlock.courseCode}</p>
                  </div>
                )}

                {selectedBlock.difficultyLevel && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Difficulty</p>
                    <p className="text-xs font-mono">{selectedBlock.difficultyLevel}/5</p>
                  </div>
                )}

                {selectedBlock.energyRequired && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Energy</p>
                    <p className="text-xs">{selectedBlock.energyRequired}</p>
                  </div>
                )}

                {selectedBlock.location && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Location</p>
                    <p className="text-xs">{selectedBlock.location}</p>
                  </div>
                )}

                {selectedBlock.resourcesNeeded && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Resources</p>
                    <p className="text-xs">{selectedBlock.resourcesNeeded}</p>
                  </div>
                )}

                {selectedBlock.bufferTimeAfter && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Buffer</p>
                    <p className="text-xs font-mono">{selectedBlock.bufferTimeAfter} MIN</p>
                  </div>
                )}

                {selectedBlock.reminderNotification && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Reminder</p>
                    <p className="text-xs font-mono">{selectedBlock.reminderNotification} MIN</p>
                  </div>
                )}

                {selectedBlock.collaborators && (
                  <div>
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Collaborators</p>
                    <p className="text-xs">{selectedBlock.collaborators}</p>
                  </div>
                )}
              </div>

              {/* Full Width Sections */}
              {selectedBlock.description && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Description</p>
                  <p className="text-xs leading-snug text-foreground">{selectedBlock.description}</p>
                </div>
              )}

              {selectedBlock.goal && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Goal</p>
                  <p className="text-xs leading-snug text-primary font-medium">{selectedBlock.goal}</p>
                </div>
              )}

              {selectedBlock.dependencies && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Dependencies</p>
                  <p className="text-xs text-foreground">{selectedBlock.dependencies}</p>
                </div>
              )}

              {selectedBlock.successMetrics && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Success Metrics</p>
                  <p className="text-xs text-foreground">{selectedBlock.successMetrics}</p>
                </div>
              )}

              {selectedBlock.reason && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-[9px] font-mono text-primary uppercase tracking-widest mb-1 font-bold">AI Context</p>
                  <p className="text-xs text-foreground">{selectedBlock.reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  );
}
