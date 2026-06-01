// ═════════════════════════════════════════════════════════════════════════════
//  E2E Journey 2 — duty swap state machine (3 roles, end to end).
//
//    Invigilator A requests a swap with B  →  pending_peer
//    B approves & forwards to admin         →  pending_admin
//    Admin approves & executes              →  approved (rooms traded)
//
//  Each role drives its own browser context seeded from the storageState
//  global-setup minted. The fixture's swap scenario puts A and B in the SAME
//  slot, different rooms, so the admin approval is a same-slot classroom swap
//  (always feasible). We reseed the swap slot in beforeAll so this journey is
//  independent of whether the admin-pipeline spec already rewrote allocations.
//
//  Requires both servers running (frontend :5173 + backend :5001) — or launch
//  with E2E_START_SERVERS=1. Validated structurally via `playwright test --list`.
// ═════════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';
import { readFixture } from '../helpers/fixture.js';
import { reseedSwapScenario } from '../helpers/seed.js';
import { closePool } from '../helpers/db.js';
import { STORAGE } from '../helpers/constants.js';

let fx;
let swap; // { slotId, assignmentA, assignmentB, roomA, roomB }

test.beforeAll(async () => {
  fx = readFixture();
  swap = await reseedSwapScenario({
    periodId: fx.periodId,
    semesterLabel: fx.semesterLabel,
    rooms: fx.rooms,
    users: fx.users,
    swapCourseCode: fx.swap.courseCode,
  });
});

test.afterAll(async () => {
  await closePool();
});

test('A requests a swap, B approves, admin executes — rooms are traded', async ({ browser }) => {
  const invA = fx.users.invA;
  const invB = fx.users.invB;

  // ── 1. Invigilator A opens the grid and requests a swap with B ─────────────
  const ctxA = await browser.newContext({ storageState: STORAGE.invA });
  const pageA = await ctxA.newPage();
  await pageA.goto('/invigilator-portal/schedule');

  // The swap slot is the earliest date, so it's the default-selected day.
  // Click B's chip (targeted precisely by assignment id via data-testid).
  const bChip = pageA.getByTestId(`invig-chip-${swap.assignmentB}`);
  await expect(bChip).toBeVisible();
  await expect(bChip).toContainText(invB.full_name);
  await bChip.click();

  // Modal opens; A has exactly one offerable duty, so it's pre-selected.
  const modalHeading = pageA.getByRole('heading', { name: 'Request a Swap' });
  await expect(modalHeading).toBeVisible();
  await pageA.getByRole('button', { name: 'Send Swap Request' }).click();

  // onSuccess closes the modal and toasts confirmation. (.first() — the app mounts
  // two ToastContainers, so every toast resolves to two matching elements.)
  await expect(modalHeading).toBeHidden();
  await expect(pageA.getByText(/Swap request sent/i).first()).toBeVisible();

  // ── 2. Invigilator B approves & forwards to admin ──────────────────────────
  const ctxB = await browser.newContext({ storageState: STORAGE.invB });
  const pageB = await ctxB.newPage();
  await pageB.goto('/invigilator-portal/incoming');

  // The card names the requester (A). Approve it.
  await expect(pageB.getByText(invA.full_name).first()).toBeVisible();
  await pageB.getByRole('button', { name: 'Approve & forward to admin' }).click();
  await expect(pageB.getByText(/Forwarded to admin/i).first()).toBeVisible();

  // ── 3. Admin approves & executes the swap ──────────────────────────────────
  const ctxAdmin = await browser.newContext({ storageState: STORAGE.admin });
  const pageAdmin = await ctxAdmin.newPage();
  await pageAdmin.goto('/dashboard/swap-approval');

  // Pending queue shows the two-way swap between A and B.
  await expect(pageAdmin.getByText('Two-way swap').first()).toBeVisible();
  await pageAdmin.getByRole('button', { name: 'Approve & execute swap' }).click();
  await expect(pageAdmin.getByText(/approved|executed/i).first()).toBeVisible();

  // ── 4. Verify the trade landed: A now sits in B's old room ─────────────────
  await pageA.reload();
  // Grid columns are ordered by location_order: roomA (RA, order 1) is the first
  // room column, roomB (RB, order 2) the second. The swap slot row's cells are
  // [time, roomA, roomB]. After the same-slot swap, A's "YOU" duty has moved into
  // roomB's column and B's duty into roomA's. (Room names are <th> column headers,
  // not cells — so we assert on the body row's cells, which proves the trade.)
  const slotRow = pageA.getByRole('row').filter({ hasText: '09:00' });
  const cells = slotRow.getByRole('cell');
  await expect(cells.nth(2)).toContainText(invA.full_name); // roomB now holds A …
  await expect(cells.nth(2)).toContainText('You');           // … and it's A's own duty
  await expect(cells.nth(1)).toContainText(invB.full_name); // roomA now holds B

  await ctxA.close();
  await ctxB.close();
  await ctxAdmin.close();
});
