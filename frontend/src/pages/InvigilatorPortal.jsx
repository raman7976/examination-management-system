import { useNavigate } from 'react-router-dom';
import logo from '../assets/lnmiitLogo.jpg';

const ROLE_LABELS = {
  faculty:     'Faculty',
  phd_student: 'PhD Student',
  lab_staff:   'Lab Staff',
};

export default function InvigilatorPortal() {
  const navigate = useNavigate();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user')) || {}; }
    catch { return {}; }
  })();

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header — same style as Dashboard */}
      <header style={{ background: 'linear-gradient(90deg, #7a1518, #8B1A1A 40%, #8B1A1A 60%, #7a1518)' }}>
        <div className="w-full flex items-center justify-between px-6 py-3">
          <div className="hidden sm:block">
            <p className="text-white text-lg font-semibold tracking-wide">The LNM Institute of Information Technology</p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Deemed-to-be-University · Jaipur
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-xs font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Invigilator Portal
            </span>
            <img src={logo} alt="LNMIIT_LOGO" className="h-10 w-auto object-contain bg-white rounded-sm" style={{ padding: '2px' }} />
          </div>
        </div>
      </header>
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #8B1A1A, #c2524a 30%, #d4978f 50%, #c2524a 70%, #8B1A1A)' }} />

      {/* Centered card */}
      <main className="flex-1 flex items-center justify-center" style={{ background: '#f8f8f6' }}>
        <div className="bg-white rounded-xl p-10 max-w-md w-full text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center text-white text-2xl font-bold uppercase"
            style={{ background: 'linear-gradient(135deg, #8B1A1A, #a52a2a)' }}>
            {user.name ? user.name.charAt(0) : 'I'}
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-1">Welcome, {user.name || 'Invigilator'}</h1>
          <p className="text-sm font-medium mb-1" style={{ color: '#8B1A1A' }}>{ROLE_LABELS[user.role] || user.role}</p>
          <p className="text-xs text-slate-400 mb-8">{user.email}</p>

          <div className="p-4 rounded-lg mb-8" style={{ background: '#fafaf9', border: '1px solid #eee' }}>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your invigilation duty details will appear here once assigned by the examination office.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md text-white transition-all cursor-pointer"
            style={{ background: '#8B1A1A' }}
            onMouseEnter={e => e.currentTarget.style.background = '#721515'}
            onMouseLeave={e => e.currentTarget.style.background = '#8B1A1A'}>
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
