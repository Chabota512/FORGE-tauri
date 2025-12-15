import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit2, ChevronDown, ChevronRight, Plus } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Commitment {
  id: number;
  title: string;
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
  venue?: string | null;
  topic?: string | null;
  type?: string;
}

interface NewCommitment {
  title: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  venue?: string;
  topic?: string;
  type: string;
}

export function WeeklyClassTimetable({ commitments, onEdit, onDelete, onAdd }: { commitments: Commitment[], onEdit?: (commitment: Commitment) => void, onDelete?: (id: number) => void, onAdd?: (commitment: NewCommitment) => void }) {
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Commitment | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [timePeriod, setTimePeriod] = useState<number>(30);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [addingClass, setAddingClass] = useState<boolean>(false);
  const [addForm, setAddForm] = useState<NewCommitment | null>(null);
  const [addDuration, setAddDuration] = useState<string>("60");
  
  if (commitments.length === 0) {
    return null;
  }

  // Generate time slots based on selected time period
  const generateTimeSlots = (period: number) => {
    const slots = [];
    const startMinutes = 6 * 60; // 6:00 AM
    const endMinutes = 22 * 60; // 10:00 PM
    for (let minutes = startMinutes; minutes < endMinutes; minutes += period) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push(time);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots(timePeriod);

  // Convert time string to minutes for comparison
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Check if a class is in this time slot
  const getClassForSlot = (day: number, timeSlot: string) => {
    return commitments.find(c => {
      if ((c.dayOfWeek ?? 0) !== day) return false;
      const slotMinutes = timeToMinutes(timeSlot);
      const startMinutes = timeToMinutes(c.startTime);
      const endMinutes = timeToMinutes(c.endTime);
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  // Calculate end time from start time and duration in minutes
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const startMinutes = timeToMinutes(startTime);
    let endMinutes = startMinutes + durationMinutes;
    // Clamp to 23:59 max
    if (endMinutes >= 24 * 60) {
      endMinutes = 23 * 60 + 59;
    }
    const h = Math.floor(endMinutes / 60);
    const m = endMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Check if a new class would overlap with existing classes
  const wouldOverlap = (dayOfWeek: number, startTime: string, endTime: string): boolean => {
    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);
    return commitments.some(c => {
      if ((c.dayOfWeek ?? 0) !== dayOfWeek) return false;
      const existingStart = timeToMinutes(c.startTime);
      const existingEnd = timeToMinutes(c.endTime);
      return (newStart < existingEnd && newEnd > existingStart);
    });
  };

  // Validate that start time is before end time
  const isValidTimeRange = (startTime: string, endTime: string): boolean => {
    return timeToMinutes(startTime) < timeToMinutes(endTime);
  };

  // Handle double-click on empty cell to add class
  const handleCellDoubleClick = (dayIdx: number, startTime: string) => {
    if (!onAdd) return;
    const duration = parseInt(addDuration) || 60;
    setAddForm({
      title: "",
      dayOfWeek: dayIdx,
      startTime: startTime,
      endTime: calculateEndTime(startTime, duration),
      venue: "",
      topic: "",
      type: "class",
    });
    setAddingClass(true);
  };

  // Update end time when duration changes in add form
  const handleDurationChange = (duration: string) => {
    setAddDuration(duration);
    if (addForm && duration !== "custom") {
      const durationMinutes = parseInt(duration);
      setAddForm({
        ...addForm,
        endTime: calculateEndTime(addForm.startTime, durationMinutes),
      });
    }
  };

  return (
    <Card className="border-white/10 bg-black/50 mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            data-testid="button-toggle-timetable"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <CardTitle className="font-display">Weekly Class Timetable</CardTitle>
          </button>
          {isExpanded && (
            <Select value={timePeriod.toString()} onValueChange={(v) => setTimePeriod(parseInt(v))}>
              <SelectTrigger className="w-32 h-8 text-[10px] bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30" className="text-xs">30 MIN</SelectItem>
                <SelectItem value="60" className="text-xs">1 HOUR</SelectItem>
                <SelectItem value="90" className="text-xs">1.5 HOURS</SelectItem>
                <SelectItem value="120" className="text-xs">2 HOURS</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="border border-white/10 p-2 bg-black/80 font-mono font-semibold w-16">TIME</th>
              {DAYS.map((day, i) => (
                <th key={i} className="border border-white/10 p-2 bg-black/80 font-mono font-semibold min-w-24 text-center">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot, slotIdx) => (
              <tr key={slotIdx}>
                <td className="border border-white/10 p-2 bg-black/50 font-mono text-muted-foreground text-center font-semibold">
                  {slot}
                </td>
                {DAYS.map((_, dayIdx) => {
                  const classItem = getClassForSlot(dayIdx, slot);
                  const cellKey = `${dayIdx}-${slotIdx}`;
                  return (
                    <td
                      key={cellKey}
                      className={`border border-white/10 p-1 text-center ${!classItem && onAdd ? 'cursor-pointer hover:bg-primary/5 transition-colors' : ''}`}
                      onDoubleClick={() => !classItem && handleCellDoubleClick(dayIdx, slot)}
                      data-testid={`cell-${dayIdx}-${slotIdx}`}
                    >
                      {classItem ? (
                        <Popover open={openCell === cellKey} onOpenChange={(open) => setOpenCell(open ? cellKey : null)}>
                          <PopoverTrigger asChild>
                            <div className="bg-primary/20 border border-primary/50 rounded p-1 text-primary text-xs font-mono cursor-pointer hover:bg-primary/30 transition-colors">
                              <div className="font-semibold truncate uppercase">{classItem.title}</div>
                              <div className="text-muted-foreground text-xs uppercase">{classItem.startTime}-{classItem.endTime}</div>
                            </div>
                          </PopoverTrigger>
                          <PopoverContent 
                            align="start" 
                            side="right" 
                            className="w-56 p-2 bg-black/95 border border-primary/30"
                            onMouseEnter={() => setOpenCell(cellKey)}
                            onMouseLeave={() => setOpenCell(null)}
                          >
                            <div className="space-y-1">
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-tight">Course</p>
                                <p className="text-xs font-mono font-semibold text-primary uppercase">{classItem.title}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-tight">Time</p>
                                <p className="text-xs font-mono uppercase">{classItem.startTime}–{classItem.endTime}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-tight">Day</p>
                                <p className="text-xs font-mono uppercase">{DAYS[classItem.dayOfWeek ?? 0]}</p>
                              </div>
                              {classItem.venue && (
                                <div>
                                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-tight">Venue</p>
                                  <p className="text-xs font-mono uppercase">{classItem.venue}</p>
                                </div>
                              )}
                              {classItem.topic && (
                                <div>
                                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-tight">Topic</p>
                                  <p className="text-xs font-mono uppercase">{classItem.topic}</p>
                                </div>
                              )}
                              <div className="flex gap-1 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-5 px-1.5 text-[10px] font-mono uppercase"
                                  onClick={() => {
                                    setEditingId(classItem.id);
                                    setEditForm({ ...classItem });
                                    setOpenCell(null);
                                  }}
                                  data-testid={`button-edit-class-${classItem.id}`}
                                >
                                  <Edit2 className="w-2.5 h-2.5 mr-0.5" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-5 px-1.5 text-[10px] font-mono uppercase text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setDeletingId(classItem.id);
                                  }}
                                  data-testid={`button-delete-class-${classItem.id}`}
                                >
                                  <Trash2 className="w-2.5 h-2.5 mr-0.5" /> Delete
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </CardContent>
      )}

      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="bg-black/95 border border-destructive/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono uppercase text-destructive">DELETE CLASS?</DialogTitle>
            <DialogDescription className="text-[10px] font-mono text-muted-foreground">
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-mono uppercase"
              onClick={() => setDeletingId(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[10px] font-mono uppercase bg-destructive text-white hover:bg-destructive/80"
              onClick={() => {
                if (deletingId !== null) {
                  onDelete?.(deletingId);
                }
                setDeletingId(null);
                setOpenCell(null);
              }}
              data-testid="button-confirm-delete"
            >
              DELETE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="bg-black/95 border border-primary/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono uppercase text-primary">EDIT CLASS</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">COURSE</label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  data-testid="input-edit-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">START</label>
                  <Input
                    type="time"
                    value={editForm.startTime}
                    onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                    className="h-6 text-[10px] bg-white/5 border-white/10"
                    data-testid="input-edit-start"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">END</label>
                  <Input
                    type="time"
                    value={editForm.endTime}
                    onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                    className="h-6 text-[10px] bg-white/5 border-white/10"
                    data-testid="input-edit-end"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">DAY</label>
                <Select value={String(editForm.dayOfWeek ?? 0)} onValueChange={(v) => setEditForm({ ...editForm, dayOfWeek: parseInt(v) as number })}>
                  <SelectTrigger className="h-6 text-[10px] bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, i) => (
                      <SelectItem key={i} value={i.toString()} className="text-xs">
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">VENUE</label>
                <Input
                  value={editForm.venue || ""}
                  onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                  placeholder="Room 101"
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  data-testid="input-edit-venue"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">TOPIC</label>
                <Input
                  value={editForm.topic || ""}
                  onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                  placeholder="Control Theory"
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  data-testid="input-edit-topic"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-mono uppercase"
              onClick={() => {
                setEditingId(null);
                setEditForm(null);
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[10px] font-mono uppercase bg-primary text-black hover:bg-primary/80"
              onClick={() => {
                if (editForm) {
                  onEdit?.(editForm);
                  setEditingId(null);
                  setEditForm(null);
                }
              }}
              data-testid="button-save-edit"
            >
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addingClass} onOpenChange={(open) => !open && setAddingClass(false)}>
        <DialogContent className="bg-black/95 border border-primary/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono uppercase text-primary flex items-center gap-2">
              <Plus className="w-3 h-3" /> ADD CLASS
            </DialogTitle>
            <DialogDescription className="text-[10px] font-mono text-muted-foreground">
              Double-clicked on {addForm ? DAYS[addForm.dayOfWeek] : ''} at {addForm?.startTime}
            </DialogDescription>
          </DialogHeader>
          {addForm && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">COURSE NAME</label>
                <Input
                  value={addForm.title}
                  onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                  placeholder="e.g. MC450 Control Systems"
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  autoFocus
                  data-testid="input-add-title"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">DAY</label>
                <Select value={String(addForm.dayOfWeek)} onValueChange={(v) => setAddForm({ ...addForm, dayOfWeek: parseInt(v) })}>
                  <SelectTrigger className="h-6 text-[10px] bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, i) => (
                      <SelectItem key={i} value={i.toString()} className="text-xs">
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">START TIME</label>
                <Input
                  type="time"
                  value={addForm.startTime}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    if (addDuration !== "custom") {
                      setAddForm({
                        ...addForm,
                        startTime: newStart,
                        endTime: calculateEndTime(newStart, parseInt(addDuration)),
                      });
                    } else {
                      setAddForm({ ...addForm, startTime: newStart });
                    }
                  }}
                  className="h-6 text-[10px] bg-white/5 border-white/10"
                  data-testid="input-add-start"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">DURATION</label>
                <Select value={addDuration} onValueChange={handleDurationChange}>
                  <SelectTrigger className="h-6 text-[10px] bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30" className="text-xs">30 MIN</SelectItem>
                    <SelectItem value="60" className="text-xs">1 HOUR</SelectItem>
                    <SelectItem value="90" className="text-xs">1.5 HOURS</SelectItem>
                    <SelectItem value="120" className="text-xs">2 HOURS</SelectItem>
                    <SelectItem value="custom" className="text-xs">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {addDuration === "custom" && (
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">END TIME</label>
                  <Input
                    type="time"
                    value={addForm.endTime}
                    onChange={(e) => setAddForm({ ...addForm, endTime: e.target.value })}
                    className="h-6 text-[10px] bg-white/5 border-white/10"
                    data-testid="input-add-end"
                  />
                </div>
              )}
              <div className="text-[10px] font-mono text-muted-foreground">
                Class: {addForm.startTime} – {addForm.endTime}
              </div>
              {!isValidTimeRange(addForm.startTime, addForm.endTime) && (
                <div className="text-[10px] font-mono text-destructive">
                  End time must be after start time
                </div>
              )}
              {isValidTimeRange(addForm.startTime, addForm.endTime) && wouldOverlap(addForm.dayOfWeek, addForm.startTime, addForm.endTime) && (
                <div className="text-[10px] font-mono text-yellow-500">
                  Warning: This overlaps with an existing class
                </div>
              )}
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">VENUE (OPTIONAL)</label>
                <Input
                  value={addForm.venue || ""}
                  onChange={(e) => setAddForm({ ...addForm, venue: e.target.value })}
                  placeholder="Room 101"
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  data-testid="input-add-venue"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">TOPIC (OPTIONAL)</label>
                <Input
                  value={addForm.topic || ""}
                  onChange={(e) => setAddForm({ ...addForm, topic: e.target.value })}
                  placeholder="Control Theory"
                  className="h-6 text-[10px] bg-white/5 border-white/10 uppercase"
                  data-testid="input-add-topic"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] font-mono uppercase"
              onClick={() => {
                setAddingClass(false);
                setAddForm(null);
                setAddDuration("60");
              }}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[10px] font-mono uppercase bg-primary text-black hover:bg-primary/80"
              disabled={!addForm?.title.trim() || !isValidTimeRange(addForm.startTime, addForm.endTime)}
              onClick={() => {
                if (addForm && addForm.title.trim() && isValidTimeRange(addForm.startTime, addForm.endTime)) {
                  onAdd?.(addForm);
                  setAddingClass(false);
                  setAddForm(null);
                  setAddDuration("60");
                }
              }}
              data-testid="button-save-add"
            >
              ADD CLASS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
