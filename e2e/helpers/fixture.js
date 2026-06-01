// Reads the fixture ids global-setup persisted to .auth/fixture.json so specs
// can reference real user names, room names and assignment ids without
// re-querying the DB.

import fs from 'node:fs';
import path from 'node:path';
import { AUTH_DIR } from './constants.js';

export function readFixture() {
  const file = path.join(AUTH_DIR, 'fixture.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Fixture not found at ${file}. Did global-setup run?`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
