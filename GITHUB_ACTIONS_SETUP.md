# Build Forge Desktop App with GitHub Actions

This guide explains how to use GitHub Actions to automatically build the Forge desktop app for Windows, macOS, and Linux.

## How It Works

The GitHub Actions workflow (`tauri-build.yml`) automatically:
1. Builds the app for Windows 11 (64-bit)
2. Creates Windows installers (MSI and NSIS)
3. Uploads them as release assets (if you create a GitHub release)

## Setup Steps

### 1. Push to GitHub

First, make sure your FORGE folder is in a GitHub repository:

```bash
cd FORGE
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/forge.git
git push -u origin main
```

### 2. Create a GitHub Release

GitHub Actions will automatically build when you create a release with a tag starting with `v`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then:
1. Go to your GitHub repository
2. Click "Releases" on the right sidebar
3. Click "Create a new release"
4. Select the tag `v0.1.0`
5. Click "Publish release"

The build will start automatically and create installers in the release.

### 3. Download Windows Installers

Once the build completes (usually 15-20 minutes):
1. Go to your GitHub releases page
2. Find the release with your tag
3. Scroll down to "Assets"
4. Download the Windows 11 installer:
   - **MSI Installer** (recommended): `Forge_0.1.0_x64_en-US.msi`
   - **NSIS Installer**: `Forge_0.1.0_x64-setup.exe`

## Manual Trigger (Without Release)

You can also manually trigger a build without creating a release:

1. Go to your GitHub repository
2. Click "Actions" tab
3. Select "Build Tauri App" on the left
4. Click "Run workflow" button
5. Artifacts will be available in the workflow summary (not in releases)

## Environment Variables

If your app needs API keys, set them as GitHub Secrets:

1. Go to your repository "Settings" → "Secrets and variables" → "Actions"
2. Click "New repository secret"
3. Add your secrets (e.g., `DATABASE_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`)

Then update the workflow file to use them:

```yaml
- name: Build Tauri App
  run: npm run tauri:build
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Build Status

Monitor the build progress:
1. Go to "Actions" tab
2. Click the "Build Tauri App" workflow run
3. You'll see the build logs as it progresses

### If Build Fails

Check the logs to see what went wrong:
- Click the failed workflow run
- Scroll through the logs to find the error
- Common issues:
  - Missing dependencies
  - API keys not set
  - Corrupted node_modules

## Windows Installer Files

The build creates two installer options in the release assets:

1. **MSI Installer** (`Forge_0.1.0_x64_en-US.msi`) - Recommended
   - Standard Windows installer
   - Works with Windows installer/uninstaller
   
2. **NSIS Installer** (`Forge_0.1.0_x64-setup.exe`)
   - Alternative installer option
   - Self-extracting executable

## Troubleshooting

### Build Takes Too Long or Times Out
- GitHub Actions has a 6-hour timeout per job - builds usually complete in 30-45 minutes
- macOS builds are slower due to signing/notarization

### Installers Not Appearing in Release
- Wait for all jobs to complete (check Actions tab)
- Each platform builds independently - some may finish before others

### "Missing target" Error
- The workflow automatically installs the correct Rust target for each platform
- If this error persists, try re-running the workflow

## Local Build vs GitHub Actions

| Method | Time | Setup | Platform |
|--------|------|-------|----------|
| Local | 10-20 min | Complex (need Rust, Visual Studio Build Tools) | Single build |
| GitHub Actions | 15-20 min | Simple (no setup needed) | Automated Windows 11 build |

## Next Steps

Once you have the Windows installers:
1. Test them on Windows 11
2. Update version numbers in `src-tauri/tauri.conf.json` for future releases
3. Create new releases when you want to rebuild
4. Share the installer download link from GitHub Releases with users
