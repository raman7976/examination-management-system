import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import logo from '../assets/lnmiitLogo.jpg';
import { getIncomingSwapRequests } from '../api/api.js';

const ROLE_LABELS = {
  faculty:     'Faculty',
  phd_student: 'PhD Student',
  lab_staff:   'Lab Staff',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Invigilator portal layout — sidebar + outlet, mirroring Dashboard.jsx
//  aesthetics so admins and invigilators feel like the same product.
//
//  The "Incoming" sidebar link carries an unread-count badge — a thin 30s
//  poll against /swap-requests/incoming is enough; this is a low-volume
//  feature and 30 s is well within human response latency.
// ─────────────────────────────────────────────────────────────────────────────
export default function InvigilatorPortal() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user')) || {}; }
    catch { return {}; }
  })();

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // ── Incoming-requests badge (30s poll) ────────────────────────────────────
  const [incomingCount, setIncomingCount] = useState(0);
  const refreshIncoming = useCallback(async () => {
    try {
      const res = await getIncomingSwapRequests();
      setIncomingCount(res.data?.requests?.length || 0);
    } catch { /* non-fatal */ }
  }, []);

  // Defer the first refresh to a microtask so the setState inside
  // `refreshIncoming` lands after the effect body returns — keeps the
  // react-hooks/set-state-in-effect linter happy while preserving identical
  // behaviour (the count just shows up one tick later).
  useEffect(() => {
    const timeout = setTimeout(refreshIncoming, 0);
    const interval = setInterval(refreshIncoming, 30_000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [refreshIncoming]);

  // Pages can ask the layout to refresh the badge after acting on a request.
  // We expose it via Outlet context so children can call useOutletContext().
  const outletContext = { refreshIncoming };

  const tabs = [
    {
      name: 'My Schedule',
      path: '/invigilator-portal/schedule',
      icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75',
    },
    {
      name: 'Incoming Requests',
      path: '/invigilator-portal/incoming',
      icon: 'M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.405 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z',
      badge: incomingCount,
    },
    {
      name: 'My Requests',
      path: '/invigilator-portal/outgoing',
      icon: 'M16 12L11 7M16 12l-5 5M16 12H4M20 4v16',
    },
    {
      name: 'Profile',
      path: '/invigilator-portal/profile',
      icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    },
  ];

  const isDefault = location.pathname === '/invigilator-portal' || location.pathname === '/invigilator-portal/';

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top bar (same as Dashboard) ── */}
      <header style={{ background: 'linear-gradient(90deg, #7a1518, #8B1A1A 40%, #8B1A1A 60%, #7a1518)' }}>
        <div className="w-full flex items-center justify-between px-6 py-3">
          <div className="hidden sm:block">
            <p className="text-white text-lg font-semibold tracking-wide">The LNM Institute of Information Technology</p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-xs font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Invigilator Portal
            </span>
            <img src={logo} alt="LNMIIT_LOGO" className="h-10 w-auto object-contain bg-white rounded-sm" style={{ padding: '2px' }} />
          </div>
        </div>
      </header>
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #8B1A1A, #c2524a 30%, #d4978f 50%, #c2524a 70%, #8B1A1A)' }} />

      {/* `min-h-0` lets <main> below actually scroll when content is taller
          than the viewport. Without it, flex's default min-height:auto would
          push the row beyond the screen and bury bottom cards. */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Sidebar ── */}
        <aside className="w-56 flex flex-col border-r min-h-0" style={{ background: '#fafaf9', borderColor: '#eee' }}>
          {/* User card */}
          <div className="px-4 py-4 border-b" style={{ borderColor: '#eee' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B1A1A, #a52a2a)' }}
              >
                {user.name ? user.name.charAt(0) : 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{user.name || 'User'}</p>
                <p className="text-[10px] truncate leading-tight" style={{ color: '#94a3b8' }}>
                  {ROLE_LABELS[user.role] || user.role}
                </p>
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-[13px] transition-all duration-150 ${isActive ? 'font-semibold' : 'font-normal hover:bg-slate-100'}`
                }
                style={({ isActive }) => ({
                  color: isActive ? '#8B1A1A' : '#475569',
                  background: isActive ? 'rgba(139,26,26,0.06)' : 'transparent',
                })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  <span className="truncate">{tab.name}</span>
                </div>
                {tab.badge > 0 && (
                  <span className="inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-[#8B1A1A] text-white min-w-[18px] h-[18px] px-1">
                    {tab.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Sign out */}
          <div className="px-3 py-3 border-t" style={{ borderColor: '#eee' }}>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-normal transition-all duration-150 cursor-pointer"
              style={{ color: '#94a3b8' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#991b1b'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto min-h-0" style={{ background: '#f8f8f6' }}>
          {isDefault ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,26,26,0.06)' }}>
                  <svg className="w-7 h-7" style={{ color: '#8B1A1A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-700 mb-1">Welcome, {user.name || 'Invigilator'}</h2>
                <p className="text-sm" style={{ color: '#94a3b8' }}>Select an option from the sidebar to get started.</p>
              </div>
            </div>
          ) : (
            <div className="p-8">
              <Outlet context={outletContext} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
