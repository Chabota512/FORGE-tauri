# Forge Desktop App - Tauri Build Guide

This guide explains how to build the Forge desktop app on your Windows machine.

## Prerequisites

Install these before building:

1. **Rust** - Install from https://rustup.rs/
2. **Node.js 20+** - Install from https://nodejs.org/
3. **Visual Studio Build Tools** - Install with "Desktop development with C++" workload
   - Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
4. **WiX Toolset 3.x** - Required for MSI creation
   - Download from: https://github.com/wixtoolset/wix3/releases
   - Install WiX 3.11 or later

## Step 1: Add Build Scripts to package.json

Add these scripts to your `package.json`:

```json
"scripts": {
  "dev:client": "vite",
  "build:tauri": "vite build --outDir dist/public",
  "build:sidecar": "tsx script/build-sidecar.ts",
  "build:sidecar:pkg": "tsx script/build-sidecar-pkg.ts",
  "tauri": "tauri",
  "tauri:dev": "npm run build:sidecar && npm run build:sidecar:pkg && tauri dev",
  "tauri:build": "npm run build:sidecar && npm run build:sidecar:pkg && tauri build"
}
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Build the Backend Sidecar

```bash
npm run build:sidecar
npm run build:sidecar:pkg
```

This creates `src-tauri/binaries/forge-backend-x86_64-pc-windows-msvc.exe`

**Important:** The file must be named exactly `forge-backend-{target-triple}.exe` where:
- Windows: `forge-backend-x86_64-pc-windows-msvc.exe`
- Mac Intel: `forge-backend-x86_64-apple-darwin`
- Mac ARM: `forge-backend-aarch64-apple-darwin`
- Linux: `forge-backend-x86_64-unknown-linux-gnu`

## Step 4: Build the Desktop App

```bash
npm run tauri:build
```

The installers will be in:
- MSI: `src-tauri/target/release/bundle/msi/`
- NSIS: `src-tauri/target/release/bundle/nsis/`

## Environment Variables

The desktop app needs these environment variables to function. Create a `.env` file in the app directory or set them in your system:

```
DATABASE_URL=your_postgres_connection_string
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## How It Works

1. **Frontend**: The React frontend is bundled into the Tauri app
2. **Backend**: The Express server is compiled to a standalone executable (sidecar)
3. **Connection**: When you launch Forge, it:
   - Starts the backend sidecar on port 5000
   - Waits for the backend to be ready
   - Shows the main window
   - All API calls go to `http://localhost:5000`

## Troubleshooting

### MSI build fails
- Ensure WiX Toolset 3.x is installed and in your PATH
- Run from a Developer Command Prompt for Visual Studio

### "Failed to create sidecar command" error
- Check that `src-tauri/binaries/forge-backend-x86_64-pc-windows-msvc.exe` exists
- The binary name must match your target platform exactly

### Frontend not connecting to backend
- The frontend automatically detects Tauri and uses `http://localhost:5000`
- Check Windows Firewall isn't blocking port 5000
- Look for backend errors in the console output

### App window doesn't appear
- The window is hidden until the backend starts
- Check for backend startup errors in the terminal

## Development Mode

For testing without building an installer:

```bash
npm run tauri:dev
```

This runs the app with hot-reload enabled.
