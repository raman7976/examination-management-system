import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";
import { loginUser } from "../api/api.js";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setError("");
    setIsLoading(true);
    try {
      const { data } = await loginUser({ email, password });
      alert("✅ " + data.message);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (error) {
      setError(error.response?.data?.message || "Login Failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #faf9f7 0%, #f3f0ec 50%, #ece7e0 100%)' }}>

      {/* ── Top Bar ── */}
      <header style={{ background: 'linear-gradient(90deg, #7a1518, #8B1A1A 40%, #8B1A1A 60%, #7a1518)' }}>
        <div className="w-full flex items-center justify-between px-8 py-4">
          <div className="hidden sm:block">
            <p className="text-white text-2xl font-semibold tracking-wide" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.01em' }}>
              The LNM Institute of Information Technology
            </p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-xs font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>Examination Portal</span>
            <img src={logo} alt="LNMIIT_LOGO" className="h-11 w-auto object-contain bg-white rounded-sm" style={{ padding: '2px' }} />
          </div>
        </div>
      </header>

      {/* ── Accent Line ── */}
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #8B1A1A, #c2524a 30%, #d4978f 50%, #c2524a 70%, #8B1A1A)' }} />

      {/* ── Main ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px]">

          {/* Card */}
          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>

            {/* Card Header */}
            <div className="px-8 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(180deg, #8B1A1A 0%, #7a1518 100%)' }}>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h1 className="text-white text-lg font-semibold" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.01em' }}>
                Examination Portal
              </h1>
              <p className="text-[11px] mt-1.5 tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Authorized Personnel Only
              </p>
            </div>

            {/* Card Body */}
            <div className="px-8 py-7">

              {/* Error Message */}
              {error && (
                <div className="mb-5 px-4 py-3 rounded-md text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              {/* Fields */}
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="username@lnmiit.ac.in"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{
                      border: '1px solid #e2e8f0',
                      color: '#334155',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••••"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{
                      border: '1px solid #e2e8f0',
                      color: '#334155',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-7">
                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="w-full text-white font-semibold py-3 rounded-md text-sm tracking-wide uppercase transition-all duration-200"
                  style={{
                    background: isLoading ? '#a0a0a0' : 'linear-gradient(180deg, #8B1A1A 0%, #751616 100%)',
                    boxShadow: isLoading ? 'none' : '0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!isLoading) e.target.style.background = 'linear-gradient(180deg, #751616 0%, #5e1111 100%)'; }}
                  onMouseLeave={(e) => { if (!isLoading) e.target.style.background = 'linear-gradient(180deg, #8B1A1A 0%, #751616 100%)'; }}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="text-center mt-4">
                  <Link to="/forgotPassword">
                    <span className="text-xs font-medium hover:underline transition-colors" style={{ color: '#8B1A1A' }}>
                      Forgot Password?
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Card Footer */}
            <div className="px-8 py-3 text-center" style={{ background: '#fafaf9', borderTop: '1px solid #f1f1ef' }}>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: '#a8a29e' }}>
                Secure · Encrypted · Institutional Access
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-5 px-6 text-center" style={{ background: 'linear-gradient(90deg, #7a1518, #8B1A1A 40%, #8B1A1A 60%, #7a1518)' }}>
        <p className="text-xs font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.8)' }}>
          The LNM Institute of Information Technology, Jaipur
        </p>
        <p className="text-[10px] mt-1 tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Deemed-to-be-University under Section 3 of UGC Act, 1956
        </p>
      </footer>

    </div>
  );
}
export default Login;