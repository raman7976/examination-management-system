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
    <div className="min-h-screen bg-slate-50 px-5 flex flex-col">
      <header className="py-8">
        <p className="text-center font-serif text-2xl text-black font-semibold">
          Examination Management Portal
        </p>
      </header>

      <main className="flex flex-1 items-center justify-center mb-24">
        <div className="w-full max-w-md bg-white p-10 rounded-2xl border border-slate-200 shadow-md">
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

          <div className="mt-8 space-y-3">
            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md shadow-sm transition-colors"
            >
              Login
            </button>
            <Link to="/forgotPassword">
              <button className="w-full mt-3 bg-green-800 hover:bg-green-900 text-white font-semibold py-2.5 rounded-md shadow-sm transition-colors">
                Forgot Password
              </button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
export default Login;