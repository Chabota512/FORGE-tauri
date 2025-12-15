import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Archive, Home, Upload, Loader2, CheckCircle, FileText, Brain, Plus, X, AlertCircle, Info, Square } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { useCourses, useCourseContext, useLLMStatus, useCreateCourse, Concept } from "@/lib/api";
import { IconPicker } from "@/components/IconPicker";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/queryClient";

interface FileStatus {
  fileName: string;
  fileSize: number;
  status: "queued" | "uploading" | "processing" | "completed" | "failed";
  currentStage?: string;
  currentStageIndex?: number;
  totalStages?: number;
  error?: string;
  concepts?: Concept[];
  summary?: string;
}

export default function IngestPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoDialogContent, setInfoDialogContent] = useState<FileStatus | null>(null);
  const [currentlyProcessingFile, setCurrentlyProcessingFile] = useState<string | null>(null);
  const [shouldCancelUpload, setShouldCancelUpload] = useState(false);

  const PIPELINE_STAGES = [
    { key: "uploaded", label: "Upload" },
    { key: "extracting", label: "Extract" },
    { key: "chunking", label: "Chunk" },
    { key: "embedding", label: "Embed" },
    { key: "updating_context", label: "Context" },
    { key: "distributing", label: "Distribute" },
    { key: "completed", label: "Done" },
  ];
  
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseProgram, setNewCourseProgram] = useState("");
  const [newCourseIcon, setNewCourseIcon] = useState("Zap");

  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const { data: llmStatus } = useLLMStatus();
  const { data: courseContext, isLoading: contextLoading, refetch: refetchContext } = useCourseContext(selectedCourse);
  const createCourse = useCreateCourse();
  
  const handleAddCourse = async () => {
    if (!newCourseCode.trim() || !newCourseName.trim()) {
      toast({
        title: "Missing Information",
        description: "Course code and name are required.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await createCourse.mutateAsync({
        code: newCourseCode.toUpperCase().trim(),
        name: newCourseName.trim(),
        programOfStudy: newCourseProgram.trim() || undefined,
        icon: newCourseIcon,
      });
      
      toast({
        title: "Course Added",
        description: `${newCourseCode.toUpperCase()} has been added successfully.`,
      });
      
      setNewCourseCode("");
      setNewCourseName("");
      setNewCourseProgram("");
      setNewCourseIcon("Zap");
      setAddCourseOpen(false);
      setSelectedCourse(newCourseCode.toUpperCase().trim());
    } catch (error: any) {
      const errorMsg = error.message || "An error occurred while adding the course.";
      toast({
        title: "Duplicate Course",
        description: errorMsg.includes("already exists") ? errorMsg : "This course code or name already exists.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles([...selectedFiles, ...files]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles([...selectedFiles, ...files]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const updateFileStatus = (fileName: string, status: Partial<FileStatus>) => {
    setFileStatuses(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(fileName) || { fileName, fileSize: 0, status: "queued" };
      newMap.set(fileName, { ...current, ...status });
      return newMap;
    });
  };

  const openInfoDialog = (fileName: string) => {
    const status = fileStatuses.get(fileName);
    if (status) {
      setInfoDialogContent(status);
      setInfoDialogOpen(true);
    }
  };

  const pollPipelineStatus = async (fileId: number, fileName: string) => {
    const maxAttempts = 120;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(getApiUrl(`/api/ingest/status/${fileId}`), { credentials: "include" });
        const status = await res.json();
        
        updateFileStatus(fileName, {
          status: status.stage === "completed" ? "completed" : status.stage === "failed" ? "failed" : "processing",
          currentStage: status.stage,
          currentStageIndex: status.currentStageIndex,
          totalStages: status.totalStages,
          error: status.error,
        });
        
        if (status.stage === "completed") {
          return { success: true };
        }
        
        if (status.stage === "failed") {
          return { success: false, error: status.error };
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    updateFileStatus(fileName, { status: "failed", error: "Pipeline timeout" });
    return { success: false, error: "Pipeline timeout" };
  };

  const handleUploadBatch = async () => {
    if (!selectedCourse) {
      toast({
        title: "Missing Course",
        description: "Please select a course.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFiles.length === 0) {
      toast({
        title: "No Files",
        description: "Please select files to upload.",
        variant: "destructive",
      });
      return;
    }

    setUploadingBatch(true);
    setShouldCancelUpload(false);
    setCurrentlyProcessingFile(null);
    setFileStatuses(new Map());

    try {
      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
        if (shouldCancelUpload) {
          toast({
            title: "Upload Cancelled",
            description: "The file upload process was cancelled.",
            variant: "destructive",
          });
          break;
        }

        const file = selectedFiles[fileIndex];
        setCurrentlyProcessingFile(file.name);
        updateFileStatus(file.name, { status: "uploading", fileSize: file.size });

        const formData = new FormData();
        formData.append("courseCode", selectedCourse);
        formData.append("file", file);

        try {
          const res = await fetch(getApiUrl("/api/ingest"), {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          const data = await res.json();

          if (res.ok && data.fileId) {
            const result = await pollPipelineStatus(data.fileId, file.name);
            
            if (result.success) {
              updateFileStatus(file.name, { status: "completed" });
              refetchContext();
              toast({
                title: `${file.name}`,
                description: "Processed successfully",
              });
            } else {
              updateFileStatus(file.name, { status: "failed", error: result.error });
              toast({
                title: `Failed: ${file.name}`,
                description: result.error || "Pipeline failed",
                variant: "destructive",
              });
            }
          } else {
            const errorMsg = data.error || "Upload failed - please try again";
            updateFileStatus(file.name, { status: "failed", error: errorMsg });
            toast({
              title: `Failed: ${file.name}`,
              description: errorMsg,
              variant: "destructive",
            });
          }
        } catch (error: any) {
          const errorMsg = error?.message || "Network error";
          updateFileStatus(file.name, { status: "failed", error: errorMsg });
          toast({
            title: `Error: ${file.name}`,
            description: errorMsg,
            variant: "destructive",
          });
        }
      }
      
      const completed = Array.from(fileStatuses.values()).filter(f => f.status === "completed").length;
      const failed = Array.from(fileStatuses.values()).filter(f => f.status === "failed").length;
      
      if (completed > 0) {
        toast({
          title: `${completed}/${selectedFiles.length} Files Ingested`,
          description: failed > 0 
            ? `${completed} completed, ${failed} failed`
            : `All files processed successfully!`,
          variant: failed > 0 ? "destructive" : "default",
        });
      }
      
      if (failed === 0 && completed === selectedFiles.length && !shouldCancelUpload) {
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        refetchContext();
      }
      
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploadingBatch(false);
      setCurrentlyProcessingFile(null);
      setShouldCancelUpload(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

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
                <span className="text-[#a7eb42]">{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                data-testid="button-library"
                onClick={() => navigate("/library")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                READING LIBRARY
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">Ingest Notes</h2>
                <p className="text-sm font-mono text-muted-foreground">Upload multiple course materials for AI-powered concept extraction</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BackButton label="KNOWLEDGE BASE" onClick={() => navigate("/knowledge")} />
            </div>
          </div>


          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="tech-panel p-6 space-y-4">
                <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                  Upload Documents
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-mono">Target Course</Label>
                    <div className="flex gap-2">
                      <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                        <SelectTrigger data-testid="select-course" className="font-mono text-sm bg-background border-border flex-1">
                          <SelectValue placeholder="Select a course..." />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.code} value={course.code} className="font-mono">
                              [{course.code}] {course.name.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        data-testid="button-add-course"
                        onClick={() => setAddCourseOpen(true)}
                        variant="outline"
                        size="icon"
                        className="border-primary text-primary hover:bg-primary hover:text-black"
                        title="Add New Course"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-mono">Documents</Label>
                    <div
                      data-testid="dropzone"
                      className={`border-2 border-dashed rounded-none p-8 text-center cursor-pointer transition-all ${
                        selectedFiles.length > 0
                          ? 'border-primary bg-primary/10' 
                          : 'border-border hover:border-primary/50 hover:bg-primary/5'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.xlsx,.xls,.pptx,.ppt,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                        onChange={handleFileSelect}
                        multiple
                        data-testid="input-file"
                      />
                      
                      {selectedFiles.length > 0 ? (
                        <div className="space-y-2">
                          <FileText className="w-10 h-10 mx-auto text-primary" />
                          <p className="text-sm font-mono text-primary">{selectedFiles.length} file(s) selected</p>
                          <p className="text-xs font-mono text-muted-foreground">Click or drag to add more files</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                          <p className="text-sm font-mono text-muted-foreground">Click or drag to upload</p>
                          <p className="text-xs font-mono text-muted-foreground/60">PDF, DOCX, XLSX, PPTX, TXT, MD, PNG, JPG, GIF, WEBP</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono text-muted-foreground">Selected files:</p>
                      <p className="text-xs font-mono text-muted-foreground">{selectedFiles.length} file(s)</p>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedFiles.map((file, idx) => {
                        const status = fileStatuses.get(file.name);
                        const statusColor = !status ? 'text-muted-foreground border-muted' 
                          : status.status === "completed" ? 'text-green-500 border-green-500/30 bg-green-500/5'
                          : status.status === "failed" ? 'text-destructive border-destructive/30 bg-destructive/5'
                          : status.status === "uploading" ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5'
                          : 'text-primary border-primary/30 bg-primary/5';
                        
                        return (
                          <div key={idx} className={`flex items-center justify-between p-2 bg-background/50 border rounded-none transition-colors ${statusColor}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FileText className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm font-mono truncate flex-1" data-testid={`text-file-${idx}`}>{file.name}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {status && (
                                <span className={`text-xs font-mono uppercase tracking-wide px-2 py-1 ${
                                  status.status === "completed" ? 'bg-green-500/20 text-green-500'
                                  : status.status === "failed" ? 'bg-destructive/20 text-destructive'
                                  : status.status === "uploading" ? 'bg-yellow-500/20 text-yellow-500'
                                  : 'bg-primary/20 text-primary'
                                }`}>
                                  {status.status === "completed" ? "ingested" 
                                  : status.status === "uploading" ? "uploading"
                                  : status.status === "processing" ? "in progress"
                                  : status.status === "failed" ? "failed"
                                  : "waiting"}
                                </span>
                              )}
                              {status && (status.status === "failed" || status.status === "processing" || status.status === "completed") && (
                                <button
                                  onClick={() => openInfoDialog(file.name)}
                                  className="p-1 hover:bg-primary/20 rounded transition-colors"
                                  data-testid={`button-info-${idx}`}
                                  title="View details"
                                >
                                  <Info className="w-4 h-4" />
                                </button>
                              )}
                              {!uploadingBatch && (
                                <button
                                  onClick={() => removeFile(idx)}
                                  className="p-1 text-destructive hover:bg-destructive/20 transition-colors"
                                  data-testid={`button-remove-file-${idx}`}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {uploadingBatch && currentlyProcessingFile && (
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-mono text-muted-foreground uppercase">Processing: {currentlyProcessingFile}</p>
                        <p className="text-xs font-mono text-muted-foreground">Stage {fileStatuses.get(currentlyProcessingFile)?.currentStageIndex || 0}/{PIPELINE_STAGES.length}</p>
                      </div>
                      
                      <div className="flex gap-1 items-center">
                        {PIPELINE_STAGES.map((stage, idx) => {
                          const processingFile = fileStatuses.get(currentlyProcessingFile);
                          const isCompleted = processingFile && processingFile.currentStageIndex ? processingFile.currentStageIndex > idx : false;
                          const isCurrent = processingFile && processingFile.currentStageIndex === idx;
                          
                          return (
                            <div key={stage.key} className="flex-1">
                              <div className={`h-2 rounded-none transition-all ${
                                isCompleted ? 'bg-green-500'
                                : isCurrent ? 'bg-primary'
                                : 'bg-border'
                              }`} />
                              <p className="text-[10px] font-mono text-muted-foreground mt-1 text-center">{stage.label}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    data-testid="button-upload"
                    onClick={handleUploadBatch}
                    disabled={selectedFiles.length === 0 || uploadingBatch || !selectedCourse}
                    className="flex-1 font-mono text-sm bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
                  >
                    {uploadingBatch ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
                      </>
                    )}
                  </Button>
                  
                  {uploadingBatch && (
                    <Button
                      data-testid="button-cancel-upload"
                      onClick={() => setShouldCancelUpload(true)}
                      variant="outline"
                      className="font-mono text-sm border-destructive text-destructive hover:bg-destructive hover:text-white rounded-none uppercase tracking-widest"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="tech-panel p-6 space-y-4">
                <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                  {selectedCourse ? `${selectedCourse} Knowledge Base` : 'Knowledge Base'}
                </h3>

                {!selectedCourse ? (
                  <p className="text-sm font-mono text-muted-foreground">Select a course to view its knowledge base.</p>
                ) : contextLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-mono text-muted-foreground">Loading context...</span>
                  </div>
                ) : courseContext?.concepts && courseContext.concepts.length > 0 ? (
                  <div className="space-y-4">
                    {courseContext.summary && (
                      <p className="text-sm font-mono text-muted-foreground border-l-2 border-primary pl-3">
                        {courseContext.summary}
                      </p>
                    )}
                    
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                        Indexed Concepts ({courseContext.concepts.length})
                      </p>
                      {courseContext.concepts.map((concept, idx) => (
                        <div key={idx} className="p-3 bg-background/50 border border-border">
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4 text-primary/60" />
                            <span className="text-sm font-mono font-bold">{concept.name}</span>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground mt-1">{concept.description}</p>
                          <p className="text-xs font-mono text-primary/60 mt-1">{concept.relevance}</p>
                        </div>
                      ))}
                    </div>

                    {courseContext.lastUpdated && (
                      <p className="text-xs font-mono text-muted-foreground/60">
                        Last updated: {new Date(courseContext.lastUpdated).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-sm font-mono text-muted-foreground">No concepts indexed yet.</p>
                    <p className="text-xs font-mono text-muted-foreground/60 mt-1">Upload course notes to build the knowledge base.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Dialog open={addCourseOpen} onOpenChange={setAddCourseOpen}>
        <DialogContent className="bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-widest">Add New Course</DialogTitle>
            <DialogDescription className="text-sm font-mono text-muted-foreground">
              Add a new course to the system. This course will be available for ingestion and scheduling.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="courseCode" className="text-sm font-mono">Course Code *</Label>
              <Input
                id="courseCode"
                data-testid="input-course-code"
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                placeholder="e.g., MC450"
                className="font-mono bg-background border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="courseName" className="text-sm font-mono">Course Name *</Label>
              <Input
                id="courseName"
                data-testid="input-course-name"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="e.g., Control Systems"
                className="font-mono bg-background border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="courseProgram" className="text-sm font-mono">Program of Study</Label>
              <Input
                id="courseProgram"
                data-testid="input-course-program"
                value={newCourseProgram}
                onChange={(e) => setNewCourseProgram(e.target.value)}
                placeholder="e.g., Mechanical Engineering"
                className="font-mono bg-background border-border"
              />
              <p className="text-xs font-mono text-muted-foreground">Optional: The academic program this course belongs to</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-mono">Course Icon</Label>
              <IconPicker value={newCourseIcon} onChange={setNewCourseIcon} />
              <p className="text-xs font-mono text-muted-foreground">Choose an icon to represent this course</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddCourseOpen(false)}
              className="font-mono text-sm border-border"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-save-course"
              onClick={handleAddCourse}
              disabled={createCourse.isPending}
              className="font-mono text-sm bg-primary text-black hover:bg-primary/90"
            >
              {createCourse.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Course"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest">
              {infoDialogContent?.fileName}
            </DialogTitle>
            <DialogDescription>
              {infoDialogContent && (
                <div className="text-xs font-mono text-muted-foreground">
                  {formatFileSize(infoDialogContent.fileSize)}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {infoDialogContent && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground uppercase">Status:</span>
                <span className={`text-xs font-mono uppercase tracking-wide px-2 py-1 ${
                  infoDialogContent.status === "completed" ? 'bg-green-500/20 text-green-500'
                  : infoDialogContent.status === "failed" ? 'bg-destructive/20 text-destructive'
                  : infoDialogContent.status === "uploading" ? 'bg-yellow-500/20 text-yellow-500'
                  : 'bg-primary/20 text-primary'
                }`}>
                  {infoDialogContent.status === "completed" ? "INGESTED" 
                  : infoDialogContent.status === "uploading" ? "UPLOADING"
                  : infoDialogContent.status === "processing" ? "IN PROGRESS"
                  : infoDialogContent.status === "failed" ? "FAILED"
                  : "WAITING"}
                </span>
              </div>

              {/* Processing Details */}
              {infoDialogContent.status === "processing" && (
                <div className="space-y-2 p-3 bg-background/50 border border-primary/20 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">Current Stage:</span>
                    <span className="text-xs font-mono text-primary uppercase">
                      {infoDialogContent.currentStage || "Unknown"}
                    </span>
                  </div>
                  {infoDialogContent.totalStages && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">
                          Progress: {(infoDialogContent.currentStageIndex || 0) + 1} / {infoDialogContent.totalStages}
                        </span>
                      </div>
                      <div className="w-full bg-background border border-border rounded h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${((infoDialogContent.currentStageIndex || 0) + 1) / (infoDialogContent.totalStages || 1) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {infoDialogContent.status === "failed" && infoDialogContent.error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded">
                  <p className="text-xs font-mono text-destructive">{infoDialogContent.error}</p>
                </div>
              )}

              {/* Completed Summary and Concepts */}
              {infoDialogContent.status === "completed" && (
                <div className="space-y-4">
                  {infoDialogContent.summary && (
                    <div className="p-3 bg-background/50 border border-border rounded">
                      <p className="text-xs font-mono text-muted-foreground mb-2 uppercase">Summary:</p>
                      <p className="text-sm text-foreground leading-relaxed">{infoDialogContent.summary}</p>
                    </div>
                  )}

                  {infoDialogContent.concepts && infoDialogContent.concepts.length > 0 && (
                    <div className="p-3 bg-background/50 border border-border rounded">
                      <p className="text-xs font-mono text-muted-foreground mb-3 uppercase">
                        Extracted Concepts ({infoDialogContent.concepts.length}):
                      </p>
                      <div className="space-y-2">
                        {infoDialogContent.concepts.map((concept, idx) => (
                          <div key={idx} className="p-2 bg-background border border-border/50 rounded text-sm">
                            <p className="font-mono text-primary text-xs uppercase tracking-wide mb-1">{concept.name}</p>
                            {concept.description && (
                              <p className="text-xs text-muted-foreground">{concept.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setInfoDialogOpen(false)}
              className="font-mono text-sm bg-primary text-black hover:bg-primary/90"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Footer />
    </div>
  );
}
