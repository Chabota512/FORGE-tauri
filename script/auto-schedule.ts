
import fetch from 'node-fetch';

const API_URL = process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  : 'http://localhost:5000';

async function autoGenerateSchedule() {
  try {
    console.log(`[${new Date().toISOString()}] Running auto-schedule generation...`);
    
    const response = await fetch(`${API_URL}/api/schedule/auto-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (data.generated) {
      console.log(`[${new Date().toISOString()}] ✅ Schedule auto-generated successfully`);
    } else {
      console.log(`[${new Date().toISOString()}] ℹ️  ${data.message || 'Schedule already exists'}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error auto-generating schedule:`, error);
    process.exit(1);
  }
}

autoGenerateSchedule();
