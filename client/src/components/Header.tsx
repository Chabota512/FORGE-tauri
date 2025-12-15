import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Menu, 
  Home, 
  Target, 
  Settings, 
  Upload, 
  BookOpen, 
  Download,
  ArrowLeft
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  showBack?: boolean;
  currentActivity?: string | null;
}

export default function Header({ showBack = true, currentActivity = null }: HeaderProps) {
  const [location, navigate] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user } = useAuth();
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const isHomePage = location === "/home" || location === "/";
  const isLandingPage = location === "/landing";

  const navItems = [
    { path: "/home", label: "Dashboard", icon: Home },
    { path: "/", label: "Missions", icon: Target },
    { path: "/settings", label: "Settings", icon: Settings },
    { path: "/ingest", label: "Ingest Notes", icon: Upload },
    { path: "/knowledge", label: "Knowledge Base", icon: BookOpen },
    { path: "/portfolio", label: "Portfolio & Archives", icon: Download },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="group flex items-center gap-3 px-4 py-2 -mx-4 -my-2 cursor-pointer transition-all duration-200">
          <button 
            data-testid="button-logo" 
            onClick={() => navigate("/home")} 
            className="flex items-center gap-3 transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(190,242,100,0.6)] group-active:drop-shadow-[0_0_16px_rgba(190,242,100,0.8)]"
          >
            <div className="w-8 h-8 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg] transition-all duration-200">
              <span className="skew-x-[10deg]">F</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold font-display leading-none tracking-widest text-foreground transition-all duration-200">FORGE</h1>
              <span className="text-[9px] text-primary font-mono tracking-[0.2em] uppercase">Acid Ops v4.0</span>
            </div>
          </button>
          {!isLandingPage && (
            <div className="hidden md:flex flex-col items-start text-xs font-mono text-muted-foreground ml-4 pl-4 border-l border-border">
              <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
              <span>{currentTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
              <span>{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center text-xs font-mono text-muted-foreground gap-4">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary animate-pulse"></div>
            SYSTEM_ONLINE
          </span>
        </div>

        <div className="hidden md:flex flex-col items-center text-xs font-mono text-muted-foreground">
          <span>{currentTime.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
          <span>{currentTime.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase()}</span>
          <span>{currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase()}</span>
        </div>
          
        <div className="flex items-center gap-2">
          {showBack && !isHomePage && (
            <Button 
              data-testid="button-back"
              onClick={() => window.history.back()}
              size="sm" 
              className="font-mono text-xs bg-transparent border border-white/10 text-foreground hover:border-primary hover:text-primary transition-all duration-150 rounded-none" 
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                data-testid="button-nav-menu"
                size="sm" 
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest" 
                variant="outline"
              >
                <Menu className="w-4 h-4 mr-2" />
                NAV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-56 bg-background border-border rounded-none"
            >
              {navItems.map((item, index) => (
                <div key={item.path}>
                  <DropdownMenuItem 
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => navigate(item.path)}
                    className={`font-mono text-xs uppercase tracking-wider cursor-pointer rounded-none ${
                      location === item.path 
                        ? "bg-primary/20 text-primary" 
                        : "hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    <item.icon className="w-4 h-4 mr-3" />
                    {item.label}
                  </DropdownMenuItem>
                  {index === 1 && <DropdownMenuSeparator className="bg-border" />}
                  {index === 5 && <DropdownMenuSeparator className="bg-border" />}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
