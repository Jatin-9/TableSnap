import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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
import { Toaster } from 'sonner';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        {/* Toaster renders the toast notifications — richColors gives red/green/yellow styling automatically */}
        <Toaster position="top-right" richColors />
        <BrowserRouter>
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