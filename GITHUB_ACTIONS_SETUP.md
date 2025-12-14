# Build Forge Desktop App with GitHub Actions

This guide explains how to use GitHub Actions to automatically build the Forge desktop app for Windows, macOS, and Linux.

## How It Works

The GitHub Actions workflow (`tauri-build.yml`) automatically:
1. Builds the app on multiple platforms (Windows, macOS Intel, macOS ARM, Linux)
2. Creates installers for each platform
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

### 3. Download Installers

Once the build completes (usually 30-45 minutes):
1. Go to your GitHub releases page
2. Find the release with your tag
3. Scroll down to "Assets"
4. Download the installer for your platform:
   - **Windows**: `Forge_0.1.0_x64_en-US.msi` or `.exe`
   - **macOS Intel**: `Forge_0.1.0_x64.dmg`
   - **macOS ARM**: `Forge_0.1.0_aarch64.dmg`
   - **Linux**: `.AppImage` or `.deb`

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
2. Click the workflow run
3. You'll see logs for each platform build

### If Build Fails

Check the logs to see what went wrong:
- Click the failed platform's job
- Scroll through the logs to find the error
- Common issues:
  - Missing dependencies
  - API keys not set
  - Corrupted node_modules (try clearing cache)

## Installer File Locations

After download, where to find installer files in the release:

**Windows:**
- MSI installer: `Forge_0.1.0_x64_en-US.msi`
- NSIS installer: `Forge_0.1.0_x64-setup.exe`

**macOS:**
- DMG (disk image): `Forge_0.1.0_x64.dmg` (Intel)
- DMG (disk image): `Forge_0.1.0_aarch64.dmg` (Apple Silicon)

**Linux:**
- AppImage: `forge_0.1.0_amd64.AppImage`
- Debian package: `forge_0.1.0_amd64.deb`

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
| Local | 10-20 min | Complex (need all tools) | Single platform |
| GitHub Actions | 30-45 min | Simple (no setup needed) | All platforms at once |

## Next Steps

Once you have the installers:
1. Test them on each platform
2. Update version numbers in `src-tauri/tauri.conf.json`
3. Create new releases for updates
4. Share the installer links with users
