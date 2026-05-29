import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, ShieldCheck } from 'lucide-react';

import logo from '../assets/lnmiitLogo.jpg';
import { loginUser } from '../api/api.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import ThemeToggle from '../components/ui/ThemeToggle.jsx';
import { slideUp } from '../design/motion.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Login — institutional sign-in page.
//
//  Visual notes:
//   • One solid maroon top bar (no gradient) + a thin 2-px accent rule —
//     reads quieter and more government-portal than the previous busy gradient.
//   • A single elevated Card slides up on mount.
//   • Errors render INLINE (no toasts, no alert()s) so the user can read them
//     while they fix the input.
//   • ThemeToggle lives in the top bar so dark mode is reachable before login.
// ─────────────────────────────────────────────────────────────────────────────
export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e?.preventDefault?.();
    if (!email || !password) { setError('Please enter both email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await loginUser({ email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({
        id:    data.user.id,
        name:  data.user.name,
        email: data.user.email,
        role:  data.user.role,
      }));
      navigate(data.user.role === 'admin' ? '/dashboard' : '/invigilator-portal');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* ── Top Bar — solid brand colour, no gradient ── */}
      <header className="bg-brand-500 text-white">
        <div className="w-full flex items-center justify-between px-8 py-3.5">
          <div className="hidden sm:block">
            <p className="text-base font-semibold tracking-wide">
              The LNM Institute of Information Technology
            </p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5 text-white/55">
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle className="text-white/80 hover:text-white hover:bg-white/10" />
            <img
              src={logo}
              alt="LNMIIT"
              className="h-10 w-auto object-contain bg-white rounded-sm p-0.5"
            />
          </div>
        </div>
      </header>
      <div className="h-px bg-brand-700" />

      {/* ── Sign-in card ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div {...slideUp} className="w-full max-w-[420px]">
          <Card padding="none" className="overflow-hidden">
            {/* Lock icon header */}
            <div className="px-7 pt-7 pb-5 text-center border-b border-border">
              <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
                <ShieldCheck size={20} strokeWidth={1.75} />
              </div>
              <h1 className="text-base font-semibold text-text">Examination Portal</h1>
              <p className="text-[10px] mt-1.5 tracking-[0.2em] uppercase text-textFaint">
                Authorized personnel only
              </p>
            </div>

            {/* Form body */}
            <form onSubmit={handleLogin} className="px-7 py-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 rounded-md text-sm bg-danger/10 text-danger border border-danger/30"
                >
                  {error}
                </div>
              )}

              <Input
                label="Email address"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username@lnmiit.ac.in"
                icon={<Mail size={15} />}
              />

              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                icon={<Lock size={15} />}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                disabled={loading}
                className="w-full mt-2"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>

              <div className="text-center pt-1">
                <Link
                  to="/forgotPassword"
                  className="text-xs font-medium text-brand-500 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </form>

            {/* Footer micro-copy */}
            <div className="px-7 py-2.5 text-center bg-surface2 border-t border-border">
              <p className="text-[10px] tracking-[0.18em] uppercase text-textFaint">
                Secure · Encrypted · Institutional access
              </p>
            </div>
          </Card>
        </motion.div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 px-6 text-center border-t border-border bg-surface">
        <p className="text-xs font-medium text-textMuted">
          The LNM Institute of Information Technology, Jaipur
        </p>
        <p className="text-[10px] mt-0.5 tracking-wider text-textFaint">
          Deemed-to-be-University under Section 3 of UGC Act, 1956
        </p>
      </footer>
    </div>
  );
}
