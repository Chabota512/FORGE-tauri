import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

const ENGINEERING_ICONS = [
  "Zap", "Cpu", "CircuitBoard", "Cog", "Wrench", "Settings", "Settings2",
  "Gauge", "Activity", "BarChart3", "LineChart", "TrendingUp", "Calculator",
  "BookOpen", "Lightbulb", "Hammer", "Pickaxe", "Anchor", "AlertCircle",
  "CheckCircle", "Clock", "Droplet", "Thermometer", "Wind", "Flame",
  "Waves", "Layers", "Grid", "Cube", "Box", "Boxes", "Package",
  "Tool", "Sliders", "Scroll", "Workflow", "GitBranch", "Zap",
  "Power", "Battery", "Plug", "Cable", "Wifi", "Radio", "Satellite",
  "Compass", "MapPin", "Navigation", "Radar", "Target", "Trophy",
];

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredIcons = ENGINEERING_ICONS.filter(icon =>
    icon.toLowerCase().includes(search.toLowerCase())
  );

  const SelectedIcon = Icons[value as keyof typeof Icons] as any;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 font-mono text-sm bg-background border-border"
          data-testid="button-icon-picker"
        >
          {SelectedIcon ? <SelectedIcon className="w-4 h-4" /> : null}
          {value || "Select icon..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 bg-background border-border">
        <div className="space-y-3">
          <Input
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="font-mono text-sm bg-background border-border"
            data-testid="input-icon-search"
          />
          <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
            {filteredIcons.map((iconName) => {
              const Icon = Icons[iconName as keyof typeof Icons] as any;
              return (
                <button
                  key={iconName}
                  onClick={() => {
                    onChange(iconName);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "p-2 rounded border transition-all hover:bg-primary/20 hover:border-primary",
                    value === iconName
                      ? "bg-primary/30 border-primary"
                      : "border-white/10 bg-white/5"
                  )}
                  title={iconName}
                  data-testid={`button-icon-${iconName}`}
                >
                  {Icon ? <Icon className="w-5 h-5 mx-auto" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
