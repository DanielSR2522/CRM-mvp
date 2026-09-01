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
import { processNextJob } from '../src/lib/carrier-portals/automation/worker-service';

async function startWorkerLoop() {
  console.log('====================================================');
  console.log('   SmarTrack CRM — Carrier Worker Runner');
  console.log('====================================================');
  const admin = getSupabaseAdmin();
  const pollIntervalMs = 3000; // Poll for queued jobs every 3s in local dev runner

  console.log(`[Worker Runner] Worker active. Polling queued jobs every ${pollIntervalMs / 1000}s...\n`);

  const runTick = async () => {
    try {
      let res = await processNextJob(admin, 'local-cli-worker');
      while (res.claimed) {
        console.log(`[Worker Runner] Processed job ${res.jobId} -> Status: ${res.status || 'Done'}`);
        res = await processNextJob(admin, 'local-cli-worker');
      }
    } catch (err: any) {
      console.error('[Worker Runner] Error in worker tick:', err);
    }
  };

  await runTick();
  setInterval(runTick, pollIntervalMs);
}

startWorkerLoop();
