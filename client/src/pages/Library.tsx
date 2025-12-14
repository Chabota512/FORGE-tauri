import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Home, Plus, Trash2, ChevronDown, ChevronRight, Check, Clock, BookMarked, Edit2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { useBooks, useCreateBook, useUpdateBook, useDeleteBook, useRecordChapter } from "@/lib/api";
import Footer from "@/components/Footer";

const TIME_CATEGORIES = [
  { value: "morning", label: "Morning Reading" },
  { value: "evening", label: "Evening Reading" },
  { value: "weekend", label: "Weekend Reading" },
  { value: "anytime", label: "Anytime" },
];

const STATUS_OPTIONS = [
  { value: "to_read", label: "To Read", icon: Clock },
  { value: "reading", label: "Currently Reading", icon: BookOpen },
  { value: "completed", label: "Completed", icon: Check },
];

export default function LibraryPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [editBookId, setEditBookId] = useState<number | null>(null);
  const [expandedForm, setExpandedForm] = useState<boolean>(false);
  const [deleteDialog, setDeleteDialog] = useState<number | null>(null);
  const [editChaptersDialog, setEditChaptersDialog] = useState<number | null>(null);
  const [chaptersInput, setChaptersInput] = useState("");
  const [editCurrentChapterDialog, setEditCurrentChapterDialog] = useState<number | null>(null);
  const [currentChapterInput, setCurrentChapterInput] = useState("");
  
  const [newBook, setNewBook] = useState({
    title: "",
    author: "",
    status: "to_read" as "to_read" | "reading" | "completed",
    timeCategory: "anytime",
    notes: "",
    totalChapters: "",
  });

  const { data: books = [], isLoading } = useBooks();
  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const recordChapter = useRecordChapter();

  const handleAddBook = async () => {
    if (!newBook.title.trim()) {
      toast({
        title: "Missing Title",
        description: "Please enter a book title.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createBook.mutateAsync({
        title: newBook.title.trim(),
        author: newBook.author.trim() || undefined,
        status: newBook.status,
        timeCategory: newBook.timeCategory,
        notes: newBook.notes.trim() || undefined,
        totalChapters: newBook.totalChapters ? parseInt(newBook.totalChapters) : undefined,
        currentChapter: 0,
      });

      toast({
        title: "Book Added",
        description: `"${newBook.title}" has been added to your reading list.`,
      });

      setNewBook({
        title: "",
        author: "",
        status: "to_read",
        timeCategory: "anytime",
        notes: "",
        totalChapters: "",
      });
      setExpandedForm(false);
    } catch (error: any) {
      toast({
        title: "Failed to Add Book",
        description: error.message || "An error occurred while adding the book.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (bookId: number, newStatus: "to_read" | "reading" | "completed") => {
    try {
      await updateBook.mutateAsync({
        id: bookId,
        status: newStatus,
      });
      toast({
        title: "Status Updated",
        description: "Book status has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Update",
        description: error.message || "An error occurred while updating the book.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async (bookId: number) => {
    try {
      await deleteBook.mutateAsync(bookId);
      toast({
        title: "Book Removed",
        description: "The book has been removed from your reading list.",
      });
      setDeleteDialog(null);
    } catch (error: any) {
      toast({
        title: "Failed to Delete",
        description: error.message || "An error occurred while deleting the book.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateChapters = async () => {
    if (!editChaptersDialog) return;
    
    const chapters = parseInt(chaptersInput);
    if (isNaN(chapters) || chapters < 1) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number of chapters.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateBook.mutateAsync({
        id: editChaptersDialog,
        totalChapters: chapters,
      });
      toast({
        title: "Chapters Updated",
        description: `Total chapters set to ${chapters}.`,
      });
      setEditChaptersDialog(null);
      setChaptersInput("");
    } catch (error: any) {
      toast({
        title: "Failed to Update",
        description: error.message || "An error occurred while updating chapters.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateCurrentChapter = async () => {
    if (!editCurrentChapterDialog) return;
    
    const chapter = parseInt(currentChapterInput);
    if (isNaN(chapter) || chapter < 0) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid chapter number.",
        variant: "destructive",
      });
      return;
    }

    try {
      await recordChapter.mutateAsync({
        bookId: editCurrentChapterDialog,
        chapterNumber: chapter,
      });
      toast({
        title: "Progress Updated",
        description: `You're now at chapter ${chapter}.`,
      });
      setEditCurrentChapterDialog(null);
      setCurrentChapterInput("");
    } catch (error: any) {
      toast({
        title: "Failed to Update",
        description: error.message || "An error occurred while updating progress.",
        variant: "destructive",
      });
    }
  };

  const handleIncrementChapter = async (bookId: number, currentChapter: number, totalChapters: number) => {
    if (currentChapter < totalChapters) {
      try {
        await recordChapter.mutateAsync({
          bookId,
          chapterNumber: currentChapter + 1,
        });
      } catch (error: any) {
        toast({
          title: "Failed to Update",
          description: error.message || "Could not increment chapter.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDecrementChapter = async (bookId: number, currentChapter: number) => {
    if (currentChapter > 0) {
      try {
        await recordChapter.mutateAsync({
          bookId,
          chapterNumber: currentChapter - 1,
        });
      } catch (error: any) {
        toast({
          title: "Failed to Update",
          description: error.message || "Could not decrement chapter.",
          variant: "destructive",
        });
      }
    }
  };

  const toReadBooks = books.filter(b => b.status === "to_read");
  const readingBooks = books.filter(b => b.status === "reading");
  const completedBooks = books.filter(b => b.status === "completed");

  const BookCard = ({ book }: { book: typeof books[0] }) => {
    const isReading = book.status === "reading";
    const needsChapters = isReading && (!book.totalChapters || book.totalChapters === 0);

    return (
      <Card className="border-white/10 bg-black/30" data-testid={`card-book-${book.id}`}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-semibold truncate">{book.title}</p>
              {book.author && (
                <p className="text-xs text-muted-foreground mt-0.5">by {book.author}</p>
              )}
              {book.timeCategory && book.timeCategory !== "anytime" && (
                <p className="text-[10px] text-primary/70 mt-1 uppercase font-mono">
                  {TIME_CATEGORIES.find(t => t.value === book.timeCategory)?.label || book.timeCategory}
                </p>
              )}
              
              {/* Show progress if chapters are set */}
              {book.totalChapters && book.totalChapters > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setEditCurrentChapterDialog(book.id);
                        setCurrentChapterInput((book.currentChapter || 0).toString());
                      }}
                      className="text-[10px] text-primary/70 font-mono hover:text-primary transition-colors"
                      data-testid={`button-edit-current-chapter-${book.id}`}
                    >
                      Progress: {book.currentChapter || 0}/{book.totalChapters} chapters
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDecrementChapter(book.id, book.currentChapter || 0)}
                        disabled={!book.currentChapter || book.currentChapter === 0}
                        className="h-5 w-5 flex items-center justify-center text-[9px] font-bold border border-white/20 rounded hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        data-testid={`button-decrement-chapter-${book.id}`}
                      >
                        −
                      </button>
                      <button
                        onClick={() => handleIncrementChapter(book.id, book.currentChapter || 0, book.totalChapters)}
                        disabled={(book.currentChapter || 0) >= book.totalChapters}
                        className="h-5 w-5 flex items-center justify-center text-[9px] font-bold border border-white/20 rounded hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        data-testid={`button-increment-chapter-${book.id}`}
                      >
                        +
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditChaptersDialog(book.id);
                          setChaptersInput(book.totalChapters?.toString() || "");
                        }}
                        className="h-5 px-1 text-[9px] text-muted-foreground hover:text-primary"
                        data-testid={`button-edit-chapters-${book.id}`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1 rounded-full mt-1">
                    <div 
                      className="bg-primary h-1 rounded-full transition-all" 
                      style={{ width: `${((book.currentChapter || 0) / book.totalChapters) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Prompt to add chapters if reading but no chapters set */}
              {needsChapters && (
                <button
                  onClick={() => {
                    setEditChaptersDialog(book.id);
                    setChaptersInput("");
                  }}
                  className="mt-2 text-[9px] text-primary/70 font-mono hover:text-primary transition-colors flex items-center gap-1"
                  data-testid={`button-add-chapters-${book.id}`}
                >
                  <Plus className="w-3 h-3" /> Add chapters to track progress
                </button>
              )}

              {book.notes && (
                <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{book.notes}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Select 
                value={book.status || "to_read"} 
                onValueChange={(v) => handleUpdateStatus(book.id, v as "to_read" | "reading" | "completed")}
              >
                <SelectTrigger 
                  className="w-auto h-7 text-[10px] bg-white/5 border-white/10" 
                  data-testid={`select-status-${book.id}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteDialog(book.id)}
                className="text-destructive hover:text-destructive h-7 px-2"
                data-testid={`button-delete-book-${book.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen text-foreground font-sans bg-[#0d0d0ded]">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
            <button 
              data-testid="button-logo" 
              onClick={() => navigate("/")} 
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
              <Button 
                data-testid="button-tables"
                onClick={() => navigate("/timetable")} 
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                TABLES
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold font-display tracking-widest">LIBRARY</h1>
            </div>
            <BackButton label="HOME" onClick={() => navigate("/home")} />
          </div>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            Your personal reading list for self-development and growth
          </p>
        </div>

        {/* Add Book Form */}
        <Card className="border-white/10 bg-black/50 mb-8">
          <CardHeader>
            <button
              onClick={() => setExpandedForm(!expandedForm)}
              className="w-full flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity text-left"
              data-testid="button-toggle-add-book-form"
            >
              {expandedForm ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <div className="flex-1">
                <CardTitle className="font-display">Add Book</CardTitle>
                <p className="text-sm text-muted-foreground">Add a new book to your reading list</p>
              </div>
            </button>
          </CardHeader>
          {expandedForm && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Book title *"
                  value={newBook.title}
                  onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                  className="bg-white/5 border-white/10"
                  data-testid="input-book-title"
                />
                <Input
                  placeholder="Author (optional)"
                  value={newBook.author}
                  onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                  className="bg-white/5 border-white/10"
                  data-testid="input-book-author"
                />
                <Select 
                  value={newBook.status} 
                  onValueChange={(v) => setNewBook({ ...newBook, status: v as "to_read" | "reading" | "completed" })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10" data-testid="select-book-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select 
                  value={newBook.timeCategory} 
                  onValueChange={(v) => setNewBook({ ...newBook, timeCategory: v })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10" data-testid="select-book-time-category">
                    <SelectValue placeholder="Best time to read" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_CATEGORIES.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Total chapters/sections (optional)"
                  type="number"
                  min="1"
                  value={newBook.totalChapters}
                  onChange={(e) => setNewBook({ ...newBook, totalChapters: e.target.value })}
                  className="bg-white/5 border-white/10"
                  data-testid="input-book-chapters"
                />
                <Input
                  placeholder="Notes (optional)"
                  value={newBook.notes}
                  onChange={(e) => setNewBook({ ...newBook, notes: e.target.value })}
                  className="bg-white/5 border-white/10 md:col-span-2"
                  data-testid="input-book-notes"
                />
                <Button
                  onClick={handleAddBook}
                  disabled={createBook.isPending}
                  className="md:col-span-2 bg-primary text-black hover:bg-primary/80 font-mono"
                  data-testid="button-add-book"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add to Reading List
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Book Lists by Status */}
        <Tabs defaultValue="reading" className="space-y-6">
          <TabsList className="bg-black/30 border border-white/10">
            <TabsTrigger value="reading" data-testid="tab-reading">
              Reading ({readingBooks.length})
            </TabsTrigger>
            <TabsTrigger value="to_read" data-testid="tab-to-read">
              To Read ({toReadBooks.length})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({completedBooks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reading" className="space-y-4">
            {readingBooks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-mono text-sm">No books currently being read</p>
                <p className="text-xs mt-1">Start reading a book to see it here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {readingBooks.map(book => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="to_read" className="space-y-4">
            {toReadBooks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-mono text-sm">No books in your queue</p>
                <p className="text-xs mt-1">Add books you want to read</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {toReadBooks.map(book => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedBooks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-mono text-sm">No completed books yet</p>
                <p className="text-xs mt-1">Finish reading a book to add it here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedBooks.map(book => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Card className="border-white/10 bg-black/30">
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold font-display text-primary">{readingBooks.length}</p>
              <p className="text-xs text-muted-foreground font-mono uppercase mt-1">Reading</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/30">
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold font-display text-foreground">{toReadBooks.length}</p>
              <p className="text-xs text-muted-foreground font-mono uppercase mt-1">Queued</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/30">
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold font-display text-green-500">{completedBooks.length}</p>
              <p className="text-xs text-muted-foreground font-mono uppercase mt-1">Completed</p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog !== null} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent className="bg-black/95 border border-white/10">
          <DialogHeader>
            <DialogTitle className="font-display">Remove Book?</DialogTitle>
            <DialogDescription>
              This will permanently remove this book from your reading list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
              className="border-white/10"
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && handleDeleteBook(deleteDialog)}
              disabled={deleteBook.isPending}
              data-testid="button-confirm-delete"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Chapters Dialog */}
      <Dialog open={editChaptersDialog !== null} onOpenChange={() => {
        setEditChaptersDialog(null);
        setChaptersInput("");
      }}>
        <DialogContent className="bg-black/95 border border-white/10">
          <DialogHeader>
            <DialogTitle className="font-display">Set Total Chapters</DialogTitle>
            <DialogDescription>
              Enter the total number of chapters/sections/segments in this book.
              Leave blank if the book structure doesn't fit (e.g., Bible, reference books).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="number"
              min="1"
              placeholder="e.g., 12"
              value={chaptersInput}
              onChange={(e) => setChaptersInput(e.target.value)}
              className="bg-white/5 border-white/10"
              data-testid="input-edit-chapters"
            />
            <p className="text-xs text-muted-foreground font-mono">
              This helps track your reading progress. You can update this anytime.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditChaptersDialog(null);
                setChaptersInput("");
              }}
              className="border-white/10"
              data-testid="button-cancel-edit-chapters"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateChapters}
              disabled={updateBook.isPending}
              className="bg-primary text-black hover:bg-primary/80"
              data-testid="button-save-chapters"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Current Chapter Dialog */}
      <Dialog open={editCurrentChapterDialog !== null} onOpenChange={() => {
        setEditCurrentChapterDialog(null);
        setCurrentChapterInput("");
      }}>
        <DialogContent className="bg-black/95 border border-white/10">
          <DialogHeader>
            <DialogTitle className="font-display">Update Reading Progress</DialogTitle>
            <DialogDescription>
              Enter the chapter number you're currently reading.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="number"
              min="0"
              placeholder="e.g., 5"
              value={currentChapterInput}
              onChange={(e) => setCurrentChapterInput(e.target.value)}
              className="bg-white/5 border-white/10"
              data-testid="input-edit-current-chapter"
            />
            <p className="text-xs text-muted-foreground font-mono">
              Update your reading progress anytime.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditCurrentChapterDialog(null);
                setCurrentChapterInput("");
              }}
              className="border-white/10"
              data-testid="button-cancel-edit-current-chapter"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateCurrentChapter}
              disabled={recordChapter.isPending}
              className="bg-primary text-black hover:bg-primary/80"
              data-testid="button-save-current-chapter"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
