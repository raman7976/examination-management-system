import { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/lnmiitLogo.jpg";
import { sendOtp, resetPassword } from "../api/api.js";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleOtpRequest = async () => {
    try {
      await sendOtp({ email });
      alert("📩 OTP sent to your console!");
    } catch (error) {
      alert("❌ " + (error.response?.data?.message || "Error"));
    }
  };

  const handleReset = async () => {
    if (newPassword !== confirmPassword) return alert("❌ Passwords do not match!");
    try {
      await resetPassword({ email, otp, newPassword });
      alert("✅ Password Reset Successfully!");
    } catch (error) {
      alert("❌ " + (error.response?.data?.message || "Reset Failed"));
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

          <div className="grid grid-cols-3 gap-y-4 items-center w-full">
            <label className="text-sm font-medium text-slate-700">Email ID<span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@lnmiit.ac.in" 
                className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-50 text-sm text-slate-500" 
              />
              <button 
                onClick={handleOtpRequest}
                className="text-blue-700 text-xs font-bold float-right mt-1 underline cursor-pointer"
              >
                Send OTP
              </button>
            </div>

            <label className="text-sm font-medium text-slate-700 leading-tight">Enter OTP<span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2" 
            />

            <label className="text-sm font-medium text-slate-700 leading-tight">New Password<span className="text-red-500">*</span></label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2" 
            />
             <label className="text-sm font-medium text-slate-700 leading-tight">Confirm Password<span className="text-red-500">*</span></label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2" 
            />
          </div>

          <div className="mt-8 space-y-3">
            <button 
              onClick={handleReset}
              className="w-full bg-green-800 hover:bg-green-900 text-white font-semibold py-2.5 rounded-md shadow-sm transition-colors"
            >
              Set New Password
            </button>
            <Link to="/">
              <button className="w-full mt-3 bg-[#000080] hover:bg-blue-950 text-white font-semibold py-2.5 rounded-md shadow-sm transition-colors">
                Move to Login?
              </button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
export default ForgotPassword;