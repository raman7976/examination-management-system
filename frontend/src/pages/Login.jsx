import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";
import { loginUser } from "../api/api.js"; // Importing the service

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const { data } = await loginUser({ email, password });
      alert("✅ " + data.message);
      localStorage.setItem("token", data.token);
      navigate("/dashboard"); 
    } catch (error) {
      alert("❌ " + (error.response?.data?.message || "Login Failed"));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 justify-between flex flex-col">
        {/* Top Branding Bar */}
      <div className="bg-[#8B1A1A] flex justify-center items-center p-2">
             <div className="font-light text-white">
                    Examination Portal
             </div>
      </div>


      <main className="flex items-center justify-center ">
        <div className="w-full max-w-sm bg-white p-10 rounded-2xl border border-slate-200 shadow-md font-sans">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="LNMIIT_LOGO" className="h-16 w-auto object-contain" />
          </div>

          <div className="grid grid-cols-3 gap-y-5 items-center w-full">
            <label className="text-sm font-medium text-slate-700">Email ID<span className="text-red-500">*</span></label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />

            <label className="text-sm font-medium text-slate-700">Password<span className="text-red-500">*</span></label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />
          </div>

          <div className="mt-8 space-y-3 flex flex-col items-center justify-center">
            <button 
              onClick={handleLogin}
              className="w-7/12 bg-[#992c2c] text-white font-light py-2.5  rounded-md shadow-sm transition-colors"
            >
              Login
            </button>
            <Link to="/forgotPassword">
              <button className="  font-normal text-xs text-blue-900 rounded-md ">
                Forgot Password?
              </button>
            </Link>
          </div>
          
        </div>
      </main>
       {/* Footer Info */}
      <footer className="bg-slate-100 py-6 px-8 text-center text-slate-500 text-sm">
       
        <p>The LNM Institute of Information Technology, Jaipur (Deemed-to-be-University)</p>
      </footer>
    </div>
  );
}
export default Login;