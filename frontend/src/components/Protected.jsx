import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from './ui';

function roleHome(role) {
  if (role === 'doctor') return '/doctor';
  if (role === 'admin') return '/admin';
  return '/patient/appointments';
}

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader full />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return <Outlet />;
}

export function roleHomeFor(role) {
  return roleHome(role);
}
