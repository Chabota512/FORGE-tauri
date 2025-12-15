import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "./queryClient";

export interface Mission {
  id: number;
  courseId: number;
  title: string;
  description: string;
  proofRequirement: string;
  missionDate: string;
  status: string;
  courseName: string;
  courseCode: string;
  proofFile?: string;
  courseIcon?: string;
}

export interface MissionFeedbackResponse {
  feedback: any;
  aiAnalysis?: string;
  message: string;
}

export interface Course {
  id: number;
  code: string;
  name: string;
  icon?: string;
  programOfStudy?: string;
}

export interface Settings {
  targetDuration: string;
  missionFocus: string;
}

export interface LLMStatus {
  groq: boolean;
  gemini: boolean;
  openai: boolean;
}

export interface OpenAIValidation {
  valid: boolean;
  status: 'valid' | 'invalid' | 'expired' | 'unconfigured' | 'error';
  message: string;
}

export interface AIValidationResults {
  openai: { valid: boolean; status: string; message: string };
  gemini: { valid: boolean; status: string; message: string };
  groq: { valid: boolean; status: string; message: string };
}

export interface Concept {
  name: string;
  description: string;
  relevance: string;
}

export interface CourseContext {
  concepts: Concept[];
  summary: string;
  lastUpdated?: string;
  sourceFile?: string;
}

export interface IngestResult {
  success: boolean;
  courseCode: string;
  extractedConcepts: number;
  totalConcepts: number;
  summary: string;
  concepts: Concept[];
}

export interface AcademicCommitment {
  id: number;
  title: string;
  type: string;
  courseId?: number;
  description?: string;
  venue?: string | null;
  topic?: string | null;
  startTime: string;
  endTime: string;
  dayOfWeek?: number;
  specificDate?: string;
  isRecurring?: boolean;
  priority?: number;
  createdAt?: string;
}

export interface TimeBlock {
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  description?: string;
  courseCode?: string;
  priority?: number;
  source?: string;
}

export interface DailySchedule {
  id: number;
  scheduleDate: string;
  scheduleData: string;
  timeBlocks: TimeBlock[];
  generatedAt: string;
  aiReasoning?: string;
  source?: string;
}

export interface CourseMaterialStatus {
  courseId: number;
  courseCode: string;
  courseName: string;
  hasMaterials: boolean;
  chunkCount: number;
}

export interface CourseMaterialsStatusResponse {
  total: number;
  withMaterials: number;
  withoutMaterials: number;
  courses: CourseMaterialStatus[];
  coursesNeedingUpload: CourseMaterialStatus[];
}

export function useCourseMaterialsStatus() {
  return useQuery<CourseMaterialsStatusResponse>({
    queryKey: ["/api/courses/materials-status"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/courses/materials-status"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch course materials status");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTodayMissions() {
  return useQuery<Mission[]>({
    queryKey: ["/api/missions/today"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/missions/today"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
  });
}

export function useCourses() {
  return useQuery<Course[]>({
    queryKey: ["/api/courses"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/courses"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch courses");
      return res.json();
    },
  });
}

export function useArchive() {
  return useQuery<Mission[]>({
    queryKey: ["/api/archive"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/archive"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch archive");
      return res.json();
    },
  });
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/settings"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });
}

export function useLLMStatus() {
  return useQuery<LLMStatus>({
    queryKey: ["/api/llm/status"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/llm/status"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch LLM status");
      return res.json();
    },
  });
}

export function useValidateAllAPIs() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("/api/llm/validate/all"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to validate APIs");
      return res.json() as Promise<AIValidationResults>;
    },
  });
}

export function useCourseContext(courseCode: string) {
  return useQuery<CourseContext>({
    queryKey: ["/api/context", courseCode],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/context/${courseCode}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch context");
      return res.json();
    },
    enabled: !!courseCode,
  });
}


export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<Settings>) => {
      const res = await fetch(getApiUrl("/api/settings"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });
}

export function useUploadProof() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId, courseCode, file }: { missionId: number; courseCode: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(getApiUrl(`/api/missions/${courseCode}/${missionId}/proof`), {
        method: "POST", credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload proof");
      return data;
    },
    onSuccess: () => {
      // Invalidate all mission-related queries to update stats
      queryClient.invalidateQueries({ queryKey: ["/api/missions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/archive"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
  });
}

export interface MissionFeedbackData {
  missionId: number;
  emotionalState?: string;
  actualTimeMinutes?: number;
  timeFeeling?: string;
  usedExternalHelp?: boolean;
  helpDetails?: string;
  missionClarity?: string;
  learningType?: string;
  blockers?: string;
  confidenceLevel?: string;
  difficulty?: number;
  timeAccuracy?: number;
  notes?: string;
}

export interface FeedbackResponse {
  feedback: any;
  aiApproved: boolean;
  aiAnalysis: string;
  aiRejectionReason?: string;
  masteryDeltas: any[];
  message: string;
}

export function useSubmitMissionFeedback() {
  return useMutation({
    mutationFn: async (data: MissionFeedbackData): Promise<FeedbackResponse> => {
      const res = await fetch(getApiUrl(`/api/missions/${data.missionId}/feedback`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to submit feedback");
      return result;
    },
  });
}

export function useConfirmMissionComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId }: { missionId: number }) => {
      const res = await fetch(getApiUrl(`/api/missions/${missionId}/confirm-complete`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm completion");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/archive"] });
      queryClient.invalidateQueries({ queryKey: ["/api/completed-missions"] });
    },
  });
}

export function useCompletedMissions() {
  return useQuery({
    queryKey: ["/api/completed-missions"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/completed-missions"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch completed missions");
      return res.json();
    },
  });
}

export function useMissionReport(missionId: number | null) {
  return useQuery({
    queryKey: ["/api/missions", missionId, "report"],
    queryFn: async () => {
      if (!missionId) return null;
      const res = await fetch(getApiUrl(`/api/missions/${missionId}/report`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch mission report");
      return res.json();
    },
    enabled: !!missionId,
  });
}

export function useDeleteMission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId }: { missionId: number }) => {
      const res = await fetch(getApiUrl(`/api/missions/${missionId}`), {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete mission");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/archive"] });
    },
  });
}

export function useDeleteProof() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId }: { missionId: number }) => {
      const res = await fetch(getApiUrl(`/api/missions/${missionId}/proof`), {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete proof");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/archive"] });
    },
  });
}

export function useIngestNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseCode, file }: { courseCode: string; file: File }): Promise<IngestResult> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("courseCode", courseCode);

      const res = await fetch(getApiUrl("/api/ingest_notes"), {
        method: "POST", credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to ingest notes");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/context", variables.courseCode] });
    },
  });
}

export function useGenerateMission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseCode }: { courseCode: string }) => {
      const res = await fetch(getApiUrl("/api/missions/generate"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate mission");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions/today"] });
    },
  });
}

export function useExportPortfolio() {
  return useMutation({
    mutationFn: async (dateRange?: { startDate?: string; endDate?: string }) => {
      const res = await fetch(getApiUrl("/api/portfolio/export"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dateRange || {}),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Export failed with status ${res.status}`);
      }

      const blob = await res.blob();

      if (blob.size === 0) {
        throw new Error("Export file is empty - no data available");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio_${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true, size: blob.size };
    },
  });
}

export function useForgeKBFiles() {
  return useQuery<Array<{
    name: string;
    course: string;
    path: string;
    size: number;
    modified: string;
  }>>({
    queryKey: ["/api/forge-kb/files"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/forge-kb/files"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });
}

export function useBatchGenerateDetails() {
  return useMutation({
    mutationFn: async (data: { blocks: any[]; date: string }) => {
      const res = await fetch(getApiUrl("/api/activities/generate-details-batch"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate batch details");
      }
      return res.json();
    },
  });
}

export function useCommitments() {
  return useQuery<AcademicCommitment[]>({
    queryKey: ["/api/commitments"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/commitments"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch commitments");
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useCreateCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commitment: Partial<AcademicCommitment>) => {
      const res = await fetch(getApiUrl("/api/commitments"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commitment),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save commitment");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commitments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

export function useUpdateCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commitment: Partial<AcademicCommitment> & { id: number }) => {
      const { id, ...data } = commitment;
      const res = await fetch(getApiUrl(`/api/commitments/${id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || "Failed to update commitment");
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commitments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

export function useDeleteCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(getApiUrl(`/api/commitments/${id}`), {
        method: "DELETE", credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete commitment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commitments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

export function useTodaySchedule() {
  return useQuery<DailySchedule>({
    queryKey: ["/api/schedule/today"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/schedule/today"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schedule");
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useScheduleDates() {
  return useQuery<string[]>({
    queryKey: ["/api/schedule/dates"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/schedule/dates"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schedule dates");
      return res.json();
    },
  });
}

export function useScheduleByDate(date: string) {
  return useQuery<DailySchedule>({
    queryKey: ["/api/schedule", date],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule/${date}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schedule");
      return res.json();
    },
    enabled: !!date,
  });
}

export function useRecentSchedules(days: number = 7) {
  return useQuery<DailySchedule[]>({
    queryKey: ["/api/schedule/recent", days],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule/recent?days=${days}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recent schedules");
      return res.json();
    },
  });
}

export function useGenerateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date?: string) => {
      const res = await fetch(getApiUrl("/api/schedule/generate"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate schedule");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

export interface Deadline {
  id: number;
  title: string;
  type: string;
  courseId?: number;
  dueDate: string;
  dueTime?: string;
  priority: number;
  description?: string;
  createdAt?: string;
}

export interface DailyFeedback {
  id?: number;
  feedbackDate: string;
  completionRating?: number | null;
  energyLevel?: number | null;
  notes?: string | null;
  createdAt?: string;
}

export function useDeadlines() {
  return useQuery<Deadline[]>({
    queryKey: ["/api/deadlines"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/deadlines"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deadlines");
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useCreateDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deadline: Partial<Deadline>) => {
      const res = await fetch(getApiUrl("/api/deadlines"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deadline),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save deadline");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
    },
  });
}

export function useDeleteDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(getApiUrl(`/api/deadlines/${id}`), {
        method: "DELETE", credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete deadline");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
    },
  });
}

export function useDailyFeedback(date: string) {
  return useQuery<DailyFeedback>({
    queryKey: ["/api/feedback", date],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/feedback/${date}`));
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json();
    },
    enabled: !!date,
  });
}

export function useSubmitDailyFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: DailyFeedback) => {
      const res = await fetch(getApiUrl("/api/feedback"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save feedback");
      return data;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/feedback", variables.feedbackDate] });
      await queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
  });
}

export interface ScheduleBlockFeedback {
  scheduleDate: string;
  blockStartTime: string;
  completed: boolean;
  skipped: boolean;
  skipReason?: "conflicts" | "fatigue" | "priority_change" | "interruption" | "other";
  customSkipReason?: string;
  energyLevel?: number;
  accuracy?: number;
  difficulty?: number;
  actualTimeSpent?: number;
  topicsCovered?: string;
  comments?: string;
}

export function useSubmitBlockFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: ScheduleBlockFeedback) => {
      const res = await fetch(getApiUrl("/api/feedback/block"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save block feedback");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
  });
}

// =============== DPM: User Preferences ===============
export interface UserPreferences {
  id?: number;
  wakeTime: string;
  sleepTime: string;
  targetWorkHours: number;
  targetFreeHours: number;
  targetOtherHours: number;
  consecutiveStudyLimit: number;
  personalGoals: string;
  scheduleGenerationTime: string;
  eveningPromptTime?: string;
  activityNotifications?: boolean;
  notificationSound?: boolean;
  selectedSound?: string;
  soundVolume?: number;
  updatedAt?: string;
}

export function useUserPreferences() {
  return useQuery<UserPreferences>({
    queryKey: ["/api/preferences"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/preferences"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch preferences");
      return res.json();
    },
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: Partial<UserPreferences>) => {
      const res = await fetch(getApiUrl("/api/preferences"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save preferences");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
    },
  });
}

// =============== DPM: Activity Library ===============
export interface Activity {
  id: number;
  name: string;
  category: string;
  defaultDuration: number;
  isDefault: boolean;
  isActive: boolean;
  preferredTime: string | null;
  createdAt?: string;
}

export function useActivityLibrary() {
  return useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/activities"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activities");
      return res.json();
    },
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activity: Omit<Activity, "id" | "createdAt">) => {
      const res = await fetch(getApiUrl("/api/activities"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create activity");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...activity }: Partial<Activity> & { id: number }) => {
      const res = await fetch(getApiUrl(`/api/activities/${id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update activity");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(getApiUrl(`/api/activities/${id}`), {
        method: "DELETE", credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete activity");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });
}

// =============== DPM: Draft Schedule Builder ===============
export interface DraftSchedule {
  id: number;
  scheduleDate: string;
  scheduleData: string;
  timeBlocks: TimeBlock[];
  source: string;
  chatPrompt?: string;
  aiReasoning?: string;
  isFinalized: boolean;
  createdAt?: string;
}

export function useDraftSchedule(date: string) {
  return useQuery<DraftSchedule | null>({
    queryKey: ["/api/schedule/draft", date],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule/draft/${date}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch draft schedule");
      return res.json();
    },
    enabled: !!date,
  });
}

export function useGenerateDraftSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date?: string) => {
      const res = await fetch(getApiUrl("/api/schedule/draft/generate"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft schedule");
      return data;
    },
    onSuccess: (_, date) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", date] });
    },
  });
}

export function useRecentScheduleAsDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date?: string) => {
      const res = await fetch(getApiUrl("/api/schedule/recent-as-draft"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to use recent schedule");
      return data;
    },
    onSuccess: (_, date) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", date] });
    },
  });
}

export function useUpdateDraftSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ date, timeBlocks }: { date: string; timeBlocks: TimeBlock[] }) => {
      const res = await fetch(getApiUrl("/api/schedule/draft/update"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          date, 
          scheduleData: JSON.stringify(timeBlocks)
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update draft schedule");
      return data;
    },
    onSuccess: (_, { date }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", date] });
    },
  });
}

export function useProcessSchedule() {
  return useMutation({
    mutationFn: async ({ date, timeBlocks }: { date: string; timeBlocks: TimeBlock[] }) => {
      const res = await fetch(getApiUrl("/api/schedule/process"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, timeBlocks }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process schedule");
      return data;
    },
  });
}

export function useChatBuildSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ date, prompt }: { date?: string; prompt: string }) => {
      const res = await fetch(getApiUrl("/api/schedule/draft/chat"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, prompt }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to build schedule from chat");
      return data;
    },
    onSuccess: (_, { date }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", date] });
    },
  });
}

export function useFinalizeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date?: string) => {
      const res = await fetch(getApiUrl("/api/schedule/draft/finalize"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to finalize schedule");
      return data;
    },
    onSuccess: async () => {
      // Invalidate all schedule-related queries to sync timeline
      await queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/schedule/recent"] });
    },
  });
}

export interface EnrichScheduleRequest {
  scheduleDate: string;
  timeBlocks: TimeBlock[];
}

export interface UnknownActivity {
  title: string;
  question: string;
}

export interface EnrichScheduleResponse {
  enrichedBlocks: TimeBlock[];
  unknownActivities?: UnknownActivity[];
}

export function useEnrichSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: EnrichScheduleRequest): Promise<EnrichScheduleResponse> => {
      const res = await fetch(getApiUrl("/api/schedule/enrich"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enrich schedule");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/draft", variables.scheduleDate] });
    },
  });
}

// Utility function to calculate time balance from time blocks
export interface TimeBalance {
  work: number;
  free: number;
  other: number;
  sleeping: number;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function calculateTimeBalance(blocks: TimeBlock[]): TimeBalance {
  const balance: TimeBalance = {
    work: 0,
    free: 0,
    other: 0,
    sleeping: 0,
  };

  blocks.forEach((block) => {
    const startMin = timeToMinutes(block.startTime);
    const endMin = timeToMinutes(block.endTime);
    const duration = Math.max(0, endMin - startMin);

    const typeStr = (block.type || "").toLowerCase();

    // Categorize based on type
    if (typeStr.includes("sleep")) {
      balance.sleeping += duration;
    } else if (
      typeStr.includes("study") ||
      typeStr.includes("class") ||
      typeStr.includes("mission") ||
      typeStr.includes("exam") ||
      typeStr.includes("assignment")
    ) {
      balance.work += duration;
    } else if (typeStr.includes("break") || typeStr.includes("personal")) {
      balance.free += duration;
    } else {
      balance.other += duration;
    }
  });

  // Convert to hours
  return {
    work: balance.work / 60,
    free: balance.free / 60,
    other: balance.other / 60,
    sleeping: balance.sleeping / 60,
  };
}

// Analyze activity details to get relevant fields
export function useAnalyzeActivityDetails() {
  return useMutation({
    mutationFn: async (request: { title: string; description: string }): Promise<{ relevantFields: string[] }> => {
      const res = await fetch(getApiUrl("/api/activities/analyze-details"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze activity details");
      return data;
    },
  });
}

// =============== Schedule Drift Detection ===============
export interface ScheduleDriftEvent {
  id: number;
  scheduleDate: string;
  blockStartTime: string;
  blockTitle: string;
  plannedDuration: number;
  actualDuration: number;
  driftMinutes: number;
  cumulativeDrift: number;
  affectedBlocksCount: number;
  userChoice?: string;
  aiRescheduleSuggestion?: string;
  resolved: boolean;
  createdAt?: string;
  resolvedAt?: string;
}

export interface DriftCheckResult {
  drift: boolean;
  driftMinutes: number;
  event?: ScheduleDriftEvent;
  requiresReschedule?: boolean;
}

export function useUnresolvedDriftEvents(date: string) {
  return useQuery<ScheduleDriftEvent[]>({
    queryKey: ["/api/schedule-drift", date],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule-drift/${date}`));
      if (!res.ok) throw new Error("Failed to fetch drift events");
      return res.json();
    },
    enabled: !!date,
    refetchInterval: 10000,
  });
}

export function useCheckDrift() {
  const queryClient = useQueryClient();

  return useMutation<DriftCheckResult, Error, {
    scheduleDate: string;
    blockStartTime: string;
    blockTitle: string;
    plannedDuration: number;
    actualDuration: number;
  }>({
    mutationFn: async (request) => {
      const res = await fetch(getApiUrl("/api/schedule-drift/check"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check drift");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-drift", variables.scheduleDate] });
    },
  });
}

export function useResolveDriftEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, userChoice, newScheduleData }: { 
      id: number; 
      userChoice: string; 
      newScheduleData?: string;
    }) => {
      const res = await fetch(getApiUrl(`/api/schedule-drift/${id}/resolve`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userChoice, newScheduleData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve drift event");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

export function useAIReschedule() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; rescheduledBlocks: TimeBlock[] },
    Error,
    { id: number; scheduleDate: string; currentTime: string; remainingBlocks: TimeBlock[] }
  >({
    mutationFn: async ({ id, scheduleDate, currentTime, remainingBlocks }) => {
      const res = await fetch(getApiUrl(`/api/schedule-drift/${id}/ai-reschedule`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleDate, currentTime, remainingBlocks }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate AI reschedule");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-drift", variables.scheduleDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/today"] });
    },
  });
}

// =============== BOOKS ===============
export interface Book {
  id: number;
  title: string;
  author?: string | null;
  status: string;
  notes?: string | null;
  timeCategory: string;
  currentPage?: number | null;
  totalPages?: number | null;
  createdAt?: string;
  completedAt?: string | null;
}

export function useBooks() {
  return useQuery<Book[]>({
    queryKey: ["/api/books"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/books"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (book: Omit<Book, "id" | "createdAt" | "completedAt">) => {
      const res = await fetch(getApiUrl("/api/books"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create book");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
    },
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...book }: Partial<Book> & { id: number }) => {
      const res = await fetch(getApiUrl(`/api/books/${id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update book");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(getApiUrl(`/api/books/${id}`), {
        method: "DELETE", credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete book");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
    },
  });
}

export function useRecordChapter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, chapterNumber }: { bookId: number; chapterNumber: number }) => {
      const res = await fetch(getApiUrl(`/api/books/${bookId}/chapters`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record chapter");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reading-stats"] });
    },
  });
}

export interface ReadingStats {
  booksCompletedMonth: number;
  booksCompletedYear: number;
  streakDays: number;
  paceChaptersPerWeek: number;
  last7Days: { date: string; hasReading: boolean; count: number }[];
}

export function useReadingStats() {
  return useQuery<ReadingStats>({
    queryKey: ["/api/reading-stats"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/reading-stats"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reading stats");
      return res.json();
    },
  });
}

// =============== COURSES CRUD ===============
export interface CourseWithProgram extends Course {
  programOfStudy?: string;
}

export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (course: { code: string; name: string; programOfStudy?: string; icon?: string }) => {
      const res = await fetch(getApiUrl("/api/courses"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(course),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create course");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      await queryClient.refetchQueries({ queryKey: ["/api/courses"] });
    },
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...course }: { id: number; code?: string; name?: string; programOfStudy?: string; icon?: string }) => {
      const res = await fetch(getApiUrl(`/api/courses/${id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(course),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update course");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      await queryClient.refetchQueries({ queryKey: ["/api/courses"] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(getApiUrl(`/api/courses/${id}`), {
        method: "DELETE", credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete course");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      await queryClient.refetchQueries({ queryKey: ["/api/courses"] });
    },
  });
}

// =============== CONCEPT TRACKING ===============
export interface ConceptTracking {
  id: number;
  courseId?: number | null;
  conceptName: string;
  firstCoveredAt?: string;
  lastCoveredAt?: string;
  coverageCount: number;
  masteryLevel: number;
}

export function useConcepts() {
  return useQuery<ConceptTracking[]>({
    queryKey: ["/api/concepts"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/concepts"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch concepts");
      return res.json();
    },
  });
}

export function useConceptsForCourse(courseId: number) {
  return useQuery<ConceptTracking[]>({
    queryKey: ["/api/concepts/course", courseId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/concepts/course/${courseId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch course concepts");
      return res.json();
    },
    enabled: !!courseId,
  });
}

export function useRecordConcept() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, conceptName }: { courseId: number; conceptName: string }) => {
      const res = await fetch(getApiUrl("/api/concepts/record"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, conceptName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record concept");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/concepts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/concepts/course", variables.courseId] });
    },
  });
}

// =============== ANALYTICS ===============
export interface FeedbackStats {
  totalBlocks: number;
  completedBlocks: number;
  skippedBlocks: number;
  avgEnergyLevel: number;
  avgDifficulty: number;
  skipReasons: Record<string, number>;
}

export interface TimePerCourse {
  courseId: number;
  courseName: string;
  totalMinutes: number;
}

export interface ProductivityByHour {
  hour: number;
  completionRate: number;
  avgEnergy: number;
}

export function useFeedbackStats() {
  return useQuery<FeedbackStats>({
    queryKey: ["/api/analytics/feedback-stats"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/analytics/feedback-stats"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch feedback stats");
      return res.json();
    },
  });
}

export function useTimePerCourse() {
  return useQuery<TimePerCourse[]>({
    queryKey: ["/api/analytics/time-per-course"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/analytics/time-per-course"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time per course");
      return res.json();
    },
  });
}

export function useProductivityByHour() {
  return useQuery<ProductivityByHour[]>({
    queryKey: ["/api/analytics/productivity-by-hour"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/analytics/productivity-by-hour"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch productivity by hour");
      return res.json();
    },
  });
}

export interface CourseAnalytics {
  courseId: number;
  courseCode: string;
  courseName: string;
  totalMinutes: number;
  conceptsCovered: number;
  totalConcepts: number;
  progressPercent: number;
}

export interface UpcomingDeadline {
  id: number;
  title: string;
  type: string;
  courseId: number | null;
  dueDate: string;
  daysRemaining: number;
}

export interface ComprehensiveAnalytics {
  summary: {
    totalBlocks: number;
    completedBlocks: number;
    skippedBlocks: number;
    completionRate: number;
    avgEnergyLevel: number;
    avgDifficulty: number;
    currentStreak: number;
    totalStudyMinutes: number;
  };
  skipReasons: Record<string, number>;
  productivityByHour: ProductivityByHour[];
  courseAnalytics: CourseAnalytics[];
  upcomingDeadlines: UpcomingDeadline[];
  recommendations: string[];
  peakHours: number[];
  lowEnergyHours: number[];
}

export function useComprehensiveAnalytics() {
  return useQuery<ComprehensiveAnalytics>({
    queryKey: ["/api/analytics/comprehensive"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/analytics/comprehensive"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comprehensive analytics");
      return res.json();
    },
  });
}

export interface TimeAllocation {
  date: string;
  sleeping: number;
  working: number;
  freeTime: number;
  other: number;
}

export function useTimeAllocation(days: number = 7) {
  return useQuery<TimeAllocation[]>({
    queryKey: ["/api/analytics/time-allocation", days],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/analytics/time-allocation?days=${days}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time allocation");
      return res.json();
    },
  });
}

// =============== ACCOUNT MANAGEMENT ===============
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log out");
      return data;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("/api/auth/account"), {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");
      return data;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// =============== KNOWLEDGE CHAT & LEARNER PROFILE ===============
export interface LearnerProfile {
  id: number;
  userId: number;
  courseId: number;
  overallConfidence?: number;
  confusionPoints?: string;
  prerequisiteGaps?: string;
  learningStyle?: string;
  preferredPracticeTypes?: string;
  idealSessionLength?: number;
  bestStudyTimes?: string;
  topicsCoveredInClass?: string;
  topicsSelfStudied?: string;
  upcomingDeadlines?: string;
  interestedApplications?: string;
  projectGoals?: string;
  conceptsNeedingRepetition?: string;
  conceptsWellRetained?: string;
  excitingTopics?: string;
  boringTopics?: string;
  deepDiveAreas?: string;
  careerGoals?: string;
  currentPace?: string;
  consistencyStreak?: number;
  lastMissionDate?: string;
  averageDailyLoad?: number;
  updatedAt?: string;
}

export interface KnowledgeChatMessage {
  id: number;
  userId: number;
  courseId: number;
  role: "user" | "assistant";
  content: string;
  extractedUpdates?: string;
  createdAt: string;
}

export interface KnowledgeChatResponse {
  userMessage: KnowledgeChatMessage;
  assistantMessage: KnowledgeChatMessage;
  profileUpdates: Record<string, unknown>;
}

export function useLearnerProfile(courseId: number | undefined) {
  return useQuery<LearnerProfile | null>({
    queryKey: ["/api/knowledge/profile", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const res = await fetch(getApiUrl(`/api/knowledge/profile/${courseId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch learner profile");
      return res.json();
    },
    enabled: !!courseId,
  });
}

export function useKnowledgeChatHistory(courseId: number | undefined) {
  return useQuery<KnowledgeChatMessage[]>({
    queryKey: ["/api/knowledge/chat", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const res = await fetch(getApiUrl(`/api/knowledge/chat/${courseId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chat history");
      return res.json();
    },
    enabled: !!courseId,
  });
}

export function useSendKnowledgeChat() {
  const queryClient = useQueryClient();

  return useMutation<KnowledgeChatResponse, Error, { courseId: number; message: string }>({
    mutationFn: async ({ courseId, message }) => {
      const res = await fetch(getApiUrl(`/api/knowledge/chat/${courseId}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/chat", variables.courseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/profile", variables.courseId] });
    },
  });
}

export function useUpdateLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation<LearnerProfile, Error, { courseId: number; updates: Partial<LearnerProfile> }>({
    mutationFn: async ({ courseId, updates }) => {
      const res = await fetch(getApiUrl(`/api/knowledge/profile/${courseId}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/profile", variables.courseId] });
    },
  });
}