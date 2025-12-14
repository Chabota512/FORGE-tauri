# Push FORGE to GitHub

Since the automated git push has permission issues, here's how to push your code to GitHub manually:

## Option 1: Using GitHub CLI (Recommended)

1. Open the terminal in Replit
2. Run these commands:

```bash
cd /home/runner/workspace/FORGE
gh auth login --with-token <<< "$GITHUB_TOKEN"
git config --global user.email "chabotamwenda512@gmail.com"
git config --global user.name "Chabota512"
git branch -M main
git push -u origin main --force
```

## Option 2: Using HTTPS with Token

1. In Replit terminal:

```bash
cd /home/runner/workspace/FORGE
git config --global user.email "chabotamwenda512@gmail.com"
git config --global user.name "Chabota512"
git push -u https://${GITHUB_TOKEN}@github.com/Chabota512/FORGE-tauri.git main
```

## Option 3: Manual Push (Easiest)

1. Download the FORGE folder locally
2. Open terminal on your computer
3. Navigate to the FORGE folder
4. Run:

```bash
git init
git add .
git commit -m "Add Tauri desktop app with GitHub Actions build workflow"
git branch -M main
git remote add origin https://github.com/Chabota512/FORGE-tauri.git
git push -u origin main
```

5. When prompted for password, use your GitHub Personal Access Token as the password

## Verify Push Succeeded

Once pushed, check:
1. Go to https://github.com/Chabota512/FORGE-tauri
2. You should see all the FORGE files in the repository

## Next: Create a Release to Trigger Builds

After pushing, create a release to automatically build installers:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then go to GitHub releases and create a new release with tag v0.1.0. The GitHub Actions workflow will automatically start building for all platforms.

## Check Build Status

1. Go to your GitHub repo
2. Click the "Actions" tab
3. You'll see "Build Tauri App" workflow running
4. Wait for all platforms to complete (30-45 minutes)
5. Download installers from the release page when done
