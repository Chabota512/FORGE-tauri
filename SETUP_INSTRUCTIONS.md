# Forge Desktop App - Setup Instructions

## Updated: Environment File Support

The app now supports loading environment variables from a `.env` file instead of requiring system environment variables.

## How to Use

1. **Download the updated FORGE folder** from Replit
2. **Rebuild on Windows** (same steps as before):
   ```cmd
   cd FORGE
   npm install
   npm run tauri:build
   ```

3. **Create the .env file**:
   - Find the `.env.example` file in the FORGE folder
   - Copy it and rename to `.env`
   - Fill in your actual API keys and database URL
   - Keep this file in the same folder as the installer

4. **Install the app**:
   - Run the MSI installer: `Forge_0.1.0_x64_en-US.msi`
   - Choose installation location (e.g., `C:\Program Files\Forge`)

5. **Add the .env file**:
   - Copy your `.env` file to the installation folder
   - For default install: `C:\Program Files\Forge\.env`

6. **Launch the app**:
   - Double-click `Forge.exe` from the installation folder
   - The app will automatically load the `.env` file

## .env File Contents

```
DATABASE_URL=your_postgresql_connection_string
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

## Troubleshooting

**App still won't start:**
- Try running from command line: `"C:\Program Files\Forge\forge-backend.exe"`
- This will show what error the backend is encountering
- Common issue: `.env` file not found or invalid credentials

**Backend can't find .env:**
- Make sure the `.env` file is in the same folder as `forge.exe` and `forge-backend.exe`
- Check the filename is exactly `.env` (not `.env.txt`)

**Database connection fails:**
- Test your DATABASE_URL connection string
- Ensure your database server is accessible from your Windows machine
