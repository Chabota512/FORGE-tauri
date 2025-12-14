import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, startOfYear } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Deadline {
  id: number;
  title: string;
  dueDate: string;
  type: string;
  priority?: number;
}

interface OneOffEvent {
  id: number;
  title: string;
  specificDate?: string;
  type?: string;
}

interface YearCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deadlines: Deadline[];
  oneOffEvents: OneOffEvent[];
  year?: number;
  onYearChange?: (year: number) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function YearCalendar({
  open,
  onOpenChange,
  deadlines,
  oneOffEvents,
  year: propYear,
  onYearChange,
}: YearCalendarProps) {
  const currentYear = propYear || new Date().getFullYear();

  const eventsByDate = useMemo(() => {
    const map = new Map<string, { deadlines: Deadline[]; events: OneOffEvent[] }>();
    
    deadlines.forEach(d => {
      if (!d.dueDate) return;
      const dateKey = d.dueDate.split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, { deadlines: [], events: [] });
      }
      map.get(dateKey)!.deadlines.push(d);
    });
    
    oneOffEvents.forEach(e => {
      if (!e.specificDate) return;
      const dateKey = e.specificDate.split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, { deadlines: [], events: [] });
      }
      map.get(dateKey)!.events.push(e);
    });
    
    return map;
  }, [deadlines, oneOffEvents]);

  const MonthGrid = ({ monthIndex }: { monthIndex: number }) => {
    const monthDate = new Date(currentYear, monthIndex, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDayOfWeek = monthStart.getDay();

    const blanks = Array(startDayOfWeek).fill(null);
    const allDays = [...blanks, ...days];

    return (
      <div className="p-2">
        <h3 className="text-xs font-mono font-bold text-center mb-2 text-primary">
          {MONTHS[monthIndex]}
        </h3>
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="text-[8px] text-muted-foreground text-center font-mono">
              {day}
            </div>
          ))}
          {allDays.map((day, i) => {
            if (!day) {
              return <div key={`blank-${i}`} className="w-5 h-5" />;
            }
            
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(dateKey);
            const hasDeadline = dayEvents && dayEvents.deadlines.length > 0;
            const hasEvent = dayEvents && dayEvents.events.length > 0;
            const isCurrentDay = isToday(day);
            
            let bgClass = "bg-transparent";
            let textClass = "text-foreground";
            
            if (hasDeadline && hasEvent) {
              bgClass = "bg-gradient-to-br from-red-500/50 to-blue-500/50";
            } else if (hasDeadline) {
              bgClass = "bg-red-500/50";
            } else if (hasEvent) {
              bgClass = "bg-blue-500/50";
            }
            
            if (isCurrentDay) {
              textClass = "text-primary font-bold";
              if (!hasDeadline && !hasEvent) {
                bgClass = "bg-primary/20";
              }
            }

            return (
              <div
                key={dateKey}
                className={`w-5 h-5 flex items-center justify-center text-[9px] font-mono rounded-sm transition-all ${bgClass} ${textClass} hover:opacity-80`}
                title={dayEvents ? 
                  [...dayEvents.deadlines.map(d => `📅 ${d.title}`), 
                   ...dayEvents.events.map(e => `📌 ${e.title}`)].join('\n') 
                  : undefined}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black/95 border border-white/10">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-widest flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onYearChange?.(currentYear - 1)}
              className="text-muted-foreground hover:text-primary"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-primary">{currentYear} CALENDAR</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onYearChange?.(currentYear + 1)}
              className="text-muted-foreground hover:text-primary"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 mt-4">
          {Array.from({ length: 12 }, (_, i) => (
            <MonthGrid key={i} monthIndex={i} />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500/50 rounded-sm" />
            <span className="text-muted-foreground">Deadlines</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500/50 rounded-sm" />
            <span className="text-muted-foreground">Events</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary/20 rounded-sm border border-primary/50" />
            <span className="text-muted-foreground">Today</span>
          </div>
        </div>

        {/* Next Upcoming Item */}
        {(() => {
          const now = new Date();
          const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
          
          // Combine and sort all upcoming items
          const upcomingItems = [
            ...deadlines.map(d => ({ 
              type: 'deadline', 
              title: d.courseId ? d.title : `[Other] ${d.title}`,
              date: new Date(d.dueDate),
              priority: d.priority || 0
            })),
            ...oneOffEvents.map(e => ({ 
              type: 'event', 
              title: e.title, 
              date: e.specificDate ? new Date(e.specificDate) : null,
              priority: 0
            }))
          ]
            .filter(item => item.date && item.date >= now && item.date <= twoWeeksFromNow)
            .sort((a, b) => a.date!.getTime() - b.date!.getTime());

          if (upcomingItems.length === 0) return null;

          const nextItem = upcomingItems[0];
          const timeUntil = nextItem.date!.getTime() - now.getTime();
          const daysUntil = Math.floor(timeUntil / (1000 * 60 * 60 * 24));
          const hoursUntil = Math.floor((timeUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          
          let urgencyColor = "text-yellow-400 border-yellow-400/30 bg-yellow-400/5";
          if (daysUntil < 3) {
            urgencyColor = "text-red-400 border-red-400/30 bg-red-400/10";
          } else if (daysUntil < 7) {
            urgencyColor = "text-orange-400 border-orange-400/30 bg-orange-400/5";
          }

          return (
            <div className={`mt-4 border rounded-lg p-3 ${urgencyColor}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                    {nextItem.type === 'deadline' ? '⏰ NEXT DEADLINE' : '📌 NEXT EVENT'}
                  </p>
                  <p className="font-mono text-sm font-semibold mt-1">{nextItem.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {format(nextItem.date!, "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-mono">
                    {daysUntil}d {hoursUntil}h
                  </p>
                  <p className="text-[9px] font-mono uppercase opacity-70">remaining</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{deadlines.length}</p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Deadlines</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{oneOffEvents.length}</p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">One-Off Events</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
