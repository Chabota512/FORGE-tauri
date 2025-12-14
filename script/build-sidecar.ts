import { build as esbuild } from "esbuild";
import { rm, mkdir, writeFile, readFile, copyFile } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

async function buildSidecar() {
  const sidecarDir = "src-tauri/binaries";
  
  await rm(sidecarDir, { recursive: true, force: true });
  await mkdir(sidecarDir, { recursive: true });

  console.log("Step 1: Building backend bundle...");
  
  const nativeModules = [
    "sharp",
    "bcrypt", 
    "@xenova/transformers",
    "chromadb",
  ];

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: join(sidecarDir, "forge-server.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: nativeModules,
    logLevel: "info",
  });

  console.log("Step 2: Creating pkg configuration...");
  
  const pkgConfig = {
    name: "forge-backend",
    version: "1.0.0",
    bin: "forge-server.cjs",
    pkg: {
      targets: ["node20-win-x64", "node20-macos-x64", "node20-linux-x64"],
      outputPath: ".",
      assets: []
    }
  };
  
  await writeFile(
    join(sidecarDir, "package.json"), 
    JSON.stringify(pkgConfig, null, 2)
  );

  console.log("Step 3: Compiling to standalone executable with pkg...");
  console.log("Run 'npm run build:sidecar:pkg' on your target platform to compile.");
  
  console.log("\nSidecar build preparation complete!");
  console.log(`Output directory: ${sidecarDir}`);
  console.log("\nTo create the final executable:");
  console.log("  cd src-tauri/binaries");
  console.log("  npx pkg . --target node20-win-x64 --output forge-backend");
  console.log("\nThen rename to: forge-backend-x86_64-pc-windows-msvc.exe");
}

buildSidecar().catch((err) => {
  console.error(err);
  process.exit(1);
});
