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
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (error) {
      alert("❌ " + (error.response?.data?.message || "Login Failed"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f7f4]">

      {/* ── Top Bar ── */}
      <header className="bg-[#8B1A1A] shadow-md">
        <div className="w-full flex items-center justify-between px-8 py-3">
          <div className="hidden sm:block">
            <p className="text-white text-[25px] font-semibold tracking-wide leading-tight">
              The LNM Institute of Information Technology
            </p>
            <p className="text-red-200 text-[10px] tracking-widest uppercase">
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <img src={logo} alt="LNMIIT_LOGO" className="h-10 w-auto object-contain bg-white rounded p-0.5" />
        </div>
      </header>

      {/* ── Thin Accent Stripe ── */}
      <div className="h-[3px] bg-gradient-to-r from-[#8B1A1A] via-[#d4544a] to-[#8B1A1A]" />

      {/* ── Main Content ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {/* Card */}
          <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">

            {/* Card Header — Maroon band */}
            <div className="bg-[#8B1A1A] px-8 py-5 text-center">
              <h1 className="text-white text-lg font-semibold tracking-wide">
                Examination Portal Login
              </h1>
              <p className="text-red-200 text-[11px] mt-1 tracking-wider uppercase">
                Authorized Personnel Only
              </p>
            </div>

            {/* Card Body */}
            <div className="px-8 py-8">

              {/* Department Name — centered */}
              <div className="flex justify-center mb-7">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  Examination Department
                </h2>
              </div>

              {/* Form Fields */}
              <div className="space-y-5">

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Email ID <span className="text-[#8B1A1A]">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="username@lnmiit.ac.in"
                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Password <span className="text-[#8B1A1A]">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={handleLogin}
                  className="w-full bg-[#8B1A1A] hover:bg-[#721515] active:bg-[#5e1111] text-white font-semibold py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm tracking-wide uppercase"
                >
                  Sign In
                </button>

                <div className="text-center">
                  <Link to="/forgotPassword">
                    <button className="text-xs text-[#8B1A1A] hover:text-[#5e1111] font-medium hover:underline transition-colors">
                      Forgot Password?
                    </button>
                  </Link>
                </div>
              </div>

            </div>

            {/* Card Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-8 py-3 text-center">
              <p className="text-[10px] text-slate-400 tracking-wide uppercase">
                Secure · Encrypted · Institutional Access
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#8B1A1A] py-5 px-6 text-center">
        <p className="text-red-100 text-xs font-medium tracking-wide">
          The LNM Institute of Information Technology, Jaipur
        </p>
        <p className="text-red-300/60 text-[10px] mt-1 tracking-wider">
          Deemed-to-be-University under Section 3 of UGC Act, 1956
        </p>
      </footer>

    </div>
  );
}
export default Login;