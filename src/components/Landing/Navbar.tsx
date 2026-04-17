import { Table2, Menu, X, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useAuth();
  const isLoggedIn = !loading && !!user;

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="glass border-b border-gray-200/50 dark:border-gray-800/50">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center group-hover:bg-blue-700 transition-colors">
              <Table2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">TableSnap</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {/* Render nothing until auth resolves to avoid flashing logged-out buttons */}
            {!loading && (isLoggedIn ? (
              <Link
                to="/dashboard"
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Log in
                </Link>
                <Link
                  to="/login"
                  className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                  Get Started
                </Link>
              </>
            ))}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile dropdown menu */}
      {isOpen && (
        <div className="md:hidden glass border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 flex flex-col gap-2">
              {!loading && (isLoggedIn ? (
                <Link
                  to="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-center text-sm font-medium transition-colors"
                >
                  Dashboard →
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="w-full py-2 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/login"
                    className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-center text-sm font-medium transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
