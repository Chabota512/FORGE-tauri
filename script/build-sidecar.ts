import { build as esbuild } from "esbuild";
import { rm, mkdir, writeFile, readFile, copyFile, cp } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

async function buildSidecar() {
  const sidecarDir = "src-tauri/binaries";
  const resourcesDir = "src-tauri/resources";
  
  await rm(sidecarDir, { recursive: true, force: true });
  await mkdir(sidecarDir, { recursive: true });
  await mkdir(resourcesDir, { recursive: true });

  console.log("Step 1: Building backend bundle...");
  
  const nativeModules = [
    "sharp",
    "chromadb",
  ];

  // Create a shim for onnxruntime-node that throws a helpful error
  // This prevents the native module require from crashing and forces WASM fallback
  const onnxShimDir = join(sidecarDir, "shims");
  await mkdir(onnxShimDir, { recursive: true });
  const onnxShimPath = join(onnxShimDir, "onnxruntime-node.cjs");
  await writeFile(
    onnxShimPath,
    `// Shim to prevent onnxruntime-node from being loaded in pkg bundle
// Forces transformers.js to use WASM backend
module.exports = {
  InferenceSession: { create: () => { throw new Error("Use WASM backend"); } },
  Tensor: function() { throw new Error("Use WASM backend"); }
};`
  );

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
    alias: {
      "onnxruntime-node": onnxShimPath,
    },
    logLevel: "info",
    packages: "bundle",
  });

  console.log("Step 2: Copying ONNX WASM files for transformers.js...");
  
  // Check both local and parent node_modules (for monorepo/workspace setups)
  const wasmSourceDirs = [
    "node_modules/@xenova/transformers/dist",
    "../node_modules/@xenova/transformers/dist",
  ];
  const wasmFiles = [
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd.wasm",
    "ort-wasm-threaded.wasm",
    "ort-wasm.wasm",
  ];
  
  let wasmSourceDir = wasmSourceDirs.find(dir => existsSync(join(dir, wasmFiles[0])));
  
  if (wasmSourceDir) {
    for (const wasmFile of wasmFiles) {
      const src = join(wasmSourceDir, wasmFile);
      const dest = join(resourcesDir, wasmFile);
      if (existsSync(src)) {
        await copyFile(src, dest);
        console.log(`  Copied: ${wasmFile}`);
      }
    }
  } else {
    console.log("  Warning: WASM files not found in node_modules");
  }

  console.log("Step 3: Creating pkg configuration with assets...");
  
  const pkgConfig = {
    name: "forge-backend",
    version: "1.0.0",
    bin: "forge-server.cjs",
    pkg: {
      targets: ["node20-win-x64", "node20-macos-x64", "node20-linux-x64"],
      outputPath: ".",
      assets: [
        "../resources/*.wasm"
      ]
    }
  };
  
  await writeFile(
    join(sidecarDir, "package.json"), 
    JSON.stringify(pkgConfig, null, 2)
  );

  console.log("Step 4: Compiling to standalone executable with pkg...");
  console.log("Run 'npm run build:sidecar:pkg' on your target platform to compile.");
  
  console.log("\nSidecar build preparation complete!");
  console.log(`Output directory: ${sidecarDir}`);
  console.log(`Resources directory: ${resourcesDir}`);
  console.log("\nTo create the final executable:");
  console.log("  cd src-tauri/binaries");
  console.log("  npx pkg . --target node20-win-x64 --output forge-backend");
  console.log("\nThen rename to: forge-backend-x86_64-pc-windows-msvc.exe");
}

buildSidecar().catch((err) => {
  console.error(err);
  process.exit(1);
});
