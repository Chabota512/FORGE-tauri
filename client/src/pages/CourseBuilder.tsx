import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, FileText, Sparkles, Send, Download, Database, ArrowLeft, Check, X, MessageSquare, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCourses } from "@/lib/api";
import jsPDF from "jspdf";
import { getApiUrl } from "@/lib/queryClient";

type BuilderPhase = "upload" | "generating" | "editing";

interface FileResult {
  fileName: string;
  text: string;
  success: boolean;
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Roadmap {
  id: number;
  courseCode: string;
  title: string;
  content: string;
  status: string;
}

export default function CourseBuilderPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<BuilderPhase>("upload");
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [extractedContent, setExtractedContent] = useState("");
  const [fileResults, setFileResults] = useState<FileResult[]>([]);

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const { data: courses = [] } = useCourses();
  const selectedCourseData = courses.find(c => c.code === selectedCourse);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleExtractAndGenerate = async () => {
    if (!selectedCourse || selectedFiles.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a course and add files.",
        variant: "destructive",
      });
      return;
    }

    setPhase("generating");
    setExtracting(true);
    setFileResults([]);

    try {
      const formData = new FormData();
      formData.append("courseCode", selectedCourse);
      selectedFiles.forEach(file => formData.append("files", file));

      const extractRes = await fetch(getApiUrl("/api/course-builder/extract"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!extractRes.ok) throw new Error("Extraction failed");

      const reader = extractRes.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let allExtractedContent = "";
      const results: FileResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          
          try {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;
            
            const update = JSON.parse(jsonStr);

            if (update.type === "progress") {
              if (update.status === "success") {
                results.push({
                  fileName: update.fileName,
                  text: update.text,
                  success: true,
                });
                toast({
                  title: "File Processed",
                  description: `${update.current}/${update.total}: ${update.fileName}`,
                });
              } else if (update.status === "error") {
                results.push({
                  fileName: update.fileName,
                  text: "",
                  success: false,
                  error: update.error,
                });
                toast({
                  title: "File Failed",
                  description: `${update.fileName}: ${update.error}`,
                  variant: "destructive",
                });
              }
              setFileResults([...results]);
            } else if (update.type === "complete") {
              console.log("[Course Builder] Extraction complete, content length:", update.extractedContent?.length || 0);
              if (update.extractedContent && update.extractedContent.trim().length > 0) {
                allExtractedContent = update.extractedContent;
              }
            } else if (update.type === "error") {
              throw new Error(update.error);
            }
          } catch (e) {
            // Only log parse errors for non-empty lines
            if (line.trim().length > 6) {
              console.error("Failed to parse update:", line.substring(0, 100));
            }
          }
        }
      }

      setExtractedContent(allExtractedContent);
      setExtracting(false);

      toast({
        title: "Content Extracted",
        description: `${results.filter(r => r.success).length} files processed.`,
      });

      setGenerating(true);
      const genRes = await fetch(getApiUrl("/api/course-builder/generate"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseCode: selectedCourse,
          courseName: selectedCourseData?.name || selectedCourse,
          extractedContent: allExtractedContent,
          sourceFiles: selectedFiles.map(f => f.name),
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);

      setRoadmap(genData.roadmap);
      setEditableContent(genData.roadmap.content);
      setPhase("editing");

      toast({
        title: "Roadmap Generated",
        description: "Your course roadmap is ready for editing.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process files",
        variant: "destructive",
      });
      setPhase("upload");
    } finally {
      setExtracting(false);
      setGenerating(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !roadmap) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setSendingChat(true);

    try {
      const res = await fetch(getApiUrl(`/api/course-builder/chat/${roadmap.id}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setChatMessages(prev => [...prev, { role: "assistant", content: data.response }]);

      if (data.updatedContent && data.updatedContent !== editableContent) {
        setEditableContent(data.updatedContent);
        toast({
          title: "Document Updated",
          description: "The roadmap has been updated based on your request.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Chat Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSendingChat(false);
    }
  };

  const handleSaveContent = async () => {
    if (!roadmap) return;

    try {
      const res = await fetch(getApiUrl(`/api/course-builder/roadmap/${roadmap.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editableContent }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRoadmap(data.roadmap);
      toast({ title: "Saved", description: "Changes saved successfully." });
    } catch (error: any) {
      toast({ title: "Save Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadPDF = () => {
    if (!roadmap) return;

    const pdf = new jsPDF();
    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(roadmap.title, margin, margin + 10);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);

    const lines = pdf.splitTextToSize(editableContent.replace(/[#*`]/g, ""), maxWidth);
    let y = margin + 25;
    const lineHeight = 6;
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }

    pdf.save(`${roadmap.courseCode}_roadmap.pdf`);
    toast({ title: "PDF Downloaded", description: `${roadmap.courseCode}_roadmap.pdf` });
  };

  const handleIngest = async () => {
    if (!roadmap) return;

    setIngesting(true);
    try {
      const res = await fetch(getApiUrl(`/api/course-builder/ingest/${roadmap.id}`), {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: "Ingested to Knowledge Base",
        description: "Your roadmap is now part of the course knowledge base.",
      });

      setRoadmap({ ...roadmap, status: "ingested" });
    } catch (error: any) {
      toast({ title: "Ingestion Error", description: error.message, variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              data-testid="button-back"
              variant="ghost"
              size="sm"
              onClick={() => navigate("/ingest")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Ingest
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-display text-lg uppercase tracking-widest">Course Builder</span>
            </div>
          </div>

          {phase === "editing" && (
            <div className="flex items-center gap-2">
              <Button
                data-testid="button-download-pdf"
                onClick={handleDownloadPDF}
                variant="outline"
                size="sm"
                className="font-mono text-xs border-primary text-primary hover:bg-primary hover:text-black"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
              <Button
                data-testid="button-ingest"
                onClick={handleIngest}
                disabled={ingesting || roadmap?.status === "ingested"}
                size="sm"
                className="font-mono text-xs bg-primary text-black hover:bg-primary/90"
              >
                {ingesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : roadmap?.status === "ingested" ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                {roadmap?.status === "ingested" ? "Ingested" : "Ingest to KB"}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-1">
        {phase === "upload" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-display font-bold uppercase tracking-widest mb-2">
                Build Your Course Roadmap
              </h2>
              <p className="text-sm font-mono text-muted-foreground">
                Upload all your course materials. We'll extract the content locally and generate a comprehensive learning roadmap.
              </p>
            </div>

            <div className="tech-panel p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-mono">Target Course</Label>
                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                  <SelectTrigger data-testid="select-course" className="font-mono text-sm bg-background border-border">
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
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-mono">Course Materials</Label>
                <div
                  data-testid="dropzone"
                  className={`border-2 border-dashed rounded-none p-8 text-center cursor-pointer transition-all ${
                    selectedFiles.length > 0
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.xls,.pptx,.ppt,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={handleFileSelect}
                    multiple
                    data-testid="input-files"
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
                      <p className="text-sm font-mono text-muted-foreground">Drop all your course materials here</p>
                      <p className="text-xs font-mono text-muted-foreground/60">PDF, Word, Excel, PowerPoint, Text, Images</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-background/50 border border-border">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-mono truncate">{file.name}</span>
                      </div>
                      <button
                        onClick={() => removeFile(idx)}
                        className="p-1 text-destructive hover:bg-destructive/20 transition-colors"
                        data-testid={`button-remove-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                data-testid="button-generate"
                onClick={handleExtractAndGenerate}
                disabled={selectedFiles.length === 0 || !selectedCourse}
                className="w-full font-mono text-sm bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Extract & Generate Roadmap
              </Button>
            </div>
          </div>
        )}

        {phase === "generating" && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin mb-6" />
            <h2 className="text-xl font-display font-bold uppercase tracking-widest mb-2">
              {extracting ? "Extracting Content..." : "Generating Roadmap..."}
            </h2>
            <p className="text-sm font-mono text-muted-foreground">
              {extracting 
                ? `Processing ${selectedFiles.length} files locally...`
                : "Creating your personalized course roadmap with AI..."
              }
            </p>

            {fileResults.length > 0 && (
              <div className="mt-8 text-left max-w-md mx-auto space-y-2">
                {fileResults.map((result, idx) => (
                  <div key={idx} className={`flex items-center gap-2 text-sm font-mono ${result.success ? 'text-green-500' : 'text-destructive'}`}>
                    {result.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    <span className="truncate">{result.fileName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "editing" && roadmap && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
            <div className="tech-panel flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-primary" />
                  <span className="font-mono text-sm uppercase tracking-widest">Document Editor</span>
                </div>
                <Button
                  data-testid="button-save"
                  onClick={handleSaveContent}
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs"
                >
                  Save Changes
                </Button>
              </div>

              <div className="flex-1 p-4 overflow-hidden">
                <Textarea
                  data-testid="textarea-content"
                  value={editableContent}
                  onChange={(e) => setEditableContent(e.target.value)}
                  className="w-full h-full font-mono text-sm bg-background border-border resize-none"
                  placeholder="Your course roadmap content..."
                />
              </div>
            </div>

            <div className="tech-panel flex flex-col h-full">
              <div className="flex items-center gap-2 p-4 border-b border-border">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="font-mono text-sm uppercase tracking-widest">AI Assistant</span>
              </div>

              <ScrollArea ref={chatScrollRef} className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-sm font-mono">Ask the AI to help edit your roadmap</p>
                      <p className="text-xs font-mono mt-2 text-muted-foreground/60">
                        Try: "Add more practical exercises" or "Simplify the introduction"
                      </p>
                    </div>
                  )}

                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-none ${
                          msg.role === "user"
                            ? "bg-primary text-black"
                            : "bg-background border border-border"
                        }`}
                      >
                        <p className="text-sm font-mono whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}

                  {sendingChat && (
                    <div className="flex justify-start">
                      <div className="bg-background border border-border p-3 rounded-none">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    ref={chatInputRef}
                    data-testid="input-chat"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                    placeholder="Ask the AI to edit your roadmap..."
                    className="flex-1 font-mono text-sm bg-background border-border"
                    disabled={sendingChat}
                  />
                  <Button
                    data-testid="button-send"
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || sendingChat}
                    size="icon"
                    className="bg-primary text-black hover:bg-primary/90"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}