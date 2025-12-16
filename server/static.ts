import express, { type Express } from "express";
import fs from "fs";
import path from "path";

declare const process: NodeJS.Process & { pkg?: { entrypoint: string } };

export function serveStatic(app: Express) {
  // Check if running as a pkg-bundled executable (Tauri sidecar)
  // process.pkg is set by pkg when the app is bundled
  const isPkgBundled = !!(process as any).pkg;
  const isTauriEnv = process.env.TAURI_ENV === "production";
  
  if (isPkgBundled || isTauriEnv) {
    // In Tauri production mode, the frontend is served by Tauri's webview
    // The backend sidecar only serves the API, not static files
    console.log("[Static] Running as Tauri sidecar - static files served by Tauri webview");
    return;
  }

  // Development mode: serve static files from the public directory
  const possiblePaths = [
    path.resolve(__dirname, "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "public"),
  ];

  let distPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      distPath = p;
      break;
    }
  }

  if (!distPath) {
    console.warn(
      `[Static] Could not find build directory. Tried: ${possiblePaths.join(", ")}. API-only mode.`,
    );
    return;
  }

  console.log(`[Static] Serving static files from: ${distPath}`);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
