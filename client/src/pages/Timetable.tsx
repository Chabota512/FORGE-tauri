import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCourses, useCommitments, useCreateCommitment, useUpdateCommitment, useDeleteCommitment, useDeadlines, useCreateDeadline, useDeleteDeadline } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Calendar, CheckCircle, Home, RefreshCw, ChevronDown, ChevronRight, BarChart3, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";
import { DailyScheduleView } from "@/components/DailyScheduleView";
import { WeeklyClassTimetable } from "@/components/WeeklyClassTimetable";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { StatsDialog } from "@/components/StatsDialog";
import { YearCalendar } from "@/components/YearCalendar";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COMMITMENT_TYPES = ["class", "exam", "assignment", "personal", "study"];
const DEADLINE_TYPES = ["exam", "ca", "assignment", "project", "submission"];
const PRIORITY_LEVELS = ["1 - Low Priority", "2 - Medium Priority", "3 - High Priority"];

export default function TimetablePage() {
  const queryClient = useQueryClient();
  const { data: courses = [] } = useCourses();
  const { data: commitments = [], isLoading: commLoading, refetch: refetchCommitments } = useCommitments();
  const { data: deadlines = [], isLoading: deadLoading } = useDeadlines();
  const createCommitment = useCreateCommitment();
  const updateCommitment = useUpdateCommitment();
  const deleteCommitment = useDeleteCommitment();
  const createDeadline = useCreateDeadline();
  const deleteDeadline = useDeleteDeadline();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [statsOpen, setStatsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [deleteDialog, setDeleteDialog] = useState<{ id: number; type: "commitment" | "deadline" | null } | null>(null);
  const [expandedForm, setExpandedForm] = useState<"recurring" | "deadline" | "oneoff" | null>(null);

  const [newCommitment, setNewCommitment] = useState({
    title: "",
    type: "class",
    startTime: "09:00",
    endTime: "11:00",
    dayOfWeek: 1,
    isRecurring: true,
    venue: "",
    topic: "",
    courseId: undefined as number | undefined,
  });

  const [newOneTimeCommitment, setNewOneTimeCommitment] = useState({
    title: "",
    type: "personal",
    description: "",
    specificDate: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "11:00",
    isRecurring: false,
  });

  const [newDeadline, setNewDeadline] = useState({
    title: "",
    type: "exam",
    courseId: courses.length > 0 ? courses[0].id : undefined,
    dueDate: new Date().toISOString().split("T")[0],
    dueTime: "23:59",
    priority: 2,
  });

  const handleAddCommitment = async () => {
    if (!newCommitment.title.trim()) {
      toast({ title: "Error", description: "Enter commitment title", variant: "destructive" });
      return;
    }
    try {
      await createCommitment.mutateAsync(newCommitment);
      await refetchCommitments();
      toast({ title: "Added", description: "Commitment saved" });
      resetCommitmentForm();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save commitment", variant: "destructive" });
    }
  };

  const resetCommitmentForm = () => {
    setNewCommitment({
      title: "",
      type: "class",
      startTime: "09:00",
      endTime: "11:00",
      dayOfWeek: 1,
      isRecurring: true,
      venue: "",
      topic: "",
      courseId: undefined,
    });
  };

  const handleAddDeadline = async () => {
    if (!newDeadline.title.trim()) {
      toast({ title: "Error", description: "Enter deadline title", variant: "destructive" });
      return;
    }
    try {
      await createDeadline.mutateAsync(newDeadline);
      setNewDeadline({
        title: "",
        type: "exam",
        courseId: courses.length > 0 ? courses[0].id : undefined,
        dueDate: new Date().toISOString().split("T")[0],
        dueTime: "23:59",
        priority: 2,
      });
      toast({ title: "Added", description: "Deadline saved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save deadline", variant: "destructive" });
    }
  };

  const handleAddOneTimeCommitment = async () => {
    if (!newOneTimeCommitment.title.trim()) {
      toast({ title: "Error", description: "Enter event title", variant: "destructive" });
      return;
    }
    try {
      await createCommitment.mutateAsync(newOneTimeCommitment);
      await refetchCommitments();
      toast({ title: "Added", description: "Event saved" });
      resetOneTimeForm();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save event", variant: "destructive" });
    }
  };

  const resetOneTimeForm = () => {
    setNewOneTimeCommitment({
      title: "",
      type: "personal",
      description: "",
      specificDate: new Date().toISOString().split("T")[0],
      startTime: "09:00",
      endTime: "11:00",
      isRecurring: false,
    });
  };

  const recurringCommitments = commitments.filter(c => c.isRecurring);
  const oneTimeCommitments = commitments.filter(c => !c.isRecurring);

  return (
    <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded]">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
            <button data-testid="button-logo" onClick={() => navigate("/")} className="flex items-center gap-3 transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)] group-active:drop-shadow-[0_0_16px_rgba(190,242,100,0.8)]">
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
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold font-display tracking-widest">TIMETABLE</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                data-testid="button-calendar-view"
                onClick={() => setCalendarOpen(true)} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-white/20 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <CalendarDays className="w-4 h-4 mr-2" />
                CALENDAR
              </Button>
              <Button 
                data-testid="button-navigate-statistics"
                onClick={() => navigate("/statistics")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                STATISTICS
              </Button>
            </div>
          </div>
        </div>

        <div className="-mt-3 mb-6">
          <ActivityTimeline onStatsClick={() => setStatsOpen(true)} />
        </div>

        <div data-testid="schedule-container" className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Generated Schedule</h2>
            <Button
              data-testid="button-schedules"
              onClick={() => navigate("/schedules")}
              size="sm"
              variant="outline"
              className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
            >My Schedules</Button>
          </div>
          <DailyScheduleView />
        </div>

        <Tabs defaultValue="recurring" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="recurring">Weekly Classes</TabsTrigger>
            <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
            <TabsTrigger value="oneoff">One-Off Events</TabsTrigger>
          </TabsList>

          {/* RECURRING COMMITMENTS */}
          <TabsContent value="recurring" className="space-y-6">
            <WeeklyClassTimetable 
              commitments={recurringCommitments}
              onAdd={(newClass) => {
                createCommitment.mutateAsync({
                  title: newClass.title,
                  type: newClass.type || "class",
                  startTime: newClass.startTime,
                  endTime: newClass.endTime,
                  dayOfWeek: newClass.dayOfWeek,
                  isRecurring: true,
                  venue: newClass.venue || "",
                  topic: newClass.topic || "",
                }).then(() => {
                  toast({ title: "Added", description: "Class added to timetable" });
                  refetchCommitments();
                }).catch(() => {
                  toast({ title: "Error", description: "Failed to add class", variant: "destructive" });
                });
              }}
              onEdit={(commitment) => {
                updateCommitment.mutateAsync({
                  id: commitment.id,
                  title: commitment.title,
                  type: commitment.type || "class",
                  startTime: commitment.startTime,
                  endTime: commitment.endTime,
                  dayOfWeek: commitment.dayOfWeek || 1,
                  isRecurring: true,
                  venue: commitment.venue || "",
                  topic: commitment.topic || "",
                }).then(() => {
                  toast({ title: "Updated", description: "Commitment saved" });
                  refetchCommitments();
                }).catch(() => {
                  toast({ title: "Error", description: "Failed to update commitment", variant: "destructive" });
                });
              }}
              onDelete={(id) => deleteCommitment.mutate(id)}
            />

            <Card className="border-white/10 bg-black/50">
              <CardHeader>
                <button
                  onClick={() => setExpandedForm(expandedForm === "recurring" ? null : "recurring")}
                  className="w-full flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-left"
                  data-testid="button-toggle-recurring-form"
                >
                  {expandedForm === "recurring" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <div className="flex-1">
                    <CardTitle className="font-display">Add Recurring Class</CardTitle>
                    <CardDescription>Classes that repeat every week</CardDescription>
                  </div>
                </button>
              </CardHeader>
              {expandedForm === "recurring" && (
                <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select 
                    value={newCommitment.courseId?.toString() || ""} 
                    onValueChange={(v) => {
                      const courseId = v ? parseInt(v) : undefined;
                      const course = courses.find(c => c.id === courseId);
                      setNewCommitment({ 
                        ...newCommitment, 
                        courseId,
                        title: course ? `${course.code} Lecture` : ""
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-commitment-course" className="bg-white/5 border-white/10">
                      <SelectValue placeholder="Select course..." />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id.toString()}>
                          [{course.code}] {course.name.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newCommitment.dayOfWeek.toString()} onValueChange={(v) => setNewCommitment({ ...newCommitment, dayOfWeek: parseInt(v) })}>
                    <SelectTrigger data-testid="select-day" className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day, i) => (
                        <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Venue (e.g., Room 101)"
                    value={newCommitment.venue}
                    onChange={(e) => setNewCommitment({ ...newCommitment, venue: e.target.value })}
                    data-testid="input-venue"
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Topic (e.g., Control Theory)"
                    value={newCommitment.topic}
                    onChange={(e) => setNewCommitment({ ...newCommitment, topic: e.target.value })}
                    data-testid="input-topic"
                    className="bg-white/5 border-white/10"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={newCommitment.startTime}
                      onChange={(e) => setNewCommitment({ ...newCommitment, startTime: e.target.value })}
                      data-testid="input-start-time"
                      className="bg-white/5 border-white/10"
                    />
                    <Input
                      type="time"
                      value={newCommitment.endTime}
                      onChange={(e) => setNewCommitment({ ...newCommitment, endTime: e.target.value })}
                      data-testid="input-end-time"
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <Button
                    onClick={handleAddCommitment}
                    disabled={createCommitment.isPending}
                    data-testid="button-add-commitment"
                    className="md:col-span-2 bg-primary text-black hover:bg-primary/80 font-mono"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add
                  </Button>
                </div>
                </CardContent>
              )}
            </Card>

            <div className="space-y-3">
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Your Weekly Schedule</h3>
              {recurringCommitments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recurring commitments yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recurringCommitments.map((c) => (
                    <Card key={c.id} className="border-white/10 bg-black/30" data-testid={`card-commitment-${c.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold">{c.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {DAYS[c.dayOfWeek || 0]} • {c.startTime} - {c.endTime}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog({ id: c.id, type: "commitment" })}
                            data-testid={`button-delete-commitment-${c.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* DEADLINES */}
          <TabsContent value="deadlines" className="space-y-6">
            <Card className="border-white/10 bg-black/50">
              <CardHeader>
                <button
                  onClick={() => setExpandedForm(expandedForm === "deadline" ? null : "deadline")}
                  className="w-full flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-left"
                  data-testid="button-toggle-deadline-form"
                >
                  {expandedForm === "deadline" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <div className="flex-1">
                    <CardTitle className="font-display">Add Deadline</CardTitle>
                    <CardDescription>Exams, CAs, assignments, and submissions</CardDescription>
                  </div>
                </button>
              </CardHeader>
              {expandedForm === "deadline" && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      placeholder="Deadline title"
                      value={newDeadline.title}
                      onChange={(e) => setNewDeadline({ ...newDeadline, title: e.target.value })}
                      data-testid="input-deadline-title"
                      className="bg-white/5 border-white/10"
                    />
                    <Select value={newDeadline.courseId?.toString() || ""} onValueChange={(v) => setNewDeadline({ ...newDeadline, courseId: v === "other" ? undefined : parseInt(v) })}>
                      <SelectTrigger data-testid="select-deadline-course" className="bg-white/5 border-white/10">
                        <SelectValue placeholder="Select course..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="other">Other</SelectItem>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={course.id.toString()}>{course.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newDeadline.type} onValueChange={(v) => setNewDeadline({ ...newDeadline, type: v })}>
                      <SelectTrigger data-testid="select-deadline-type" className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEADLINE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={newDeadline.dueDate}
                      onChange={(e) => setNewDeadline({ ...newDeadline, dueDate: e.target.value })}
                      data-testid="input-due-date"
                      className="bg-white/5 border-white/10 accent-primary"
                    />
                    <Select value={newDeadline.priority.toString()} onValueChange={(v) => setNewDeadline({ ...newDeadline, priority: parseInt(v) })}>
                      <SelectTrigger data-testid="select-priority" className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_LEVELS.map((p, i) => (
                          <SelectItem key={i} value={(i + 1).toString()}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddDeadline}
                      disabled={createDeadline.isPending}
                      data-testid="button-add-deadline"
                      className="md:col-span-2 bg-primary text-black hover:bg-primary/80 font-mono"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Deadline
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="space-y-3">
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Upcoming Deadlines</h3>
              {deadlines.length === 0 ? (
                <p className="text-muted-foreground text-sm">No deadlines yet</p>
              ) : (
                <div className="space-y-2">
                  {deadlines.map((d) => (
                    <Card key={d.id} className="border-white/10 bg-black/30" data-testid={`card-deadline-${d.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold">{d.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {d.dueDate} {d.dueTime && `• ${d.dueTime}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded font-mono">{d.type}</span>
                            <span className="text-primary">
                              {d.courseId ? courses.find(c => c.id === d.courseId)?.code : "Other"}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog({ id: d.id, type: "deadline" })}
                            data-testid={`button-delete-deadline-${d.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ONE-OFF EVENTS */}
          <TabsContent value="oneoff" className="space-y-6">
            <Card className="border-white/10 bg-black/50">
              <CardHeader>
                <button
                  onClick={() => setExpandedForm(expandedForm === "oneoff" ? null : "oneoff")}
                  className="w-full flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-left"
                  data-testid="button-toggle-oneoff-form"
                >
                  {expandedForm === "oneoff" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <div className="flex-1">
                    <CardTitle className="font-display">Add One-Time Event</CardTitle>
                    <CardDescription>One-off commitments on specific dates</CardDescription>
                  </div>
                </button>
              </CardHeader>
              {expandedForm === "oneoff" && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      placeholder="Event title"
                      value={newOneTimeCommitment.title}
                      onChange={(e) => setNewOneTimeCommitment({ ...newOneTimeCommitment, title: e.target.value })}
                      data-testid="input-oneoff-title"
                      className="bg-white/5 border-white/10 md:col-span-2"
                    />
                    <Input
                      type="date"
                      value={newOneTimeCommitment.specificDate}
                      onChange={(e) => setNewOneTimeCommitment({ ...newOneTimeCommitment, specificDate: e.target.value })}
                      data-testid="input-oneoff-date"
                      className="bg-white/5 border-white/10 accent-primary"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={newOneTimeCommitment.startTime}
                        onChange={(e) => setNewOneTimeCommitment({ ...newOneTimeCommitment, startTime: e.target.value })}
                        data-testid="input-oneoff-start"
                        className="bg-white/5 border-white/10"
                      />
                      <Input
                        type="time"
                        value={newOneTimeCommitment.endTime}
                        onChange={(e) => setNewOneTimeCommitment({ ...newOneTimeCommitment, endTime: e.target.value })}
                        data-testid="input-oneoff-end"
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                    <Input
                      placeholder="Notes (optional)"
                      value={newOneTimeCommitment.description || ""}
                      onChange={(e) => setNewOneTimeCommitment({ ...newOneTimeCommitment, description: e.target.value })}
                      data-testid="input-oneoff-notes"
                      className="bg-white/5 border-white/10 md:col-span-2"
                    />
                    <Button
                      onClick={handleAddOneTimeCommitment}
                      disabled={createCommitment.isPending}
                      data-testid="button-add-oneoff"
                      className="md:col-span-2 bg-primary text-black hover:bg-primary/80 font-mono"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Event
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="space-y-3">
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">One-Time Commitments</h3>
              {oneTimeCommitments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No one-time commitments yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {oneTimeCommitments.map((c) => (
                    <Card key={c.id} className="border-white/10 bg-black/30" data-testid={`card-oneoff-${c.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold">{c.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {c.specificDate} • {c.startTime} - {c.endTime}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog({ id: c.id, type: "commitment" })}
                            data-testid={`button-delete-oneoff-${c.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="bg-black/95 border border-destructive/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono uppercase text-destructive">DELETE?</DialogTitle>
            <DialogDescription className="text-[10px] font-mono text-muted-foreground">
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-mono uppercase"
              onClick={() => setDeleteDialog(null)}
              data-testid="button-cancel-delete-timetable"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[10px] font-mono uppercase bg-destructive text-white hover:bg-destructive/80"
              onClick={() => {
                if (deleteDialog) {
                  if (deleteDialog.type === "commitment") {
                    deleteCommitment.mutate(deleteDialog.id);
                  } else if (deleteDialog.type === "deadline") {
                    deleteDeadline.mutate(deleteDialog.id);
                  }
                  setDeleteDialog(null);
                }
              }}
              data-testid="button-confirm-delete-timetable"
            >
              DELETE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />
      <YearCalendar 
        open={calendarOpen} 
        onOpenChange={setCalendarOpen}
        deadlines={deadlines}
        oneOffEvents={oneTimeCommitments}
        year={calendarYear}
        onYearChange={setCalendarYear}
      />
      <Footer />
    </div>
  );
}