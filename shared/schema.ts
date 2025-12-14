import { sql } from "drizzle-orm";
import { pgTable, text, varchar, date, serial, index, integer, boolean, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  hasCreatedFirstSchedule: boolean("has_created_first_schedule").default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  code: varchar("code", { length: 10 }).notNull(),
  name: text("name").notNull(),
  programOfStudy: text("program_of_study"),
  icon: text("icon").default("Zap"),
}, (table) => ({
  userIdIdx: index("courses_user_id_idx").on(table.userId),
}));

export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  courseCode: varchar("course_code", { length: 10 }).notNull(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  fileData: text("file_data"), // Base64 encoded file content for processing (temporary)
  stage: varchar("stage", { length: 30 }).default("uploaded"),
  stageProgress: integer("stage_progress").default(0),
  extractedText: text("extracted_text"),
  extractedChunks: integer("extracted_chunks").default(0),
  embeddedChunks: integer("embedded_chunks").default(0),
  concepts: text("concepts"),
  summary: text("summary"),
  error: text("error"),
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => ({
  courseCodeIdx: index("uploaded_files_course_code_idx").on(table.courseCode),
  stageIdx: index("uploaded_files_stage_idx").on(table.stage),
  userIdIdx: index("uploaded_files_user_id_idx").on(table.userId),
}));

export const courseContexts = pgTable("course_contexts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  courseCode: varchar("course_code", { length: 10 }).notNull(),
  concepts: text("concepts"), // JSON array of concepts
  summary: text("summary"),
  sourceFile: text("source_file"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userCourseIdx: index("course_contexts_user_course_idx").on(table.userId, table.courseCode),
}));

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  fileId: integer("file_id").notNull().references(() => uploadedFiles.id),
  courseCode: varchar("course_code", { length: 10 }).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  embedding: text("embedding").notNull(), // JSON array of numbers
  page: integer("page"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdIdx: index("document_chunks_user_id_idx").on(table.userId),
  fileIdIdx: index("document_chunks_file_id_idx").on(table.fileId),
  courseCodeIdx: index("document_chunks_course_code_idx").on(table.courseCode),
}));

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  author: text("author"),
  status: text("status").default("reading"), // reading, completed, paused
  notes: text("notes"),
  timeCategory: text("time_category").default("free_time"),
  currentPage: integer("current_page"),
  totalPages: integer("total_pages"),
  totalChapters: integer("total_chapters").default(1),
  currentChapter: integer("current_chapter").default(0),
  targetDate: date("target_date"), // optional finish-by date
  genre: text("genre"), // fiction, non-fiction, technical, self-help, etc.
  mood: text("mood"), // relaxing, intense, educational, inspiring - for schedule matching
  lastReadAt: text("last_read_at"), // for rotation prioritization
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => ({
  userIdIdx: index("books_user_id_idx").on(table.userId),
}));

export const readingLogs = pgTable("reading_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  bookId: integer("book_id").notNull().references(() => books.id),
  chaptersRead: integer("chapters_read").notNull().default(1),
  timeSpentMinutes: integer("time_spent_minutes"),
  feeling: text("feeling"), // great, good, okay, struggled
  comprehensionLevel: text("comprehension_level"), // fully_understood, mostly_got_it, confused, lost
  logDate: date("log_date").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  bookIdIdx: index("reading_logs_book_id_idx").on(table.bookId),
  userIdIdx: index("reading_logs_user_id_idx").on(table.userId),
  logDateIdx: index("reading_logs_log_date_idx").on(table.logDate),
}));

export const chapterCompletions = pgTable("chapter_completions", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id),
  chapterNumber: integer("chapter_number").notNull(),
  completedAt: date("completed_at").notNull(),
}, (table) => ({
  bookDateIdx: index("chapter_completions_book_date_idx").on(table.bookId, table.completedAt),
  dateIdx: index("chapter_completions_date_idx").on(table.completedAt),
}));

export const conceptTracking = pgTable("concept_tracking", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  courseId: integer("course_id").references(() => courses.id),
  conceptName: text("concept_name").notNull(),
  firstCoveredAt: text("first_covered_at").default(sql`CURRENT_TIMESTAMP`),
  lastCoveredAt: text("last_covered_at").default(sql`CURRENT_TIMESTAMP`),
  coverageCount: integer("coverage_count").default(1),
  masteryLevel: integer("mastery_level").default(1),
}, (table) => ({
  courseConceptIdx: index("concept_tracking_course_concept_idx").on(table.courseId, table.conceptName),
  userIdIdx: index("concept_tracking_user_id_idx").on(table.userId),
}));

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  courseId: integer("course_id").notNull().references(() => courses.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  proofRequirement: text("proof_requirement").notNull(),
  missionDate: date("mission_date").notNull(),
  status: text("status").default("pending"), // pending, proof_uploaded, completed, needs_revision
  completedAt: text("completed_at"),
  targetedConcepts: text("targeted_concepts"), // JSON array of concept names this mission covers
  estimatedDuration: integer("estimated_duration"), // in minutes
  difficulty: text("difficulty"), // easy, medium, hard
  energyLevel: text("energy_level"), // low, medium, high - based on time of day and user patterns
  materials: text("materials"), // JSON array of required materials
  source: text("source").default("auto"), // 'auto' for system-generated, 'manual' for user-generated
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  courseIdIdx: index("missions_course_id_idx").on(table.courseId),
  dateIdx: index("missions_date_idx").on(table.missionDate),
  userIdIdx: index("missions_user_id_idx").on(table.userId),
}));

export const proofs = pgTable("proofs", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").notNull().references(() => missions.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  fileData: text("file_data"), // Base64 encoded file content for database storage
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  missionIdIdx: index("proofs_mission_id_idx").on(table.missionId),
}));

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  missionId: integer("mission_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
}));

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  key: varchar("key", { length: 50 }).notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userKeyIdx: index("settings_user_key_idx").on(table.userId, table.key),
}));

export const academicCommitments = pgTable("academic_commitments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  type: text("type").notNull(),
  courseId: integer("course_id").references(() => courses.id),
  description: text("description"),
  venue: text("venue"),
  topic: text("topic"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  dayOfWeek: integer("day_of_week"),
  specificDate: date("specific_date"),
  isRecurring: boolean("is_recurring").default(false),
  priority: integer("priority").default(1),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  dayOfWeekIdx: index("commitments_day_of_week_idx").on(table.dayOfWeek),
  specificDateIdx: index("commitments_specific_date_idx").on(table.specificDate),
  typeIdx: index("commitments_type_idx").on(table.type),
  userIdIdx: index("commitments_user_id_idx").on(table.userId),
}));

export const dailySchedules = pgTable("daily_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  scheduleDate: date("schedule_date").notNull(),
  scheduleData: text("schedule_data").notNull(),
  generatedAt: text("generated_at").default(sql`CURRENT_TIMESTAMP`),
  aiReasoning: text("ai_reasoning"),
  source: text("source").default("manual"),
}, (table) => ({
  dateIdx: index("schedules_date_idx").on(table.scheduleDate),
  userDateIdx: index("schedules_user_date_idx").on(table.userId, table.scheduleDate),
}));

export const deadlines = pgTable("deadlines", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  type: text("type").notNull(),
  courseId: integer("course_id").references(() => courses.id),
  dueDate: date("due_date").notNull(),
  dueTime: text("due_time"),
  priority: integer("priority").default(2),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  courseDateIdx: index("deadlines_course_date_idx").on(table.courseId, table.dueDate),
  dateIdx: index("deadlines_date_idx").on(table.dueDate),
  userIdIdx: index("deadlines_user_id_idx").on(table.userId),
}));

export const dailyFeedback = pgTable("daily_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  feedbackDate: date("feedback_date").notNull(),
  completionRating: integer("completion_rating"),
  energyLevel: integer("energy_level"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  dateIdx: index("feedback_date_idx").on(table.feedbackDate),
  userDateIdx: index("feedback_user_date_idx").on(table.userId, table.feedbackDate),
}));

export const missionFeedback = pgTable("mission_feedback", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").notNull().references(() => missions.id),
  
  // User experience feedback (what AI can't see from proof)
  emotionalState: text("emotional_state"), // confused, frustrated, flow, bored
  actualTimeMinutes: integer("actual_time_minutes"),
  timeFeeling: text("time_feeling"), // faster, about_right, much_longer
  usedExternalHelp: boolean("used_external_help").default(false),
  helpDetails: text("help_details"), // what kind of help they used
  missionClarity: text("mission_clarity"), // unclear, somewhat_clear, crystal_clear
  learningType: text("learning_type"), // new, mixed, already_knew
  blockers: text("blockers"), // what slowed them down
  confidenceLevel: text("confidence_level"), // shaky, moderate, solid
  
  // Legacy fields (keeping for backward compatibility)
  difficulty: integer("difficulty"),
  timeAccuracy: integer("time_accuracy"),
  notes: text("notes"),
  
  // AI validation results
  aiApproved: boolean("ai_approved"),
  aiRejectionReason: text("ai_rejection_reason"),
  fullAiAnalysis: text("full_ai_analysis"),
  
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  missionIdIdx: index("mission_feedback_mission_id_idx").on(table.missionId),
}));

export const userPatterns = pgTable("user_patterns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  patternValue: text("pattern_value").notNull(),
  confidence: text("confidence").default("0.5"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userPatternIdx: index("user_patterns_user_pattern_idx").on(table.userId, table.patternType),
}));

export const scheduleBlockFeedback = pgTable("schedule_block_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  scheduleDate: date("schedule_date").notNull(),
  blockStartTime: text("block_start_time").notNull(),
  completed: boolean("completed").default(false),
  skipped: boolean("skipped").default(false),
  skipReason: text("skip_reason"),
  customSkipReason: text("custom_skip_reason"),
  energyLevel: integer("energy_level"),
  accuracy: text("accuracy"),
  difficulty: integer("difficulty"),
  actualTimeSpent: integer("actual_time_spent"),
  topicsCovered: text("topics_covered"),
  comments: text("comments"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  dateTimeIdx: index("block_feedback_date_time_idx").on(table.scheduleDate, table.blockStartTime),
  dateIdx: index("block_feedback_date_idx").on(table.scheduleDate),
  userIdIdx: index("block_feedback_user_id_idx").on(table.userId),
}));

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).unique(),
  wakeTime: text("wake_time").default("06:00"),
  sleepTime: text("sleep_time").default("22:00"),
  targetWorkHours: integer("target_work_hours").default(6),
  targetFreeHours: integer("target_free_hours").default(4),
  targetOtherHours: integer("target_other_hours").default(4),
  consecutiveStudyLimit: integer("consecutive_study_limit").default(90),
  personalGoals: text("personal_goals"),
  scheduleGenerationTime: text("schedule_generation_time").default("06:00"),
  eveningPromptTime: text("evening_prompt_time").default("18:00"),
  activityNotifications: boolean("activity_notifications").default(true),
  notificationSound: boolean("notification_sound").default(true),
  selectedSound: text("selected_sound").default("chime"),
  soundVolume: integer("sound_volume").default(70),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const activityLibrary = pgTable("activity_library", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  defaultDuration: integer("default_duration").default(30),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  preferredTime: text("preferred_time"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdIdx: index("activity_library_user_id_idx").on(table.userId),
}));

export const draftSchedules = pgTable("draft_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  scheduleDate: date("schedule_date").notNull(),
  scheduleData: text("schedule_data").notNull(),
  source: text("source").notNull(),
  chatPrompt: text("chat_prompt"),
  aiReasoning: text("ai_reasoning"),
  isFinalized: boolean("is_finalized").default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  dateIdx: index("draft_schedules_date_idx").on(table.scheduleDate),
  userIdIdx: index("draft_schedules_user_date_idx").on(table.userId),
}));

export const scheduleDriftEvents = pgTable("schedule_drift_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  scheduleDate: date("schedule_date").notNull(),
  blockStartTime: text("block_start_time").notNull(),
  blockTitle: text("block_title").notNull(),
  plannedDuration: integer("planned_duration").notNull(),
  actualDuration: integer("actual_duration").notNull(),
  driftMinutes: integer("drift_minutes").notNull(),
  cumulativeDrift: integer("cumulative_drift").notNull(),
  affectedBlocksCount: integer("affected_blocks_count").notNull(),
  userChoice: text("user_choice"),
  aiRescheduleSuggestion: text("ai_reschedule_suggestion"),
  resolved: boolean("resolved").default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: text("resolved_at"),
}, (table) => ({
  dateIdx: index("drift_events_date_idx").on(table.scheduleDate),
  unresolvedIdx: index("drift_events_unresolved_idx").on(table.scheduleDate, table.resolved),
  userIdIdx: index("drift_events_user_id_idx").on(table.userId),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertMissionSchema = createInsertSchema(missions).pick({
  userId: true,
  courseId: true,
  title: true,
  description: true,
  proofRequirement: true,
  missionDate: true,
  estimatedDuration: true,
  difficulty: true,
  energyLevel: true,
  materials: true,
  source: true,
});

export const insertProofSchema = createInsertSchema(proofs).pick({
  missionId: true,
  fileName: true,
  fileSize: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  type: true,
  title: true,
  message: true,
  missionId: true,
});

export const insertSettingSchema = createInsertSchema(settings).pick({
  userId: true,
  key: true,
  value: true,
});

export const insertAcademicCommitmentSchema = createInsertSchema(academicCommitments).omit({
  id: true,
  createdAt: true,
});

export const insertDailyScheduleSchema = createInsertSchema(dailySchedules).omit({
  id: true,
  generatedAt: true,
});

export const insertDeadlineSchema = createInsertSchema(deadlines).omit({
  id: true,
  createdAt: true,
});

export const insertDailyFeedbackSchema = createInsertSchema(dailyFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertUserPatternSchema = createInsertSchema(userPatterns).omit({
  id: true,
  updatedAt: true,
});

export const insertScheduleBlockFeedbackSchema = createInsertSchema(scheduleBlockFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
});

export const insertActivityLibrarySchema = createInsertSchema(activityLibrary).omit({
  id: true,
  createdAt: true,
});

export const insertDraftScheduleSchema = createInsertSchema(draftSchedules).omit({
  id: true,
  createdAt: true,
});

export const insertScheduleDriftEventSchema = createInsertSchema(scheduleDriftEvents).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export const insertBookSchema = createInsertSchema(books).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertChapterCompletionSchema = createInsertSchema(chapterCompletions).omit({
  id: true,
});

export const insertReadingLogSchema = createInsertSchema(readingLogs).omit({
  id: true,
  createdAt: true,
});

export const insertMissionFeedbackSchema = createInsertSchema(missionFeedback).omit({
  id: true,
  createdAt: true,
  aiApproved: true,
  aiRejectionReason: true,
  fullAiAnalysis: true,
});

export const insertConceptTrackingSchema = createInsertSchema(conceptTracking).omit({
  id: true,
  firstCoveredAt: true,
  lastCoveredAt: true,
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
  completedAt: true,
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true,
  createdAt: true,
});

// Learner profiles - extended data about user's learning state per course
export const learnerProfiles = pgTable("learner_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  courseId: integer("course_id").notNull().references(() => courses.id),
  
  // Understanding depth
  overallConfidence: integer("overall_confidence").default(50), // 0-100
  confusionPoints: text("confusion_points"), // JSON array of specific struggles
  prerequisiteGaps: text("prerequisite_gaps"), // JSON array of missing foundations
  
  // Learning preferences
  learningStyle: text("learning_style"), // visual, hands-on, theoretical, mixed
  preferredPracticeTypes: text("preferred_practice_types"), // JSON array: problems, projects, reading, simulations
  idealSessionLength: integer("ideal_session_length").default(45), // minutes
  bestStudyTimes: text("best_study_times"), // JSON array of time preferences
  
  // Progress context
  topicsCoveredInClass: text("topics_covered_in_class"), // JSON array
  topicsSelfStudied: text("topics_self_studied"), // JSON array
  upcomingDeadlines: text("upcoming_deadlines"), // JSON array with dates
  interestedApplications: text("interested_applications"), // JSON array of real-world interests
  projectGoals: text("project_goals"), // What they want to build
  
  // Retention patterns
  conceptsNeedingRepetition: text("concepts_needing_repetition"), // JSON array - fade quickly
  conceptsWellRetained: text("concepts_well_retained"), // JSON array - stick easily
  lastReviewDate: text("last_review_date"),
  
  // Motivation & engagement
  excitingTopics: text("exciting_topics"), // JSON array
  boringTopics: text("boring_topics"), // JSON array
  deepDiveAreas: text("deep_dive_areas"), // JSON array - want to go further
  careerGoals: text("career_goals"), // Text description
  
  // 20-mile calibration
  currentPace: text("current_pace").default("moderate"), // slow, moderate, fast
  consistencyStreak: integer("consistency_streak").default(0), // days of consistent work
  lastMissionDate: text("last_mission_date"),
  averageDailyLoad: integer("average_daily_load").default(2), // missions per day
  
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userCourseIdx: index("learner_profiles_user_course_idx").on(table.userId, table.courseId),
}));

// Knowledge chat history - conversations about learning progress
export const knowledgeChatHistory = pgTable("knowledge_chat_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  courseId: integer("course_id").notNull().references(() => courses.id),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  extractedUpdates: text("extracted_updates"), // JSON of profile updates extracted from this message
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userCourseIdx: index("knowledge_chat_user_course_idx").on(table.userId, table.courseId),
  createdAtIdx: index("knowledge_chat_created_at_idx").on(table.createdAt),
}));

export const insertLearnerProfileSchema = createInsertSchema(learnerProfiles).omit({
  id: true,
  updatedAt: true,
});

export const insertKnowledgeChatSchema = createInsertSchema(knowledgeChatHistory).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type Mission = typeof missions.$inferSelect;
export type InsertProof = z.infer<typeof insertProofSchema>;
export type Proof = typeof proofs.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type AcademicCommitment = typeof academicCommitments.$inferSelect;
export type InsertAcademicCommitment = z.infer<typeof insertAcademicCommitmentSchema>;
export type DailySchedule = typeof dailySchedules.$inferSelect;
export type InsertDailySchedule = z.infer<typeof insertDailyScheduleSchema>;
export type Deadline = typeof deadlines.$inferSelect;
export type InsertDeadline = z.infer<typeof insertDeadlineSchema>;
export type DailyFeedback = typeof dailyFeedback.$inferSelect;
export type InsertDailyFeedback = z.infer<typeof insertDailyFeedbackSchema>;
export type UserPattern = typeof userPatterns.$inferSelect;
export type InsertUserPattern = z.infer<typeof insertUserPatternSchema>;
export type ScheduleBlockFeedback = typeof scheduleBlockFeedback.$inferSelect;
export type InsertScheduleBlockFeedback = z.infer<typeof insertScheduleBlockFeedbackSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type ActivityLibraryItem = typeof activityLibrary.$inferSelect;
export type InsertActivityLibraryItem = z.infer<typeof insertActivityLibrarySchema>;
export type DraftSchedule = typeof draftSchedules.$inferSelect;
export type InsertDraftSchedule = z.infer<typeof insertDraftScheduleSchema>;
export type ScheduleDriftEvent = typeof scheduleDriftEvents.$inferSelect;
export type InsertScheduleDriftEvent = z.infer<typeof insertScheduleDriftEventSchema>;
export type Book = typeof books.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;
export type ChapterCompletion = typeof chapterCompletions.$inferSelect;
export type InsertChapterCompletion = z.infer<typeof insertChapterCompletionSchema>;
export type ReadingLog = typeof readingLogs.$inferSelect;
export type InsertReadingLog = z.infer<typeof insertReadingLogSchema>;
export type ConceptTracking = typeof conceptTracking.$inferSelect;
export type InsertConceptTracking = z.infer<typeof insertConceptTrackingSchema>;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type MissionFeedback = typeof missionFeedback.$inferSelect;
export type InsertMissionFeedback = z.infer<typeof insertMissionFeedbackSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type LearnerProfile = typeof learnerProfiles.$inferSelect;
export type InsertLearnerProfile = z.infer<typeof insertLearnerProfileSchema>;
export type KnowledgeChatMessage = typeof knowledgeChatHistory.$inferSelect;
export type InsertKnowledgeChatMessage = z.infer<typeof insertKnowledgeChatSchema>;

// Course Roadmaps - collaborative AI+human documents for course knowledge bases
export const courseRoadmaps = pgTable("course_roadmaps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  courseCode: varchar("course_code", { length: 10 }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  extractedContent: text("extracted_content"),
  sourceFiles: text("source_files"),
  status: varchar("status", { length: 20 }).default("draft"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  courseCodeIdx: index("course_roadmaps_course_code_idx").on(table.courseCode),
  userIdIdx: index("course_roadmaps_user_id_idx").on(table.userId),
}));

export const roadmapChatHistory = pgTable("roadmap_chat_history", {
  id: serial("id").primaryKey(),
  roadmapId: integer("roadmap_id").notNull().references(() => courseRoadmaps.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  roadmapIdIdx: index("roadmap_chat_roadmap_id_idx").on(table.roadmapId),
}));

export const insertCourseRoadmapSchema = createInsertSchema(courseRoadmaps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoadmapChatSchema = createInsertSchema(roadmapChatHistory).omit({
  id: true,
  createdAt: true,
});

export type CourseRoadmap = typeof courseRoadmaps.$inferSelect;
export type InsertCourseRoadmap = z.infer<typeof insertCourseRoadmapSchema>;
export type RoadmapChatMessage = typeof roadmapChatHistory.$inferSelect;
export type InsertRoadmapChatMessage = z.infer<typeof insertRoadmapChatSchema>;

// Planning Chat Sessions - conversational schedule building
export const planningChatSessions = pgTable("planning_chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  scheduleDate: date("schedule_date").notNull(),
  status: varchar("status", { length: 20 }).default("active"), // active, completed, abandoned
  currentScheduleData: text("current_schedule_data"), // JSON of schedule blocks being built
  aiReasoning: text("ai_reasoning"),
  importedTodoList: text("imported_todo_list"), // Extracted content from uploaded to-do file
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => ({
  userDateIdx: index("planning_sessions_user_date_idx").on(table.userId, table.scheduleDate),
  statusIdx: index("planning_sessions_status_idx").on(table.status),
}));

// Planning Chat Messages - individual messages in planning conversations
export const planningChatMessages = pgTable("planning_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => planningChatSessions.id),
  role: varchar("role", { length: 20 }).notNull(), // user, assistant, system
  content: text("content").notNull(),
  activityIndex: integer("activity_index"), // if message is about a specific activity
  scheduleSnapshot: text("schedule_snapshot"), // JSON of schedule state after this message
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index("planning_messages_session_idx").on(table.sessionId),
  activityIdx: index("planning_messages_activity_idx").on(table.activityIndex),
}));

// Planning Preferences - learned patterns about user's planning style
export const planningPreferences = pgTable("planning_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  preferredWakeTime: text("preferred_wake_time"),
  preferredSleepTime: text("preferred_sleep_time"),
  morningProductivity: text("morning_productivity"), // low, medium, high
  afternoonProductivity: text("afternoon_productivity"),
  eveningProductivity: text("evening_productivity"),
  preferredBreakDuration: integer("preferred_break_duration"), // minutes
  preferredWorkBlockDuration: integer("preferred_work_block_duration"), // minutes
  commonActivities: text("common_activities"), // JSON array of frequently used activities
  avoidActivities: text("avoid_activities"), // JSON array of activities to avoid
  planningStyle: text("planning_style"), // detailed, flexible, minimal
  energyPatterns: text("energy_patterns"), // JSON describing energy throughout day
  lessonsLearned: text("lessons_learned"), // JSON array of AI-extracted insights
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdx: index("planning_prefs_user_idx").on(table.userId),
}));

export const insertPlanningChatSessionSchema = createInsertSchema(planningChatSessions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertPlanningChatMessageSchema = createInsertSchema(planningChatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertPlanningPreferencesSchema = createInsertSchema(planningPreferences).omit({
  id: true,
  updatedAt: true,
});

export type PlanningChatSession = typeof planningChatSessions.$inferSelect;
export type InsertPlanningChatSession = z.infer<typeof insertPlanningChatSessionSchema>;
export type PlanningChatMessage = typeof planningChatMessages.$inferSelect;
export type InsertPlanningChatMessage = z.infer<typeof insertPlanningChatMessageSchema>;
export type PlanningPreferences = typeof planningPreferences.$inferSelect;
export type InsertPlanningPreferences = z.infer<typeof insertPlanningPreferencesSchema>;
