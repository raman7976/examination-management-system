// ═════════════════════════════════════════════════════════════════════════════
//  Playwright global setup — provision the live DB safely, then point the SPA at
//  the E2E period.
//
//  SAFETY CONTRACT (live Aiven DB):
//   1. Capture the real is_active=1 period id → persisted so teardown restores it.
//   2. Sweep any crashed-run __TEST_E2E_ leftovers (idempotent).
//   3. Provision a fully __TEST_E2E_-tagged fixture (period + users + rooms +
//      both journey scenarios).
//   4. Flip the active period to the E2E period — REQUIRED because the SPA reads
//      the active period for every page (it never passes ?period_id). This is
//      the one place the global flag is touched; global-teardown ALWAYS restores
//      the captured original (even on failure, via Playwright's teardown hook).
//   5. Mint per-role storageState files + persist fixture ids for the specs.
//
//  Because step 4 mutates shared global state, E2E is intended for nightly/manual
//  runs with a serialized DB concurrency group (see .github/workflows), never in
//  parallel against the same instance.
// ═════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool, sweep, getActivePeriodId, setActivePeriod } from './helpers/db.js';
import { provision } from './helpers/seed.js';
import { writeStorageState } from './helpers/auth.js';
import { STORAGE, AUTH_DIR, E2E_PREFIX, RUN_ID } from './helpers/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  if (!process.env.DB_HOST) {
    throw new Error(
      'E2E global-setup: no DB_HOST. The e2e suite runs against the live DB; ' +
      'ensure backend/.env exists (loaded by helpers/db.js) before running.',
    );
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  console.log(`\n[e2e] global-setup — RUN_ID=${RUN_ID}, prefix=${E2E_PREFIX}`);

  // 1. Capture the real active period BEFORE we touch anything.
  const originalActivePeriodId = await getActivePeriodId();
  fs.writeFileSync(
    path.join(AUTH_DIR, 'original-active.json'),
    JSON.stringify({ originalActivePeriodId }, null, 2),
  );
  console.log(`[e2e] captured original active period id = ${originalActivePeriodId}`);

  // 2. Mop up any leftovers from a crashed prior run.
  await sweep();

  // 3. Provision the fixture (all rows __TEST_E2E_-tagged).
  const fx = await provision();
  console.log(`[e2e] provisioned period ${fx.periodId} (${fx.semesterLabel})`);

  // 4. Activate the E2E period so the SPA's active-period reads hit our data.
  await setActivePeriod(fx.periodId);
  console.log(`[e2e] activated E2E period ${fx.periodId}`);

  // 5. Per-role storageState + fixture ids for the specs.
  writeStorageState(STORAGE.admin, fx.users.admin);
  writeStorageState(STORAGE.invA, fx.users.invA);
  writeStorageState(STORAGE.invB, fx.users.invB);

  fs.writeFileSync(
    path.join(AUTH_DIR, 'fixture.json'),
    JSON.stringify(
      {
        runId: RUN_ID,
        periodId: fx.periodId,
        semesterLabel: fx.semesterLabel,
        users: fx.users,
        rooms: fx.rooms,
        swap: fx.swap,
        pipeline: fx.pipeline,
      },
      null,
      2,
    ),
  );

  await closePool();
  console.log('[e2e] global-setup complete.\n');
}
