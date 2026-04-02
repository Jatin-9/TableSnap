import { NavLink } from 'react-router-dom';
import {
  Table2,
  BarChart3,
  Bell,
  Settings,
  Tag,
  Search,
  Crown,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function Sidebar() {
  const { user, signOut, isSuperAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user) {
      fetchPopularTags();
    }
  }, [user]);

  const fetchPopularTags = async () => {
    const { data } = await supabase
      .from('table_snapshots')
      .select('auto_tags')
      .eq('user_id', user!.id);

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

  const handleSignOut = async () => {
    await signOut();
  };

  const navItems = [
    { to: '/dashboard', icon: Table2, label: 'My Tables' },
    { to: '/dashboard/analytics', icon: BarChart3, label: 'My Analytics' },
    { to: '/dashboard/reminders', icon: Bell, label: 'Reminders' },
    { to: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen dark:bg-gray-900 dark:border-gray-800">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Table2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">TableSnap</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400"
          />
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}

        {isSuperAdmin && (
          <NavLink
            to="/super-admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20'
              }`
            }
          >
            <Crown className="w-5 h-5" />
            <span className="font-medium">Super Admin</span>
          </NavLink>
        )}

        {tags.length > 0 && (
          <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 px-4 mb-3">
              <Tag className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Popular Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-2 px-4">
              {tags.map((tag) => (
                <span
                  key={tag.tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium hover:bg-gray-200 cursor-pointer transition-colors dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {tag.tag}
                  <span className="text-gray-500 dark:text-gray-400">({tag.count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-700 hover:bg-gray-50 rounded-lg transition-colors dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="font-medium">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-700 hover:bg-gray-50 rounded-lg transition-colors dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}