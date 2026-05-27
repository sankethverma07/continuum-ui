/**
 * Long-running worker for Supabase mesh ingest jobs.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx src/cli/runWorker.ts
 *
 * Runs forever. Polls the catalog for rows in status='pending' kind='mesh'
 * and processes them one at a time. Deploy as a Railway/Fly.io/Render worker
 * alongside the Supabase Edge Function, or run it on a cron trigger.
 */

import { defaultConfig, runPollLoop } from '../worker/supabaseWorker.js';

runPollLoop(defaultConfig()).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
