// ═════════════════════════════════════════════════════════════════════════════
//  Token minting + storageState writing for E2E.
//
//  Why mint instead of driving the /login UI?
//   • The real login route is behind loginLimiter (10 / 15 min) — repeated
//     headed runs would trip it.
//   • Minting removes any webServer/globalSetup ordering race: storageState is
//     written from the DB ids before the browser ever starts.
//   • The token is byte-for-byte what userController issues (jwt.sign({id,email,
//     role}, JWT_SECRET, {expiresIn:'8h'})), and `protect` only verifies the
//     signature — never the DB — so a minted token authenticates identically.
//
//  writeStorageState() emits the exact localStorage shape the SPA expects:
//  `token` (raw JWT) + `user` (JSON {id,name,email,role}, mirroring Login.jsx).
// ═════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { BASE_URL } from './constants.js';

export function mintToken({ id, email, role }) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET missing — ensure backend/.env is loaded (helpers/db.js does this).');
  }
  return jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

// Write a Playwright storageState file seeding localStorage for `origin`.
export function writeStorageState(filePath, user, origin = BASE_URL) {
  const token = mintToken(user);
  const state = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'token', value: token },
          {
            name: 'user',
            value: JSON.stringify({
              id: user.id,
              name: user.full_name || user.name,
              email: user.email,
              role: user.role,
            }),
          },
        ],
      },
    ],
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
}
