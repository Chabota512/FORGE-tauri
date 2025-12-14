import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard } from "lucide-react";
import React, { useState, useEffect } from "react";

interface PageHeaderAction {
  testId: string;
  label?: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

interface PageHeaderProps {
  actions?: PageHeaderAction[];
}

export default function PageHeader({ actions }: PageHeaderProps) {
  const [location, navigate] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isDashboard = location === "/dashboard";
  const navigationIcon = isDashboard ? <Home className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />;
  const navigationTarget = isDashboard ? "/home" : "/dashboard";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* LEFT: Logo */}
        <button 
          data-testid="button-logo" 
          onClick={() => navigate("/")} 
          className="flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200 flex-shrink-0 bg-transparent border-0 hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)] active:drop-shadow-[0_0_16px_rgba(190,242,100,0.8)]"
        >
          <div className="w-8 h-8 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg] transition-all duration-200">
            <span className="skew-x-[10deg]">F</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold font-display leading-none tracking-widest text-foreground transition-all duration-200">FORGE</h1>
            <span className="text-[9px] text-primary font-mono tracking-[0.2em] uppercase">Acid Ops v3.1</span>
          </div>
        </button>

        {/* CENTER: Time Display - Horizontal Components */}
        <div className="hidden md:flex items-center text-xs font-mono text-muted-foreground gap-4">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary animate-pulse"></div>
            SYSTEM_ONLINE
          </span>
          <span className="text-white/10">|</span>
          <div className="flex flex-col gap-0.5 text-[9px] text-[#b3b3b3]">
            <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
            <span className="text-[#a7eb42] text-[12px]">{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
          </div>
        </div>

        {/* RIGHT: Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button 
            data-testid="button-home"
            onClick={() => navigate(navigationTarget)} 
            size="sm" 
            className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none" 
            variant="outline"
          >
            {navigationIcon}
          </Button>
          {actions?.map((action) => (
            <Button 
              key={action.testId}
              data-testid={action.testId}
              onClick={action.onClick} 
              size="sm" 
              className={`font-mono text-xs rounded-none transition-all duration-150 ${
                action.variant === "primary"
                  ? "bg-transparent border border-primary text-primary hover:bg-primary hover:text-black uppercase tracking-widest"
                  : "bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary"
              }`}
              variant="outline"
            >
              {action.icon}
              {action.label && <span className="ml-2">{action.label}</span>}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}
