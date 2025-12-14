import { Button } from "@/components/ui/button";
import { Sparkles, Settings, Upload, BookOpen, Download, Activity, Archive, Home, ArrowLeft } from "lucide-react";

interface BackButtonProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

const iconMap: Record<string, React.ReactNode> = {
  'MISSIONS': <Sparkles className="w-4 h-4 mr-2" />,
  'SETTINGS': <Home className="w-4 h-4 mr-2" />,
  'INGEST': <Home className="w-4 h-4 mr-2" />,
  'KNOWLEDGE': <Home className="w-4 h-4 mr-2" />,
  'PORTFOLIO': <Home className="w-4 h-4 mr-2" />,
  'NOTIFICATIONS': <Home className="w-4 h-4 mr-2" />,
  'ARCHIVES': <Home className="w-4 h-4 mr-2" />,
  'DASHBOARD': <Home className="w-4 h-4 mr-2" />,
  'HOME': <Home className="w-4 h-4 mr-2" />,
};

const labelMap: Record<string, string> = {
  'MISSIONS': 'BACK_TO_DASHBOARD',
  'SETTINGS': 'BACK_TO_HOME',
  'INGEST': 'BACK_TO_HOME',
  'KNOWLEDGE': 'BACK_TO_HOME',
  'PORTFOLIO': 'BACK_TO_HOME',
  'NOTIFICATIONS': 'BACK_TO_HOME',
  'ARCHIVES': 'BACK_TO_HOME',
  'DASHBOARD': 'BACK_TO_HOME',
  'HOME': 'BACK_TO_HOME',
  'SCHEDULES': 'BACK_TO_MY_SCHEDULES',
};

export default function BackButton({ label, onClick, icon }: BackButtonProps) {
  const displayIcon = icon || iconMap[label.toUpperCase()] || <ArrowLeft className="w-4 h-4 mr-2" />;
  const displayLabel = labelMap[label.toUpperCase()] || `BACK_TO_${label.toUpperCase()}`;
  
  return (
    <Button 
      data-testid={`button-back-${label.toLowerCase()}`}
      onClick={onClick} 
      variant="ghost" 
      className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      {displayIcon}
      {displayLabel}
    </Button>
  );
}
