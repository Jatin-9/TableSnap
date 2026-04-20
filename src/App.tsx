import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './components/Landing/LandingPage';
import LoginPage from './components/Auth/LoginPage';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import DashboardLayout from './components/Layout/DashboardLayout';
import TablesPage from './components/Dashboard/TablesPage';
import AnalyticsPage from './components/Dashboard/AnalyticsPage';
import RemindersPage from './components/Dashboard/RemindersPage';
import SettingsPage from './components/Dashboard/SettingsPage';
import NLQPage from './components/Dashboard/NLQPage';
import StudyPage from './components/Dashboard/StudyPage';
import SuperAdminPage from './components/SuperAdmin/SuperAdminPage';
import SharedTablePage from './components/Share/SharedTablePage';
import ResetPasswordPage from './components/Auth/ResetPasswordPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster, toast } from 'sonner';

// Detects the ?upgraded=true param Lemon Squeezy appends after a successful payment.
// The webhook that actually flips the tier in the DB fires asynchronously — it can
// arrive 1–5 seconds after the redirect. So we poll the DB every 2s for up to 12s
// until the tier becomes 'pro', then force a page reload so all hooks get fresh data.
function UpgradeSuccessHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upgraded') !== 'true') return;

    // Strip the param immediately so it doesn't re-trigger on refresh
    params.delete('upgraded');
    navigate({ search: params.toString() }, { replace: true });

    if (!user) return;

    toast.loading('Activating your Pro account…', { id: 'upgrade-pending' });

    let attempts = 0;
    const maxAttempts = 6; // 6 × 2s = 12 seconds total

    const poll = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('users')
        .select('tier')
        .eq('id', user.id)
        .single();

      if (data?.tier === 'pro') {
        clearInterval(poll);
        toast.dismiss('upgrade-pending');
        toast.success('Welcome to Pro! Your account has been upgraded.', { duration: 6000 });
        // Reload so useUsage and all other hooks pick up the new tier
        window.location.reload();
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        toast.dismiss('upgrade-pending');
        // Webhook may be delayed — prompt the user to refresh manually
        toast.error('Upgrade is taking longer than expected. Please refresh the page.', { duration: 10000 });
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [location.search, user]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        {/* Toaster renders the toast notifications — richColors gives red/green/yellow styling automatically */}
        <Toaster position="top-right" richColors />
        <BrowserRouter>
          <UpgradeSuccessHandler />
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* made dashboard the default page as I want to make upload page modal */}

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<TablesPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="reminders" element={<RemindersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Natural Language Query page — lets users chat with their table data */}
              <Route path="query" element={<NLQPage />} />
              {/* Flashcard study mode — only 2-column tables appear here */}
              <Route path="study" element={<StudyPage />} />
            </Route>

            <Route
              path="/super-admin"
              element={
                <ProtectedRoute requireAdmin>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<SuperAdminPage />} />
            </Route>

            {/* Public share route — no login required */}
            <Route path="/share/:id" element={<SharedTablePage />} />

            {/* Password reset — user arrives here via the email link */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;