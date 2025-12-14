# Forge Desktop App - Final Setup

## What's Included

When you install the MSI, it installs these files to `C:\Program Files\Forge\`:
- `forge.exe` - The main app
- `forge-backend.exe` - The backend server
- `.env.example` - Template for your environment variables
- `Uninstall Forge` - Shortcut to uninstall

## Setup Instructions

### 1. Rebuild the Installer (on Windows)
```cmd
cd C:\dev\FORGE
npm install
npm run tauri:build
```

### 2. Install the MSI
Run the installer at:
```
C:\dev\FORGE\src-tauri\target\release\bundle\msi\Forge_0.1.0_x64_en-US.msi
```

### 3. Create Your .env File
After installation, go to `C:\Program Files\Forge\` and:

1. Copy `.env.example` and rename the copy to `.env`
2. Open `.env` with Notepad
3. Fill in your actual API keys and database URL:

```
DATABASE_URL=your_postgres_connection_string
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
```

4. Save the file

### 4. Launch Forge
Double-click `forge.exe` - it will now work!

## Editing Environment Variables Later

When you need to update your API keys or database URL:

1. Navigate to `C:\Program Files\Forge\`
2. Open `.env` with Notepad (run as Administrator if needed)
3. Edit the values you want to change
4. Save and restart the app

## Troubleshooting

**App doesn't start:**
```cmd
cd "C:\Program Files\Forge"
.\forge-backend.exe
```
This will show you any error messages.

**"Access denied" when editing .env:**
- Right-click Notepad and select "Run as administrator"
- Then open the `.env` file

**Database connection fails:**
- Check your DATABASE_URL is correct
- Make sure your database server is accessible from your Windows machine
