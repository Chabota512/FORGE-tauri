
import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

interface ProgressItem {
  id: string
  title: string
  status: 'pending' | 'processing' | 'success' | 'error'
  message?: string
}

interface ProgressDialogProps {
  open: boolean
  title: string
  description?: string
  items: ProgressItem[]
  current: number
  total: number
}

export function ProgressDialog({ open, title, description, items, current, total }: ProgressDialogProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [items])

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="bg-black/95 border border-primary/30 max-w-2xl" hideClose>
        <DialogHeader>
          <DialogTitle className="text-sm font-mono uppercase text-primary">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs mt-2">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-primary">{current}/{total} ({percentage}%)</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          <div className="border border-border/50 bg-background/30 rounded">
            <ScrollArea className="h-64" ref={scrollRef}>
              <div className="p-3 space-y-1 font-mono text-xs">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 ${
                      item.status === 'processing' ? 'text-primary' : 
                      item.status === 'success' ? 'text-green-500' : 
                      item.status === 'error' ? 'text-red-500' : 
                      'text-muted-foreground'
                    }`}
                  >
                    {item.status === 'processing' && (
                      <Loader2 className="w-3 h-3 mt-0.5 animate-spin flex-shrink-0" />
                    )}
                    {item.status === 'success' && (
                      <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    )}
                    {item.status === 'error' && (
                      <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    )}
                    {item.status === 'pending' && (
                      <span className="w-3 h-3 mt-0.5 flex-shrink-0">○</span>
                    )}
                    <div className="flex-1">
                      <div>{item.title}</div>
                      {item.message && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {item.message}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
