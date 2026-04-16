import { Table2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const footerLinks = [
  { to: '/', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { to: '/login', label: 'Login' },
];

export default function Footer() {
  return (
    <footer className="border-t border-gray-200/50 dark:border-gray-800/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo and tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Table2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">TableSnap</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Snap a photo. Get a table. Talk to your data.
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {footerLinks.map((link) =>
              'to' in link ? (
                <Link
                  key={link.label}
                  to={link.to!}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              )
            )}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200/50 dark:border-gray-800/50 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Built for students, researchers, and language learners worldwide.
          </p>
          <p className="text-xs text-gray-400/60 dark:text-gray-500/60 mt-2">
            © {new Date().getFullYear()} TableSnap. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
