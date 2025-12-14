import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, FileText, FolderOpen, RefreshCw, Trash2, MessageCircle } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useCourses, useCourseContext, useForgeKBFiles, useDeleteCourse, useUpdateCourse } from "@/lib/api";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { KnowledgeChatDialog } from "@/components/KnowledgeChatDialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconPicker } from "@/components/IconPicker";
import * as Icons from "lucide-react";

export default function KnowledgePage() {
  const [, navigate] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [deleteDialogCourse, setDeleteDialogCourse] = useState<{ id: number; code: string } | null>(null);
  const [editCourse, setEditCourse] = useState<any>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editProgram, setEditProgram] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles } = useForgeKBFiles();
  const { data: context, isLoading: contextLoading } = useCourseContext(selectedCourse);
  const deleteCourse = useDeleteCourse();
  const updateCourse = useUpdateCourse();

  const renderCourseIcon = (iconName: string | undefined) => {
    if (!iconName) iconName = "Zap";
    const Icon = Icons[iconName as keyof typeof Icons] as any;
    return Icon ? <Icon className="w-4 h-4 text-primary" /> : <Icons.Zap className="w-4 h-4 text-primary" />;
  };

  const handleEditCourse = (course: any) => {
    setEditCourse(course);
    setEditCode(course.code);
    setEditName(course.name);
    setEditProgram(course.programOfStudy || "");
    setEditIcon(course.icon || "Zap");
  };

  const handleSaveEdit = async () => {
    if (!editCourse || !editCode.trim() || !editName.trim()) {
      toast({
        title: "Missing Information",
        description: "Course code and name are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateCourse.mutateAsync({
        id: editCourse.id,
        code: editCode.toUpperCase().trim(),
        name: editName.trim(),
        programOfStudy: editProgram.trim() || undefined,
        icon: editIcon,
      });

      toast({
        title: "Course Updated",
        description: `${editCode.toUpperCase()} has been updated successfully.`,
      });

      setEditCourse(null);
    } catch (error: any) {
      const errorMsg = error.message || "An error occurred while updating the course.";
      toast({
        title: "Duplicate Course",
        description: errorMsg.includes("already exists") ? errorMsg : "This course code or name already exists.",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDeleteCourse = async () => {
    if (!deleteDialogCourse) return;
    
    const courseCode = deleteDialogCourse.code;
    
    try {
      const result = await deleteCourse.mutateAsync(deleteDialogCourse.id);
      
      // Clear selected course if it was the deleted one
      if (selectedCourse === courseCode) {
        setSelectedCourse("");
      }
      
      // Close dialog first
      setDeleteDialogCourse(null);
      
      // Show success toast after deletion is confirmed
      toast({
        title: "Course Deleted",
        description: `${courseCode} and all related data have been removed.`,
      });
    } catch (error: any) {
      setDeleteDialogCourse(null);
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete course.",
        variant: "destructive",
      });
    }
  };

  const groupedFiles = files.reduce((acc, file) => {
    if (!acc[file.course]) acc[file.course] = [];
    acc[file.course].push(file);
    return acc;
  }, {} as Record<string, typeof files>);

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
                data-testid="button-refresh"
                onClick={() => refetchFiles()} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button 
                data-testid="button-ingest"
                onClick={() => navigate("/ingest")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                INGEST
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
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">Knowledge Base</h2>
                <p className="text-sm font-mono text-muted-foreground">Browse /forge_kb/ directory contents</p>
              </div>
            </div>
            <BackButton label="DASHBOARD" onClick={() => navigate("/home")} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="tech-panel p-6 space-y-4">
                <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                  Proof Files
                </h3>

                {filesLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-mono text-muted-foreground">Loading files...</span>
                  </div>
                ) : Object.keys(groupedFiles).length === 0 ? (
                  <div className="text-center py-8">
                    <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-sm font-mono text-muted-foreground">No files in knowledge base yet.</p>
                    <p className="text-xs font-mono text-muted-foreground/60 mt-1">Complete missions to add proof files.</p>
                    <Button
                      data-testid="button-navigate-missions"
                      onClick={() => navigate("/missions")}
                      className="mt-4 font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
                      size="sm"
                    >
                      GO TO MISSIONS
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedFiles).map(([courseCode, courseFiles]) => (
                      <div key={courseCode} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-mono text-primary">
                          <FolderOpen className="w-4 h-4" />
                          <span>/forge_kb/{courseCode}/</span>
                          <span className="text-muted-foreground">({courseFiles.length})</span>
                        </div>
                        <div className="ml-6 space-y-1">
                          {courseFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-background/50 border border-border hover:border-primary/30 transition-colors">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-mono" data-testid={`text-file-${idx}`}>{file.name}</span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground">{formatFileSize(file.size)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="tech-panel p-6 space-y-4">
                <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                  Course Contexts
                </h3>

                {coursesLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-mono text-muted-foreground">Loading courses...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courses.map((course) => (
                      <div key={course.code} className="flex items-stretch gap-2 group">
                        <button
                          onClick={() => setSelectedCourse(selectedCourse === course.code ? "" : course.code)}
                          onDoubleClick={() => handleEditCourse(course)}
                          className={`flex-1 text-left p-3 border transition-all ${
                            selectedCourse === course.code 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border hover:border-primary/50'
                          }`}
                          data-testid={`button-course-${course.code}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {renderCourseIcon(course.icon)}
                            <span className="text-sm font-mono font-bold">
                              [{course.code}]
                            </span>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground ml-6">
                            {course.name.replace(/_/g, " ")}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 px-2 border border-border group-hover:border-primary/50 transition-all">
                          <span className="text-xs font-mono text-muted-foreground">context.json</span>
                          <button
                            onClick={() => setDeleteDialogCourse({ id: course.id, code: course.code })}
                            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20 rounded transition-colors"
                            data-testid={`button-delete-course-${course.code}`}
                            title="Delete course"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCourse && (
                <div className="tech-panel p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-sm font-display uppercase tracking-widest text-primary">
                      {selectedCourse} Context
                    </h3>
                    <Button
                      data-testid="button-chat-learning"
                      onClick={() => setChatDialogOpen(true)}
                      size="sm"
                      className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
                      variant="outline"
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      Chat About Learning
                    </Button>
                  </div>

                  {contextLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-mono text-muted-foreground">Loading context...</span>
                    </div>
                  ) : context?.concepts && context.concepts.length > 0 ? (
                    <div className="space-y-4">
                      {context.summary && (
                        <p className="text-sm font-mono text-muted-foreground border-l-2 border-primary pl-3">
                          {context.summary}
                        </p>
                      )}
                      
                      <div className="space-y-2">
                        {context.concepts.map((concept, idx) => (
                          <div key={idx} className="p-3 bg-background/50 border border-border">
                            <span className="text-sm font-mono font-bold text-primary">{concept.name}</span>
                            <p className="text-xs font-mono text-muted-foreground mt-1">{concept.description}</p>
                          </div>
                        ))}
                      </div>

                      {context.lastUpdated && (
                        <p className="text-xs font-mono text-muted-foreground/60">
                          Last updated: {formatDate(context.lastUpdated)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm font-mono text-muted-foreground">No context indexed for this course.</p>
                      <p className="text-xs font-mono text-muted-foreground/60 mt-1">Upload notes in the Ingest page.</p>
                      <Button
                        data-testid="button-navigate-ingest"
                        onClick={() => navigate("/ingest")}
                        className="mt-4 font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
                        size="sm"
                      >
                        GO TO INGEST
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Dialog open={!!editCourse} onOpenChange={(open) => !open && setEditCourse(null)}>
        <DialogContent className="bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-widest">Edit Course</DialogTitle>
            <DialogDescription className="text-sm font-mono text-muted-foreground">
              Update course information.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editCourseCode" className="text-sm font-mono">Course Code *</Label>
              <Input
                id="editCourseCode"
                data-testid="input-edit-course-code"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                placeholder="e.g., MC450"
                className="font-mono bg-background border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editCourseName" className="text-sm font-mono">Course Name *</Label>
              <Input
                id="editCourseName"
                data-testid="input-edit-course-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Control Systems"
                className="font-mono bg-background border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editCourseProgram" className="text-sm font-mono">Program of Study</Label>
              <Input
                id="editCourseProgram"
                data-testid="input-edit-course-program"
                value={editProgram}
                onChange={(e) => setEditProgram(e.target.value)}
                placeholder="e.g., Mechanical Engineering"
                className="font-mono bg-background border-border"
              />
              <p className="text-xs font-mono text-muted-foreground">Optional: The academic program this course belongs to</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-mono">Course Icon</Label>
              <IconPicker value={editIcon} onChange={setEditIcon} />
              <p className="text-xs font-mono text-muted-foreground">Choose an icon to represent this course</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditCourse(null)}
              className="font-mono text-sm border-border"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-save-edit-course"
              onClick={handleSaveEdit}
              disabled={updateCourse.isPending}
              className="font-mono text-sm bg-primary text-black hover:bg-primary/90"
            >
              {updateCourse.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDialogCourse} onOpenChange={(open) => !open && setDeleteDialogCourse(null)}>
        <AlertDialogContent className="bg-black/95 border border-destructive/50 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xs font-mono uppercase text-destructive">
              DELETE COURSE?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[10px] font-mono text-muted-foreground">
              This will permanently delete {deleteDialogCourse?.code} and all related data (missions, deadlines, commitments, context). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 pt-2">
            <AlertDialogCancel 
              className="text-[10px] font-mono uppercase"
              data-testid="button-cancel-delete-course"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCourse}
              disabled={deleteCourse.isPending}
              className="text-[10px] font-mono uppercase bg-destructive text-white hover:bg-destructive/80"
              data-testid="button-confirm-delete-course"
            >
              {deleteCourse.isPending ? "DELETING..." : "DELETE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedCourse && (() => {
        const course = courses.find(c => c.code === selectedCourse);
        if (!course) return null;
        return (
          <KnowledgeChatDialog
            open={chatDialogOpen}
            onOpenChange={setChatDialogOpen}
            courseId={course.id}
            courseName={course.name.replace(/_/g, " ")}
            courseCode={course.code}
          />
        );
      })()}

      <Footer />
    </div>
  );
}
