import { Navigate, Outlet } from 'react-router-dom';

// Gate for the invigilator portal. Admins are bounced to /dashboard — they
// have a different surface for the same data and should not land here.
// Missing token → login screen.
export default function InvigilatorRoute() {
  const token = localStorage.getItem('token');
  const user  = (() => {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  })();

  if (!token)                  return <Navigate to="/"          replace />;
  if (user?.role === 'admin')  return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
