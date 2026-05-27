import { Navigate, Outlet } from 'react-router-dom';

export default function AdminRoute() {
  const token = localStorage.getItem('token');
  const user  = (() => {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  })();

  if (!token)                 return <Navigate to="/"                   replace />;
  if (user?.role !== 'admin') return <Navigate to="/invigilator-portal" replace />;
  return <Outlet />;
}
