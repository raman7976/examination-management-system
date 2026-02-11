import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-slate-800">Welcome to Dashboard</h1>
      <p className="text-slate-600 mt-2">You have successfully logged into the Examination Portal.</p>
      <button 
        onClick={handleLogout}
        className="mt-6 bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 transition-all"
      >
        Logout
      </button>
    </div>
  );
}

export default Dashboard;