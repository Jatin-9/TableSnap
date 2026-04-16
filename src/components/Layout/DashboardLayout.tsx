import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import UploadPage from '../Upload/UploadPage';
import { Moon, Sun, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';

export default function DashboardLayout() {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [savingTheme, setSavingTheme] = useState(false);

  const handleThemeToggle = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (!user) return;
    try {
      setSavingTheme(true);
      await supabase.from('users').update({ themeCheck: nextTheme }).eq('id', user.id);
    } catch { /* ignore */ } finally {
      setSavingTheme(false);
    }
  };

  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    const openHandler = () => setShowUploadModal(true);
    const closeHandler = () => setShowUploadModal(false);

    window.addEventListener('open-upload-modal', openHandler);
    window.addEventListener('close-upload-modal', closeHandler);

    return () => {
      window.removeEventListener('open-upload-modal', openHandler);
      window.removeEventListener('close-upload-modal', closeHandler);
    };
  }, []);

  const handleSaved = () => {
    setShowUploadModal(false);
    window.dispatchEvent(new Event('refresh-tables'));
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-gray-100">
      <Sidebar />

      {/* Top-right: theme toggle + sign out icon buttons */}
      <div className="fixed top-4 right-5 z-20 flex items-center gap-1.5">
        <button
          onClick={handleThemeToggle}
          disabled={savingTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {savingTheme ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={signOut}
          title="Sign out"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-zinc-950">
        <Outlet />
      </main>

      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-6xl max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <UploadPage
              onSaved={handleSaved}
              onClose={() => setShowUploadModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}