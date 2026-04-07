import { Outlet, NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";

function DashboardLayout() {
  const navigate = useNavigate();

  // Read user info from localStorage (stored during login)
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

  // 1. Define tabs in ONE place. 
  // If you add a 3rd tab tomorrow, you only change this array.
  const navigationTabs = [
    { name: "Data Import", path: "/dashboard/add-course" },
    { name: "Add Exam Slot", path: "/dashboard/add-exam" },
    { name: "Smart Scheduling", path: "/dashboard/smart-scheduling" },
    { name: "Seating Manager", path: "/dashboard/seating-manager" },
    { name: "Seating Arrangement", path: "/dashboard/seating-arrangement" },
  ];

  return (
    <div className="flex flex-col h-screen">

      {/* ── Top Bar — LNMIIT Branding ── */}
      <header className="bg-[#8B1A1A] shadow-md">
        <div className="w-full flex items-center justify-between px-8 py-3">

          {/* Left: Institute Name */}
          <div className="hidden sm:block">
            <p className="text-white text-[20px] font-semibold tracking-wide leading-tight">
              The LNM Institute of Information Technology
            </p>
            <p className="text-red-200 text-[10px] tracking-widest uppercase">
              Deemed-to-be-University · Jaipur
            </p>
          </div>

          {/* Right: Portal Name & Logo */}
          <div className="flex items-center gap-5 border-l border-[#b53a3a] pl-5">
            <div className="text-right hidden sm:block">
              <p className="text-white text-[15px] font-bold tracking-widest uppercase opacity-90">
                Examination Portal
              </p>
            </div>
            <img src={logo} alt="LNMIIT_LOGO" className="h-10 w-auto object-contain bg-white rounded p-0.5" />
          </div>

        </div>
      </header>

      {/* ── Thin Accent Stripe ── */}
      <div className="h-[3px] bg-gradient-to-r from-[#8B1A1A] via-[#d4544a] to-[#8B1A1A]" />

      {/* ── Secondary Bar — User Info & Sign Out ── */}
      <div className="bg-white border-b border-slate-200 px-8 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold uppercase">
            {user.name ? user.name.charAt(0) : "U"}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">
              {user.name || "User"}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">
              {user.email || "Examination Portal"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs font-semibold text-[#8B1A1A] hover:text-[#5e1111] border border-[#8B1A1A]/30 hover:border-[#8B1A1A] px-4 py-1.5 rounded-md transition-all duration-200 uppercase tracking-wider hover:bg-red-50"
        >
          Sign Out
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR: Aside tag used for navigation */}
        <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col p-4 space-y-2">

          {/* 2. Map through tabs to avoid repeating code */}
          {navigationTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `p-3 rounded-md transition-all border-l-4 ${isActive
                  ? "bg-white border-[#8B1A1A] text-[#8B1A1A] shadow-sm font-semibold"
                  : "border-transparent text-slate-600 hover:bg-slate-200"
                }`
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </aside>

        {/* MAIN CONTENT: The 'Outlet' swaps the pages here */}
        <main className="flex-1 bg-white overflow-y-auto p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;