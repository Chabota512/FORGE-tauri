import { execSync } from "child_process";
import { rename, access } from "fs/promises";
import { join } from "path";

async function buildPkg() {
  const sidecarDir = "src-tauri/binaries";
  
  try {
    await access(join(sidecarDir, "forge-server.cjs"));
  } catch {
    console.error("Error: forge-server.cjs not found. Run 'npm run build:sidecar' first.");
    process.exit(1);
  }

  console.log("Compiling Node.js backend to standalone executable...");
  
  const rustInfo = execSync("rustc -Vv").toString();
  const targetMatch = /host: (\S+)/g.exec(rustInfo);
  const targetTriple = targetMatch ? targetMatch[1] : "x86_64-pc-windows-msvc";
  
  console.log(`Target platform: ${targetTriple}`);
  
  const isWindows = targetTriple.includes("windows");
  const isMac = targetTriple.includes("darwin") || targetTriple.includes("apple");
  
  let pkgTarget = "node20-linux-x64";
  if (isWindows) pkgTarget = "node20-win-x64";
  else if (isMac) pkgTarget = "node20-macos-x64";
  
  console.log(`Building for: ${pkgTarget}`);
  
  const ext = isWindows ? ".exe" : "";
  const finalName = `forge-backend-${targetTriple}${ext}`;
  
  execSync(
    `npx pkg ${join(sidecarDir, "forge-server.cjs")} --target ${pkgTarget} --output ${join(sidecarDir, finalName)}`,
    { stdio: "inherit" }
  );
  
  console.log(`\nSuccess! Created: ${join(sidecarDir, finalName)}`);
  console.log("\nThe binary is named correctly for Tauri sidecar.");
  console.log("Tauri will automatically find it when using: shell.sidecar('forge-backend')");
}

buildPkg().catch((err) => {
  console.error(err);
  process.exit(1);
});
