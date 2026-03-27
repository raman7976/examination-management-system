import { Navigate, Outlet } from 'react-router-dom';

function ProtectedRoute() {
  // 1. Check if the user has a VIP Wristband in their browser storage
  const token = localStorage.getItem('token');

  // 2. If no token exists, immediately redirect them to the Login page.
  // The "replace" keyword ensures they can't use the back button to return to the locked page.
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // 3. If they DO have a token, let them through to the child routes (the dashboard).
  return <Outlet />;
}

export default ProtectedRoute;