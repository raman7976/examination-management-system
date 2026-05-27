import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  })();

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  const navigationTabs = [
    { name: "Registration", path: "/dashboard/registration", icon: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" },
    { name: "Import Data", path: "/dashboard/add-course", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" },
    { name: "Add Exam Slot", path: "/dashboard/add-exam", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
    { name: "Smart Scheduling", path: "/dashboard/smart-scheduling", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    { name: "Seating Manager", path: "/dashboard/seating-manager", icon: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" },
    { name: "Seating Arrangement", path: "/dashboard/seating-arrangement", icon: "M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" },
    { name: "PDF Reports", path: "/dashboard/pdf-reports", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
    { name: "Past Exams", path: "/dashboard/past-exams", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
  ];

  const isDefaultDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Top Bar ── */}
      <header style={{ background: 'linear-gradient(90deg, #7a1518, #8B1A1A 40%, #8B1A1A 60%, #7a1518)' }}>
        <div className="w-full flex items-center justify-between px-6 py-3">
          <div className="hidden sm:block">
            <p className="text-white text-lg font-semibold tracking-wide" style={{ letterSpacing: '0.01em' }}>
              The LNM Institute of Information Technology
            </p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-xs font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>Examination Portal</span>
            <img src={logo} alt="LNMIIT_LOGO" className="h-10 w-auto object-contain bg-white rounded-sm" style={{ padding: '2px' }} />
          </div>
        </div>
      </header>
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #8B1A1A, #c2524a 30%, #d4978f 50%, #c2524a 70%, #8B1A1A)' }} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-56 flex flex-col border-r" style={{ background: '#fafaf9', borderColor: '#eee' }}>

          {/* User card */}
          <div className="px-4 py-4 border-b" style={{ borderColor: '#eee' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B1A1A, #a52a2a)' }}>
                {user.name ? user.name.charAt(0) : "U"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
                  {user.name || "User"}
                </p>
                <p className="text-[10px] truncate leading-tight" style={{ color: '#94a3b8' }}>
                  {user.email || ""}
                </p>
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {navigationTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-all duration-150 ${isActive
                    ? "font-semibold"
                    : "font-normal hover:bg-slate-100"
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? '#8B1A1A' : '#475569',
                  background: isActive ? 'rgba(139,26,26,0.06)' : 'transparent',
                })}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                {tab.name}
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

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f6' }}>
          {isDefaultDashboard ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,26,26,0.06)' }}>
                  <svg className="w-7 h-7" style={{ color: '#8B1A1A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-700 mb-1">Examination Management</h2>
                <p className="text-sm" style={{ color: '#94a3b8' }}>
                  Select an option from the sidebar to get started.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;