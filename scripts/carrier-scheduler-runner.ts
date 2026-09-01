import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { getSupabaseAdmin } from '../src/lib/supabaseAdmin';
import { runSchedulerCheck } from '../src/lib/carrier-portals/automation/scheduler-service';

async function startSchedulerLoop() {
  console.log('====================================================');
  console.log('   SmarTrack CRM — Carrier Scheduler Runner (8-Hour Engine)');
  console.log('====================================================');
  const admin = getSupabaseAdmin();
  const checkIntervalMs = 10000; // Check for due connections every 10s in local dev runner

  console.log(`[Scheduler Runner] Running scheduled checks every ${checkIntervalMs / 1000}s...\n`);

  const runTick = async () => {
    try {
      const res = await runSchedulerCheck(admin);
      if (res.checkedCount > 0) {
        console.log(`[Scheduler] Checked ${res.checkedCount} due connections. Enqueued: ${res.jobsEnqueued}, Duplicates Skipped: ${res.skippedDuplicates}`);
      }
    } catch (err: any) {
      console.error('[Scheduler Runner] Error in scheduler tick:', err);
    }
  };

  await runTick();
  setInterval(runTick, checkIntervalMs);
}

startSchedulerLoop();
