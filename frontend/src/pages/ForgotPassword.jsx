import { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";
import { sendOtp, resetPassword } from "../api/api.js";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleOtpRequest = async () => {
    if (!email) { setError("Please enter your email first."); return; }
    setError("");
    try {
      await sendOtp({ email });
      setSuccess("OTP sent! Check your console/email.");
    } catch (error) {
      setError(error.response?.data?.message || "Failed to send OTP.");
    }
  };

  const handleReset = async () => {
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    try {
      await resetPassword({ email, otp, newPassword });
      setSuccess("Password reset successfully! You can now login.");
      setError("");
    } catch (error) {
      setError(error.response?.data?.message || "Reset Failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleReset();
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
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #8B1A1A, #c2524a 30%, #d4978f 50%, #c2524a 70%, #8B1A1A)' }} />

      {/* ── Main ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">

          <div className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>

            {/* Card Header */}
            <div className="px-8 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(180deg, #8B1A1A 0%, #7a1518 100%)' }}>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <h1 className="text-white text-lg font-semibold" style={{ fontFamily: "'Inter', sans-serif" }}>
                Reset Password
              </h1>
              <p className="text-[11px] mt-1.5 tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Recover your portal access
              </p>
            </div>

            {/* Card Body */}
            <div className="px-8 py-7">

              {error && (
                <div className="mb-4 px-4 py-3 rounded-md text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 px-4 py-3 rounded-md text-sm" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  {success}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>Email Address</label>
                    <button onClick={handleOtpRequest} type="button"
                      className="text-[10px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none" style={{ color: '#8B1A1A' }}
                      onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                      Send OTP
                    </button>
                  </div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="your-email@lnmiit.ac.in"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{ border: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc' }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>OTP Code</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="123456"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{ border: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc' }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="••••••••"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{ border: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc' }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="••••••••"
                    className="w-full rounded-md px-4 py-2.5 text-sm transition-all duration-150"
                    style={{ border: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc' }}
                    onFocus={(e) => { e.target.style.borderColor = '#8B1A1A'; e.target.style.boxShadow = '0 0 0 3px rgba(139,26,26,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                </div>
              </div>

              <div className="mt-7">
                <button onClick={handleReset} disabled={loading}
                  className="w-full text-white font-semibold py-3 rounded-md text-sm tracking-wide uppercase transition-all duration-200"
                  style={{
                    background: loading ? '#a0a0a0' : 'linear-gradient(180deg, #8B1A1A 0%, #751616 100%)',
                    boxShadow: loading ? 'none' : '0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!loading) e.target.style.background = 'linear-gradient(180deg, #751616 0%, #5e1111 100%)'; }}
                  onMouseLeave={(e) => { if (!loading) e.target.style.background = 'linear-gradient(180deg, #8B1A1A 0%, #751616 100%)'; }}>
                  {loading ? 'Resetting...' : 'Set New Password'}
                </button>

                <div className="text-center mt-4">
                  <Link to="/">
                    <span className="text-xs font-medium hover:underline transition-colors" style={{ color: '#8B1A1A' }}>
                      ← Back to Login
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="px-8 py-3 text-center" style={{ background: '#fafaf9', borderTop: '1px solid #f1f1ef' }}>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: '#a8a29e' }}>
                Secure · Encrypted · Institutional Access
              </p>
            </div>
          </div>

        </div>
      </main>

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
export default ForgotPassword;