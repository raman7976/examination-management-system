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
    <div className="min-h-screen bg-slate-50 justify-between flex flex-col">
      {/* Top Branding Bar */}
      <div className="bg-[#8B1A1A] flex justify-center items-center p-2">
             <div className="font-light text-white">
                    Examination Portal
             </div>
      </div>

      <main className="flex flex-1 items-center justify-center ">
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
                className="font-normal text-xs text-blue-900 rounded-md float-right mt-1 underline cursor-pointer"
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

          <div className="mt-8 space-y-3 flex flex-col items-center justify-center">
            <button 
              onClick={handleReset}
              className="w-7/12 bg-[#992c2c] text-white font-light py-2.5  rounded-md shadow-sm transition-colors"
            >
              Set New Password
            </button>
            <Link to="/">
              <button className="font-normal text-xs text-blue-900 rounded-md">
                Move to Login?
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
export default ForgotPassword;