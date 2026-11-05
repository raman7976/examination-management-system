import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  UserCog,
  Upload,
  CalendarDays,
  Settings,
  LayoutGrid,
  Armchair,
  Users,
  ArrowLeftRight,
  FileText,
  Archive,
  ClipboardList,
  ShieldAlert,
  LogOut,
} from 'lucide-react';

import logo from '../assets/lnmiitLogo.jpg';
import { usePeriod } from '../context/usePeriod.js';
import ThemeToggle from '../components/ui/ThemeToggle.jsx';
import PageTransition from '../components/ui/PageTransition.jsx';

// ─────────────────────────────────────────────────────────────────────────────
//  Admin Dashboard layout — sidebar + top bar + outlet.
//
//  Visual notes:
//   • Solid `bg-surface` top bar with a 1-px divider. The previous busy
//     maroon gradient read as "branded splash screen"; this is closer to
//     real institutional admin tools (DigiLocker, eGov dashboards).
//   • The 10 tabs are grouped into 4 sections so the sidebar feels less
//     like a dump.
//   • The active-link indicator (2-px maroon bar on the left edge) is a
//     SINGLE motion.div with a shared `layoutId`, so it slides smoothly
//     between tabs instead of teleporting.
//   • <Outlet/> is wrapped in <PageTransition/> so every tab fades in.
// ─────────────────────────────────────────────────────────────────────────────

// Tabs grouped semantically. Adjust labels here — nowhere else.
const NAV_SECTIONS = [
  {
    label: 'Setup',
    items: [
      { path: '/dashboard/registration', name: 'Registration', icon: UserCog },
      { path: '/dashboard/add-course',   name: 'Import Data',  icon: Upload },
      { path: '/dashboard/add-exam',     name: 'Add Exam Slot', icon: CalendarDays },
    ],
  },
  {
    label: 'Schedule',
    items: [
      { path: '/dashboard/smart-scheduling',    name: 'Smart Scheduling',    icon: Settings },
      { path: '/dashboard/seating-manager',     name: 'Seating Manager',     icon: LayoutGrid },
      { path: '/dashboard/seating-arrangement', name: 'Seating Arrangement', icon: Armchair },
    ],
  },
  {
    label: 'Invigilation',
    items: [
      { path: '/dashboard/invigilator-scheduling', name: 'Invigilator Scheduling', icon: Users },
      { path: '/dashboard/swap-approval',          name: 'Swap Approval',          icon: ArrowLeftRight },
      { path: '/dashboard/unfair-means',           name: 'Unfair Means',           icon: ShieldAlert },
    ],
  },
  {
    label: 'Reports',
    items: [
      { path: '/dashboard/pdf-reports',        name: 'PDF Reports',        icon: FileText },
      { path: '/dashboard/past-exams',         name: 'Past Exams',         icon: Archive },
      { path: '/dashboard/past-invigilation',  name: 'Past Invigilation',  icon: ClipboardList },
    ],
  },
];

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { periodsLoaded, periodsError, activePeriod } = usePeriod();
  const onRegistration = location.pathname.startsWith('/dashboard/registration');

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user')) || {}; }
    catch { return {}; }
  })();

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const isDefaultDashboard =
    location.pathname === '/dashboard' || location.pathname === '/dashboard/';

  return (
    <div className="flex flex-col h-screen bg-bg text-text">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="bg-surface border-b border-border">
        <div className="w-full flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="LNMIIT"
              className="h-9 w-auto object-contain bg-white rounded-sm p-0.5 border border-border"
            />
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold text-text">
                The LNM Institute of Information Technology
              </p>
              <p className="text-[10px] tracking-[0.18em] uppercase text-textFaint">
                Examination Portal · Admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-border">
              <div
                className="w-8 h-8 rounded-full bg-brand-500 text-white text-xs font-bold uppercase flex items-center justify-center"
                title={user.email || ''}
              >
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-text">{user.name || 'User'}</p>
                <p className="text-[10px] text-textFaint truncate max-w-[160px]">{user.email || ''}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* `min-h-0` is the critical bit — without it, this flex child inherits
          `min-height: auto`, which lets its content push the row taller than
          the viewport and silently disables the scroll inside <main>. With
          `min-h-0`, the row's height is bounded and <main>'s overflow-y-auto
          actually clips + scrolls long pages like Registration / InvigScheduling. */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside className="w-60 flex flex-col border-r border-border bg-surface2 min-h-0">
          <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-textFaint px-3 mb-1.5">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <NavLink
                        key={tab.path}
                        to={tab.path}
                        end={false}
                        className={({ isActive }) =>
                          [
                            'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors duration-fast ease-out',
                            isActive
                              ? 'font-semibold text-brand-500 bg-brand-500/10'
                              : 'font-medium text-textMuted hover:text-text hover:bg-surface',
                          ].join(' ')
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Sliding active indicator — Framer Motion shared
                                layoutId, so it animates between tabs. */}
                            {isActive && (
                              <motion.span
                                layoutId="sidebar-active-marker"
                                transition={{ type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-brand-500 rounded-r-full"
                              />
                            )}
                            <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
                            <span className="truncate">{tab.name}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sign out — always pinned to the bottom */}
          <div className="px-3 py-3 border-t border-border">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-textMuted hover:text-danger hover:bg-danger/10 transition-colors duration-fast ease-out cursor-pointer"
            >
              <LogOut size={16} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-bg min-h-0">
          {isDefaultDashboard ? (
            <div className="flex items-center justify-center h-full px-6">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                  <LayoutGrid size={28} strokeWidth={1.5} className="text-brand-500" />
                </div>
                <h2 className="text-lg font-semibold text-text mb-1">Examination Management</h2>
                <p className="text-sm text-textFaint">
                  Select an option from the sidebar to get started.
                </p>
              </div>
            </div>
          ) : (
            <div className="px-8 py-6">
              {/* Active-period strip — read-only display on every tab EXCEPT Registration */}
              {periodsLoaded && !periodsError && activePeriod && !onRegistration && (
                <div className="mb-5 bg-surface border border-border rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-bold uppercase tracking-[0.18em] text-textFaint">
                    Active
                  </span>
                  <span className="text-sm font-semibold text-text">
                    {activePeriod.semester_label}
                  </span>
                  <span className="text-textFaint">·</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-500 text-white">
                    {activePeriod.exam_type}
                  </span>
                  <span className="ml-auto text-[10px] text-textFaint italic">
                    Manage periods from <b className="text-textMuted">Registration</b>
                  </span>
                </div>
              )}

              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
