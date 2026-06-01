// ─────────────────────────────────────────────────────────────────────────────
//  localStorage auth helpers — mirror exactly how the app persists a session.
//
//  Login.jsx writes:  localStorage.token = <jwt>
//                     localStorage.user  = JSON.stringify({id,name,email,role})
//  api.js reads `token` on every request and clears both on a 401. These
//  helpers let tests seed and assert that contract without hard-coding the
//  key names in every spec.
// ─────────────────────────────────────────────────────────────────────────────

export const getStoredToken = () => localStorage.getItem('token');

export const getStoredUser = () => {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
};

export function seedAuth({ token = 'test-jwt', user = {} } = {}) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify({
    id: 1, name: 'Seed User', email: 'seed@lnmiit.ac.in', role: 'admin', ...user,
  }));
}
