import { Outlet, NavLink } from "react-router-dom";

function DashboardLayout() {
  // 1. Define tabs in ONE place. 
  // If you add a 3rd tab tomorrow, you only change this array.
  const navigationTabs = [
    { name: "Add Exam Slot",      path: "/dashboard/add-exam" },
    { name: "Add Course to Slot", path: "/dashboard/add-course" },
    { name: "Seating Manager",    path: "/dashboard/seating-manager" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* HEADER: Static top bar */}
       <header className="bg-[#8B1A1A] flex justify-center items-center p-2">
             <div className="font-light text-white">
                    Examination Portal
             </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR: Aside tag used for navigation */}
        <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col p-4 space-y-2">
          
          {/* 2. Map through tabs to avoid repeating code */}
          {navigationTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `p-3 rounded-md transition-all border-l-4 ${
                  isActive
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