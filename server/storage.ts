import { type Mission, type InsertMission, type Proof, type InsertProof, type Course, type InsertCourse, type Notification, type InsertNotification, type Setting, type InsertSetting, type AcademicCommitment, type InsertAcademicCommitment, type DailySchedule, type InsertDailySchedule, type Deadline, type InsertDeadline, type DailyFeedback, type InsertDailyFeedback, type UserPattern, type InsertUserPattern, type ScheduleBlockFeedback, type InsertScheduleBlockFeedback, type UserPreferences, type InsertUserPreferences, type ActivityLibraryItem, type InsertActivityLibraryItem, type DraftSchedule, type InsertDraftSchedule, type ScheduleDriftEvent, type InsertScheduleDriftEvent, type Book, type InsertBook, type ConceptTracking, type InsertConceptTracking, type MissionFeedback, type InsertMissionFeedback, type UploadedFile, type InsertUploadedFile, type DocumentChunk, type InsertDocumentChunk, type LearnerProfile, type InsertLearnerProfile, type KnowledgeChatMessage, type InsertKnowledgeChatMessage, type ReadingLog, type InsertReadingLog, type PlanningChatSession, type InsertPlanningChatSession, type PlanningChatMessage, type InsertPlanningChatMessage, type PlanningPreferences, type InsertPlanningPreferences } from "@shared/schema";
import { db } from "./db";
import { users, missions, proofs, courses, notifications, settings, academicCommitments, dailySchedules, deadlines, dailyFeedback, userPatterns, scheduleBlockFeedback, userPreferences, activityLibrary, draftSchedules, scheduleDriftEvents, books, conceptTracking, missionFeedback, chapterCompletions, uploadedFiles, documentChunks, learnerProfiles, knowledgeChatHistory, readingLogs, planningChatSessions, planningChatMessages, planningPreferences, courseContexts } from "@shared/schema";
import { eq, desc, asc, and, gte, lte, sql, or, count, isNull } from "drizzle-orm";
import { generateSmartMissions } from "./llm/smartMissionGenerator";

const FORGE_KB_PATH = process.env.FORGE_KB_PATH || "./forge_kb";

export interface IStorage {
  getCourses(userId: number): Promise<Course[]>;
  seedCourses(): Promise<void>;
  getMissionsByDate(date: string, userId: number): Promise<(Mission & { courseName: string, courseCode: string, proofFile?: string })[]>;
  getMissionById(id: number): Promise<Mission | undefined>;
  createMission(mission: InsertMission): Promise<Mission>;
  updateMissionStatus(id: number, status: string): Promise<void>;
  deleteMission(id: number): Promise<void>;
  getProofsByMissionId(missionId: number): Promise<Proof[]>;
  createProof(proof: InsertProof): Promise<Proof>;
  generateDailyMissions(date: string, userId: number): Promise<(Mission & { courseName: string, courseCode: string })[]>;
  getArchiveData(startDate: string | undefined, endDate: string | undefined, userId: number): Promise<any[]>;
  generatePortfolio(startDate: string | undefined, endDate: string | undefined, userId: number): Promise<string>;
  getNotifications(limit: number | undefined, userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  getSetting(key: string, userId: number): Promise<Setting | undefined>;
  setSetting(key: string, value: string, userId: number): Promise<Setting>;
  getSettings(userId: number): Promise<Setting[]>;
  getCommitments(userId: number): Promise<AcademicCommitment[]>;
  getCommitmentsForDate(date: string, userId: number): Promise<AcademicCommitment[]>;
  createCommitment(commitment: InsertAcademicCommitment): Promise<AcademicCommitment>;
  updateCommitment(id: number, commitment: Partial<InsertAcademicCommitment>): Promise<AcademicCommitment | undefined>;
  deleteCommitment(id: number): Promise<void>;
  getScheduleForDate(date: string, userId: number): Promise<DailySchedule | undefined>;
  getSchedulesForDateRange(days: number, userId: number): Promise<DailySchedule[]>;
  saveSchedule(schedule: InsertDailySchedule): Promise<DailySchedule>;
  getDeadlines(userId: number): Promise<Deadline[]>;
  getDeadlinesInRange(startDate: string, endDate: string, userId: number): Promise<Deadline[]>;
  createDeadline(deadline: InsertDeadline): Promise<Deadline>;
  updateDeadline(id: number, deadline: Partial<InsertDeadline>): Promise<Deadline | undefined>;
  deleteDeadline(id: number): Promise<void>;
  getDailyFeedback(date: string, userId: number): Promise<DailyFeedback | undefined>;
  createDailyFeedback(feedback: InsertDailyFeedback): Promise<DailyFeedback>;
  updateDailyFeedback(date: string, feedback: Partial<InsertDailyFeedback>, userId: number): Promise<DailyFeedback | undefined>;
  getFeedbackInRange(startDate: string, endDate: string, userId: number): Promise<DailyFeedback[]>;
  getUserPattern(patternType: string, userId: number): Promise<UserPattern | undefined>;
  saveUserPattern(pattern: InsertUserPattern): Promise<UserPattern>;
  getAllUserPatterns(userId: number): Promise<UserPattern[]>;
  saveScheduleBlockFeedback(feedback: InsertScheduleBlockFeedback): Promise<ScheduleBlockFeedback>;
  getScheduleBlockFeedback(scheduleDate: string, blockStartTime: string, userId: number): Promise<ScheduleBlockFeedback | undefined>;
  getUserPreferences(userId: number): Promise<UserPreferences | undefined>;
  saveUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences>;
  getActivityLibrary(userId: number): Promise<ActivityLibraryItem[]>;
  getActiveActivities(userId: number): Promise<ActivityLibraryItem[]>;
  createActivity(activity: InsertActivityLibraryItem): Promise<ActivityLibraryItem>;
  updateActivity(id: number, activity: Partial<InsertActivityLibraryItem>): Promise<ActivityLibraryItem | undefined>;
  deleteActivity(id: number): Promise<void>;
  seedDefaultActivities(userId: number): Promise<void>;
  getDraftSchedule(date: string, userId: number): Promise<DraftSchedule | undefined>;
  saveDraftSchedule(draft: InsertDraftSchedule): Promise<DraftSchedule>;
  finalizeDraftSchedule(date: string, userId: number): Promise<DailySchedule | undefined>;
  getRecentSchedule(date: string, userId: number): Promise<DailySchedule | undefined>;
  getWeeklyTimetable(userId: number): Promise<AcademicCommitment[]>;
  createTimetableEntry(entry: InsertAcademicCommitment): Promise<AcademicCommitment>;
  updateTimetableEntry(id: number, entry: Partial<InsertAcademicCommitment>): Promise<AcademicCommitment | undefined>;
  deleteTimetableEntry(id: number): Promise<void>;
  createDriftEvent(event: InsertScheduleDriftEvent): Promise<ScheduleDriftEvent>;
  getUnresolvedDriftEvents(date: string, userId: number): Promise<ScheduleDriftEvent[]>;
  getDriftEventsForDate(date: string, userId: number): Promise<ScheduleDriftEvent[]>;
  storeAISuggestion(id: number, suggestion: string): Promise<ScheduleDriftEvent | undefined>;
  resolveDriftEvent(id: number, userChoice: string, resolvedSchedule?: string): Promise<ScheduleDriftEvent | undefined>;
  getAllBlockFeedbackForDate(date: string, userId: number): Promise<ScheduleBlockFeedback[]>;
  getBooks(userId: number): Promise<Book[]>;
  getBookById(id: number): Promise<Book | undefined>;
  createBook(book: InsertBook): Promise<Book>;
  updateBook(id: number, book: Partial<InsertBook>): Promise<Book | undefined>;
  deleteBook(id: number): Promise<void>;
  recordChapterCompletion(bookId: number, chapterNumber: number): Promise<{ book: Book; completion: any }>;
  getChapterCompletionsForBook(bookId: number): Promise<any[]>;
  getUploadedFiles(courseCode: string, userId: number): Promise<UploadedFile[]>;
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  updateUploadedFile(id: number, file: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined>;
  deleteUploadedFile(id: number): Promise<void>;
  getReadingStats(userId: number): Promise<{
    booksCompletedMonth: number;
    booksCompletedYear: number;
    streakDays: number;
    paceChaptersPerWeek: number;
    last7Days: { date: string; hasReading: boolean; count: number }[];
  }>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: number, course: Partial<InsertCourse>): Promise<Course | undefined>;
  deleteCourse(id: number): Promise<void>;
  recordConceptCoverage(courseId: number, conceptName: string, userId: number): Promise<ConceptTracking>;
  getConceptsForCourse(courseId: number, userId: number): Promise<ConceptTracking[]>;
  getAllConceptTracking(userId: number): Promise<ConceptTracking[]>;
  getScheduleFeedbackStats(userId: number): Promise<{
    totalBlocks: number;
    completedBlocks: number;
    skippedBlocks: number;
    avgEnergyLevel: number;
    avgDifficulty: number;
    skipReasons: Record<string, number>;
  }>;
  getTimePerCourse(userId: number): Promise<{ courseId: number; courseName: string; totalMinutes: number }[]>;
  getProductivityByHour(userId: number): Promise<{ hour: number; completionRate: number; avgEnergy: number }[]>;

  // Learner Profile & Knowledge Chat
  getLearnerProfile(userId: number, courseId: number): Promise<LearnerProfile | undefined>;
  upsertLearnerProfile(profile: InsertLearnerProfile): Promise<LearnerProfile>;
  getChatHistory(userId: number, courseId: number, limit?: number): Promise<KnowledgeChatMessage[]>;
  addChatMessage(message: InsertKnowledgeChatMessage): Promise<KnowledgeChatMessage>;

  // Mission Feedback Patterns
  getRecentMissionFeedback(userId: number, limit?: number): Promise<MissionFeedback[]>;

  // Weekly Course Coverage Tracking
  getWeeklyCoursesCovered(userId: number, weekStartDate: string): Promise<{ courseId: number; courseCode: string; courseName: string; missionCount: number }[]>;
  getCoursesNeedingAttention(userId: number, weekStartDate: string): Promise<{ courseId: number; courseCode: string; courseName: string; daysSinceLastMission: number | null }[]>;

  // Reading Log Methods
  createReadingLog(log: InsertReadingLog): Promise<ReadingLog>;
  getReadingLogsForBook(bookId: number): Promise<ReadingLog[]>;
  getReadingLogsForUser(userId: number, limit?: number): Promise<ReadingLog[]>;
  countIncompleteAutoMissions(date: string, userId: number): Promise<number>;

  // Planning Chat Methods
  createPlanningSession(session: InsertPlanningChatSession): Promise<PlanningChatSession>;
  getPlanningSession(userId: number, date: string): Promise<PlanningChatSession | undefined>;
  getPlanningSessionById(sessionId: number): Promise<PlanningChatSession | undefined>;
  updatePlanningSession(sessionId: number, updates: Partial<PlanningChatSession>): Promise<PlanningChatSession | undefined>;
  getRecentPlanningSessions(userId: number, limit?: number): Promise<PlanningChatSession[]>;
  addPlanningMessage(message: InsertPlanningChatMessage): Promise<PlanningChatMessage>;
  getPlanningMessages(sessionId: number): Promise<PlanningChatMessage[]>;
  clearPlanningMessages(sessionId: number): Promise<void>;
  getPlanningPreferences(userId: number): Promise<PlanningPreferences | undefined>;
  upsertPlanningPreferences(prefs: InsertPlanningPreferences): Promise<PlanningPreferences>;
}

export class DrizzleStorage implements IStorage {
  async getCourses(userId: number): Promise<Course[]> {
    return await db.select().from(courses).where(eq(courses.userId, userId));
  }

  async seedCourses(): Promise<void> {
    // This is a no-op for DrizzleStorage as courses are managed by the user
    // The interface requires this method for compatibility
  }

  async getMissionsByDate(date: string, userId: number): Promise<(Mission & { courseName: string, courseCode: string, proofFile?: string })[]> {
    const result = await db
      .select({
        mission: missions,
        courseName: courses.name,
        courseCode: courses.code,
      })
      .from(missions)
      .leftJoin(courses, eq(missions.courseId, courses.id))
      .where(and(sql`DATE(${missions.missionDate}) = DATE(${date})`, eq(missions.userId, userId)));

    const missionsWithProofs = await Promise.all(
      result.map(async (r: any) => {
        const missionProofs = await this.getProofsByMissionId(r.mission.id);
        const latestProof = missionProofs[missionProofs.length - 1];
        return {
          ...r.mission,
          courseName: r.courseName || "",
          courseCode: r.courseCode || "",
          proofFile: latestProof?.fileName,
          status: latestProof ? "complete" : (r.mission.status || "pending"),
        };
      })
    );

    return missionsWithProofs;
  }

  async getMissionById(id: number): Promise<Mission | undefined> {
    const result = await db.select().from(missions).where(eq(missions.id, id));
    return result[0];
  }

  async createMission(data: InsertMission): Promise<Mission> {
    // Ensure userId is set from courseId if not provided
    if (!data.userId && data.courseId) {
      const [course] = await db.select().from(courses).where(eq(courses.id, data.courseId)).limit(1);
      if (course?.userId) {
        data.userId = course.userId;
      }
    }

    const [mission] = await db.insert(missions).values(data).returning();
    return mission;
  }

  async updateMissionStatus(id: number, status: string): Promise<void> {
    await db.update(missions).set({ status }).where(eq(missions.id, id));
  }

  async deleteMission(id: number): Promise<void> {
    await db.delete(missionFeedback).where(eq(missionFeedback.missionId, id));
    await db.delete(proofs).where(eq(proofs.missionId, id));
    await db.delete(missions).where(eq(missions.id, id));
  }

  async getProofsByMissionId(missionId: number): Promise<Proof[]> {
    return await db.select().from(proofs).where(eq(proofs.missionId, missionId));
  }

  async createProof(proof: InsertProof): Promise<Proof> {
    const result = await db.insert(proofs).values(proof).returning();
    return result[0];
  }

  async deleteLatestProof(missionId: number): Promise<void> {
    const allProofs = await this.getProofsByMissionId(missionId);
    if (allProofs.length > 0) {
      const latestProof = allProofs[allProofs.length - 1];
      await db.delete(proofs).where(eq(proofs.id, latestProof.id));
      await this.updateMissionStatus(missionId, "pending");
    }
  }

  async generateDailyMissions(date: string, userId: number): Promise<(Mission & { courseName: string, courseCode: string })[]> {
    try {
      const result = await generateSmartMissions({
        userId,
        date,
        maxMissions: 5,
      });

      console.log(`[generateDailyMissions] Smart generation complete:`);
      console.log(`  - Workload intensity: ${result.analysis.workload.workloadIntensity}`);
      console.log(`  - Available time: ${result.analysis.workload.totalAvailableMinutes} minutes`);
      console.log(`  - Missions generated: ${result.analysis.totalMissionsGenerated}`);
      console.log(`  - Courses selected: ${result.analysis.coursesSelected.map(c => c.course.code).join(", ")}`);

      return result.missions;
    } catch (error) {
      console.error("[generateDailyMissions] Smart mission generation failed:", error);
      return [];
    }
  }

  async getArchiveData(startDate: string | undefined, endDate: string | undefined, userId: number): Promise<any[]> {
    const results = await db
      .select({
        mission: missions,
        course: courses,
      })
      .from(missions)
      .leftJoin(courses, eq(missions.courseId, courses.id))
      .where(eq(missions.userId, userId))
      .orderBy(desc(missions.missionDate));

    const archiveData = await Promise.all(
      results.map(async (r: any) => {
        const missionProofs = await db
          .select()
          .from(proofs)
          .where(eq(proofs.missionId, r.mission.id));

        return {
          id: r.mission.id,
          courseId: r.mission.courseId,
          title: r.mission.title,
          description: r.mission.description,
          proofRequirement: r.mission.proofRequirement,
          missionDate: r.mission.missionDate,
          status: missionProofs.length > 0 ? "complete" : (r.mission.status || "pending"),
          createdAt: r.mission.createdAt,
          courseName: r.course?.name || "",
          courseCode: r.course?.code || "",
          proofs: missionProofs.map((p: any) => ({
            id: p.id,
            fileName: p.fileName,
            fileSize: p.fileSize,
            uploadedAt: p.uploadedAt,
          })),
        };
      })
    );

    return archiveData;
  }

  async generatePortfolio(startDate: string | undefined, endDate: string | undefined, userId: number): Promise<string> {
    const archiveData = await this.getArchiveData(startDate, endDate, userId);
    const completedMissions = archiveData.filter(m => m.status === "complete");

    let markdown = `# FORGE Engineering Portfolio\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**Total Completed Missions:** ${completedMissions.length}\n\n`;
    markdown += `---\n\n`;

    const groupedByCourse: Record<string, any[]> = {};
    completedMissions.forEach(mission => {
      if (!groupedByCourse[mission.courseName]) {
        groupedByCourse[mission.courseName] = [];
      }
      groupedByCourse[mission.courseName].push(mission);
    });

    for (const [courseName, courseMissions] of Object.entries(groupedByCourse)) {
      markdown += `## ${courseName}\n\n`;

      for (const mission of courseMissions) {
        markdown += `### ${mission.missionDate}: ${mission.title}\n`;
        markdown += `- **Description:** ${mission.description}\n`;
        markdown += `- **Proof Requirement:** ${mission.proofRequirement}\n`;

        if (mission.proofs && mission.proofs.length > 0) {
          markdown += `- **Submitted Proofs:**\n`;
          mission.proofs.forEach((proof: Proof) => {
            markdown += `  - ${proof.fileName} (${new Date(proof.uploadedAt || "").toLocaleString()})\n`;
          });
        }
        markdown += `\n`;
      }
    }

    markdown += `---\n`;
    markdown += `*Portfolio generated by FORGE - Personal Engineering Advisor*\n`;

    return markdown;
  }

  async getNotifications(limit: number = 10, userId: number): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(notification).returning();
    return result[0];
  }

  async getSetting(key: string, userId: number): Promise<Setting | undefined> {
    const result = await db.select().from(settings).where(and(eq(settings.key, key), eq(settings.userId, userId)));
    return result[0];
  }

  async setSetting(key: string, value: string, userId: number): Promise<Setting> {
    const existing = await this.getSetting(key, userId);
    if (existing) {
      const [updatedSetting] = await db.update(settings).set({ value }).where(eq(settings.id, existing.id)).returning();
      return updatedSetting;
    }
    const result = await db.insert(settings).values({ key, value, userId }).returning();
    return result[0];
  }

  async getSettings(userId: number): Promise<Setting[]> {
    return await db.select().from(settings).where(eq(settings.userId, userId));
  }

  async getCommitments(userId: number): Promise<AcademicCommitment[]> {
    return await db.select().from(academicCommitments).where(eq(academicCommitments.userId, userId)).orderBy(academicCommitments.startTime);
  }

  async getCommitmentsForDate(date: string, userId: number): Promise<AcademicCommitment[]> {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();

    const results = await db.select().from(academicCommitments).where(
      and(
        eq(academicCommitments.userId, userId),
        or(
          and(
            eq(academicCommitments.isRecurring, true),
            eq(academicCommitments.dayOfWeek, dayOfWeek)
          ),
          eq(academicCommitments.specificDate, date)
        )
      )
    ).orderBy(academicCommitments.startTime);
    return results;
  }

  async createCommitment(commitment: InsertAcademicCommitment): Promise<AcademicCommitment> {
    const result = await db.insert(academicCommitments).values(commitment).returning();
    return result[0];
  }

  async updateCommitment(id: number, commitment: Partial<InsertAcademicCommitment>): Promise<AcademicCommitment | undefined> {
    const result = await db.update(academicCommitments).set(commitment).where(eq(academicCommitments.id, id)).returning();
    return result[0];
  }

  async deleteCommitment(id: number): Promise<void> {
    await db.delete(academicCommitments).where(eq(academicCommitments.id, id));
  }

  async getScheduleForDate(date: string, userId: number): Promise<DailySchedule | undefined> {
    const result = await db.select().from(dailySchedules).where(and(eq(dailySchedules.scheduleDate, date), eq(dailySchedules.userId, userId)));
    return result[0];
  }

  async getSchedulesForDateRange(days: number, userId: number): Promise<DailySchedule[]> {

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const schedules = await db
      .select()
      .from(dailySchedules)
      .where(
        and(
          gte(dailySchedules.scheduleDate, startDateStr),
          lte(dailySchedules.scheduleDate, today),
          eq(dailySchedules.userId, userId)
        )
      )
      .orderBy(dailySchedules.scheduleDate);

    return schedules.map(s => ({
      ...s,
      timeBlocks: JSON.parse(s.scheduleData),
    }));
  }

  async getAllScheduleDates(userId: number): Promise<string[]> {
    const schedules = await db
      .select({ scheduleDate: dailySchedules.scheduleDate })
      .from(dailySchedules)
      .where(eq(dailySchedules.userId, userId))
      .orderBy(desc(dailySchedules.scheduleDate));

    return schedules.map(s => s.scheduleDate);
  }

  async saveSchedule(data: {
    scheduleDate: string;
    scheduleData: string;
    aiReasoning?: string;
    source?: string;
    userId?: number;
  }): Promise<DailySchedule> {
    if (!data.userId) {
      throw new Error("userId is required to save schedule");
    }

    // Check if a schedule exists for this user and date
    const existing = await db
      .select()
      .from(dailySchedules)
      .where(and(eq(dailySchedules.scheduleDate, data.scheduleDate), eq(dailySchedules.userId, data.userId)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing schedule
      const [result] = await db
        .update(dailySchedules)
        .set({
          scheduleData: data.scheduleData,
          aiReasoning: data.aiReasoning || null,
          source: data.source || "manual",
          generatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(dailySchedules.scheduleDate, data.scheduleDate), eq(dailySchedules.userId, data.userId)))
        .returning();
      return result;
    } else {
      // Insert new schedule
      const [result] = await db
        .insert(dailySchedules)
        .values({
          scheduleDate: data.scheduleDate,
          scheduleData: data.scheduleData,
          aiReasoning: data.aiReasoning || null,
          source: data.source || "manual",
          userId: data.userId,
        })
        .returning();
      return result;
    }
  }

  async getDeadlines(userId: number): Promise<Deadline[]> {
    return await db.select().from(deadlines).where(eq(deadlines.userId, userId)).orderBy(deadlines.dueDate);
  }

  async getDeadlinesInRange(startDate: string, endDate: string, userId: number): Promise<Deadline[]> {
    return await db.select().from(deadlines)
      .where(and(gte(deadlines.dueDate, startDate), lte(deadlines.dueDate, endDate), eq(deadlines.userId, userId)))
      .orderBy(deadlines.dueDate);
  }

  async createDeadline(deadline: InsertDeadline): Promise<Deadline> {
    const result = await db.insert(deadlines).values(deadline).returning();
    return result[0];
  }

  async updateDeadline(id: number, deadline: Partial<InsertDeadline>): Promise<Deadline | undefined> {
    const result = await db.update(deadlines).set(deadline).where(eq(deadlines.id, id)).returning();
    return result[0];
  }

  async deleteDeadline(id: number): Promise<void> {
    await db.delete(deadlines).where(eq(deadlines.id, id));
  }

  async getDailyFeedback(date: string, userId: number): Promise<DailyFeedback | undefined> {
    const result = await db.select().from(dailyFeedback).where(and(eq(dailyFeedback.feedbackDate, date), eq(dailyFeedback.userId, userId)));
    return result[0];
  }

  async createDailyFeedback(feedback: InsertDailyFeedback): Promise<DailyFeedback> {
    const result = await db.insert(dailyFeedback).values(feedback).returning();
    return result[0];
  }

  async updateDailyFeedback(date: string, feedback: Partial<InsertDailyFeedback>, userId: number): Promise<DailyFeedback | undefined> {
    const result = await db.update(dailyFeedback).set(feedback).where(and(eq(dailyFeedback.feedbackDate, date), eq(dailyFeedback.userId, userId))).returning();
    return result[0];
  }

  async getFeedbackInRange(startDate: string, endDate: string, userId: number): Promise<DailyFeedback[]> {
    return await db.select().from(dailyFeedback)
      .where(and(gte(dailyFeedback.feedbackDate, startDate), lte(dailyFeedback.feedbackDate, endDate), eq(dailyFeedback.userId, userId)))
      .orderBy(dailyFeedback.feedbackDate);
  }

  async getUserPattern(patternType: string, userId: number): Promise<UserPattern | undefined> {
    const result = await db.select().from(userPatterns).where(and(eq(userPatterns.patternType, patternType), eq(userPatterns.userId, userId)));
    return result[0];
  }

  async saveUserPattern(pattern: InsertUserPattern): Promise<UserPattern> {
    if (!pattern.userId) {
      throw new Error("userId is required to save user pattern");
    }
    const existing = await this.getUserPattern(pattern.patternType, pattern.userId);
    if (existing) {
      const updated = await db.update(userPatterns)
        .set({ patternValue: pattern.patternValue, confidence: pattern.confidence, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(and(eq(userPatterns.patternType, pattern.patternType), eq(userPatterns.userId, pattern.userId)))
        .returning();
      return updated[0];
    }
    const result = await db.insert(userPatterns).values(pattern).returning();
    return result[0];
  }

  async getAllUserPatterns(userId: number): Promise<UserPattern[]> {
    return await db.select().from(userPatterns).where(eq(userPatterns.userId, userId));
  }

  async saveScheduleBlockFeedback(feedback: InsertScheduleBlockFeedback): Promise<ScheduleBlockFeedback> {
    if (!feedback.userId) throw new Error("userId is required");
    const existing = await this.getScheduleBlockFeedback(feedback.scheduleDate, feedback.blockStartTime, feedback.userId);
    if (existing) {
      const result = await db.update(scheduleBlockFeedback)
        .set({ ...feedback, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(and(eq(scheduleBlockFeedback.scheduleDate, feedback.scheduleDate), eq(scheduleBlockFeedback.blockStartTime, feedback.blockStartTime), eq(scheduleBlockFeedback.userId, feedback.userId)))
        .returning();
      return result[0];
    }
    const result = await db.insert(scheduleBlockFeedback).values(feedback).returning();
    return result[0];
  }

  async getScheduleBlockFeedback(scheduleDate: string, blockStartTime: string, userId: number): Promise<ScheduleBlockFeedback | undefined> {
    const result = await db.select().from(scheduleBlockFeedback).where(and(eq(scheduleBlockFeedback.scheduleDate, scheduleDate), eq(scheduleBlockFeedback.blockStartTime, blockStartTime), eq(scheduleBlockFeedback.userId, userId)));
    return result[0];
  }

  // DPM: User Preferences
  async getUserPreferences(userId: number): Promise<UserPreferences | undefined> {
    const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    return result[0];
  }

  async saveUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences> {
    if (!prefs.userId) throw new Error("userId is required");
    const existing = await this.getUserPreferences(prefs.userId);
    if (existing) {
      const updated = await db.update(userPreferences)
        .set({ ...prefs, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(userPreferences.id, existing.id))
        .returning();
      return updated[0];
    }
    const result = await db.insert(userPreferences).values(prefs).returning();
    return result[0];
  }

  async getActivityLibrary(userId: number): Promise<ActivityLibraryItem[]> {
    return await db.select().from(activityLibrary)
      .where(eq(activityLibrary.userId, userId))
      .orderBy(desc(activityLibrary.lastUsedAt), desc(activityLibrary.usageCount), activityLibrary.category, activityLibrary.name);
  }

  async getActiveActivities(userId: number): Promise<ActivityLibraryItem[]> {
    return await db.select().from(activityLibrary)
      .where(and(eq(activityLibrary.isActive, true), eq(activityLibrary.userId, userId)))
      .orderBy(desc(activityLibrary.lastUsedAt), desc(activityLibrary.usageCount), activityLibrary.category, activityLibrary.name);
  }

  async incrementActivityUsage(id: number): Promise<void> {
    await db.update(activityLibrary).set({ usageCount: sql`${activityLibrary.usageCount} + 1`, lastUsedAt: sql`CURRENT_TIMESTAMP` }).where(eq(activityLibrary.id, id));
  }

  async createActivity(activity: InsertActivityLibraryItem): Promise<ActivityLibraryItem> {
    const result = await db.insert(activityLibrary).values(activity).returning();
    return result[0];
  }

  async updateActivity(id: number, activity: Partial<InsertActivityLibraryItem>): Promise<ActivityLibraryItem | undefined> {
    const result = await db.update(activityLibrary).set(activity).where(eq(activityLibrary.id, id)).returning();
    return result[0];
  }

  async deleteActivity(id: number): Promise<void> {
    await db.delete(activityLibrary).where(eq(activityLibrary.id, id));
  }

  async seedDefaultActivities(userId: number): Promise<void> {
    // Check if this user already has activities that are marked as default
    const existingDefault = await db.select().from(activityLibrary)
      .where(and(eq(activityLibrary.userId, userId), eq(activityLibrary.isDefault, true)));
    if (existingDefault.length > 0) return;

    // Fetch all default activities (where userId is null)
    const defaultActivities = await db.select().from(activityLibrary).where(isNull(activityLibrary.userId));

    for (const activity of defaultActivities) {
      // Create a copy for the user, setting userId and isDefault to true
      const { id, ...activityWithoutId } = activity;
      await this.createActivity({
        ...activityWithoutId,
        userId: userId,
        isDefault: true, // Mark this as a user-specific default
      });
    }
  }

  // DPM: Draft Schedules
  async getDraftSchedule(date: string, userId: number): Promise<DraftSchedule | undefined> {
    const result = await db.select().from(draftSchedules)
      .where(and(eq(draftSchedules.scheduleDate, date), eq(draftSchedules.isFinalized, false), eq(draftSchedules.userId, userId)))
      .orderBy(desc(draftSchedules.createdAt));
    return result[0];
  }

  async getFinalizedSchedule(date: string, userId: number): Promise<DraftSchedule | undefined> {
    const result = await db.select().from(draftSchedules)
      .where(and(eq(draftSchedules.scheduleDate, date), eq(draftSchedules.isFinalized, true), eq(draftSchedules.userId, userId)))
      .orderBy(desc(draftSchedules.createdAt));
    return result[0];
  }

  async saveDraftSchedule(draft: InsertDraftSchedule): Promise<DraftSchedule> {
    const result = await db.insert(draftSchedules).values(draft).returning();
    return result[0];
  }

  async finalizeDraftSchedule(date: string, userId: number): Promise<DailySchedule | undefined> {
    const draft = await this.getDraftSchedule(date, userId);
    if (!draft) return undefined;

    // Mark draft as finalized
    await db.update(draftSchedules)
      .set({ isFinalized: true })
      .where(eq(draftSchedules.id, draft.id));

    // Save as active schedule
    const schedule = await this.saveSchedule({
      scheduleDate: date,
      scheduleData: draft.scheduleData,
      aiReasoning: draft.aiReasoning || undefined,
      userId: userId,
    });

    return schedule;
  }

  async getRecentSchedule(date: string, userId: number): Promise<DailySchedule | undefined> {
    // Get the most recent schedule before the given date
    const result = await db.select().from(dailySchedules)
      .where(and(lte(dailySchedules.scheduleDate, date), eq(dailySchedules.userId, userId)))
      .orderBy(desc(dailySchedules.scheduleDate))
      .limit(1);
    return result[0];
  }

  // Weekly timetable methods
  async getWeeklyTimetable(userId: number): Promise<AcademicCommitment[]> {
    return await db.select().from(academicCommitments)
      .where(and(eq(academicCommitments.isRecurring, true), eq(academicCommitments.userId, userId)))
      .orderBy(academicCommitments.dayOfWeek, academicCommitments.startTime);
  }

  async createTimetableEntry(entry: InsertAcademicCommitment): Promise<AcademicCommitment> {
    const result = await db.insert(academicCommitments).values(entry).returning();
    return result[0];
  }

  async updateTimetableEntry(id: number, entry: Partial<InsertAcademicCommitment>): Promise<AcademicCommitment | undefined> {
    const result = await db.update(academicCommitments).set(entry).where(eq(academicCommitments.id, id)).returning();
    return result[0];
  }

  async deleteTimetableEntry(id: number): Promise<void> {
    await db.delete(academicCommitments).where(eq(academicCommitments.id, id));
  }

  // Schedule Drift Events
  async createDriftEvent(event: InsertScheduleDriftEvent): Promise<ScheduleDriftEvent> {
    const result = await db.insert(scheduleDriftEvents).values(event).returning();
    return result[0];
  }

  async getUnresolvedDriftEvents(date: string, userId: number): Promise<ScheduleDriftEvent[]> {
    return await db.select().from(scheduleDriftEvents)
      .where(and(eq(scheduleDriftEvents.scheduleDate, date), eq(scheduleDriftEvents.resolved, false), eq(scheduleDriftEvents.userId, userId)))
      .orderBy(scheduleDriftEvents.createdAt);
  }

  async getDriftEventsForDate(date: string, userId: number): Promise<ScheduleDriftEvent[]> {
    return await db.select().from(scheduleDriftEvents)
      .where(and(eq(scheduleDriftEvents.scheduleDate, date), eq(scheduleDriftEvents.userId, userId)))
      .orderBy(scheduleDriftEvents.createdAt);
  }

  async storeAISuggestion(id: number, suggestion: string): Promise<ScheduleDriftEvent | undefined> {
    const result = await db.update(scheduleDriftEvents)
      .set({
        aiRescheduleSuggestion: suggestion,
      })
      .where(eq(scheduleDriftEvents.id, id))
      .returning();
    return result[0];
  }

  async resolveDriftEvent(id: number, userChoice: string, resolvedSchedule?: string): Promise<ScheduleDriftEvent | undefined> {
    const result = await db.update(scheduleDriftEvents)
      .set({
        userChoice,
        resolved: true,
        resolvedAt: sql`CURRENT_TIMESTAMP`,
        aiRescheduleSuggestion: resolvedSchedule || undefined, // Use resolvedSchedule if provided, otherwise undefined
      })
      .where(eq(scheduleDriftEvents.id, id))
      .returning();
    return result[0];
  }

  async getAllBlockFeedbackForDate(date: string, userId: number): Promise<ScheduleBlockFeedback[]> {
    return await db.select().from(scheduleBlockFeedback)
      .where(and(eq(scheduleBlockFeedback.scheduleDate, date), eq(scheduleBlockFeedback.userId, userId)))
      .orderBy(scheduleBlockFeedback.blockStartTime);
  }

  // Books methods
  async getBooks(userId: number): Promise<Book[]> {
    return await db.select().from(books).where(eq(books.userId, userId)).orderBy(desc(books.createdAt));
  }

  async getBookById(id: number): Promise<Book | undefined> {
    const result = await db.select().from(books).where(eq(books.id, id));
    return result[0];
  }

  async createBook(book: InsertBook): Promise<Book> {
    const result = await db.insert(books).values(book).returning();
    return result[0];
  }

  async updateBook(id: number, book: Partial<InsertBook>): Promise<Book | undefined> {
    const updateData: any = { ...book };
    if (book.status === 'completed') {
      updateData.completedAt = sql`CURRENT_TIMESTAMP`;
    }
    const result = await db.update(books).set(updateData).where(eq(books.id, id)).returning();
    return result[0];
  }

  async deleteBook(id: number): Promise<void> {
    await db.delete(chapterCompletions).where(eq(chapterCompletions.bookId, id));
    await db.delete(books).where(eq(books.id, id));
  }

  async recordChapterCompletion(bookId: number, chapterNumber: number): Promise<{ book: Book; completion: any }> {
    const today = new Date().toISOString().split('T')[0];

    const completion = await db.insert(chapterCompletions).values({
      bookId,
      chapterNumber,
      completedAt: today,
    }).returning();

    const book = await this.getBookById(bookId);
    if (book) {
      const newChapter = Math.max(book.currentChapter || 0, chapterNumber);
      const updateData: any = { currentChapter: newChapter };

      if (book.totalChapters && newChapter >= book.totalChapters) {
        updateData.status = 'completed';
        updateData.completedAt = sql`CURRENT_TIMESTAMP`;
      }

      await db.update(books).set(updateData).where(eq(books.id, bookId));
    }

    const updatedBook = await this.getBookById(bookId);
    return { book: updatedBook!, completion: completion[0] };
  }

  async getChapterCompletionsForBook(bookId: number): Promise<any[]> {
    return await db.select().from(chapterCompletions)
      .where(eq(chapterCompletions.bookId, bookId))
      .orderBy(desc(chapterCompletions.completedAt));
  }

  async getUploadedFiles(courseCode: string, userId: number): Promise<UploadedFile[]> {
    return await db.select().from(uploadedFiles).where(and(eq(uploadedFiles.courseCode, courseCode), eq(uploadedFiles.userId, userId))).orderBy(desc(uploadedFiles.uploadedAt));
  }

  async createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const result = await db.insert(uploadedFiles).values(file).returning();
    return result[0];
  }

  async updateUploadedFile(id: number, file: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined> {
    const result = await db.update(uploadedFiles).set(file).where(eq(uploadedFiles.id, id)).returning();
    return result[0];
  }

  async deleteUploadedFile(id: number): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  async getReadingStats(userId: number): Promise<{
    booksCompletedMonth: number;
    booksCompletedYear: number;
    streakDays: number;
    paceChaptersPerWeek: number;
    last7Days: { date: string; hasReading: boolean; count: number }[];
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const allBooks = await db.select().from(books).where(eq(books.userId, userId));

    const booksCompletedMonth = allBooks.filter(b => 
      b.status === 'completed' && b.completedAt && b.completedAt >= startOfMonth
    ).length;
    const booksCompletedYear = allBooks.filter(b => 
      b.status === 'completed' && b.completedAt && b.completedAt >= startOfYear
    ).length;

    const allCompletions = await db.select().from(chapterCompletions)
      .innerJoin(books, eq(chapterCompletions.bookId, books.id))
      .where(eq(books.userId, userId))
      .orderBy(desc(chapterCompletions.completedAt));

    const last7Days: { date: string; hasReading: boolean; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCompletions = allCompletions.filter(c => (c.chapter_completions as any).completedAt === dateStr);
      last7Days.push({
        date: dateStr,
        hasReading: dayCompletions.length > 0,
        count: dayCompletions.length,
      });
    }

    let streakDays = 0;
    let startedCounting = false;
    for (let i = 0; i < 365; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const hasReading = allCompletions.some(c => (c.chapter_completions as any).completedAt === dateStr);
      if (hasReading) {
        streakDays++;
        startedCounting = true;
      } else if (startedCounting) {
        break;
      }
    }

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
    const recentCompletions = allCompletions.filter(c => (c.chapter_completions as any).completedAt && (c.chapter_completions as any).completedAt >= twoWeeksAgoStr);
    const paceChaptersPerWeek = Math.round((recentCompletions.length / 2) * 10) / 10;

    return {
      booksCompletedMonth,
      booksCompletedYear,
      streakDays,
      paceChaptersPerWeek,
      last7Days,
    };
  }

  // Courses CRUD methods
  async createCourse(course: InsertCourse): Promise<Course> {
    const result = await db.insert(courses).values(course).returning();
    return result[0];
  }

  async updateCourse(id: number, course: Partial<InsertCourse>): Promise<Course | undefined> {
    const result = await db.update(courses).set(course).where(eq(courses.id, id)).returning();
    return result[0];
  }

  async deleteCourse(id: number): Promise<void> {
    // Get all missions for this course
    const courseMissions = await db.select().from(missions).where(eq(missions.courseId, id));

    // Delete mission-related data first
    for (const mission of courseMissions) {
      await db.delete(missionFeedback).where(eq(missionFeedback.missionId, mission.id));
      await db.delete(proofs).where(eq(proofs.missionId, mission.id));
    }

    // Delete all missions for this course
    await db.delete(missions).where(eq(missions.courseId, id));

    // Delete other related data
    await db.delete(deadlines).where(eq(deadlines.courseId, id));
    await db.delete(academicCommitments).where(eq(academicCommitments.courseId, id));
    await db.delete(conceptTracking).where(eq(conceptTracking.courseId, id));

    // Finally delete the course itself
    await db.delete(courses).where(eq(courses.id, id));
  }

  // Concept Tracking methods
  async recordConceptCoverage(courseId: number, conceptName: string, userId: number): Promise<ConceptTracking> {
    const whereCondition = and(eq(conceptTracking.courseId, courseId), eq(conceptTracking.conceptName, conceptName), eq(conceptTracking.userId, userId));
      
    const existing = await db.select().from(conceptTracking)
      .where(whereCondition);

    if (existing.length > 0) {
      const result = await db.update(conceptTracking)
        .set({
          lastCoveredAt: sql`CURRENT_TIMESTAMP`,
          coverageCount: sql`${conceptTracking.coverageCount} + 1`,
        })
        .where(whereCondition)
        .returning();
      return result[0];
    }

    const result = await db.insert(conceptTracking).values({
      courseId,
      conceptName,
      coverageCount: 1,
      masteryLevel: 1,
      userId: userId,
    }).returning();
    return result[0];
  }

  async getConceptsForCourse(courseId: number, userId: number): Promise<ConceptTracking[]> {
    return await db.select().from(conceptTracking)
      .where(and(eq(conceptTracking.courseId, courseId), eq(conceptTracking.userId, userId)))
      .orderBy(desc(conceptTracking.lastCoveredAt));
  }

  async getAllConceptTracking(userId: number): Promise<ConceptTracking[]> {
    return await db.select().from(conceptTracking).where(eq(conceptTracking.userId, userId)).orderBy(desc(conceptTracking.lastCoveredAt));
  }

  // Analytics methods
  async getScheduleFeedbackStats(userId: number): Promise<{
    totalBlocks: number;
    completedBlocks: number;
    skippedBlocks: number;
    avgEnergyLevel: number;
    avgDifficulty: number;
    skipReasons: Record<string, number>;
  }> {
    const allFeedback = await db.select().from(scheduleBlockFeedback).where(eq(scheduleBlockFeedback.userId, userId));

    const totalBlocks = allFeedback.length;
    const completedBlocks = allFeedback.filter(f => f.completed).length;
    const skippedBlocks = allFeedback.filter(f => f.skipped).length;

    const energyValues = allFeedback.filter(f => f.energyLevel !== null).map(f => f.energyLevel!);
    const avgEnergyLevel = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : 0;

    const difficultyValues = allFeedback.filter(f => f.difficulty !== null).map(f => f.difficulty!);
    const avgDifficulty = difficultyValues.length > 0 ? difficultyValues.reduce((a, b) => a + b, 0) / difficultyValues.length : 0;

    const skipReasons: Record<string, number> = {};
    allFeedback.filter(f => f.skipReason).forEach(f => {
      const reason = f.skipReason!;
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    });

    return {
      totalBlocks,
      completedBlocks,
      skippedBlocks,
      avgEnergyLevel,
      avgDifficulty,
      skipReasons,
    };
  }

  async getTimePerCourse(userId: number): Promise<{ courseId: number; courseName: string; totalMinutes: number }[]> {
    const allSchedules = await db.select().from(dailySchedules).where(eq(dailySchedules.userId, userId));
    const courseList = await this.getCourses(userId);

    const courseTimeMap: Record<number, number> = {};

    for (const schedule of allSchedules) {
      try {
        const blocks = JSON.parse(schedule.scheduleData);
        for (const block of blocks) {
          if (block.courseId && block.duration) {
            courseTimeMap[block.courseId] = (courseTimeMap[block.courseId] || 0) + block.duration;
          }
        }
      } catch (e) {
        // Skip malformed schedule data
      }
    }

    return courseList.map(course => ({
      courseId: course.id,
      courseName: course.name,
      totalMinutes: courseTimeMap[course.id] || 0,
    }));
  }

  async getProductivityByHour(userId: number): Promise<{ hour: number; completionRate: number; avgEnergy: number }[]> {
    const allFeedback = await db.select().from(scheduleBlockFeedback).where(eq(scheduleBlockFeedback.userId, userId));

    const hourStats: Record<number, { completed: number; total: number; energySum: number; energyCount: number }> = {};

    for (let h = 0; h < 24; h++) {
      hourStats[h] = { completed: 0, total: 0, energySum: 0, energyCount: 0 };
    }

    for (const feedback of allFeedback) {
      const hour = parseInt(feedback.blockStartTime.split(':')[0], 10);
      if (!isNaN(hour) && hour >= 0 && hour < 24) {
        hourStats[hour].total++;
        if (feedback.completed) {
          hourStats[hour].completed++;
        }
        if (feedback.energyLevel !== null) {
          hourStats[hour].energySum += feedback.energyLevel;
          hourStats[hour].energyCount++;
        }
      }
    }

    return Object.entries(hourStats).map(([hour, stats]) => ({
      hour: parseInt(hour, 10),
      completionRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      avgEnergy: stats.energyCount > 0 ? stats.energySum / stats.energyCount : 0,
    }));
  }

  async createMissionFeedback(data: InsertMissionFeedback): Promise<MissionFeedback> {
    const [feedback] = await db.insert(missionFeedback).values(data).returning();
    return feedback;
  }

  async getMissionFeedback(missionId: number, userId: number): Promise<MissionFeedback | undefined> {
    const [feedback] = await db.select().from(missionFeedback).where(and(eq(missionFeedback.missionId, missionId))).limit(1);
    return feedback;
  }

  async updateMissionFeedback(missionId: number, data: Partial<MissionFeedback>, userId: number): Promise<MissionFeedback | undefined> {
    const [feedback] = await db.update(missionFeedback)
      .set(data)
      .where(eq(missionFeedback.missionId, missionId))
      .returning();
    return feedback;
  }

  async completeMission(id: number): Promise<void> {
    await db.update(missions).set({ 
      status: "completed",
      completedAt: new Date().toISOString()
    }).where(eq(missions.id, id));
  }

  async getCompletedMissions(userId: number): Promise<(Mission & { courseName: string; courseCode: string; feedback?: MissionFeedback })[]> {
    const result = await db
      .select({
        mission: missions,
        courseName: courses.name,
        courseCode: courses.code,
      })
      .from(missions)
      .leftJoin(courses, eq(missions.courseId, courses.id))
      .where(and(
        eq(missions.userId, userId),
        eq(missions.status, "completed")
      ))
      .orderBy(desc(missions.completedAt));

    const missionsWithDetails = await Promise.all(
      result.map(async (r: any) => {
        const feedback = await this.getMissionFeedback(r.mission.id, userId);
        const missionProofs = await this.getProofsByMissionId(r.mission.id);
        return {
          ...r.mission,
          courseName: r.courseName || "",
          courseCode: r.courseCode || "",
          feedback,
          proofFile: missionProofs[0]?.fileName,
        };
      })
    );

    return missionsWithDetails;
  }

  async getCompletedMissionsByCourse(userId: number, courseId: number): Promise<(Mission & { feedback?: MissionFeedback })[]> {
    const result = await db
      .select()
      .from(missions)
      .where(and(
        eq(missions.userId, userId),
        eq(missions.courseId, courseId),
        eq(missions.status, "completed")
      ))
      .orderBy(desc(missions.completedAt));

    const missionsWithFeedback = await Promise.all(
      result.map(async (mission: any) => {
        const feedback = await this.getMissionFeedback(mission.id, userId);
        return { ...mission, feedback };
      })
    );

    return missionsWithFeedback;
  }

  async getMissionWithFullDetails(missionId: number, userId: number): Promise<any> {
    const result = await db
      .select({
        mission: missions,
        courseName: courses.name,
        courseCode: courses.code,
      })
      .from(missions)
      .leftJoin(courses, eq(missions.courseId, courses.id))
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));

    if (!result || result.length === 0) return null;
    const { mission, courseName, courseCode } = result[0];

    const feedback = await this.getMissionFeedback(missionId, userId);
    const proofsList = await this.getProofsByMissionId(missionId);

    return {
      ...mission,
      courseName,
      courseCode,
      feedback,
      proofs: proofsList,
    };
  }

  async hasUserCreatedFirstSchedule(userId: number): Promise<boolean> {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user.length > 0 && user[0].hasCreatedFirstSchedule === true;
  }

  async markUserCreatedFirstSchedule(userId: number): Promise<void> {
    await db.update(users).set({ hasCreatedFirstSchedule: true }).where(eq(users.id, userId));
  }

  getForgeKBPath(): string {
    return FORGE_KB_PATH;
  }

  // Learner Profile & Knowledge Chat implementations
  async getLearnerProfile(userId: number, courseId: number): Promise<LearnerProfile | undefined> {
    const result = await db.select().from(learnerProfiles)
      .where(and(eq(learnerProfiles.userId, userId), eq(learnerProfiles.courseId, courseId)));
    return result[0];
  }

  async upsertLearnerProfile(profile: InsertLearnerProfile): Promise<LearnerProfile> {
    const existing = await this.getLearnerProfile(profile.userId, profile.courseId);
    if (existing) {
      const updated = await db.update(learnerProfiles)
        .set({ ...profile, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(and(eq(learnerProfiles.userId, profile.userId), eq(learnerProfiles.courseId, profile.courseId)))
        .returning();
      return updated[0];
    }
    const result = await db.insert(learnerProfiles).values(profile).returning();
    return result[0];
  }

  async getChatHistory(userId: number, courseId: number, limit: number = 50): Promise<KnowledgeChatMessage[]> {
    return await db.select().from(knowledgeChatHistory)
      .where(and(eq(knowledgeChatHistory.userId, userId), eq(knowledgeChatHistory.courseId, courseId)))
      .orderBy(asc(knowledgeChatHistory.createdAt))
      .limit(limit);
  }

  async addChatMessage(message: InsertKnowledgeChatMessage): Promise<KnowledgeChatMessage> {
    const result = await db.insert(knowledgeChatHistory).values(message).returning();
    return result[0];
  }

  async getRecentMissionFeedback(userId: number, limit: number = 20): Promise<MissionFeedback[]> {
    const result = await db
      .select({
        feedback: missionFeedback,
      })
      .from(missionFeedback)
      .innerJoin(missions, eq(missionFeedback.missionId, missions.id))
      .where(eq(missions.userId, userId))
      .orderBy(desc(missionFeedback.createdAt))
      .limit(limit);

    return result.map(r => r.feedback);
  }

  async getWeeklyCoursesCovered(userId: number, weekStartDate: string): Promise<{ courseId: number; courseCode: string; courseName: string; missionCount: number }[]> {
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndDate = weekEnd.toISOString().split("T")[0];

    const result = await db
      .select({
        courseId: courses.id,
        courseCode: courses.code,
        courseName: courses.name,
        missionCount: count(missions.id),
      })
      .from(missions)
      .innerJoin(courses, eq(missions.courseId, courses.id))
      .where(
        and(
          eq(missions.userId, userId),
          gte(missions.missionDate, weekStartDate),
          lte(missions.missionDate, weekEndDate)
        )
      )
      .groupBy(courses.id, courses.code, courses.name);

    return result.map(r => ({
      courseId: r.courseId,
      courseCode: r.courseCode,
      courseName: r.courseName,
      missionCount: Number(r.missionCount),
    }));
  }

  async getCoursesNeedingAttention(userId: number, weekStartDate: string): Promise<{ courseId: number; courseCode: string; courseName: string; daysSinceLastMission: number | null }[]> {
    const allCourses = await this.getCourses(userId);
    const coveredCourses = await this.getWeeklyCoursesCovered(userId, weekStartDate);
    const coveredCourseIds = new Set(coveredCourses.map(c => c.courseId));

    const today = new Date();
    const coursesNeedingAttention: { courseId: number; courseCode: string; courseName: string; daysSinceLastMission: number | null }[] = [];

    for (const course of allCourses) {
      if (!coveredCourseIds.has(course.id)) {
        const lastMission = await db
          .select({ missionDate: missions.missionDate })
          .from(missions)
          .where(and(eq(missions.courseId, course.id), eq(missions.userId, userId)))
          .orderBy(desc(missions.missionDate))
          .limit(1);

        let daysSinceLastMission: number | null = null;
        if (lastMission.length > 0 && lastMission[0].missionDate) {
          const lastDate = new Date(lastMission[0].missionDate);
          daysSinceLastMission = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        coursesNeedingAttention.push({
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          daysSinceLastMission,
        });
      }
    }

    return coursesNeedingAttention.sort((a, b) => {
      if (a.daysSinceLastMission === null && b.daysSinceLastMission === null) return 0;
      if (a.daysSinceLastMission === null) return -1;
      if (b.daysSinceLastMission === null) return 1;
      return b.daysSinceLastMission - a.daysSinceLastMission;
    });
  }

  async createReadingLog(log: InsertReadingLog): Promise<ReadingLog> {
    const [result] = await db.insert(readingLogs).values(log).returning();
    
    if (log.bookId) {
      await db.update(books)
        .set({ lastReadAt: new Date().toISOString() })
        .where(eq(books.id, log.bookId));
    }
    
    return result;
  }

  async getReadingLogsForBook(bookId: number): Promise<ReadingLog[]> {
    return await db.select().from(readingLogs).where(eq(readingLogs.bookId, bookId)).orderBy(desc(readingLogs.logDate));
  }

  async getReadingLogsForUser(userId: number, limit: number = 50): Promise<ReadingLog[]> {
    return await db.select().from(readingLogs).where(eq(readingLogs.userId, userId)).orderBy(desc(readingLogs.logDate)).limit(limit);
  }

  async countIncompleteAutoMissions(date: string, userId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(missions)
      .leftJoin(proofs, eq(missions.id, proofs.missionId))
      .where(and(
        eq(missions.userId, userId),
        sql`DATE(${missions.missionDate}) = DATE(${date})`,
        eq(missions.source, 'auto'),
        sql`${proofs.id} IS NULL`
      ));
    return Number(result[0]?.count || 0);
  }

  async getUsersWithScheduleGenerationTime(): Promise<{ userId: number; scheduleGenerationTime: string }[]> {
    const result = await db
      .select({
        userId: userPreferences.userId,
        scheduleGenerationTime: userPreferences.scheduleGenerationTime,
      })
      .from(userPreferences)
      .where(sql`${userPreferences.scheduleGenerationTime} IS NOT NULL`);
    
    const uniqueUsers = new Map<number, string>();
    for (const r of result) {
      if (r.userId && r.scheduleGenerationTime && !uniqueUsers.has(r.userId)) {
        uniqueUsers.set(r.userId, r.scheduleGenerationTime);
      }
    }
    
    return Array.from(uniqueUsers.entries()).map(([userId, scheduleGenerationTime]) => ({
      userId,
      scheduleGenerationTime,
    }));
  }

  // Planning Chat Methods
  async createPlanningSession(session: InsertPlanningChatSession): Promise<PlanningChatSession> {
    const [result] = await db.insert(planningChatSessions).values(session).returning();
    return result;
  }

  async getPlanningSession(userId: number, date: string): Promise<PlanningChatSession | undefined> {
    const result = await db.select().from(planningChatSessions)
      .where(and(
        eq(planningChatSessions.userId, userId),
        eq(planningChatSessions.scheduleDate, date)
      ))
      .orderBy(desc(planningChatSessions.createdAt))
      .limit(1);
    return result[0];
  }

  async getPlanningSessionById(sessionId: number): Promise<PlanningChatSession | undefined> {
    const result = await db.select().from(planningChatSessions)
      .where(eq(planningChatSessions.id, sessionId));
    return result[0];
  }

  async updatePlanningSession(sessionId: number, updates: Partial<PlanningChatSession>): Promise<PlanningChatSession | undefined> {
    const [result] = await db.update(planningChatSessions)
      .set(updates)
      .where(eq(planningChatSessions.id, sessionId))
      .returning();
    return result;
  }

  async getRecentPlanningSessions(userId: number, limit: number = 10): Promise<PlanningChatSession[]> {
    return await db.select().from(planningChatSessions)
      .where(eq(planningChatSessions.userId, userId))
      .orderBy(desc(planningChatSessions.createdAt))
      .limit(limit);
  }

  async addPlanningMessage(message: InsertPlanningChatMessage): Promise<PlanningChatMessage> {
    const [result] = await db.insert(planningChatMessages).values(message).returning();
    return result;
  }

  async getPlanningMessages(sessionId: number): Promise<PlanningChatMessage[]> {
    return await db.select().from(planningChatMessages)
      .where(eq(planningChatMessages.sessionId, sessionId))
      .orderBy(asc(planningChatMessages.createdAt));
  }

  async clearPlanningMessages(sessionId: number): Promise<void> {
    await db.delete(planningChatMessages)
      .where(eq(planningChatMessages.sessionId, sessionId));
  }

  async getPlanningPreferences(userId: number): Promise<PlanningPreferences | undefined> {
    const result = await db.select().from(planningPreferences)
      .where(eq(planningPreferences.userId, userId));
    return result[0];
  }

  async upsertPlanningPreferences(prefs: InsertPlanningPreferences): Promise<PlanningPreferences> {
    const existing = await this.getPlanningPreferences(prefs.userId);
    if (existing) {
      const [result] = await db.update(planningPreferences)
        .set({ ...prefs, updatedAt: new Date().toISOString() })
        .where(eq(planningPreferences.userId, prefs.userId))
        .returning();
      return result;
    }
    const [result] = await db.insert(planningPreferences).values(prefs).returning();
    return result;
  }
}

export const storage = new DrizzleStorage();