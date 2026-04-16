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
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function Sidebar() {
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

  return (
    <div className="w-60 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800/80 flex flex-col h-screen">
      {/* Logo — clicking it goes back to the landing page */}
      <div className="px-5 py-5 border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 bg-blue-600 group-hover:bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
            <Table2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900 dark:text-white">TableSnap</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
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

      {/* Bottom: Tags section */}
      {tags.length > 0 && (
        <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-1.5 px-3 mb-3">
            <Tag className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">
              Tags
            </span>
          </div>
          {/* Two-column grid: tag name on the left, count on the right */}
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
    </div>
  );
}
