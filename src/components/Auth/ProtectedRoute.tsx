import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, supabaseUser, loading } = useAuth();

  if (loading) {
    // Return null instead of a spinner — the auth check reads from localStorage
    // and completes in under 50ms, so a spinner would just flash and disappear,
    // which looks worse than showing nothing. The page's own skeleton handles
    // the visible loading state once the auth check is done.
    return null;
  }

  if (!supabaseUser) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin) {
    if (!user) {
      // Same reasoning — return null while the admin role check resolves
      return null;
    }

    if (user.role !== 'super_admin') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
