import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyProfile } from '../../api/api.js';

const ROLE_LABELS = {
  faculty:     'Faculty',
  phd_student: 'PhD Student',
  lab_staff:   'Lab Staff',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Profile — read-only summary of the logged-in invigilator. JWT only carries
//  id/email/role so we hit /v1/user/me to fill in employee_id + department.
// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getMyProfile();
        if (!mounted) return;
        setUser(res.data?.user || null);
      } catch (err) {
        if (!mounted) return;
        setError(err.response?.data?.message || 'Failed to load profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Profile</h1>
        <p className="text-sm text-textMuted mt-1">Your account information.</p>
      </div>

      {loading && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {user && (
        <div className="bg-surface rounded-xl shadow-sm border border-border p-6">
          <div className="flex items-center gap-4 mb-6 pb-5 border-b border-border">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold uppercase flex-shrink-0"
              className="bg-gradient-to-br from-brand-500 to-brand-600"
            >
              {user.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="text-lg font-bold text-text">{user.full_name}</p>
              <p className="text-sm font-medium" >{ROLE_LABELS[user.role] || user.role}</p>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            <Row label="Email">{user.email}</Row>
            <Row label="Employee ID">{user.employee_id || <em className="text-textFaint">Not set</em>}</Row>
            <Row label="Department">{user.department || <em className="text-textFaint">Not set</em>}</Row>
            <Row label="Member since">
              {user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            </Row>
          </dl>

          <div className="mt-6 pt-5 border-t border-border">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md text-white cursor-pointer transition-colors"
              
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-textFaint">{label}</dt>
      <dd className="text-sm text-text text-right">{children}</dd>
    </div>
  );
}
