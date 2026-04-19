import { NavLink, Link } from 'react-router-dom';
import {
  Table2,
  BarChart3,
  Bell,
  Settings,
  Tag,
  Crown,
  MessageSquare,
  BookOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user, isSuperAdmin } = useAuth();

  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);

  useEffect(() => {
    if (user) fetchPopularTags();
  }, [user]);

  const fetchPopularTags = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('table_snapshots')
      .select('auto_tags')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching popular tags:', error);
      return;
    }

    if (data) {
      const tagCounts: Record<string, number> = {};
      data.forEach((snapshot) => {
        snapshot.auto_tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
      const sortedTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setTags(sortedTags);
    }
  };

  const navItems = [
    { to: '/dashboard', icon: Table2, label: 'My Tables' },
    { to: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/dashboard/query', icon: MessageSquare, label: 'Ask AI' },
    { to: '/dashboard/study', icon: BookOpen, label: 'Study' },
    { to: '/dashboard/reminders', icon: Bell, label: 'Reminders' },
    { to: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  // The nav + tags content is identical on desktop and inside the mobile drawer.
  // Extracting it here avoids duplicating JSX.
  const navContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 bg-blue-600 group-hover:bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
            <Table2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900 dark:text-white">TableSnap</span>
        </Link>
        {/* Close button — only visible inside the mobile drawer */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80'
              }`
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}

        {isSuperAdmin && (
          <NavLink
            to="/super-admin"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                isActive
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20'
              }`
            }
          >
            <Crown className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Super Admin</span>
          </NavLink>
        )}
      </nav>

      {/* Tags section */}
      {tags.length > 0 && (
        <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-1.5 px-3 mb-3">
            <Tag className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">
              Tags
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-3">
            {tags.map((tag) => (
              <div key={tag.tag} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/60">
                <span className="text-xs text-gray-700 dark:text-gray-200">{tag.tag}</span>
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {tag.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar — always in the normal document flow on md+ ───── */}
      <div className="hidden md:flex flex-col w-60 flex-shrink-0 h-screen bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800/80">
        {navContent}
      </div>

      {/* ── Mobile drawer overlay — slides in from the left ─────────────── */}
      {/* The outer div covers the full viewport and blocks interaction when open */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-all duration-300 ${
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {/* Semi-transparent backdrop — tap to close */}
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onClose}
        />

        {/* Drawer panel — slides in/out */}
        <div
          className={`absolute left-0 top-0 h-full w-64 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {navContent}
        </div>
      </div>
    </>
  );
}
