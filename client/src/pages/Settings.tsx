import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Archive,
  RefreshCw,
  Home,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Clock,
  Target,
  Activity as ActivityIcon,
  Trash2,
  Plus,
  Edit2,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import {
  useSettings,
  useUpdateSettings,
  useLLMStatus,
  useUserPreferences,
  useUpdateUserPreferences,
  useActivityLibrary,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
  useDeleteAccount,
  useValidateAllAPIs,
  type Activity as ActivityType,
} from "@/lib/api";
import Footer from "@/components/Footer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: llmStatus, isLoading: llmLoading } = useLLMStatus();
  const { data: preferences, isLoading: prefsLoading } = useUserPreferences();
  const { data: activities, isLoading: activitiesLoading } = useActivityLibrary();
  const { user } = useAuth();

  const updateSettings = useUpdateSettings();
  const updatePreferences = useUpdateUserPreferences();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const { logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const validateAPIs = useValidateAllAPIs();
  const [apiTestResults, setApiTestResults] = useState<any>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Mission settings
  const [targetDuration, setTargetDuration] = useState(20);
  const [missionFocus, setMissionFocus] = useState("");

  // DPM Preferences
  const [wakeTime, setWakeTime] = useState("06:00");
  const [sleepTime, setSleepTime] = useState("22:00");
  const [targetWorkHours, setTargetWorkHours] = useState(6);
  const [targetFreeHours, setTargetFreeHours] = useState(4);
  const [targetOtherHours, setTargetOtherHours] = useState(4);
  const [consecutiveStudyLimit, setConsecutiveStudyLimit] = useState(90);
  const [personalGoals, setPersonalGoals] = useState("");
  const [scheduleGenerationTime, setScheduleGenerationTime] = useState("06:00");

  // Notification preferences
  const [activityNotifications, setActivityNotifications] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);

  // Activity dialog
  const [activityDialog, setActivityDialog] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityType | null>(null);
  const [activityName, setActivityName] = useState("");
  const [activityCategory, setActivityCategory] = useState("study");
  const [activityDuration, setActivityDuration] = useState(30);
  const [activityPreferredTime, setActivityPreferredTime] = useState("");

  // Sound presets with Web Audio API generation
  const soundPresets: Record<string, (volume: number) => void> = {
    chime: (volume) => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    },
    bell: (volume) => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    },
    ping: (volume) => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    },
    alert: (volume) => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1500, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    },
    subtle: (volume) => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 700;
      gain.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    },
  };

  const playPreviewSound = (soundName: string, volume: number) => {
    const soundFn = soundPresets[soundName];
    if (soundFn) {
      try {
        soundFn(Math.min(1, volume));
      } catch (e) {
        console.log("Could not play preview sound");
      }
    }
  };
  const [categoryScrollIndex, setCategoryScrollIndex] = useState(0);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryContainerRef = useRef<HTMLDivElement>(null);

  const CATEGORIES = [
    "study", "homework", "lecture", "research", "group_work", "meeting",
    "work", "internship", "skill_dev", "career_prep", "mindfulness", "self_care",
    "sleep", "exercise", "sports", "creative", "entertainment", "commute",
    "admin", "break", "meal", "hygiene", "rest", "social",
    "extracurricular", "cultural", "personal_time"
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    study: "Study", homework: "Homework", lecture: "Lecture", research: "Research",
    group_work: "Group Work", meeting: "Meeting", work: "Work", internship: "Internship",
    skill_dev: "Skill Dev", career_prep: "Career Prep", mindfulness: "Mindfulness",
    self_care: "Self Care", sleep: "Sleep", exercise: "Exercise", sports: "Sports",
    creative: "Creative", entertainment: "Entertainment", commute: "Commute",
    admin: "Admin", break: "Break", meal: "Meal", hygiene: "Hygiene", rest: "Rest",
    social: "Social", extracurricular: "Extracurricular", cultural: "Cultural",
    personal_time: "Personal Time"
  };

  const visibleCategories = CATEGORIES.slice(categoryScrollIndex, categoryScrollIndex + 5);

  const handleCategoryScroll = (direction: 'up' | 'down') => {
    if (direction === 'up') {
      setCategoryScrollIndex(Math.max(0, categoryScrollIndex - 1));
    } else {
      setCategoryScrollIndex(Math.min(CATEGORIES.length - 5, categoryScrollIndex + 1));
    }
  };

  const handleCategoryWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      handleCategoryScroll('down');
    } else {
      handleCategoryScroll('up');
    }
  };

  const handleTestAPIs = async () => {
    try {
      const result = await validateAPIs.mutateAsync();
      setApiTestResults(result);
    } catch (error: any) {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to test APIs",
        variant: "destructive",
      });
    }
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleCategoryScroll('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleCategoryScroll('down');
    }
  };

  // Debounce handler for volume changes
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [localVolume, setLocalVolume] = useState(preferences?.soundVolume || 70);

  const handleVolumeChange = (value: number) => {
    setLocalVolume(value);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      handleUpdatePreference('soundVolume', value);
    }, 500); // Adjust debounce delay as needed
  };

  useEffect(() => {
    setLocalVolume(preferences?.soundVolume || 70);
  }, [preferences?.soundVolume]);

  useEffect(() => {
    if (settings) {
      setTargetDuration(parseInt(settings.targetDuration) || 20);
      setMissionFocus(settings.missionFocus || "");
    }
  }, [settings]);

  useEffect(() => {
    if (preferences) {
      setWakeTime(preferences.wakeTime || "06:00");
      setSleepTime(preferences.sleepTime || "22:00");
      setTargetWorkHours(preferences.targetWorkHours || 6);
      setTargetFreeHours(preferences.targetFreeHours || 4);
      setTargetOtherHours(preferences.targetOtherHours || 4);
      setConsecutiveStudyLimit(preferences.consecutiveStudyLimit || 90);
      setPersonalGoals(preferences.personalGoals || "");
      setScheduleGenerationTime(preferences.scheduleGenerationTime || "06:00");
      setActivityNotifications(preferences.activityNotifications ?? true);
      setNotificationSound(preferences.notificationSound ?? true);
      setLocalVolume(preferences.soundVolume || 70);
    }
  }, [preferences]);

  const handleSaveMissionSettings = async () => {
    try {
      await updateSettings.mutateAsync({
        targetDuration: targetDuration.toString(),
        missionFocus,
      });
      toast({
        title: "Settings Saved",
        description: "Mission parameters have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  const handleSavePreferences = async () => {
    try {
      await updatePreferences.mutateAsync({
        wakeTime,
        sleepTime,
        targetWorkHours,
        targetFreeHours,
        targetOtherHours,
        consecutiveStudyLimit,
        personalGoals,
        scheduleGenerationTime,
      });
      toast({
        title: "Preferences Saved",
        description: "Your scheduling preferences have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save preferences",
        variant: "destructive",
      });
    }
  };

  const handleToggleNotificationPreference = async (type: 'notifications' | 'sound', value: boolean) => {
    try {
      if (type === 'notifications') {
        setActivityNotifications(value);
        await updatePreferences.mutateAsync({
          activityNotifications: value,
        });
      } else {
        setNotificationSound(value);
        await updatePreferences.mutateAsync({
          notificationSound: value,
        });
      }
      toast({
        title: "Preference Updated",
        description: type === 'notifications'
          ? `Activity notifications ${value ? 'enabled' : 'disabled'}.`
          : `Notification sound ${value ? 'enabled' : 'disabled'}.`,
      });
    } catch (error: any) {
      // Revert on error
      if (type === 'notifications') {
        setActivityNotifications(!value);
      } else {
        setNotificationSound(!value);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update preference",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePreference = async (key: 'selectedSound' | 'soundVolume', value: string | number) => {
    try {
      const updateData: Record<string, any> = {};
      updateData[key] = value;
      await updatePreferences.mutateAsync(updateData);
      if (key === 'selectedSound') {
        toast({
          title: "Preference Updated",
          description: `Notification sound changed to ${value}.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update preference",
        variant: "destructive",
      });
    }
  };

  const openActivityDialog = (activity?: ActivityType) => {
    if (activity) {
      setEditingActivity(activity);
      setActivityName(activity.name);
      setActivityCategory(activity.category);
      setActivityDuration(activity.defaultDuration);
      setActivityPreferredTime(activity.preferredTime || "");
    } else {
      setEditingActivity(null);
      setActivityName("");
      setActivityCategory("other");
      setActivityDuration(30);
      setActivityPreferredTime("");
    }
    setActivityDialog(true);
  };

  const handleSaveActivity = async () => {
    try {
      if (editingActivity) {
        await updateActivity.mutateAsync({
          id: editingActivity.id,
          name: activityName,
          category: activityCategory,
          defaultDuration: activityDuration,
          preferredTime: activityPreferredTime || null,
        });
        toast({ title: "Activity Updated" });
      } else {
        await createActivity.mutateAsync({
          name: activityName,
          category: activityCategory,
          defaultDuration: activityDuration,
          isDefault: false,
          isActive: true,
          preferredTime: activityPreferredTime || null,
        });
        toast({ title: "Activity Created" });
      }
      setActivityDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActivity = async (activity: ActivityType) => {
    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        isActive: !activity.isActive,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteActivity = async (id: number) => {
    try {
      await deleteActivity.mutateAsync(id);
      toast({ title: "Activity Deleted" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const totalHours = targetWorkHours + targetFreeHours + targetOtherHours;
  const isBalanceValid = totalHours <= 24;

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/30 bg-[#0d0d0ded] flex flex-col">
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
                <h1 className="text-xl font-bold font-display leading-none tracking-widest text-foreground transition-all duration-200">
                  FORGE
                </h1>
                <span className="text-[9px] text-primary font-mono tracking-[0.2em] uppercase">
                  Acid Ops v3.1
                </span>
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
                data-testid="button-missions"
                onClick={() => navigate("/")}
                size="sm"
                className="font-mono text-xs bg-transparent border border-primary text-primary hover:bg-primary hover:text-black transition-all duration-150 rounded-none uppercase tracking-widest"
                variant="outline"
              >
                MISSIONS
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
                <SettingsIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold uppercase tracking-widest">
                  Settings
                </h2>
                <p className="text-sm font-mono text-muted-foreground">
                  Configure your planning preferences
                </p>
              </div>
            </div>
            <BackButton label="DASHBOARD" onClick={() => navigate("/home")} />
          </div>

          {settingsLoading || prefsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="activities" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-black/50 border border-border rounded-none mb-6">
                <TabsTrigger
                  value="activities"
                  className="font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-black rounded-none"
                  data-testid="tab-activities"
                >
                  Activities
                </TabsTrigger>
                <TabsTrigger
                  value="missions"
                  className="font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-black rounded-none"
                  data-testid="tab-missions"
                >
                  Missions
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className="font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-black rounded-none"
                  data-testid="tab-system"
                >
                  System
                </TabsTrigger>
              </TabsList>

              {/* Activities Tab */}
              <TabsContent value="activities" className="space-y-6">
                <div className="tech-panel p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-sm font-display uppercase tracking-widest text-primary flex items-center gap-2">
                      <ActivityIcon className="w-4 h-4" />
                      Activity Library
                    </h3>
                    <Button
                      data-testid="button-add-activity"
                      onClick={() => openActivityDialog()}
                      size="sm"
                      className="font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>

                  <p className="text-xs font-mono text-muted-foreground">
                    Activities you want to include in your daily schedule. Toggle
                    to enable/disable auto-scheduling.
                  </p>

                  {activitiesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto border border-border/50 p-2">
                      {activities?.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-center justify-between p-3 bg-background/50 border border-border hover:border-primary/50 transition-colors"
                          data-testid={`activity-item-${activity.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Switch
                              data-testid={`switch-activity-${activity.id}`}
                              checked={activity.isActive}
                              onCheckedChange={() => handleToggleActivity(activity)}
                            />
                            <div className="flex-1">
                              <p className="font-mono text-sm">{activity.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-mono text-muted-foreground">
                                  {activity.category} • {activity.defaultDuration} min
                                  {activity.preferredTime &&
                                    ` • ${activity.preferredTime}`}
                                </p>
                                <Button
                                  data-testid={`button-edit-activity-${activity.id}`}
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openActivityDialog(activity)}
                                  className="h-5 w-5 p-0 hover:text-primary"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!activity.isDefault && (
                              <Button
                                data-testid={`button-delete-activity-${activity.id}`}
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteActivity(activity.id)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Missions Tab */}
              <TabsContent value="missions" className="space-y-6">
                <div className="tech-panel p-6 space-y-6">
                  <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                    Goldilocks Parameters
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="duration" className="text-sm font-mono">
                          Target Duration
                        </Label>
                        <span
                          className="text-lg font-display font-bold text-primary"
                          data-testid="text-duration-value"
                        >
                          {targetDuration} min
                        </span>
                      </div>
                      <Slider
                        data-testid="slider-duration"
                        id="duration"
                        min={5}
                        max={60}
                        step={5}
                        value={[targetDuration]}
                        onValueChange={(value) => setTargetDuration(value[0])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs font-mono text-muted-foreground">
                        <span>5 min</span>
                        <span className="text-primary">Goldilocks: 15-30 min</span>
                        <span>60 min</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="focus" className="text-sm font-mono">
                        Mission Focus
                      </Label>
                      <Textarea
                        data-testid="input-focus"
                        id="focus"
                        placeholder="e.g., practical application, theoretical understanding, hands-on implementation..."
                        value={missionFocus}
                        onChange={(e) => setMissionFocus(e.target.value)}
                        className="font-mono text-sm bg-background border-border focus:border-primary resize-none h-24"
                      />
                      <p className="text-xs font-mono text-muted-foreground">
                        Describe the type of missions you want to focus on
                      </p>
                    </div>
                  </div>

                  <Button
                    data-testid="button-save"
                    onClick={handleSaveMissionSettings}
                    disabled={updateSettings.isPending}
                    className="w-full font-mono text-sm bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest"
                  >
                    {updateSettings.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Settings
                  </Button>
                </div>
              </TabsContent>

              {/* System Tab */}
              <TabsContent value="system" className="space-y-6">
                <div className="tech-panel p-6 space-y-4">
                  <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                    Display Settings
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Moon className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-mono text-sm">Light Mode</p>
                        <p className="text-xs font-mono text-muted-foreground">
                          Coming soon
                        </p>
                      </div>
                    </div>
                    <Button
                      data-testid="button-toggle-theme"
                      disabled
                      className="font-mono text-xs bg-muted text-muted-foreground rounded-none uppercase tracking-widest"
                      variant="outline"
                    >
                      Unavailable
                    </Button>
                  </div>
                </div>

                <div className="tech-panel p-6 space-y-4">
                  <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2 flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4" />
                    Notifications & Sound
                  </h3>

                  <p className="text-xs font-mono text-muted-foreground">
                    Configure how you're notified when scheduled activities change.
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-background/50 border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-mono text-sm">Activity Change Notifications</p>
                          <p className="text-xs font-mono text-muted-foreground">
                            Show toast notification when switching activities
                          </p>
                        </div>
                      </div>
                      <Switch
                        data-testid="switch-notifications"
                        checked={activityNotifications}
                        onCheckedChange={(checked) => handleToggleNotificationPreference('notifications', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-background/50 border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-mono text-sm">Notification Sound</p>
                          <p className="text-xs font-mono text-muted-foreground">
                            Play sound when activity changes
                          </p>
                        </div>
                      </div>
                      <Switch
                        data-testid="switch-sound"
                        checked={notificationSound}
                        onCheckedChange={(checked) => handleToggleNotificationPreference('sound', checked)}
                      />
                    </div>

                    {notificationSound && (
                      <>
                        <div className="flex items-center justify-between p-3 bg-background/50 border border-border hover:border-primary/50 transition-colors">
                          <div className="flex-1">
                            <p className="font-mono text-sm">Select Sound</p>
                            <p className="text-xs font-mono text-muted-foreground">
                              Choose your notification sound
                            </p>
                          </div>
                          <select
                            data-testid="select-sound"
                            value={preferences?.selectedSound || 'chime'}
                            onChange={(e) => handleUpdatePreference('selectedSound', e.target.value)}
                            className="ml-4 px-2 py-1 text-xs font-mono bg-background border border-primary/50 rounded text-foreground"
                          >
                            <option value="chime">Chime</option>
                            <option value="bell">Bell</option>
                            <option value="ping">Ping</option>
                            <option value="alert">Alert</option>
                            <option value="subtle">Subtle</option>
                          </select>
                        </div>

                        <div className="p-3 bg-background/50 border border-border hover:border-primary/50 transition-colors">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-mono text-sm">Volume</p>
                              <p className="text-xs font-mono text-muted-foreground">
                                {localVolume}%
                              </p>
                            </div>
                            <button
                              data-testid="button-preview-sound"
                              onClick={() => playPreviewSound(preferences?.selectedSound || 'chime', localVolume / 100)}
                              className="px-3 py-1 text-xs font-mono bg-primary text-black hover:bg-primary/90 rounded uppercase tracking-widest"
                            >
                              Preview
                            </button>
                          </div>
                          <Slider
                            data-testid="slider-volume"
                            min={0}
                            max={100}
                            step={1}
                            value={[localVolume]}
                            onValueChange={(value) => handleVolumeChange(value[0])}
                            className="w-full"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="tech-panel p-6 space-y-4">
                  <h3 className="text-sm font-display uppercase tracking-widest text-primary border-b border-border pb-2">
                    LLM Configuration Status
                  </h3>

                  {llmLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-mono text-muted-foreground">
                        Checking API status...
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-background/50 border border-border">
                        <div className="flex items-center gap-3">
                          {llmStatus?.groq ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-mono font-bold">Groq API</p>
                            <p className="text-xs font-mono text-muted-foreground">
                              Fast mission generation
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-mono uppercase ${
                            llmStatus?.groq ? "text-green-500" : "text-red-500"
                          }`}
                          data-testid="status-groq"
                        >
                          {llmStatus?.groq ? "CONNECTED" : "NOT CONFIGURED"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-background/50 border border-border">
                        <div className="flex items-center gap-3">
                          {llmStatus?.gemini ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-mono font-bold">Gemini API</p>
                            <p className="text-xs font-mono text-muted-foreground">
                              Vision validation & scheduling
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-mono uppercase ${
                            llmStatus?.gemini ? "text-green-500" : "text-red-500"
                          }`}
                          data-testid="status-gemini"
                        >
                          {llmStatus?.gemini ? "CONNECTED" : "NOT CONFIGURED"}
                        </span>
                      </div>

                      {(!llmStatus?.groq || !llmStatus?.gemini) && (
                        <div className="space-y-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded">
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5"></div>
                            <div className="flex-1 space-y-2">
                              <p className="text-sm font-mono text-yellow-500 font-bold">
                                AI Features Disabled - API Keys Required
                              </p>
                              <p className="text-xs font-mono text-yellow-500/80">
                                The following features require API keys to be configured:
                              </p>
                              <ul className="text-xs font-mono text-yellow-500/80 space-y-1 ml-4">
                                <li>• AI Schedule Generation</li>
                                <li>• Mission Auto-Generation</li>
                                <li>• Pattern Analysis from Feedback</li>
                                <li>• Document Ingestion & Concept Extraction</li>
                                <li>• Schedule Detail Enrichment</li>
                              </ul>
                            </div>
                          </div>

                          <div className="border-t border-yellow-500/30 pt-3 space-y-3">
                            <p className="text-xs font-mono text-yellow-500 font-bold">
                              Setup Instructions:
                            </p>

                            <div className="space-y-2">
                              <p className="text-xs font-mono text-yellow-500/80">
                                1. Get a free Groq API key (for pattern analysis):
                              </p>
                              <a
                                href="https://console.groq.com/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs font-mono text-yellow-400 hover:text-yellow-300 underline ml-4"
                              >
                                → console.groq.com/keys
                              </a>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-mono text-yellow-500/80">
                                2. Get a Gemini API key (for AI planning):
                              </p>
                              <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs font-mono text-yellow-400 hover:text-yellow-300 underline ml-4"
                              >
                                → aistudio.google.com/app/apikey
                              </a>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-mono text-yellow-500/80">
                                3. Get an OpenAI API key (for GPT-4o Mini):
                              </p>
                              <a
                                href="https://platform.openai.com/api-keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs font-mono text-yellow-400 hover:text-yellow-300 underline ml-4"
                              >
                                → platform.openai.com/api-keys
                              </a>
                              <p className="text-xs font-mono text-yellow-500/60 ml-4">
                                ($5 free credits for new accounts)
                              </p>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-mono text-yellow-500/80">
                                4. Add them to your Replit Secrets:
                              </p>
                              <div className="ml-4 space-y-1 text-xs font-mono text-yellow-500/60">
                                <p>• Open the Tools panel (left sidebar)</p>
                                <p>• Click "Secrets" (lock icon)</p>
                                <p>• Add: GROQ_API_KEY = your_groq_key</p>
                                <p>• Add: GEMINI_API_KEY = your_gemini_key</p>
                                <p>• Add: OPENAI_API_KEY = your_openai_key</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-mono text-yellow-500/80">
                                4. Restart your Repl (stop and run again)
                              </p>
                            </div>
                          </div>

                          <div className="border-t border-yellow-500/30 pt-3">
                            <p className="text-xs font-mono text-yellow-500/60">
                              Both APIs offer free tiers sufficient for personal use.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="tech-panel p-6 space-y-4">
                  <div className="border-b border-border pb-4">
                    <h3 className="text-sm font-display uppercase tracking-widest text-primary mb-2">
                      Account Information
                    </h3>
                    <p className="text-xs font-mono text-muted-foreground mb-4">
                      Manage your profile and account settings
                    </p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Email</p>
                        <p className="text-sm font-mono text-foreground" data-testid="text-user-email">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Name</p>
                        <p className="text-sm font-mono text-foreground" data-testid="text-user-name">{user?.name}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4">
                    <Button
                      onClick={async () => {
                        try {
                          await logout();
                          toast({
                            title: "Logged out",
                            description: "You have been logged out successfully.",
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: error instanceof Error ? error.message : "Failed to log out",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="w-full font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none"
                      data-testid="button-logout"
                    >
                      Logout
                    </Button>

                    <Button
                      onClick={() => setShowDeleteConfirm(true)}
                      variant="destructive"
                      className="w-full font-mono text-xs rounded-none"
                      data-testid="button-delete-account"
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      Delete Account
                    </Button>
                  </div>
                </div>
              </TabsContent>

              </Tabs>
          )}
        </div>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-black/95 border border-red-500/30">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest text-red-500">
              Confirm Account Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm font-mono text-muted-foreground">
              Are you sure you want to delete your account? This action is permanent and cannot be undone.
            </p>
            <p className="text-xs font-mono text-red-500/80">
              All your data including missions, schedules, deadlines, courses, and proofs will be permanently deleted.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              className="font-mono text-xs rounded-none"
              disabled={deleteAccount.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteAccount.mutate(undefined, {
                  onSuccess: async () => {
                    toast({
                      title: "Account Deleted",
                      description: "Your account has been permanently deleted.",
                    });
                    try {
                      await logout();
                    } catch (error) {
                      console.error("Error during logout after account deletion:", error);
                    }
                    navigate("/landing");
                  },
                  onError: (error) => {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to delete account",
                      variant: "destructive",
                    });
                    setShowDeleteConfirm(false);
                  },
                });
              }}
              disabled={deleteAccount.isPending}
              className="font-mono text-xs rounded-none"
            >
              {deleteAccount.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Dialog */}
      <Dialog open={activityDialog} onOpenChange={setActivityDialog}>
        <DialogContent className="bg-black/95 border border-border">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest text-primary">
              {editingActivity ? "Edit Activity" : "Add Activity"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-mono">Name</Label>
              <Input
                data-testid="input-activity-name"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="e.g., Morning Workout"
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2 relative">
              <Label className="text-sm font-mono">Category</Label>
              <button
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full px-3 py-2 text-xs font-mono text-left bg-background border border-border hover:border-primary/50 transition-colors rounded"
                data-testid="button-category-dropdown"
              >
                {CATEGORY_LABELS[activityCategory]} <span className="float-right">▼</span>
              </button>

              {categoryDropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border bg-background shadow-lg rounded">
                  <div
                    ref={categoryContainerRef}
                    className="space-y-1 p-2 max-h-48 overflow-hidden"
                    onWheel={handleCategoryWheel}
                    onKeyDown={handleCategoryKeyDown}
                    tabIndex={0}
                  >
                    {visibleCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setActivityCategory(cat);
                          setCategoryDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1 text-xs font-mono rounded transition-colors ${
                          activityCategory === cat
                            ? "bg-primary text-black"
                            : "bg-background/50 text-foreground hover:bg-background/80"
                        }`}
                        data-testid={`category-option-${cat}`}
                      >
                        {CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 p-2 border-t border-border">
                    <button
                      onClick={() => handleCategoryScroll('up')}
                      disabled={categoryScrollIndex === 0}
                      className="flex-1 px-1 py-1 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 transition-all rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-category-up"
                    >
                      <ChevronDown size={10} className="rotate-180 mx-auto" />
                    </button>
                    <button
                      onClick={() => handleCategoryScroll('down')}
                      disabled={categoryScrollIndex >= CATEGORIES.length - 5}
                      className="flex-1 px-1 py-1 text-[9px] font-mono uppercase border border-white/20 text-foreground hover:border-primary hover:text-primary hover:bg-primary/20 transition-all rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-category-down"
                    >
                      <ChevronDown size={10} className="mx-auto" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-mono">Duration (minutes)</Label>
              <Input
                data-testid="input-activity-duration"
                type="number"
                min="1"
                max="1440"
                value={activityDuration}
                onChange={(e) => setActivityDuration(Math.max(1, parseInt(e.target.value) || 30))}
                className="font-mono bg-background border-border"
                placeholder="e.g., 30, 90, 120"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-mono">Preferred Time (optional)</Label>
              <Input
                data-testid="input-activity-time"
                type="time"
                value={activityPreferredTime}
                onChange={(e) => setActivityPreferredTime(e.target.value)}
                className="font-mono bg-background border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivityDialog(false)}
              className="font-mono text-xs rounded-none"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-save-activity"
              onClick={handleSaveActivity}
              disabled={!activityName.trim()}
              className="font-mono text-xs bg-primary text-black hover:bg-primary/90 rounded-none"
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