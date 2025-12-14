import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertMissionSchema, insertProofSchema, insertAcademicCommitmentSchema, insertScheduleBlockFeedbackSchema, insertBookSchema, insertCourseSchema, insertMissionFeedbackSchema, missionFeedback, missions, deadlines, scheduleBlockFeedback, dailySchedules, draftSchedules, academicCommitments, courses, books, userPreferences, notifications, users, proofs, userPatterns, settings, conceptTracking, scheduleDriftEvents, dailyFeedback, activityLibrary, insertUploadedFileSchema, uploadedFiles, insertLearnerProfileSchema, insertKnowledgeChatSchema, courseRoadmaps, roadmapChatHistory, planningChatSessions, planningChatMessages, learnerProfiles, knowledgeChatHistory, documentChunks, readingLogs, planningPreferences } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { generateMission, isGroqConfigured } from "./llm/groq";
import { gatherMissionIntelligence } from "./llm/missionIntelligence";
import { extractConcepts, validateProofWithVision, analyzeDocumentText, isGeminiConfigured, generateProofFeedback as generateGeminiFeedback } from "./llm/gemini";
import { validateGeminiAPI } from "./llm/gemini";
import { validateGroqAPI } from "./llm/groq";
import { generateProofFeedback as generateGroqFeedback } from "./llm/groq";
import { generateDailySchedule, loadAllCourseContexts } from "./llm/planner";
import { buildUnifiedContext } from "./llm/unifiedContext";
import { updateUserPatterns } from "./llm/patternAnalyzer";
import { analyzeActivityDetails } from "./llm/detailsAnalyzer";
import { ingestNotes } from "./llm/missionIntelligence";
import { ingestFiles, ingestSingleFile, getIngestJobStatus, validateFiles } from "./llm/ingestRag";
import { generateSingleRagMission } from "./llm/missionRag";
import { getChunkCount, sanitizeCourseCode } from "./llm/retriever";
import { updateMasteryFromFeedback, startMasteryDecayScheduler } from "./llm/mastery";
import { exportMetrics } from "./metrics/counters";
import type { UserPreferences } from "@shared/schema";
import { createUser, getUserByEmail, getUserById, authenticateUser } from "./auth";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

import { loadContextForCourse as loadContextFromDB } from "./llm/ingestPipeline";

const FORGE_KB_PATH = process.env.FORGE_KB_PATH || "./forge_kb";

// Helper function to get time-of-day label
function getTimeOfDayLabel(timeStr: string): string {
  const [hours] = timeStr.split(":").map(Number);
  const config = [
    { label: "Early Night", start: 0, end: 4 },
    { label: "Late Night", start: 4, end: 6 },
    { label: "Early Morning", start: 6, end: 7 },
    { label: "Morning", start: 7, end: 9 },
    { label: "Mid-Morning", start: 9, end: 10 },
    { label: "Late Morning", start: 10, end: 12 },
    { label: "Noon", start: 12, end: 13 },
    { label: "Midday", start: 13, end: 14 },
    { label: "Afternoon", start: 14, end: 17 },
    { label: "Late Afternoon", start: 17, end: 19 },
    { label: "Early Evening", start: 19, end: 20 },
    { label: "Evening", start: 20, end: 22 },
    { label: "Late Evening", start: 22, end: 24 },
  ];
  return config.find(t => hours >= t.start && hours < t.end)?.label || "Unknown";
}

// Helper function to generate AI reschedule for remaining blocks
async function generateReschedule(
  scheduleDate: string,
  currentTime: string,
  remainingBlocks: any[],
  preferences: UserPreferences | undefined
): Promise<any[]> {
  // Parse current time to minutes from midnight
  const [currentHour, currentMin] = currentTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMin;

  // Get sleep time constraint
  const sleepTime = preferences?.sleepTime || "22:00";
  const [sleepHour, sleepMin] = sleepTime.split(':').map(Number);
  const sleepMinutes = sleepHour * 60 + sleepMin;

  // Available time remaining
  const availableMinutes = sleepMinutes - currentMinutes;

  if (availableMinutes <= 0 || remainingBlocks.length === 0) {
    return remainingBlocks; // No time left or no blocks to reschedule
  }

  // Calculate total duration needed for remaining blocks
  const totalDurationNeeded = remainingBlocks.reduce((sum, block) => {
    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);
    return sum + ((endH * 60 + endM) - (startH * 60 + startM));
  }, 0);

  // Calculate scaling factor if we need to compress
  const scaleFactor = totalDurationNeeded > availableMinutes 
    ? availableMinutes / totalDurationNeeded 
    : 1;

  // Reschedule blocks sequentially from current time
  let nextStartMinutes = currentMinutes;
  const rescheduledBlocks = remainingBlocks.map((block) => {
    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);
    const originalDuration = (endH * 60 + endM) - (startH * 60 + startM);

    // Apply scaling if needed (minimum 15 minutes per block)
    const newDuration = Math.max(15, Math.round(originalDuration * scaleFactor));

    // Calculate new times
    const newStartHour = Math.floor(nextStartMinutes / 60);
    const newStartMin = nextStartMinutes % 60;
    const newEndMinutes = nextStartMinutes + newDuration;
    const newEndHour = Math.floor(newEndMinutes / 60);
    const newEndMin = newEndMinutes % 60;

    const rescheduled = {
      ...block,
      startTime: `${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}`,
      endTime: `${String(newEndHour).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`,
      originalStartTime: block.startTime,
      originalEndTime: block.endTime,
      wasRescheduled: true,
      durationChange: newDuration - originalDuration,
    };

    nextStartMinutes = newEndMinutes;
    return rescheduled;
  });

  // Filter out any blocks that would extend past sleep time
  return rescheduledBlocks.filter(block => {
    const [endH, endM] = block.endTime.split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    return endMinutes <= sleepMinutes;
  });
}

function normalizeCourseCode(code: string): string {
  return (code || "").toUpperCase().replace(/\s+/g, "");
}

function safeParseJsonArray(jsonStr: string | null | undefined): string[] | undefined {
  if (!jsonStr) return undefined;
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Memory-based uploads for database storage (no local disk dependencies)
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for proofs
});

const ingestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for document ingestion
});

const courseBuilderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for course builder (reduced for DB storage)
});

const todoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "/tmp/todo-uploads");
    },
    filename: (req, file, cb) => {
      // Preserve original filename to retain file extension
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const ext = path.extname(file.originalname);
      cb(null, `${timestamp}-${random}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for to-do list files
});

// Helper to convert buffer to base64 for database storage
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

// Async wrapper for database context loading
async function loadContextForCourse(courseCode: string, userId?: number): Promise<any> {
  return await loadContextFromDB(courseCode, userId);
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // No local file system setup needed - all data stored in database

  // Auth routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validated = signupSchema.parse(req.body);

      const existingUser = await getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const user = await createUser(validated.email, validated.password, validated.name);
      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        }
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validated = loginSchema.parse(req.body);

      const user = await authenticateUser(validated.email, validated.password);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        }
      });

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to log in" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get user's missions and roadmaps first to delete dependent data
      const userMissions = await db.select().from(missions).where(eq(missions.userId, userId));
      const missionIds = userMissions.map(m => m.id);
      const userRoadmaps = await db.select().from(courseRoadmaps).where(eq(courseRoadmaps.userId, userId));
      const roadmapIds = userRoadmaps.map(r => r.id);

      // Delete mission-related data
      for (const missionId of missionIds) {
        await db.delete(missionFeedback).where(eq(missionFeedback.missionId, missionId));
        await db.delete(proofs).where(eq(proofs.missionId, missionId));
      }

      // Delete roadmap-related data
      for (const roadmapId of roadmapIds) {
        await db.delete(roadmapChatHistory).where(eq(roadmapChatHistory.roadmapId, roadmapId));
      }

      // Delete all user data in order of dependencies
      await db.delete(missions).where(eq(missions.userId, userId));
      await db.delete(deadlines).where(eq(deadlines.userId, userId));
      await db.delete(scheduleBlockFeedback).where(eq(scheduleBlockFeedback.userId, userId));
      await db.delete(dailySchedules).where(eq(dailySchedules.userId, userId));
      await db.delete(draftSchedules).where(eq(draftSchedules.userId, userId));
      await db.delete(academicCommitments).where(eq(academicCommitments.userId, userId));
      await db.delete(readingLogs).where(eq(readingLogs.userId, userId));
      // Delete learner profiles and chat history before deleting courses (foreign key constraint)
      await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, userId));
      await db.delete(knowledgeChatHistory).where(eq(knowledgeChatHistory.userId, userId));
      await db.delete(documentChunks).where(eq(documentChunks.userId, userId));
      await db.delete(planningChatSessions).where(eq(planningChatSessions.userId, userId));
      await db.delete(courseRoadmaps).where(eq(courseRoadmaps.userId, userId));
      await db.delete(courses).where(eq(courses.userId, userId));
      await db.delete(books).where(eq(books.userId, userId));
      await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
      await db.delete(activityLibrary).where(eq(activityLibrary.userId, userId));
      await db.delete(notifications).where(eq(notifications.userId, userId));
      await db.delete(userPatterns).where(eq(userPatterns.userId, userId));
      await db.delete(settings).where(eq(settings.userId, userId));
      await db.delete(conceptTracking).where(eq(conceptTracking.userId, userId));
      await db.delete(scheduleDriftEvents).where(eq(scheduleDriftEvents.userId, userId));
      await db.delete(dailyFeedback).where(eq(dailyFeedback.userId, userId));
      await db.delete(planningPreferences).where(eq(planningPreferences.userId, userId));
      await db.delete(users).where(eq(users.id, userId));

      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
      });

      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

  app.get("/api/llm/status", (_req, res) => {
    res.json({
      groq: isGroqConfigured(),
      gemini: isGeminiConfigured(),
    });
  });

  app.get("/api/llm/validate/all", async (_req, res) => {
    try {
      const [gemini, groq] = await Promise.all([
        validateGeminiAPI(),
        validateGroqAPI()
      ]);
      res.json({ gemini, groq });
    } catch (error: any) {
      console.error("Error validating APIs:", error);
      res.json({
        gemini: { valid: false, status: 'error', message: 'Test failed' },
        groq: { valid: false, status: 'error', message: 'Test failed' }
      });
    }
  });

  app.get("/api/missions/today", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
        .toISOString()
        .split("T")[0];

      let missions = await storage.getMissionsByDate(today, req.session.userId);

      // Check how many incomplete auto missions exist
      const DAILY_AUTO_MISSION_TARGET = 3;
      const incompleteAutoCount = await storage.countIncompleteAutoMissions(today, req.session.userId!);

      // If no missions for today, or if incomplete auto missions are below target, generate more
      if (missions.length === 0 || incompleteAutoCount < DAILY_AUTO_MISSION_TARGET) {
        const newMissions = await storage.generateDailyMissions(today, req.session.userId);
        // Only add missions that would bring us up to target
        if (missions.length === 0) {
          missions = newMissions;
        } else {
          missions = await storage.getMissionsByDate(today, req.session.userId);
        }
      }

      res.json(missions);
    } catch (error) {
      console.error("Error fetching missions:", error);
      res.status(500).json({ error: "Failed to fetch missions" });
    }
  });

  app.get("/api/courses", requireAuth, async (req, res) => {
    try {
      const courses = await storage.getCourses(req.session.userId);
      res.json(courses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  app.get("/api/courses/materials-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const courseList = await storage.getCourses(userId);

      const materialsStatus = await Promise.all(
        courseList.map(async (course) => {
          const chunkCount = await getChunkCount(userId, sanitizeCourseCode(course.code));
          return {
            courseId: course.id,
            courseCode: course.code,
            courseName: course.name,
            hasMaterials: chunkCount > 0,
            chunkCount,
          };
        })
      );

      const coursesWithMaterials = materialsStatus.filter(c => c.hasMaterials);
      const coursesWithoutMaterials = materialsStatus.filter(c => !c.hasMaterials);

      res.json({
        total: courseList.length,
        withMaterials: coursesWithMaterials.length,
        withoutMaterials: coursesWithoutMaterials.length,
        courses: materialsStatus,
        coursesNeedingUpload: coursesWithoutMaterials,
      });
    } catch (error) {
      console.error("Error fetching course materials status:", error);
      res.status(500).json({ error: "Failed to fetch course materials status" });
    }
  });

  // POST mission with AI generation
  app.post("/api/missions", requireAuth, async (req, res) => {
    try {
      const { courseId, missionDate, ...missionData } = req.body;
      const validated = insertMissionSchema.parse({
        courseId,
        missionDate: missionDate || new Date().toISOString().split("T")[0],
        userId: req.session.userId,
        source: 'manual',
        ...missionData,
      });

      const mission = await storage.createMission(validated);
      res.status(201).json(mission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating mission:", error);
      res.status(500).json({ error: "Failed to create mission" });
    }
  });

  app.post("/api/missions/generate", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { courseCode } = req.body;
    if (!courseCode) {
      return res.status(400).json({ error: "Course code is required" });
    }

    try {
      const courses = await storage.getCourses(req.session.userId);
      const course = courses.find(c => c.code === courseCode);

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const mission = await generateSingleRagMission(
        req.session.userId,
        course.code,
        course.name,
        "general learning",
        30
      );

      const savedMission = await storage.createMission({
        userId: req.session.userId,
        courseId: course.id,
        title: mission.title,
        description: mission.description,
        proofRequirement: mission.proofRequirement,
        missionDate: new Date().toISOString().split('T')[0],
        source: 'manual',
      });

      res.json(savedMission);
    } catch (error: any) {
      console.error("Error generating mission:", error);
      res.status(500).json({ error: error.message || "Failed to generate mission" });
    }
  });

  app.delete("/api/missions/:id", requireAuth, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      await storage.deleteMission(missionId);
      res.json({ message: "Mission deleted successfully" });
    } catch (error) {
      console.error("Error deleting mission:", error);
      res.status(500).json({ error: "Failed to delete mission" });
    }
  });

  app.get("/api/archive", requireAuth, async (req, res) => {
    try {
      const archiveData = await storage.getArchiveData(undefined, undefined, req.session.userId);
      res.json(archiveData);
    } catch (error) {
      console.error("Error fetching archive:", error);
      res.status(500).json({ error: "Failed to fetch archive" });
    }
  });

  app.post("/api/missions/:courseCode/:id/proof", requireAuth, (req, res, next) => {
    proofUpload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "File too large - maximum 10MB allowed" });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(500).json({ error: "Upload failed" });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId) || !req.file) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }

      const courseCode = normalizeCourseCode(req.params.courseCode);
      if (!courseCode) {
        res.status(400).json({ error: "Invalid course code" });
        return;
      }

      // Generate unique filename for database storage
      const timestamp = new Date().toISOString().split("T")[0];
      const ext = path.extname(req.file.originalname);
      const fileName = `mission_${missionId}_${timestamp}${ext}`;
      
      // Store file data as base64 in the proof record
      const fileData = bufferToBase64(req.file.buffer);

      const validated = insertProofSchema.parse({
        missionId,
        fileName,
        fileSize: req.file.size,
        fileData,
      });

      // Create proof with file data stored in database
      const proof = await storage.createProof(validated);
      // Keep mission as proof_uploaded - only mark complete after feedback + AI approval
      await storage.updateMissionStatus(missionId, "proof_uploaded");

      res.json({ proof, message: "Proof uploaded successfully" });
    } catch (error) {
      console.error("Error uploading proof:", error);
      res.status(500).json({ error: "Failed to upload proof" });
    }
  });

  app.delete("/api/missions/:id/proof", requireAuth, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      await storage.deleteLatestProof(missionId);
      res.json({ message: "Proof deleted successfully" });
    } catch (error) {
      console.error("Error deleting proof:", error);
      res.status(500).json({ error: "Failed to delete proof" });
    }
  });

  app.post("/api/missions/:id/feedback", requireAuth, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      // Parse all feedback fields including new ones
      const feedbackData = {
        missionId,
        emotionalState: req.body.emotionalState || null,
        actualTimeMinutes: req.body.actualTimeMinutes || null,
        timeFeeling: req.body.timeFeeling || null,
        usedExternalHelp: req.body.usedExternalHelp || false,
        helpDetails: req.body.helpDetails || null,
        missionClarity: req.body.missionClarity || null,
        learningType: req.body.learningType || null,
        blockers: req.body.blockers || null,
        confidenceLevel: req.body.confidenceLevel || null,
        difficulty: req.body.difficulty || null,
        timeAccuracy: req.body.timeAccuracy || null,
        notes: req.body.notes || null,
      };

      const feedback = await storage.createMissionFeedback(feedbackData);

      // Get mission details for AI validation and analysis
      let aiValidation: { approved: boolean; analysis: string; rejectionReason?: string } = { approved: true, analysis: "" };

      try {
        const mission = await storage.getMissionById(missionId);
        if (mission) {
          const courses = await storage.getCourses(req.session.userId!);
          const course = courses.find((c: any) => c.id === mission.courseId);

          if (course) {
            const proofs = await storage.getProofsByMissionId(missionId);
            if (proofs && proofs.length > 0) {
              const proof = proofs[0];
              const normalizedCourseCode = normalizeCourseCode(course.code);
              const filePath = path.join(FORGE_KB_PATH, normalizedCourseCode, proof.fileName);

              console.log(`[AI Validation] Looking for proof at: ${filePath}`);

              if (fs.existsSync(filePath)) {
                try {
                  const proofContent = await analyzeDocumentText(filePath, getMimeType(filePath));
                  console.log(`[AI Validation] Extracted proof content length: ${proofContent.length}`);

                  // Use new comprehensive validation function
                  const { validateAndAnalyzeMission } = await import("./llm/gemini");
                  aiValidation = await validateAndAnalyzeMission(
                    proofContent,
                    mission.title,
                    mission.description,
                    mission.proofRequirement,
                    {
                      emotionalState: feedbackData.emotionalState || undefined,
                      actualTimeMinutes: feedbackData.actualTimeMinutes || undefined,
                      timeFeeling: feedbackData.timeFeeling || undefined,
                      usedExternalHelp: feedbackData.usedExternalHelp || undefined,
                      helpDetails: feedbackData.helpDetails || undefined,
                      missionClarity: feedbackData.missionClarity || undefined,
                      learningType: feedbackData.learningType || undefined,
                      blockers: feedbackData.blockers || undefined,
                      confidenceLevel: feedbackData.confidenceLevel || undefined,
                    }
                  );

                  console.log(`[AI Validation] Result: ${aiValidation.approved ? 'APPROVED' : 'REJECTED'}`);
                } catch (analyzeErr) {
                  console.error("Error during AI validation:", analyzeErr);
                  aiValidation = { 
                    approved: true, 
                    analysis: "Your submission has been received. The AI analysis is temporarily unavailable.",
                    rejectionReason: undefined
                  };
                }
              } else {
                console.warn(`[AI Validation] Proof file not found at: ${filePath}`);
                aiValidation = { 
                  approved: false, 
                  analysis: "",
                  rejectionReason: "Proof file not found. Please try uploading again."
                };
              }
            } else {
              aiValidation = { 
                approved: false, 
                analysis: "",
                rejectionReason: "No proof submitted. Please upload your work before submitting feedback."
              };
            }
          }
        }
      } catch (aiErr) {
        console.error("Error during AI validation:", aiErr);
        aiValidation = { 
          approved: true, 
          analysis: "Your submission has been received.",
          rejectionReason: undefined
        };
      }

      // Update feedback record with AI results
      await storage.updateMissionFeedback(missionId, {
        aiApproved: aiValidation.approved,
        aiRejectionReason: aiValidation.rejectionReason || null,
        fullAiAnalysis: aiValidation.analysis,
      });

      // Update mission status based on AI decision
      if (aiValidation.approved) {
        // Keep as proof_uploaded - will be marked complete when user clicks "Got it"
        await storage.updateMissionStatus(missionId, "proof_uploaded");
      } else {
        await storage.updateMissionStatus(missionId, "needs_revision");
      }

      // Update mastery levels if approved
      let masteryDeltas: any[] = [];
      if (aiValidation.approved) {
        try {
          const mission = await storage.getMissionById(missionId);
          if (mission) {
            const courses = await storage.getCourses(req.session.userId!);
            const courseCode = courses.find((c: any) => c.id === mission.courseId)?.code || "";
            const courseContext = await loadContextForCourse(courseCode, req.session.userId!);

            const allConcepts = courseContext.concepts?.map((c: any) => 
              typeof c === "string" ? c : c.name
            ).filter(Boolean) || [];

            const missionWords = (mission.title + " " + mission.description).toLowerCase().split(/\W+/);
            const relevantConcepts = allConcepts.filter((concept: string) => {
              const conceptLower = concept.toLowerCase();
              return missionWords.some((word: string) => 
                conceptLower.includes(word) || word.includes(conceptLower.split(" ")[0])
              );
            });

            const conceptNames = relevantConcepts.length > 0 
              ? relevantConcepts.slice(0, 5) 
              : allConcepts.slice(0, 3);

            if (conceptNames.length > 0) {
              masteryDeltas = await updateMasteryFromFeedback({
                missionId,
                courseId: mission.courseId,
                conceptNames,
                isValid: true,
                difficulty: feedbackData.difficulty ?? undefined,
                timeAccuracy: feedbackData.timeAccuracy ?? undefined,
              });
            }
          }
        } catch (masteryErr) {
          console.error("Error updating mastery levels:", masteryErr);
        }
      }

      res.json({ 
        feedback, 
        aiApproved: aiValidation.approved,
        aiAnalysis: aiValidation.analysis,
        aiRejectionReason: aiValidation.rejectionReason,
        masteryDeltas, 
        message: aiValidation.approved ? "Feedback saved successfully" : "Revision needed" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error saving mission feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // Confirm mission completion (when user clicks "Got it" after AI approval)
  app.post("/api/missions/:id/confirm-complete", requireAuth, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      const mission = await storage.getMissionById(missionId);
      if (!mission) {
        res.status(404).json({ error: "Mission not found" });
        return;
      }

      // Check if feedback was approved by AI
      const feedback = await storage.getMissionFeedback(missionId);
      if (!feedback?.aiApproved) {
        res.status(400).json({ error: "Mission has not been approved by AI" });
        return;
      }

      await storage.completeMission(missionId);
      res.json({ message: "Mission completed successfully" });
    } catch (error) {
      console.error("Error confirming mission completion:", error);
      res.status(500).json({ error: "Failed to complete mission" });
    }
  });

  // Get completed missions for the file explorer view
  app.get("/api/completed-missions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const completedMissions = await storage.getCompletedMissions(userId);
      res.json(completedMissions);
    } catch (error) {
      console.error("Error fetching completed missions:", error);
      res.status(500).json({ error: "Failed to fetch completed missions" });
    }
  });

  // Get full mission details including feedback for report view
  app.get("/api/missions/:id/report", requireAuth, async (req, res) => {
    try {
      const missionId = parseInt(req.params.id);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      const missionDetails = await storage.getMissionWithFullDetails(missionId);
      if (!missionDetails) {
        res.status(404).json({ error: "Mission not found" });
        return;
      }

      res.json(missionDetails);
    } catch (error) {
      console.error("Error fetching mission report:", error);
      res.status(500).json({ error: "Failed to fetch mission report" });
    }
  });

  app.get("/api/archive/:missionId/proof", async (req, res) => {
    try {
      const missionId = parseInt(req.params.missionId);
      if (isNaN(missionId)) {
        res.status(400).json({ error: "Invalid mission ID" });
        return;
      }

      const proofs = await storage.getProofsByMissionId(missionId);
      if (!proofs || proofs.length === 0) {
        res.status(404).json({ error: "No proof found" });
        return;
      }

      const proof = proofs[0];
      const filePath = path.join(
        FORGE_KB_PATH,
        proof.fileName.split("_")[0],
        proof.fileName
      );

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "File not found on server" });
        return;
      }

      const mimeType = getMimeType(filePath);
      res.setHeader("Content-Type", mimeType);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error retrieving proof:", error);
      res.status(500).json({ error: "Failed to retrieve proof" });
    }
  });

  app.post("/api/export-portfolio", requireAuth, async (req, res) => {
    try {
      const portfolioContent = await storage.generatePortfolio(undefined, undefined, req.session.userId);
      const portfolioPath = path.join(FORGE_KB_PATH, "portfolio", "portfolio.md");
      fs.writeFileSync(portfolioPath, portfolioContent);

      res.json({ message: "Portfolio exported", path: portfolioPath });
    } catch (error) {
      console.error("Error exporting portfolio:", error);
      res.status(500).json({ error: "Failed to export portfolio" });
    }
  });

  // Unified ingest endpoint - uploads file and runs full pipeline
  app.post("/api/ingest", requireAuth, ingestUpload.single("file"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const courseCode = (req.body.courseCode || "").toUpperCase();
      const userCourses = await storage.getCourses(userId);
      const course = userCourses.find((c: any) => c.code === courseCode);

      if (!course) {
        try { fs.unlinkSync(req.file.path); } catch {}
        res.status(400).json({ error: `Course "${courseCode}" not found. Please create the course first.` });
        return;
      }

      // Check for duplicate files (same name + size in same course)
      const existingFiles = await db.select().from(uploadedFiles).where(
        and(
          eq(uploadedFiles.courseCode, courseCode),
          eq(uploadedFiles.fileName, req.file.filename),
          eq(uploadedFiles.fileSize, req.file.size)
        )
      );

      if (existingFiles.length > 0 && existingFiles[0].stage === "completed") {
        // Duplicate found and already completed - reuse results
        try { fs.unlinkSync(req.file.path); } catch {}
        const duplicate = existingFiles[0];
        console.log(`[Ingest] Duplicate file detected: ${req.file.filename} (reusing file ID ${duplicate.id})`);

        return res.json({
          success: true,
          fileId: duplicate.id,
          fileName: duplicate.originalName,
          stage: "completed",
          isDuplicate: true,
          message: "Duplicate file detected - using cached results",
          concepts: duplicate.concepts ? JSON.parse(duplicate.concepts) : undefined,
          summary: duplicate.summary
        });
      }

      // Move file from temp to course uploads directory (user-scoped)
      const courseDir = path.join(FORGE_KB_PATH, `user_${userId}`, courseCode);
      const uploadsDir = path.join(courseDir, "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const targetPath = path.join(uploadsDir, req.file.filename);
      fs.renameSync(req.file.path, targetPath);

      // Create file record
      const uploadedFile = await storage.createUploadedFile({
        userId,
        courseCode,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        stage: "uploaded",
        stageProgress: 0,
      });

      // Start pipeline in background (don't block response)
      const { runPipeline } = await import("./llm/ingestPipeline");
      runPipeline(uploadedFile.id, userId).catch((err: any) => {
        console.error(`[Ingest] Pipeline failed for file ${uploadedFile.id}:`, err);
        // Update file with error status
        storage.updateUploadedFile(uploadedFile.id, {
          stage: "failed",
          error: err instanceof Error ? err.message : String(err)
        }).catch(e => console.error("Failed to update error status:", e));
      });

      res.json({
        success: true,
        fileId: uploadedFile.id,
        fileName: uploadedFile.originalName,
        stage: "uploaded",
        message: "File uploaded, processing started"
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get pipeline status for a file
  app.get("/api/ingest/status/:id", requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }

      const { getPipelineStatus } = await import("./llm/ingestPipeline");
      const status = await getPipelineStatus(fileId);

      if (!status) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.json(status);
    } catch (error) {
      console.error("Error getting status:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // List uploaded files for a course
  app.get("/api/ingest/files", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const courseCode = (req.query.courseCode as string || "").toUpperCase();
      if (!courseCode) {
        res.status(400).json({ error: "courseCode is required" });
        return;
      }

      const { getCourseFiles } = await import("./llm/ingestPipeline");
      const files = await getCourseFiles(courseCode, userId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // RAG multi-file ingest endpoint (accepts up to 5 files, 50MB each)
  app.post("/api/ingest/rag", requireAuth, ingestUpload.array("files", 5), async (req, res) => {
    try {
      const userId = req.session.userId!;
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "Document ingestion requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files provided" });
        return;
      }

      const courseCode = (req.body.courseCode || "").toUpperCase();

      const userCourses = await storage.getCourses(userId);
      const course = userCourses.find((c: any) => c.code === courseCode);

      if (!course) {
        res.status(400).json({ error: `Course "${courseCode}" not found. Please create the course first.` });
        return;
      }

      const validation = validateFiles(files.map(f => ({ size: f.size, originalname: f.originalname })));
      if (!validation.valid) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        res.status(400).json({ error: validation.error });
        return;
      }

      const fileData = files.map(f => ({
        path: f.path,
        originalname: f.originalname,
        size: f.size,
      }));

      const result = await ingestFiles(courseCode, fileData);

      if (result.status === "accepted") {
        res.status(202).json({
          status: "accepted",
          jobId: result.jobId,
          message: "Large upload queued for background processing",
          concepts: [],
          summary: "",
        });
      } else {
        // Extract concepts from the ingested files
        let allConcepts: any[] = [];
        let extractedSummary = "";

        try {
          // Combine text from all files for concept extraction
          let combinedText = "";
          for (const file of files) {
            try {
              const mimeType = getMimeType(file.path);
              const fileText = await analyzeDocumentText(file.path, mimeType);
              combinedText += fileText + "\n\n";
            } catch (e) {
              console.error(`Error extracting text from ${file.originalname}:`, e);
            }
          }

          // Extract concepts if we have text
          if (combinedText.trim().length > 50) {
            const conceptResult = await extractConcepts(combinedText, courseCode);
            allConcepts = conceptResult.concepts;
            extractedSummary = conceptResult.summary;

            // Context is now stored in database via loadContextForCourse
            // Concept extraction results are returned in the response
          }
        } catch (e) {
          console.error("Error extracting concepts:", e);
          // Don't fail the upload if concept extraction fails
        }

        res.json({
          status: "ok",
          chunksAdded: result.chunksAdded,
          files: result.files,
          concepts: allConcepts,
          summary: extractedSummary,
        });
      }
    } catch (error) {
      console.error("Error in RAG ingest:", error);
      res.status(500).json({ error: "Failed to ingest files with RAG" });
    }
  });

  // Get course context (concepts and summary)
  app.get("/api/context/:courseCode", requireAuth, async (req, res) => {
    try {
      const courseCode = decodeURIComponent(req.params.courseCode);
      const userId = req.session.userId!;
      const context = await loadContextForCourse(courseCode, userId);
      res.json({
        concepts: context.concepts || [],
        summary: context.summary || "",
        lastUpdated: context.lastUpdated,
      });
    } catch (error) {
      console.error("Error fetching course context:", error);
      res.status(500).json({ error: "Failed to fetch course context" });
    }
  });

  // Get RAG ingest job status
  app.get("/api/ingest/job/:jobId", requireAuth, async (req, res) => {
    const jobStatus = getIngestJobStatus(req.params.jobId);
    if (!jobStatus) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(jobStatus);
  });

  // Ingest notes endpoint
  app.post("/api/ingest_notes", requireAuth, ingestUpload.single("file"), async (req, res) => {
    let courseCode = "";
    try {
      const userId = req.session.userId!;
      const file = req.file;
      courseCode = (req.body.courseCode || "").toUpperCase();

      if (!file || !courseCode) {
        res.status(400).json({ error: "Missing file or courseCode" });
        return;
      }

      // Check if course exists
      const courses = await storage.getCourses(userId);
      const course = courses.find((c: any) => c.code === courseCode);

      if (!course) {
        res.status(404).json({ error: `Course ${courseCode} not found` });
        return;
      }

      // Ingest the notes
      const result = await ingestNotes(courseCode, file.path);

      // Return appropriate status based on success
      if (!result.success) {
        res.status(400).json(result);
      } else {
        res.status(200).json(result);
      }
    } catch (error: any) {
      console.error("Error ingesting notes:", error);
      res.status(500).json({ 
        success: false,
        courseCode,
        extractedConcepts: 0,
        totalConcepts: 0,
        summary: "",
        concepts: [],
        error: "Failed to ingest notes",
        details: error.message || String(error)
      });
    }
  });

  // Academic commitments endpoints
  app.get("/api/commitments", requireAuth, async (req, res) => {
    try {
      const commitments = await storage.getCommitments(req.session.userId);
      res.json(commitments);
    } catch (error) {
      console.error("Error fetching commitments:", error);
      res.status(500).json({ error: "Failed to fetch commitments" });
    }
  });

  app.post("/api/commitments", requireAuth, async (req, res) => {
    try {
      const validated = insertAcademicCommitmentSchema.parse({ ...req.body, userId: req.session.userId });
      const commitment = await storage.createCommitment(validated);
      res.status(201).json(commitment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating commitment:", error);
      res.status(500).json({ error: "Failed to create commitment" });
    }
  });

  app.put("/api/commitments/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid commitment ID" });
        return;
      }

      const validated = insertAcademicCommitmentSchema.partial().parse({ ...req.body, userId: req.session.userId });
      const updated = await storage.updateCommitment(id, validated);

      if (!updated) {
        res.status(404).json({ error: "Commitment not found" });
        return;
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error updating commitment:", error);
      res.status(500).json({ error: "Failed to update commitment" });
    }
  });

  app.delete("/api/commitments/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid commitment ID" });
        return;
      }

      await storage.deleteCommitment(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting commitment:", error);
      res.status(500).json({ error: "Failed to delete commitment" });
    }
  });

  // Timetable endpoints - weekly class schedule CRUD
  app.get("/api/timetable", requireAuth, async (req, res) => {
    try {
      const timetable = await storage.getWeeklyTimetable(req.session.userId);
      res.json(timetable || []);
    } catch (error) {
      console.error("Error fetching timetable:", error);
      res.status(500).json({ error: "Failed to fetch timetable" });
    }
  });

  app.post("/api/timetable", requireAuth, async (req, res) => {
    try {
      const validated = insertAcademicCommitmentSchema.parse({ ...req.body, userId: req.session.userId });
      const result = await storage.createTimetableEntry(validated);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating timetable entry:", error);
      res.status(500).json({ error: "Failed to create timetable entry" });
    }
  });

  app.put("/api/timetable/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid timetable ID" });
        return;
      }
      const result = await storage.updateTimetableEntry(id, { ...req.body, userId: req.session.userId });
      if (!result) {
        res.status(404).json({ error: "Timetable entry not found" });
        return;
      }
      res.json(result);
    } catch (error) {
      console.error("Error updating timetable entry:", error);
      res.status(500).json({ error: "Failed to update timetable entry" });
    }
  });

  app.delete("/api/timetable/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid timetable ID" });
        return;
      }
      await storage.deleteTimetableEntry(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting timetable entry:", error);
      res.status(500).json({ error: "Failed to delete timetable entry" });
    }
  });

  // Get all schedule dates
  app.get("/api/schedule/dates", requireAuth, async (req, res) => {
    try {
      const dates = await storage.getAllScheduleDates(req.session.userId);
      res.status(200).json(dates);
    } catch (error) {
      console.error("Error fetching schedule dates:", error);
      res.status(500).json({ error: "Failed to fetch schedule dates" });
    }
  });

  // Auto-generate schedule if needed (called by cron job)
  app.post("/api/schedule/auto-generate", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated", generated: false });
      }

      const today = new Date().toISOString().split("T")[0];

      // Check if schedule already exists (finalized)
      const existing = await storage.getFinalizedSchedule(today, userId);
      if (existing) {
        return res.json({ 
          message: "Schedule already exists", 
          schedule: existing,
          generated: false 
        });
      }

      // Check if user has created their first schedule manually
      const hasCreatedFirst = await storage.hasUserCreatedFirstSchedule(userId);
      if (!hasCreatedFirst) {
        return res.status(400).json({ 
          error: "Auto-generation only allowed after you create your first schedule manually",
          generated: false 
        });
      }

      if (!isGeminiConfigured()) {
        return res.status(503).json({ 
          error: "AI scheduling requires GEMINI_API_KEY",
          generated: false
        });
      }

      // Generate schedule automatically
      const commitments = await storage.getCommitmentsForDate(today, userId);
      const missions = await storage.getMissionsByDate(today, userId);
      const deadlines = await storage.getDeadlines(userId);
      const books = await storage.getBooks(userId);
      const allSettings = await storage.getSettings(userId);
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => { settingsObj[s.key] = s.value; });

      const courseContexts = loadAllCourseContexts();
      const preferences = await storage.getUserPreferences(userId);
      const activities = await storage.getActiveActivities(userId);
      const unifiedContext = await buildUnifiedContext(userId);

      const generated = await generateDailySchedule({
        date: today,
        commitments: commitments.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          courseId: c.courseId || undefined,
          description: c.description || undefined,
          startTime: c.startTime,
          endTime: c.endTime,
          priority: c.priority || 1,
        })),
        missions: missions.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          courseCode: m.courseCode,
          status: m.status || "pending",
          estimatedDuration: m.estimatedDuration || undefined,
          difficulty: m.difficulty || undefined,
          energyLevel: m.energyLevel || undefined,
          materials: safeParseJsonArray(m.materials),
          proofRequirement: m.proofRequirement || undefined,
        })),
        settings: {
          targetDuration: parseInt(settingsObj.targetDuration || "20"),
          missionFocus: settingsObj.missionFocus || "practical application",
        },
        courseContexts,
        deadlines: deadlines.map(d => ({
          id: d.id,
          title: d.title,
          dueDate: d.dueDate,
          priority: d.priority || 2,
        })),
        userPreferences: preferences || undefined,
        activities,
        books: books.map(b => ({
          id: b.id,
          title: b.title,
          author: b.author,
          totalPages: b.totalPages,
          currentPage: b.currentPage,
          currentChapter: b.currentChapter,
          totalChapters: b.totalChapters,
        })),
        unifiedContext,
      });

      // First save as draft
      await storage.saveDraftSchedule({
        scheduleDate: today,
        scheduleData: JSON.stringify(generated.timeBlocks),
        source: "ai_generated",
        aiReasoning: generated.reasoning,
        isFinalized: false,
        userId,
      });

      // Then immediately finalize it
      const finalizedSchedule = await storage.finalizeDraftSchedule(today);

      // Track activity usage
      try {
        const allActivities = await storage.getActivityLibrary(userId);
        const activityMap = new Map(allActivities.map(a => [a.name.toLowerCase(), a.id]));

        for (const block of generated.timeBlocks) {
          const blockTitle = (block.title).toLowerCase();
          const activityId = activityMap.get(blockTitle);
          if (activityId) {
            await storage.incrementActivityUsage(activityId);
          }
        }
      } catch (err) {
        console.log("Note: Could not update activity usage", err);
      }

      res.json({
        message: "Schedule auto-generated and finalized successfully",
        schedule: {
          ...finalizedSchedule,
          timeBlocks: generated.timeBlocks,
        },
        generated: true
      });
    } catch (error) {
      console.error("Error auto-generating schedule:", error);
      res.status(500).json({ error: "Failed to auto-generate schedule", generated: false });
    }
  });

  // Get today's FINALIZED schedule only (no auto-generation)
  app.get("/api/schedule/today", requireAuth, async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const finalized = await storage.getFinalizedSchedule(today, req.session.userId);

      if (!finalized) {
        // Return empty schedule with proper structure
        return res.status(200).json({
          id: 0,
          scheduleDate: today,
          scheduleData: "[]",
          timeBlocks: [],
          generatedAt: new Date().toISOString(),
          aiReasoning: null,
          source: null
        });
      }

      res.status(200).json({
        ...finalized,
        timeBlocks: JSON.parse(finalized.scheduleData),
      });
    } catch (error) {
      console.error("Error fetching today's schedule:", error);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  // Get schedule for a specific date
  app.get("/api/schedule/:date", requireAuth, async (req, res) => {
    try {
      const { date } = req.params;
      if (!date) {
        res.status(400).json({ error: "Date is required" });
        return;
      }

      const schedule = await storage.getScheduleForDate(date, req.session.userId!);

      if (!schedule) {
        return res.status(200).json({
          id: 0,
          scheduleDate: date,
          scheduleData: "[]",
          timeBlocks: [],
          generatedAt: new Date().toISOString(),
          aiReasoning: null
        });
      }

      res.status(200).json({
        ...schedule,
        timeBlocks: JSON.parse(schedule.scheduleData),
      });
    } catch (error) {
      console.error("Error fetching schedule:", error);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  // DPM: Draft schedule CRUD - Get only, no auto-generation
  app.get("/api/schedule/draft/:date", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { date } = req.params;
      if (!date) {
        res.status(400).json({ error: "Date is required" });
        return;
      }

      let draft = await storage.getDraftSchedule(date, userId!);

      // Do not auto-generate draft schedules - users must explicitly request generation
      res.json({
        ...draft,
        timeBlocks: draft ? JSON.parse(draft.scheduleData) : [],
      });
    } catch (error) {
      console.error("Error fetching draft schedule:", error);
      res.status(500).json({ error: "Failed to fetch draft schedule" });
    }
  });

  app.post("/api/schedule/generate", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "AI scheduling requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }

      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split("T")[0];

      const commitments = await storage.getCommitmentsForDate(targetDate, userId);
      const missions = await storage.getMissionsByDate(targetDate, userId);
      const deadlines = await storage.getDeadlines(userId);
      const books = await storage.getBooks(userId);
      const allSettings = await storage.getSettings(userId);
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => { settingsObj[s.key] = s.value; });

      // Get user patterns from recent feedback
      const patterns = await storage.getAllUserPatterns(userId!);
      const userPatterns = patterns.length > 0 ? patterns[0] : null;

      const courseContexts = loadAllCourseContexts();
      const unifiedContext = await buildUnifiedContext(userId!);

      const generated = await generateDailySchedule({
        date: targetDate,
        commitments: commitments.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          courseId: c.courseId || undefined,
          description: c.description || undefined,
          startTime: c.startTime,
          endTime: c.endTime,
          priority: c.priority || 1,
        })),
        missions: missions.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          courseCode: m.courseCode,
          status: m.status || "pending",
          estimatedDuration: m.estimatedDuration || undefined,
          difficulty: m.difficulty || undefined,
          energyLevel: m.energyLevel || undefined,
          materials: safeParseJsonArray(m.materials),
          proofRequirement: m.proofRequirement || undefined,
        })),
        settings: {
          targetDuration: parseInt(settingsObj.targetDuration || "20"),
          missionFocus: settingsObj.missionFocus || "practical application",
        },
        courseContexts,
        deadlines: deadlines.map(d => ({
          id: d.id,
          title: d.title,
          dueDate: d.dueDate,
          priority: d.priority || 2,
        })),
        books: books.map(b => ({
          id: b.id,
          title: b.title,
          author: b.author,
          totalPages: b.totalPages,
          currentPage: b.currentPage,
          currentChapter: b.currentChapter,
          totalChapters: b.totalChapters,
        })),
        unifiedContext,
      });

      const schedule = await storage.saveSchedule({
        scheduleDate: targetDate,
        scheduleData: JSON.stringify(generated.timeBlocks),
        aiReasoning: generated.reasoning,
        source: "manual",
        userId,
      });

      res.json({
        ...schedule,
        timeBlocks: generated.timeBlocks,
      });
    } catch (error) {
      console.error("Error generating schedule:", error);
      res.status(500).json({ error: "Failed to generate schedule" });
    }
  });

  // Generate draft schedule with AI
  app.post("/api/schedule/draft/generate", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "AI scheduling requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }

      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split("T")[0];

      const commitments = await storage.getCommitmentsForDate(targetDate, userId);
      const missions = await storage.getMissionsByDate(targetDate, userId);
      const deadlines = await storage.getDeadlines(userId);
      const books = await storage.getBooks(userId);
      const allSettings = await storage.getSettings(userId);
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => { settingsObj[s.key] = s.value; });

      const patterns = await storage.getAllUserPatterns(userId!);
      const userPatterns = patterns.length > 0 ? patterns[0] : null;

      const userPrefs = await storage.getUserPreferences(userId!);
      const activities = await storage.getActivityLibrary(userId);

      const courseContexts = loadAllCourseContexts();
      const unifiedContext = await buildUnifiedContext(userId!);

      const generated = await generateDailySchedule({
        date: targetDate,
        commitments: commitments.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          courseId: c.courseId || undefined,
          description: c.description || undefined,
          startTime: c.startTime,
          endTime: c.endTime,
          priority: c.priority || 1,
        })),
        missions: missions.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          courseCode: m.courseCode,
          status: m.status || "pending",
          estimatedDuration: m.estimatedDuration || undefined,
          difficulty: m.difficulty || undefined,
          energyLevel: m.energyLevel || undefined,
          materials: safeParseJsonArray(m.materials),
          proofRequirement: m.proofRequirement || undefined,
        })),
        settings: {
          targetDuration: parseInt(settingsObj.targetDuration || "20"),
          missionFocus: settingsObj.missionFocus || "practical application",
        },
        courseContexts,
        deadlines: deadlines.map(d => ({
          id: d.id,
          title: d.title,
          dueDate: d.dueDate,
          priority: d.priority || 2,
        })),
        userPreferences: userPrefs || undefined,
        activities,
        books: books.map(b => ({
          id: b.id,
          title: b.title,
          author: b.author,
          totalPages: b.totalPages,
          currentPage: b.currentPage,
          currentChapter: b.currentChapter,
          totalChapters: b.totalChapters,
        })),
        unifiedContext,
      });

      const draft = await storage.saveDraftSchedule({
        scheduleDate: targetDate,
        scheduleData: JSON.stringify(generated.timeBlocks),
        source: "ai_generated",
        aiReasoning: generated.reasoning,
        isFinalized: false,
        userId: req.session.userId,
      });

      res.json({
        ...draft,
        timeBlocks: generated.timeBlocks,
      });
    } catch (error) {
      console.error("Error generating draft schedule:", error);
      res.status(500).json({ error: "Failed to generate draft schedule" });
    }
  });

  // Deadline endpoints
  app.get("/api/deadlines", requireAuth, async (req, res) => {
    try {
      const deadlines = await storage.getDeadlines(req.session.userId);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching deadlines:", error);
      res.status(500).json({ error: "Failed to fetch deadlines" });
    }
  });

  app.post("/api/deadlines", requireAuth, async (req, res) => {
    try {
      const { id, ...deadlineData } = req.body;
      const { insertDeadlineSchema } = await import("@shared/schema");
      const validated = insertDeadlineSchema.parse({
        ...deadlineData,
        userId: req.session.userId,
      });

      if (id) {
        const updated = await storage.updateDeadline(id, validated);
        if (!updated) {
          res.status(404).json({ error: "Deadline not found" });
          return;
        }
        res.json(updated);
      } else {
        const created = await storage.createDeadline(validated);
        res.status(201).json(created);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error saving deadline:", error);
      res.status(500).json({ error: "Failed to save deadline" });
    }
  });

  app.delete("/api/deadlines/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid deadline ID" });
        return;
      }
      await storage.deleteDeadline(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting deadline:", error);
      res.status(500).json({ error: "Failed to delete deadline" });
    }
  });

  app.get("/api/feedback", requireAuth, async (req, res) => {
    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const feedback = await storage.getFeedbackInRange(startDate, endDate, req.session.userId!);
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.get("/api/feedback/:date", requireAuth, async (req, res) => {
    try {
      const { date } = req.params;
      const feedback = await storage.getDailyFeedback(date, req.session.userId!);
      res.json(feedback || {});
    } catch (error) {
      console.error("Error fetching daily feedback:", error);
      res.status(500).json({ error: "Failed to fetch daily feedback" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { feedbackDate, overallRating, energyLevel, focusLevel, distractions, notes } = req.body;

      if (!feedbackDate) {
        res.status(400).json({ error: "feedbackDate is required" });
        return;
      }

      const existing = await storage.getDailyFeedback(feedbackDate, req.session.userId!);
      let result;

      if (existing) {
        result = await storage.updateDailyFeedback(feedbackDate, {
          completionRating: overallRating || null,
          energyLevel: energyLevel || null,
          notes: notes || null,
        });
      } else {
        result = await storage.createDailyFeedback({
          feedbackDate,
          userId: req.session.userId,
          completionRating: overallRating || null,
          energyLevel: energyLevel || null,
          notes: notes || null,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error saving daily feedback:", error);
      res.status(500).json({ error: "Failed to save daily feedback" });
    }
  });

  app.post("/api/feedback/block", requireAuth, async (req, res) => {
    try {
      const { scheduleDate, blockStartTime, completed, skipped, skipReason, customSkipReason, energyLevel, accuracy, difficulty, topicsCovered, comments } = req.body;

      if (!scheduleDate || !blockStartTime) {
        res.status(400).json({ error: "scheduleDate and blockStartTime are required" });
        return;
      }

      const validated = insertScheduleBlockFeedbackSchema.parse({
        scheduleDate,
        blockStartTime,
        completed: completed || false,
        skipped: skipped || false,
        skipReason: skipReason || null,
        customSkipReason: customSkipReason || null,
        energyLevel: energyLevel ? parseInt(energyLevel) : null,
        accuracy: accuracy ? String(accuracy) : null,
        difficulty: difficulty ? parseInt(difficulty) : null,
        topicsCovered: topicsCovered || null,
        comments: comments || null,
      });

      const result = await storage.saveScheduleBlockFeedback(validated);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error saving block feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  app.get("/api/feedback/block/:date/:time", requireAuth, async (req, res) => {
    try {
      const { date, time } = req.params;
      const feedback = await storage.getScheduleBlockFeedback(date, time, req.session.userId!);
      res.json(feedback || null);
    } catch (error) {
      console.error("Error fetching block feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Pattern analysis endpoint - triggers pattern extraction from recent feedback
  app.post("/api/patterns/analyze", requireAuth, async (req, res) => {
    try {
      await updateUserPatterns();
      const patterns = await storage.getAllUserPatterns(req.session.userId!);
      const patternsObj: Record<string, any> = {};
      patterns.forEach(p => {
        patternsObj[p.patternType] = {
          value: p.patternValue,
          confidence: parseFloat(p.confidence || "0"),
        };
      });
      res.json({ success: true, patterns: patternsObj });
    } catch (error) {
      console.error("Error analyzing patterns:", error);
      res.status(500).json({ error: "Failed to analyze patterns" });
    }
  });

  // =============== DPM: User Preferences Endpoints ===============
  app.get("/api/preferences", requireAuth, async (req, res) => {
    try {
      let prefs = await storage.getUserPreferences(req.session.userId);
      if (!prefs) {
        // Create default preferences if none exist
        prefs = await storage.saveUserPreferences({
          userId: req.session.userId,
          wakeTime: "06:00",
          sleepTime: "22:00",
          targetWorkHours: 6,
          targetFreeHours: 4,
          targetOtherHours: 4,
          consecutiveStudyLimit: 90,
          personalGoals: "",
          scheduleGenerationTime: "06:00",
        });
      }
      res.json(prefs);
    } catch (error) {
      console.error("Error fetching preferences:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.post("/api/preferences", requireAuth, async (req, res) => {
    try {
      const { insertUserPreferencesSchema } = await import("@shared/schema");
      const validated = insertUserPreferencesSchema.parse({ ...req.body, userId: req.session.userId });
      const result = await storage.saveUserPreferences(validated);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error saving preferences:", error);
      res.status(500).json({ error: "Failed to save preferences" });
    }
  });

  // =============== Schedule Drift Detection Endpoints ===============

  // Get unresolved drift events for a date
  app.get("/api/schedule-drift/:date", requireAuth, async (req, res) => {
    try {
      const date = req.params.date;
      const events = await storage.getUnresolvedDriftEvents(date, req.session.userId!);
      res.json(events);
    } catch (error) {
      console.error("Error fetching drift events:", error);
      res.status(500).json({ error: "Failed to fetch drift events" });
    }
  });

  // Check for drift when block feedback is submitted
  app.post("/api/schedule-drift/check", requireAuth, async (req, res) => {
    try {
      const { scheduleDate, blockStartTime, blockTitle, plannedDuration, actualDuration } = req.body;

      // Calculate drift
      const driftMinutes = actualDuration - plannedDuration;

      // Only create drift event if significant (> 10 minutes overrun)
      if (driftMinutes <= 10) {
        res.json({ drift: false, driftMinutes });
        return;
      }

      // Get the schedule for this date to count remaining blocks
      const schedule = await storage.getScheduleForDate(scheduleDate, req.session.userId!);
      let affectedBlocksCount = 0;

      if (schedule) {
        const blocks = JSON.parse(schedule.scheduleData);
        // Count blocks that start after this block
        affectedBlocksCount = blocks.filter((b: any) => b.startTime > blockStartTime).length;
      }

      // Get existing drift events to calculate cumulative drift
      const existingDriftEvents = await storage.getDriftEventsForDate(scheduleDate, req.session.userId!);
      const previousDrift = existingDriftEvents.reduce((sum, e) => sum + e.driftMinutes, 0);
      const cumulativeDrift = previousDrift + driftMinutes;

      // Create drift event
      const { insertScheduleDriftEventSchema } = await import("@shared/schema");
      const eventData = insertScheduleDriftEventSchema.parse({
        scheduleDate,
        blockStartTime,
        blockTitle,
        plannedDuration,
        actualDuration,
        driftMinutes,
        cumulativeDrift,
        affectedBlocksCount,
      });

      const event = await storage.createDriftEvent(eventData);

      res.json({
        drift: true,
        event,
        requiresReschedule: cumulativeDrift >= 15 && affectedBlocksCount > 0,
      });
    } catch (error) {
      console.error("Error checking drift:", error);
      res.status(500).json({ error: "Failed to check drift" });
    }
  });

  // Resolve a drift event (user chose manual or AI)
  app.post("/api/schedule-drift/:id/resolve", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid drift event ID" });
        return;
      }

      const { userChoice, newScheduleData } = req.body;
      const result = await storage.resolveDriftEvent(id, userChoice, newScheduleData);

      if (!result) {
        res.status(404).json({ error: "Drift event not found" });
        return;
      }

      res.json(result);
    } catch (error) {
      console.error("Error resolving drift event:", error);
      res.status(500).json({ error: "Failed to resolve drift event" });
    }
  });

  // Get all block feedback for a date (for calculating actual vs planned)
  app.get("/api/schedule-feedback/:date", requireAuth, async (req, res) => {
    try {
      const date = req.params.date;
      const feedback = await storage.getAllBlockFeedbackForDate(date, req.session.userId!);
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching block feedback:", error);
      res.status(500).json({ error: "Failed to fetch block feedback" });
    }
  });

  // Get all block feedback for a date (for calculating actual vs planned)
  app.get("/api/schedule-feedback/:date", requireAuth, async (req, res) => {
    try {
      const date = req.params.date;
      const feedback = await storage.getAllBlockFeedbackForDate(date, req.session.userId!);
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching block feedback:", error);
      res.status(500).json({ error: "Failed to fetch block feedback" });
    }
  });

  // AI Reschedule - generate new schedule for remaining blocks (preview only, does not resolve)
  app.post("/api/schedule-drift/:id/ai-reschedule", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid drift event ID" });
        return;
      }

      const { scheduleDate, currentTime, remainingBlocks } = req.body;

      // Get user preferences for constraints
      const preferences = await storage.getUserPreferences(req.session.userId!);

      // Generate AI rescheduled suggestion
      const aiSuggestion = await generateReschedule(
        scheduleDate,
        currentTime,
        remainingBlocks,
        preferences
      );

      // Store the AI suggestion without resolving the event
      // The event will be resolved when user applies the changes via handleApplyAI
      await storage.storeAISuggestion(id, JSON.stringify(aiSuggestion));

      res.json({
        success: true,
        rescheduledBlocks: aiSuggestion,
      });
    } catch (error) {
      console.error("Error generating AI reschedule:", error);
      res.status(500).json({ error: "Failed to generate AI reschedule" });
    }
  });

  // =============== DPM: Activity Library Endpoints ===============
  app.get("/api/activities", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (userId) {
        await storage.seedDefaultActivities(userId);
      }
      const activities = await storage.getActivityLibrary(userId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  app.post("/api/activities", requireAuth, async (req, res) => {
    try {
      const { insertActivityLibrarySchema } = await import("@shared/schema");
      const validated = insertActivityLibrarySchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      const result = await storage.createActivity(validated);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating activity:", error);
      res.status(500).json({ error: "Failed to create activity" });
    }
  });

  app.put("/api/activities/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid activity ID" });
        return;
      }
      const result = await storage.updateActivity(id, { ...req.body, userId: req.session.userId });
      if (!result) {
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      res.json(result);
    } catch (error) {
      console.error("Error updating activity:", error);
      res.status(500).json({ error: "Failed to update activity" });
    }
  });

  app.delete("/api/activities/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid activity ID" });
        return;
      }
      await storage.deleteActivity(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ error: "Failed to delete activity" });
    }
  });

  app.post("/api/schedule/recent-as-draft", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split("T")[0];

      // Get recent schedules (up to 30 days back)
      const recentSchedules = await storage.getSchedulesForDateRange(30, userId);

      if (!recentSchedules || recentSchedules.length === 0) {
        res.status(404).json({ error: "No recent schedule found" });
        return;
      }

      // Get the most recent one
      const recentSchedule = recentSchedules[0];
      const recentBlocks = JSON.parse(recentSchedule.scheduleData);

      const draft = await storage.saveDraftSchedule({
        scheduleDate: targetDate,
        scheduleData: JSON.stringify(recentBlocks),
        source: "recent",
        aiReasoning: "Loaded from your recent schedule",
        isFinalized: false,
        userId: userId,
      });

      res.json({
        ...draft,
        timeBlocks: recentBlocks,
      });
    } catch (error) {
      console.error("Error loading recent schedule:", error);
      res.status(500).json({ error: "Failed to load recent schedule" });
    }
  });

  app.post("/api/schedule/chat-build", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "AI chat building requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }

      const { date, prompt } = req.body;

      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ error: "Chat prompt is required" });
        return;
      }

      const targetDate = date || new Date().toISOString().split("T")[0];

      const commitments = await storage.getCommitmentsForDate(targetDate, userId);
      const missions = await storage.getMissionsByDate(targetDate, userId);
      const deadlines = await storage.getDeadlines(userId);
      const books = await storage.getBooks(userId);
      const allSettings = await storage.getSettings(userId);
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => { settingsObj[s.key] = s.value; });

      // Get user preferences for DPM
      const userPrefs = await storage.getUserPreferences(userId);
      const activities = await storage.getActiveActivities(userId);

      const courseContexts = loadAllCourseContexts();
      const unifiedContext = await buildUnifiedContext(userId);

      const generated = await generateDailySchedule({
        date: targetDate,
        commitments: commitments.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          courseId: c.courseId || undefined,
          description: c.description || undefined,
          startTime: c.startTime,
          endTime: c.endTime,
          priority: c.priority || 1,
        })),
        missions: missions.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          courseCode: m.courseCode,
          status: m.status || "pending",
          estimatedDuration: m.estimatedDuration || undefined,
          difficulty: m.difficulty || undefined,
          energyLevel: m.energyLevel || undefined,
          materials: safeParseJsonArray(m.materials),
          proofRequirement: m.proofRequirement || undefined,
        })),
        settings: {
          targetDuration: parseInt(settingsObj.targetDuration || "20"),
          missionFocus: settingsObj.missionFocus || "practical application",
        },
        courseContexts,
        deadlines: deadlines.map(d => ({
          id: d.id,
          title: d.title,
          dueDate: d.dueDate,
          priority: d.priority || 2,
        })),
        userPreferences: userPrefs || undefined,
        activities,
        books: books.map(b => ({
          id: b.id,
          title: b.title,
          author: b.author,
          totalPages: b.totalPages,
          currentPage: b.currentPage,
          currentChapter: b.currentChapter,
          totalChapters: b.totalChapters,
        })),
        chatPrompt: prompt,
        unifiedContext,
      });

      const draft = await storage.saveDraftSchedule({
        scheduleDate: targetDate,
        scheduleData: JSON.stringify(generated.timeBlocks),
        source: "chat",
        chatPrompt: prompt,
        aiReasoning: generated.reasoning,
        isFinalized: false,
        userId: req.session.userId,
      });

      res.json({
        ...draft,
        timeBlocks: generated.timeBlocks,
      });
    } catch (error) {
      console.error("Error generating chat schedule:", error);
      res.status(500).json({ error: "Failed to generate schedule from chat" });
    }
  });

  // Finalize draft schedule
  app.post("/api/schedule/draft/finalize", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split("T")[0];

      const schedule = await storage.finalizeDraftSchedule(targetDate, userId);
      if (!schedule) {
        res.status(404).json({ error: "No draft schedule found to finalize" });
        return;
      }

      // Mark that user has created their first schedule (if this is their first)
      const hasCreatedFirst = await storage.hasUserCreatedFirstSchedule(userId);
      if (!hasCreatedFirst) {
        await storage.markUserCreatedFirstSchedule(userId);
      }

      // Track activity usage for recently-used activities sorting
      try {
        const timeBlocks = JSON.parse(schedule.scheduleData);
        const allActivities = await storage.getActivityLibrary(userId);
        const activityMap = new Map(allActivities.map(a => [a.name.toLowerCase(), a.id]));

        for (const block of timeBlocks) {
          const blockTitle = (block.title || block.activity || "").toLowerCase();
          const activityId = activityMap.get(blockTitle);
          if (activityId) {
            await storage.incrementActivityUsage(activityId);
          }
        }
      } catch (err) {
        console.log("Note: Could not update activity usage for this schedule", err);
      }

      res.json({
        ...schedule,
        timeBlocks: JSON.parse(schedule.scheduleData),
      });
    } catch (error) {
      console.error("Error finalizing schedule:", error);
      res.status(500).json({ error: "Failed to finalize schedule" });
    }
  });

  // Enrich schedule with AI-generated details
  app.post("/api/schedule/enrich", requireAuth, async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "Schedule enrichment requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }

      const { scheduleDate, timeBlocks } = req.body;

      if (!scheduleDate || !timeBlocks || !Array.isArray(timeBlocks)) {
        res.status(400).json({ error: "scheduleDate and timeBlocks array are required" });
        return;
      }

      // Get original draft to compare changes
      const originalDraft = await storage.getDraftSchedule(scheduleDate, req.session.userId!);
      const originalBlocks = originalDraft ? JSON.parse(originalDraft.scheduleData) : [];

      const { enrichScheduleBlocks } = await import("./llm/planner");
      const result = await enrichScheduleBlocks(scheduleDate, timeBlocks, originalBlocks);

      res.json(result);
    } catch (error) {
      console.error("Error enriching schedule:", error);
      res.status(500).json({ error: "Failed to enrich schedule" });
    }
  });

  // Process edited schedule blocks - reprocess with AI awareness of changes
  app.post("/api/schedule/process-edits", requireAuth, async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "Schedule editing requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }
      const { date, editedBlocks, originalBlocks } = req.body;
      const { enrichScheduleBlocks } = await import("./llm/planner");
      const result = await enrichScheduleBlocks(date, editedBlocks, originalBlocks);
      res.json({
        timeBlocks: result.enrichedBlocks,
        unknownActivities: result.unknownActivities,
        aiReasoning: "Schedule reprocessed based on your edits",
      });
    } catch (error) {
      console.error("Error processing edits:", error);
      res.status(500).json({ error: "Failed to process edits" });
    }
  });

  // Update draft schedule with edited blocks
  app.post("/api/schedule/draft/update", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { date, scheduleData } = req.body;
      if (!date || !scheduleData) {
        res.status(400).json({ error: "date and scheduleData are required" });
        return;
      }

      const draft = await storage.saveDraftSchedule({
        scheduleDate: date,
        scheduleData: scheduleData,
        source: "edited",
        isFinalized: false,
        userId: userId,
      });

      const timeBlocks = JSON.parse(scheduleData);
      res.json({
        ...draft,
        timeBlocks,
      });
    } catch (error) {
      console.error("Error updating draft schedule:", error);
      res.status(500).json({ error: "Failed to update draft schedule" });
    }
  });

  // PROCESS button handler: Save edits → Collect data → Filter with Groq → Generate with Gemini
  app.post("/api/schedule/process", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "Schedule processing requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }
      const { date, timeBlocks } = req.body;
      if (!date || !timeBlocks) {
        res.status(400).json({ error: "date and timeBlocks required" });
        return;
      }

      // Step 1: Save edits to draft
      await storage.saveDraftSchedule({
        scheduleDate: date,
        scheduleData: JSON.stringify(timeBlocks),
        source: "edited",
        isFinalized: false,
        userId: userId,
      });

      // Step 2: Collect user data for context
      const { generateUserDataReport } = await import("./llm/dataReportGenerator");
      const userDataReport = await generateUserDataReport(storage, userId as number, date);

      // Step 3: Filter relevant details and generate content for each block
      const { filterRelevantDetails } = await import("./llm/detailsFilter");
      const { generateActivityDetails } = await import("./llm/detailsGenerator");

      // Sequential processing with full schedule context for better AI understanding
      const enrichedBlocks: any[] = [];
      for (let i = 0; i < timeBlocks.length; i++) {
        const block = timeBlocks[i];
        try {
          // Filter which detail fields are relevant
          const relevantFields = await filterRelevantDetails(
            block.title,
            block.description,
            block.type
          );

          // Build schedule context for this block
          const scheduleContext = {
            timeOfDay: block.currentTimeSlot || getTimeOfDayLabel(block.startTime),
            movedFromTimeSlot: block.movedFromTimeSlot,
            previousActivities: enrichedBlocks.slice(-2).map(b => b.title),
            upcomingActivities: timeBlocks.slice(i + 1, i + 3).map((b: any) => b.title)
          };

          // Generate content for each relevant field with full context
          const details = await generateActivityDetails(
            block.title,
            block.description,
            block.type,
            relevantFields.map(f => f.name),
            {
              recentMissions: userDataReport.missions?.map((m: any) => m.title) || [],
              deadlines: userDataReport.deadlines?.map((d: any) => `${d.title} (${d.dueDate})`) || [],
              preferences: userDataReport.preferences || {},
              courses: userDataReport.courses?.map((c: any) => ({ code: c.code, name: c.name })) || [],
              feedbackPatterns: userDataReport.feedbackPatterns || {},
              knowledgeBase: userDataReport.knowledgeBase || {},
              scheduleContext
            }
          );

          enrichedBlocks.push({
            ...block,
            generatedDetails: details,
            detailFields: relevantFields
          });
        } catch (error) {
          console.error("Error enriching block:", error);
          enrichedBlocks.push(block); // Return original if enrichment fails
        }
      }

      res.json({
        success: true,
        message: "Schedule processed and details generated",
        dataReport: userDataReport,
        enrichedBlocks: enrichedBlocks
      });
    } catch (error) {
      console.error("Error processing schedule:", error);
      res.status(500).json({ error: "Failed to process schedule" });
    }
  });

  // Generate activity details with AI (used during editing)
  app.post("/api/activities/generate-details", async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "AI detail generation requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }
      const { title, description, type } = req.body;
      if (!title || !description || !type) {
        res.status(400).json({ error: "title, description, and type are required" });
        return;
      }

      const { filterRelevantDetails } = await import("./llm/detailsFilter");
      const { generateActivityDetails } = await import("./llm/detailsGenerator");

      // Filter relevant fields
      const detailFields = await filterRelevantDetails(title, description, type);

      // Generate content for each field
      const generatedDetails = await generateActivityDetails(
        title,
        description,
        type,
        detailFields.map(f => f.name)
      );

      res.json({
        detailFields,
        generatedDetails
      });
    } catch (error) {
      console.error("Error generating activity details:", error);
      res.status(500).json({ error: "Failed to generate activity details" });
    }
  });

  // Batch generate details for multiple activities (used when navigating to Stage 3)
  app.post("/api/activities/generate-details-batch", requireAuth, async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({ 
          error: "AI detail generation requires GEMINI_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GEMINI_API_KEY"
        });
        return;
      }
      const userId = req.session.userId;
      const { blocks, date } = req.body;
      if (!Array.isArray(blocks)) {
        res.status(400).json({ error: "blocks array is required" });
        return;
      }

      const { filterRelevantDetails } = await import("./llm/detailsFilter");
      const { generateActivityDetails } = await import("./llm/detailsGenerator");

      // Get user context for better AI generation
      const preferences = await storage.getUserPreferences(userId);
      const userPrefs = preferences ? {
        wakeTime: preferences.wakeTime,
        sleepTime: preferences.sleepTime,
        personalGoals: preferences.personalGoals
      } : {};

      const results = [];
      const processedActivities: Array<{ title: string; description: string; details: any }> = [];

      // Process activities SEQUENTIALLY with accumulated context
      for (const block of blocks) {
        try {
          // Filter relevant fields
          const detailFields = await filterRelevantDetails(
            block.title,
            block.description,
            block.type
          );

          // Build context from previously processed activities
          const previousActivityTitles = processedActivities.map(a => a.title);
          const previousActivityDetails = processedActivities.map(a => 
            `${a.title}: ${a.details.Description || a.description}`
          );

          // Generate content for each field WITH accumulated context
          const generatedDetails = await generateActivityDetails(
            block.title,
            block.description,
            block.type,
            detailFields.map(f => f.name),
            {
              preferences: userPrefs,
              scheduleContext: {
                timeOfDay: getTimeOfDayLabel(block.startTime),
                previousActivities: previousActivityTitles,
                upcomingActivities: blocks.slice(blocks.indexOf(block) + 1, blocks.indexOf(block) + 3).map(b => b.title)
              }
            }
          );

          results.push({
            detailFields,
            generatedDetails
          });

          // Store for next iteration's context
          processedActivities.push({
            title: block.title,
            description: block.description,
            details: generatedDetails
          });
        } catch (error) {
          console.error("Error generating details for block:", block.title, error);
          results.push({
            detailFields: [],
            generatedDetails: {}
          });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error("Error generating batch activity details:", error);
      res.status(500).json({ error: "Failed to generate batch activity details" });
    }
  });

  // Analyze activity details to determine relevant fields
  app.post("/api/activities/analyze-details", async (req, res) => {
    try {
      if (!isGroqConfigured()) {
        res.status(503).json({ 
          error: "Activity analysis requires GROQ_API_KEY. Configure it in Secrets to enable this feature.",
          missingKey: "GROQ_API_KEY"
        });
        return;
      }
      const { title, description } = req.body;
      if (!title || !description) {
        res.status(400).json({ error: "title and description are required" });
        return;
      }
      const relevantFields = await analyzeActivityDetails(title, description);
      res.json({ relevantFields });
    } catch (error) {
      console.error("Error analyzing activity details:", error);
      res.status(500).json({ error: "Failed to analyze activity details" });
    }
  });

  // ===== BOOKS CRUD =====
  app.get("/api/books", requireAuth, async (req, res) => {
    try {
      const books = await storage.getBooks(req.session.userId!);
      res.json(books);
    } catch (error) {
      console.error("Error fetching books:", error);
      res.status(500).json({ error: "Failed to fetch books" });
    }
  });

  app.get("/api/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }
      const book = await storage.getBookById(id);
      if (!book) {
        res.status(404).json({ error: "Book not found" });
        return;
      }
      res.json(book);
    } catch (error) {
      console.error("Error fetching book:", error);
      res.status(500).json({ error: "Failed to fetch book" });
    }
  });

  app.post("/api/books", requireAuth, async (req, res) => {
    try {
      const bodySchema = insertBookSchema.omit({ userId: true });
      const validated = bodySchema.parse(req.body);
      const book = await storage.createBook({
        ...validated,
        userId: req.session.userId,
      });
      res.status(201).json(book);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating book:", error);
      res.status(500).json({ error: "Failed to create book" });
    }
  });

  app.put("/api/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }
      const validated = insertBookSchema.partial().parse(req.body);
      const book = await storage.updateBook(id, validated);
      if (!book) {
        res.status(404).json({ error: "Book not found" });
        return;
      }
      res.json(book);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error updating book:", error);
      res.status(500).json({ error: "Failed to update book" });
    }
  });

  app.delete("/api/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }
      await storage.deleteBook(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting book:", error);
      res.status(500).json({ error: "Failed to delete book" });
    }
  });

  app.post("/api/books/:id/chapters", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: "Invalid book ID" });
        return;
      }
      const { chapterNumber } = req.body;
      const parsedChapter = parseInt(chapterNumber);
      if (!chapterNumber || isNaN(parsedChapter) || parsedChapter <= 0) {
        res.status(400).json({ error: "Valid positive chapterNumber is required" });
        return;
      }
      const book = await storage.getBookById(id);
      if (!book) {
        res.status(404).json({ error: "Book not found" });
        return;
      }
      const result = await storage.recordChapterCompletion(id, parsedChapter);
      res.json(result);
    } catch (error) {
      console.error("Error recording chapter completion:", error);
      res.status(500).json({ error: "Failed to record chapter completion" });
    }
  });

  app.get("/api/reading-stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getReadingStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching reading stats:", error);
      res.status(500).json({ error: "Failed to fetch reading stats" });
    }
  });

  // ===== READING LOGS =====
  app.post("/api/books/:id/reading-log", requireAuth, async (req, res) => {
    try {
      const bookId = parseInt(req.params.id);
      if (isNaN(bookId)) {
        return res.status(400).json({ error: "Invalid book ID" });
      }

      const book = await storage.getBookById(bookId);
      if (!book) {
        return res.status(404).json({ error: "Book not found" });
      }

      const { chaptersRead, timeSpentMinutes, feeling, comprehensionLevel, logDate } = req.body;
      
      const log = await storage.createReadingLog({
        userId: req.session.userId,
        bookId,
        chaptersRead: chaptersRead || 1,
        timeSpentMinutes,
        feeling,
        comprehensionLevel,
        logDate: logDate || new Date().toISOString().split('T')[0],
      });

      // Update book's current chapter progress
      if (chaptersRead && book.currentChapter !== null) {
        const newCurrentChapter = Math.min(
          (book.currentChapter || 0) + chaptersRead,
          book.totalChapters || 999
        );
        await storage.updateBook(bookId, { currentChapter: newCurrentChapter });
      }

      res.status(201).json(log);
    } catch (error) {
      console.error("Error creating reading log:", error);
      res.status(500).json({ error: "Failed to create reading log" });
    }
  });

  app.get("/api/books/:id/reading-logs", requireAuth, async (req, res) => {
    try {
      const bookId = parseInt(req.params.id);
      if (isNaN(bookId)) {
        return res.status(400).json({ error: "Invalid book ID" });
      }
      const logs = await storage.getReadingLogsForBook(bookId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching reading logs:", error);
      res.status(500).json({ error: "Failed to fetch reading logs" });
    }
  });

  app.get("/api/reading-logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getReadingLogsForUser(req.session.userId!, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching reading logs:", error);
      res.status(500).json({ error: "Failed to fetch reading logs" });
    }
  });

  // ===== COURSES CRUD =====
  app.post("/api/courses", requireAuth, async (req, res) => {
    try {
      const bodySchema = insertCourseSchema.omit({ userId: true });
      const validated = bodySchema.parse(req.body);

      // Normalize function: remove spaces and convert to lowercase
      const normalize = (str: string) => str.replace(/\s+/g, '').toLowerCase();

      // Check for duplicates
      const existingCourses = await storage.getCourses(req.session.userId);
      const normalizedCode = normalize(validated.code);
      const normalizedName = normalize(validated.name);

      const duplicate = existingCourses.find(course => {
        const existingCode = normalize(course.code);
        const existingName = normalize(course.name);
        return existingCode === normalizedCode || existingName === normalizedName;
      });

      if (duplicate) {
        const matchType = normalize(duplicate.code) === normalizedCode ? 'code' : 'name';
        const matchField = matchType === 'code' ? duplicate.code : duplicate.name;
        return res.status(400).json({ 
          error: `Course ${matchType} already exists: ${matchField}` 
        });
      }

      const course = await storage.createCourse({
        ...validated,
        userId: req.session.userId,
      });
      res.status(201).json(course);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error creating course:", error);
      res.status(500).json({ error: "Failed to create course" });
    }
  });

  app.put("/api/courses/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid course ID" });
        return;
      }
      const validated = insertCourseSchema.partial().parse(req.body);

      // Normalize function: remove spaces and convert to lowercase
      const normalize = (str: string) => str.replace(/\s+/g, '').toLowerCase();

      // Check for duplicates (excluding the current course being updated)
      if (validated.code || validated.name) {
        const existingCourses = await storage.getCourses(req.session.userId);

        const duplicate = existingCourses.find(course => {
          if (course.id === id) return false; // Skip the course being updated

          if (validated.code) {
            const normalizedCode = normalize(validated.code);
            const existingCode = normalize(course.code);
            if (existingCode === normalizedCode) return true;
          }

          if (validated.name) {
            const normalizedName = normalize(validated.name);
            const existingName = normalize(course.name);
            if (existingName === normalizedName) return true;
          }

          return false;
        });

        if (duplicate) {
          const matchType = validated.code && normalize(duplicate.code) === normalize(validated.code) ? 'code' : 'name';
          const matchField = matchType === 'code' ? duplicate.code : duplicate.name;
          return res.status(400).json({ 
            error: `Course ${matchType} already exists: ${matchField}` 
          });
        }
      }

      const course = await storage.updateCourse(id, validated);
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      res.json(course);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
        return;
      }
      console.error("Error updating course:", error);
      res.status(500).json({ error: "Failed to update course" });
    }
  });

  app.delete("/api/courses/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid course ID" });
        return;
      }

      // Get course details before deletion
      const courses = await storage.getCourses(req.session.userId);
      const course = courses.find(c => c.id === id);

      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }

      // CASCADE DELETE: Get all missions for this course first
      const courseMissions = await db.select().from(missions).where(eq(missions.courseId, id));
      const missionIds = courseMissions.map(m => m.id);

      // Delete mission feedback for all missions in this course
      for (const missionId of missionIds) {
        await db.delete(missionFeedback).where(eq(missionFeedback.missionId, missionId));
        await db.delete(proofs).where(eq(proofs.missionId, missionId));
      }

      // Delete all missions for this course
      await db.delete(missions).where(eq(missions.courseId, id));

      // Delete deadlines for this course
      await db.delete(deadlines).where(eq(deadlines.courseId, id));

      // Delete commitments for this course
      await db.delete(academicCommitments).where(eq(academicCommitments.courseId, id));

      // Delete concept tracking for this course
      await db.delete(conceptTracking).where(eq(conceptTracking.courseId, id));

      // Delete the course itself
      await storage.deleteCourse(id);

      // Delete course knowledge base directory if it exists (for all users)
      const userId = req.session.userId;
      const userCourseDir = path.join(FORGE_KB_PATH, `user_${userId}`, course.code);
      if (fs.existsSync(userCourseDir)) {
        fs.rmSync(userCourseDir, { recursive: true, force: true });
      }

      res.json({ success: true, message: `Course ${course.code} and all related data deleted` });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ error: "Failed to delete course" });
    }
  });

  // ===== CONCEPT TRACKING =====
  app.post("/api/concepts/record", requireAuth, async (req, res) => {
    try {
      const { courseId, conceptName } = req.body;
      if (!courseId || !conceptName) {
        res.status(400).json({ error: "courseId and conceptName are required" });
        return;
      }
      const concept = await storage.recordConceptCoverage(courseId, conceptName, req.session.userId!);
      res.json(concept);
    } catch (error) {
      console.error("Error recording concept:", error);
      res.status(500).json({ error: "Failed to record concept" });
    }
  });

  app.get("/api/concepts", requireAuth, async (req, res) => {
    try {
      const concepts = await storage.getAllConceptTracking(req.session.userId!);
      res.json(concepts);
    } catch (error) {
      console.error("Error fetching concepts:", error);
      res.status(500).json({ error: "Failed to fetch concepts" });
    }
  });

  app.get("/api/concepts/course/:courseId", async (req, res) => {
    try {
      const courseId = parseInt(req.params.courseId);
      if (isNaN(courseId)) {
        res.status(400).json({ error: "Invalid course ID" });
        return;
      }
      const concepts = await storage.getConceptsForCourse(courseId, req.session.userId!);
      res.json(concepts);
    } catch (error) {
      console.error("Error fetching course concepts:", error);
      res.status(500).json({ error: "Failed to fetch course concepts" });
    }
  });

  // ===== ANALYTICS =====
  app.get("/api/analytics/feedback-stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getScheduleFeedbackStats(req.session.userId!);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
      res.status(500).json({ error: "Failed to fetch feedback stats" });
    }
  });

  app.get("/api/analytics/time-per-course", requireAuth, async (req, res) => {
    try {
      const timeData = await storage.getTimePerCourse(req.session.userId!);
      res.json(timeData);
    } catch (error) {
      console.error("Error fetching time per course:", error);
      res.status(500).json({ error: "Failed to fetch time per course" });
    }
  });

  app.get("/api/analytics/productivity-by-hour", requireAuth, async (req, res) => {
    try {
      const productivityData = await storage.getProductivityByHour(req.session.userId!);
      res.json(productivityData);
    } catch (error) {
      console.error("Error fetching productivity by hour:", error);
      res.status(500).json({ error: "Failed to fetch productivity by hour" });
    }
  });

  app.get("/api/analytics/comprehensive", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const [
        feedbackStats,
        timePerCourse,
        productivityByHour,
        courses,
        deadlines,
        allConceptTracking,
        recentSchedules,
      ] = await Promise.all([
        storage.getScheduleFeedbackStats(userId!),
        storage.getTimePerCourse(userId!),
        storage.getProductivityByHour(userId!),
        storage.getCourses(userId!),
        storage.getDeadlines(userId!),
        storage.getAllConceptTracking(userId!),
        storage.getSchedulesForDateRange(30, userId!),
      ]);

      const today = new Date();
      const upcomingDeadlines = deadlines.filter(d => {
        const dueDate = new Date(d.dueDate);
        const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysRemaining >= 0 && daysRemaining <= 14;
      });

      const peakHours = productivityByHour
        .filter(h => h.completionRate >= 70 && h.avgEnergy >= 3.5)
        .map(h => h.hour)
        .slice(0, 3);

      const lowEnergyHours = productivityByHour
        .filter(h => h.avgEnergy < 2.5 || h.completionRate < 30)
        .map(h => h.hour);

      const recommendations: string[] = [];

      if (peakHours.length > 0) {
        recommendations.push(`Your peak productivity hours are around ${peakHours.map(h => `${h}:00`).join(", ")}. Schedule challenging tasks during these times.`);
      }

      if (lowEnergyHours.length > 0) {
        recommendations.push(`Energy dips detected around ${lowEnergyHours.slice(0, 3).map(h => `${h}:00`).join(", ")}. Consider lighter tasks or breaks.`);
      }

      if (feedbackStats.skippedBlocks > feedbackStats.completedBlocks * 0.3) {
        recommendations.push("You're skipping more than 30% of activities. Consider adjusting your schedule to be more realistic.");
      }

      if (feedbackStats.avgDifficulty > 4) {
        recommendations.push("Tasks are consistently rated as difficult. Consider breaking them into smaller steps.");
      }

      const topSkipReasons = Object.entries(feedbackStats.skipReasons || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topSkipReasons.some(([reason]) => reason === "fatigue")) {
        recommendations.push("Fatigue is a frequent skip reason. Consider adding more breaks or reducing workload.");
      }

      const neglectedCourses = timePerCourse.filter(c => c.totalMinutes < 60);
      for (const course of neglectedCourses.slice(0, 2)) {
        const hasUpcomingDeadline = upcomingDeadlines.some(d => d.courseId === course.courseId);
        if (hasUpcomingDeadline) {
          recommendations.push(`Warning: ${course.courseName.replace(/_/g, " ")} has upcoming deadlines but minimal study time.`);
        }
      }

      let currentStreak = 0;
      const sortedSchedules = recentSchedules.sort((a, b) => 
        new Date(b.scheduleDate).getTime() - new Date(a.scheduleDate).getTime()
      );

      for (const schedule of sortedSchedules) {
        const scheduleDate = new Date(schedule.scheduleDate);
        const daysDiff = Math.floor((today.getTime() - scheduleDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff === currentStreak || daysDiff === currentStreak + 1) {
          currentStreak++;
        } else {
          break;
        }
      }

      const courseAnalytics = courses.map(course => {
        const timeData = timePerCourse.find(t => t.courseId === course.id);
        const conceptsCovered = allConceptTracking.filter(c => c.courseId === course.id);
        const contextPath = path.join(FORGE_KB_PATH, course.code, "context.json");
        let totalConcepts = 0;
        try {
          if (fs.existsSync(contextPath)) {
            const context = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
            totalConcepts = context.concepts?.length || 0;
          }
        } catch {}

        return {
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          totalMinutes: timeData?.totalMinutes || 0,
          conceptsCovered: conceptsCovered.length,
          totalConcepts,
          progressPercent: totalConcepts > 0 ? Math.round((conceptsCovered.length / totalConcepts) * 100) : 0,
        };
      });

      res.json({
        summary: {
          totalBlocks: feedbackStats.totalBlocks,
          completedBlocks: feedbackStats.completedBlocks,
          skippedBlocks: feedbackStats.skippedBlocks,
          completionRate: feedbackStats.totalBlocks > 0 
            ? Math.round((feedbackStats.completedBlocks / feedbackStats.totalBlocks) * 100) 
            : 0,
          avgEnergyLevel: Math.round(feedbackStats.avgEnergyLevel * 10) / 10,
          avgDifficulty: Math.round(feedbackStats.avgDifficulty * 10) / 10,
          currentStreak,
          totalStudyMinutes: timePerCourse.reduce((sum, c) => sum + c.totalMinutes, 0),
        },
        skipReasons: feedbackStats.skipReasons,
        productivityByHour,
        courseAnalytics,
        upcomingDeadlines: upcomingDeadlines.map(d => ({
          ...d,
          daysRemaining: Math.ceil((new Date(d.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
        })),
        recommendations,
        peakHours,
        lowEnergyHours,
      });
    } catch (error) {
      console.error("Error fetching comprehensive analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/time-allocation", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const schedules = await storage.getSchedulesForDateRange(days, req.session.userId!);

      const dailyAllocation: { date: string; sleeping: number; working: number; freeTime: number; other: number }[] = [];

      for (const schedule of schedules) {
        try {
          const blocks = JSON.parse(schedule.scheduleData);
          let sleeping = 0, working = 0, freeTime = 0, other = 0;

          for (const block of blocks) {
            const [startH, startM] = block.startTime.split(":").map(Number);
            const [endH, endM] = block.endTime.split(":").map(Number);
            const duration = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;

            const type = (block.type || "").toLowerCase();
            if (type.includes("sleep") || type.includes("rest")) {
              sleeping += duration;
            } else if (type.includes("study") || type.includes("work") || type.includes("class") || type.includes("lecture")) {
              working += duration;
            } else if (type.includes("free") || type.includes("leisure") || type.includes("social") || type.includes("exercise")) {
              freeTime += duration;
            } else {
              other += duration;
            }
          }

          dailyAllocation.push({
            date: schedule.scheduleDate,
            sleeping: Math.round(sleeping * 10) / 10,
            working: Math.round(working * 10) / 10,
            freeTime: Math.round(freeTime * 10) / 10,
            other: Math.round(other * 10) / 10,
          });
        } catch {}
      }

      res.json(dailyAllocation);
    } catch (error) {
      console.error("Error fetching time allocation:", error);
      res.status(500).json({ error: "Failed to fetch time allocation" });
    }
  });

  // Prometheus metrics endpoint
  app.get("/metrics", (req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send(exportMetrics());
  });

  // Knowledge Chat & Learner Profile routes
  app.get("/api/knowledge/profile/:courseId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const courseId = parseInt(req.params.courseId);

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const profile = await storage.getLearnerProfile(userId, courseId);
      res.json(profile || null);
    } catch (error) {
      console.error("Error fetching learner profile:", error);
      res.status(500).json({ error: "Failed to fetch learner profile" });
    }
  });

  app.post("/api/knowledge/profile/:courseId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const courseId = parseInt(req.params.courseId);

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const profileData = {
        ...req.body,
        userId,
        courseId,
      };

      const parsed = insertLearnerProfileSchema.safeParse(profileData);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const profile = await storage.upsertLearnerProfile(parsed.data);
      res.json(profile);
    } catch (error) {
      console.error("Error saving learner profile:", error);
      res.status(500).json({ error: "Failed to save learner profile" });
    }
  });

  app.get("/api/knowledge/chat/:courseId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const courseId = parseInt(req.params.courseId);
      const limit = parseInt(req.query.limit as string) || 50;

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const messages = await storage.getChatHistory(userId, courseId, limit);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat history:", error);
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  app.post("/api/knowledge/chat/:courseId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const courseId = parseInt(req.params.courseId);

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Save user message
      const userMessage = await storage.addChatMessage({
        userId,
        courseId,
        role: "user",
        content: message,
      });

      // Get course context for RAG
      const course = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
      if (!course.length) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Get learner profile for context
      const profile = await storage.getLearnerProfile(userId, courseId);

      // Get recent chat history for context
      const recentHistory = await storage.getChatHistory(userId, courseId, 10);

      // Analyze message and generate response using LLM
      const { analyzeKnowledgeChat } = await import("./llm/knowledgeChat");
      const result = await analyzeKnowledgeChat({
        courseCode: course[0].code,
        courseName: course[0].name,
        userMessage: message,
        chatHistory: recentHistory,
        currentProfile: profile || null,
      });

      // Save assistant response
      const assistantMessage = await storage.addChatMessage({
        userId,
        courseId,
        role: "assistant",
        content: result.response,
        extractedUpdates: JSON.stringify(result.profileUpdates),
      });

      // Update learner profile if there are updates
      if (result.profileUpdates && Object.keys(result.profileUpdates).length > 0) {
        const existingProfile = profile || { userId, courseId };
        await storage.upsertLearnerProfile({
          ...existingProfile,
          ...result.profileUpdates,
          userId,
          courseId,
        });
      }

      res.json({
        userMessage,
        assistantMessage,
        profileUpdates: result.profileUpdates,
      });
    } catch (error) {
      console.error("Error processing knowledge chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // ============================================
  // COURSE BUILDER ROUTES
  // ============================================

  // Bulk extract content from files with streaming progress
  app.post("/api/course-builder/extract", requireAuth, courseBuilderUpload.array("files", 50), async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "No files provided" })}\n\n`);
        res.end();
        return;
      }

      const { spawn } = await import("child_process");
      const pythonScriptPath = path.join(process.cwd(), "server/services/pdfExtractor.py");
      const pythonProcess = spawn("python3", [pythonScriptPath]);

      const fileList = files.map(f => ({ path: f.path, name: f.originalname }));
      pythonProcess.stdin.write(JSON.stringify({ files: fileList }));
      pythonProcess.stdin.end();

      let allContent = "";
      let buffer = "";

      pythonProcess.stdout.on("data", (data: any) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const update = JSON.parse(line);
            res.write(`data: ${JSON.stringify(update)}\n\n`);
            if (update.type === "progress" && update.status === "success" && update.text) {
              allContent += `=== ${update.fileName} ===\n${update.text}\n\n`;
              console.log(`[PDF] Extracted ${update.fileName}: ${update.text.length} chars`);
            }
          } catch (e) {
            console.error("[PDF Extractor] Parse error:", e);
          }
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        console.error("Python error:", data.toString());
        res.write(`data: ${JSON.stringify({ type: "error", error: data.toString() })}\n\n`);
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          console.log(`[Course Builder] Extraction complete, content length: ${allContent.length}`);
          res.write(`data: ${JSON.stringify({ type: "complete", extractedContent: allContent })}\n\n`);
        } else {
          console.error(`[Course Builder] Python process exited with code ${code}`);
          res.write(`data: ${JSON.stringify({ type: "error", error: `Extraction failed with code ${code}` })}\n\n`);
        }
        res.end();
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      });

    } catch (error: any) {
      console.error("Course builder extraction error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  });

  // Generate course roadmap from extracted content
  app.post("/api/course-builder/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { courseCode, courseName, extractedContent, sourceFiles } = req.body;

      if (!courseCode || !extractedContent) {
        return res.status(400).json({ error: "Course code and extracted content are required" });
      }

      const { generateCourseRoadmap } = await import("./llm/courseBuilder");
      const roadmap = await generateCourseRoadmap(courseCode, courseName || courseCode, extractedContent);

      // Save to database
      const [saved] = await db.insert(courseRoadmaps).values({
        userId,
        courseCode,
        title: roadmap.title,
        content: roadmap.content,
        extractedContent,
        sourceFiles: JSON.stringify(sourceFiles || []),
        status: "draft",
      }).returning();

      res.json({
        success: true,
        roadmap: saved,
      });
    } catch (error: any) {
      console.error("Course roadmap generation error:", error);
      res.status(500).json({ error: error.message || "Generation failed" });
    }
  });

  // Update roadmap content
  app.patch("/api/course-builder/roadmap/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const roadmapId = parseInt(req.params.id);
      const { content, title } = req.body;

      const updates: any = { updatedAt: new Date().toISOString() };
      if (content !== undefined) updates.content = content;
      if (title !== undefined) updates.title = title;

      const [updated] = await db.update(courseRoadmaps)
        .set(updates)
        .where(eq(courseRoadmaps.id, roadmapId))
        .returning();

      res.json({ success: true, roadmap: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Update failed" });
    }
  });

  // Chat to refine roadmap
  app.post("/api/course-builder/chat/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const roadmapId = parseInt(req.params.id);
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get current roadmap
      const [roadmap] = await db.select().from(courseRoadmaps).where(eq(courseRoadmaps.id, roadmapId));
      if (!roadmap) {
        return res.status(404).json({ error: "Roadmap not found" });
      }

      // Get chat history
      const history = await db.select().from(roadmapChatHistory)
        .where(eq(roadmapChatHistory.roadmapId, roadmapId))
        .orderBy(roadmapChatHistory.createdAt);

      const { refineRoadmapWithChat } = await import("./llm/courseBuilder");
      const response = await refineRoadmapWithChat(
        roadmap.content,
        message,
        history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }))
      );

      // Save chat messages
      await db.insert(roadmapChatHistory).values([
        { roadmapId, role: "user", content: message },
        { roadmapId, role: "assistant", content: response },
      ]);

      // Extract updated content from response (if it contains markdown document)
      let updatedContent = roadmap.content;
      if (response.includes("# ") || response.includes("## ")) {
        updatedContent = response;
        await db.update(courseRoadmaps)
          .set({ content: updatedContent, updatedAt: new Date().toISOString() })
          .where(eq(courseRoadmaps.id, roadmapId));
      }

      res.json({
        success: true,
        response,
        updatedContent,
      });
    } catch (error: any) {
      console.error("Roadmap chat error:", error);
      res.status(500).json({ error: error.message || "Chat failed" });
    }
  });

  // Ingest roadmap to knowledge base
  app.post("/api/course-builder/ingest/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const roadmapId = parseInt(req.params.id);

      const [roadmap] = await db.select().from(courseRoadmaps).where(eq(courseRoadmaps.id, roadmapId));
      if (!roadmap) {
        return res.status(404).json({ error: "Roadmap not found" });
      }

      // Save roadmap content as a file in forge_kb
      const courseDir = path.join(FORGE_KB_PATH, roadmap.courseCode);
      if (!fs.existsSync(courseDir)) {
        fs.mkdirSync(courseDir, { recursive: true });
      }

      const fileName = `roadmap_${Date.now()}.md`;
      const filePath = path.join(courseDir, fileName);
      fs.writeFileSync(filePath, roadmap.content);

      // Run ingestion pipeline
      const { ingestSingleFile } = await import("./llm/ingestRag");
      const fileId = await ingestSingleFile(roadmap.courseCode, filePath, fileName);

      // Update roadmap status
      await db.update(courseRoadmaps)
        .set({ status: "ingested", updatedAt: new Date().toISOString() })
        .where(eq(courseRoadmaps.id, roadmapId));

      res.json({
        success: true,
        message: "Roadmap ingested to knowledge base",
        fileId,
      });
    } catch (error: any) {
      console.error("Roadmap ingestion error:", error);
      res.status(500).json({ error: error.message || "Ingestion failed" });
    }
  });

  // Get roadmap by ID
  app.get("/api/course-builder/roadmap/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const roadmapId = parseInt(req.params.id);
      const [roadmap] = await db.select().from(courseRoadmaps).where(eq(courseRoadmaps.id, roadmapId));

      if (!roadmap) {
        return res.status(404).json({ error: "Roadmap not found" });
      }

      const history = await db.select().from(roadmapChatHistory)
        .where(eq(roadmapChatHistory.roadmapId, roadmapId))
        .orderBy(roadmapChatHistory.createdAt);

      res.json({ roadmap, chatHistory: history });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get roadmaps for a course
  app.get("/api/course-builder/course/:courseCode", requireAuth, async (req: Request, res: Response) => {
    try {
      const { courseCode } = req.params;
      const roadmaps = await db.select().from(courseRoadmaps)
        .where(eq(courseRoadmaps.courseCode, courseCode))
        .orderBy(courseRoadmaps.createdAt);

      res.json({ roadmaps });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== PLANNING CHAT API ==========
  
  // Start or resume a planning chat session
  app.post("/api/planning-chat/session", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { date } = req.body;
      if (!date) {
        return res.status(400).json({ error: "date is required" });
      }

      // Check for existing active session
      let session = await storage.getPlanningSession(userId, date);
      
      if (!session) {
        // Create new session
        session = await storage.createPlanningSession({
          userId,
          scheduleDate: date,
          status: "active",
        });
      }

      // Get messages for this session
      const messages = await storage.getPlanningMessages(session.id);
      
      // Get user preferences and patterns for context
      const preferences = await storage.getPlanningPreferences(userId);
      const userPrefs = await storage.getUserPreferences(userId);
      const recentSessions = await storage.getRecentPlanningSessions(userId, 5);

      res.json({
        session,
        messages,
        preferences,
        userPrefs,
        recentSessionsCount: recentSessions.length,
      });
    } catch (error: any) {
      console.error("Error with planning session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send a message to the planning assistant
  app.post("/api/planning-chat/message", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { sessionId, message, activityIndex } = req.body;
      if (!sessionId || !message) {
        return res.status(400).json({ error: "sessionId and message required" });
      }

      // Verify session belongs to user
      const session = await storage.getPlanningSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Save user message
      await storage.addPlanningMessage({
        sessionId,
        role: "user",
        content: message,
        activityIndex: activityIndex ?? null,
      });

      // Get all messages for context
      const allMessages = await storage.getPlanningMessages(sessionId);
      
      // Get user data for AI context
      const userPrefs = await storage.getUserPreferences(userId);
      const planningPrefs = await storage.getPlanningPreferences(userId);
      const commitments = await storage.getCommitmentsForDate(session.scheduleDate, userId);
      const deadlines = await storage.getDeadlinesInRange(
        session.scheduleDate,
        new Date(new Date(session.scheduleDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        userId
      );
      const activities = await storage.getActiveActivities(userId);

      // Get recent planning sessions for cross-session memory
      const recentPlanSessions = await storage.getRecentPlanningSessions(userId, 7);
      const recentSessions = recentPlanSessions
        .filter(s => s.id !== sessionId && s.currentScheduleData)
        .slice(0, 5)
        .map(s => {
          let scheduleActivities: string[] = [];
          try {
            const blocks = JSON.parse(s.currentScheduleData || "[]");
            scheduleActivities = blocks.map((b: any) => b.title);
          } catch {}
          return {
            date: s.scheduleDate,
            activities: scheduleActivities,
            status: s.status || "active",
          };
        });

      // Current schedule state
      let currentSchedule: any[] = [];
      if (session.currentScheduleData) {
        try {
          currentSchedule = JSON.parse(session.currentScheduleData);
        } catch {}
      }

      // Generate AI response
      const { generatePlanningResponse } = await import("./llm/planningAssistant");
      const aiResponse = await generatePlanningResponse({
        messages: allMessages,
        currentSchedule,
        userContext: {
          wakeTime: userPrefs?.wakeTime || "06:00",
          sleepTime: userPrefs?.sleepTime || "22:00",
          commitments,
          deadlines,
          activities: activities.map(a => a.name),
          planningPrefs,
          importedTodoList: session.importedTodoList || undefined,
          recentSessions,
        },
        activityIndex,
        scheduleDate: session.scheduleDate,
      });

      // Save AI response
      const aiMessage = await storage.addPlanningMessage({
        sessionId,
        role: "assistant",
        content: aiResponse.message,
        activityIndex: activityIndex ?? null,
        scheduleSnapshot: aiResponse.updatedSchedule ? JSON.stringify(aiResponse.updatedSchedule) : null,
      });

      // Update session with new schedule if changed
      if (aiResponse.updatedSchedule) {
        await storage.updatePlanningSession(sessionId, {
          currentScheduleData: JSON.stringify(aiResponse.updatedSchedule),
          aiReasoning: aiResponse.reasoning,
        });
      }

      // Update planning preferences if AI learned something
      if (aiResponse.learnedPreferences) {
        const existing = await storage.getPlanningPreferences(userId);
        await storage.upsertPlanningPreferences({
          userId,
          ...existing,
          ...aiResponse.learnedPreferences,
        });
      }

      res.json({
        message: aiMessage,
        updatedSchedule: aiResponse.updatedSchedule,
        reasoning: aiResponse.reasoning,
        targetDate: aiResponse.targetDate,
      });
    } catch (error: any) {
      console.error("Error in planning chat:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get current schedule state from session
  app.get("/api/planning-chat/schedule/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const sessionId = parseInt(req.params.sessionId);

      const session = await storage.getPlanningSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      let schedule: any[] = [];
      if (session.currentScheduleData) {
        try {
          schedule = JSON.parse(session.currentScheduleData);
        } catch {}
      }

      res.json({ schedule, aiReasoning: session.aiReasoning });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update session date for date switching (preserves chat history)
  app.post("/api/planning-chat/update-date", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { sessionId, newDate } = req.body;
      const session = await storage.getPlanningSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session date
      await storage.updatePlanningSession(sessionId, {
        scheduleDate: newDate,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Finalize chat-built schedule
  app.post("/api/planning-chat/finalize", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { sessionId } = req.body;
      const session = await storage.getPlanningSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!session.currentScheduleData) {
        return res.status(400).json({ error: "No schedule to finalize" });
      }

      // Parse and save as final schedule
      const scheduleBlocks = JSON.parse(session.currentScheduleData);
      
      const savedSchedule = await storage.saveSchedule({
        scheduleDate: session.scheduleDate,
        scheduleData: session.currentScheduleData,
        aiReasoning: session.aiReasoning || "Built collaboratively via chat",
        source: "chat-builder",
        userId,
      });

      // Delete any existing non-finalized drafts for this date, then save new one
      await db.delete(draftSchedules)
        .where(and(
          eq(draftSchedules.userId, userId),
          eq(draftSchedules.scheduleDate, session.scheduleDate),
          eq(draftSchedules.isFinalized, false)
        ));
      
      await storage.saveDraftSchedule({
        userId,
        scheduleDate: session.scheduleDate,
        scheduleData: session.currentScheduleData,
        aiReasoning: session.aiReasoning || "Built collaboratively via chat",
        source: "chat-builder",
        isFinalized: false,
      });

      // Mark session as completed
      await storage.updatePlanningSession(sessionId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });

      // Mark first schedule created if needed
      await db.update(users)
        .set({ hasCreatedFirstSchedule: true })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        schedule: savedSchedule,
        blocks: scheduleBlocks,
      });
    } catch (error: any) {
      console.error("Error finalizing chat schedule:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get planning preferences
  app.get("/api/planning-chat/preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const prefs = await storage.getPlanningPreferences(userId);
      res.json({ preferences: prefs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get planning chat history - list all dates with planning sessions
  app.get("/api/planning-chat/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessions = await db.select()
        .from(planningChatSessions)
        .where(eq(planningChatSessions.userId, userId))
        .orderBy(desc(planningChatSessions.scheduleDate));

      const today = new Date().toISOString().split("T")[0];
      
      // Return both simple dates array (for backwards compat) and detailed sessions
      const dates = sessions.map(s => s.scheduleDate);
      const sessionsWithInfo = sessions.map(s => ({
        date: s.scheduleDate,
        status: s.status,
        isPast: s.scheduleDate < today,
        isToday: s.scheduleDate === today,
        hasSchedule: !!s.currentScheduleData,
        messageCount: 0, // Will be populated if needed
      }));
      
      res.json({ dates, sessions: sessionsWithInfo });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Use a past session as template for a new date
  app.post("/api/planning-chat/use-as-template", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { sourceDate, targetDate } = req.body;
      
      // Get the source session
      const sourceSession = await storage.getPlanningSession(userId, sourceDate);
      if (!sourceSession) {
        return res.status(404).json({ error: "Source session not found" });
      }

      // Create or get target session
      let targetSession = await storage.getPlanningSession(userId, targetDate);
      if (!targetSession) {
        targetSession = await storage.createPlanningSession({
          userId,
          scheduleDate: targetDate,
          status: "active",
          currentScheduleData: sourceSession.currentScheduleData,
          aiReasoning: `Template from ${sourceDate}`,
        });
      } else {
        // Update existing session with template data
        targetSession = await storage.updatePlanningSession(targetSession.id, {
          currentScheduleData: sourceSession.currentScheduleData,
          aiReasoning: `Template from ${sourceDate}`,
        });
      }

      // Add a system message noting the template usage
      await storage.addPlanningMessage({
        sessionId: targetSession!.id,
        role: "assistant",
        content: `I've loaded your schedule from ${new Date(sourceDate).toLocaleDateString()} as a starting template. This schedule has ${sourceSession.currentScheduleData ? JSON.parse(sourceSession.currentScheduleData).length : 0} activities. Would you like to make any adjustments for ${new Date(targetDate).toLocaleDateString()}?`,
      });

      res.json({ 
        success: true, 
        session: targetSession,
        copiedBlocks: sourceSession.currentScheduleData ? JSON.parse(sourceSession.currentScheduleData).length : 0
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Clear planning chat messages for a session
  app.delete("/api/planning-chat/messages/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionId = parseInt(req.params.sessionId);
      const session = await storage.getPlanningSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      await storage.clearPlanningMessages(sessionId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload a to-do list file for planning session
  app.post("/api/planning-chat/upload-todo/:sessionId", requireAuth, (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    todoUpload.single("file")(req, res, async (err) => {
      if (err) {
        console.error("To-do upload error:", err);
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      try {
        const sessionId = parseInt(req.params.sessionId);
        const session = await storage.getPlanningSessionById(sessionId);
        
        if (!session || session.userId !== userId) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ error: "Session not found" });
        }

        // Use the document extractor to extract content
        const { extractDocument } = await import("./llm/documentExtractor");
        const extraction = await extractDocument(req.file.path);
        
        // Combine main text and any image text
        let extractedContent = extraction.text;
        if (extraction.imageTexts.length > 0) {
          extractedContent += "\n\n" + extraction.imageTexts.join("\n");
        }

        // Update the session with the imported to-do list
        await db.update(planningChatSessions)
          .set({ importedTodoList: extractedContent })
          .where(eq(planningChatSessions.id, sessionId));

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        res.json({ 
          success: true, 
          message: "To-do list imported successfully",
          extractedContent: extractedContent.substring(0, 500) + (extractedContent.length > 500 ? "..." : "")
        });
      } catch (error: any) {
        console.error("Error processing to-do file:", error);
        if (req.file?.path) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        res.status(500).json({ error: "Failed to process to-do file" });
      }
    });
  });

  // Clear imported to-do list from session
  app.delete("/api/planning-chat/todo/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionId = parseInt(req.params.sessionId);
      const session = await storage.getPlanningSessionById(sessionId);
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      await db.update(planningChatSessions)
        .set({ importedTodoList: null })
        .where(eq(planningChatSessions.id, sessionId));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start mastery decay scheduler
  startMasteryDecayScheduler();

  // GitHub integration route
  app.post("/api/github/push", requireAuth, async (req, res) => {
    try {
      const { repoName, description } = req.body;

      if (!repoName || typeof repoName !== "string") {
        return res
          .status(400)
          .json({ error: "Repository name is required" });
      }

      const { pushToGitHub } = await import("./github");
      const result = await pushToGitHub(
        repoName,
        description || "Forge - Personal Engineering Advisor"
      );
      res.json(result);
    } catch (error: any) {
      console.error("GitHub push error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}