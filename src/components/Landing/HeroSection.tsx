import { Sparkles, ArrowRight, Play, Table2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import FloatingWords from './FloatingWords';
import { useAuth } from '../../contexts/AuthContext';

export default function HeroSection() {
  const { user, loading } = useAuth();
  const isLoggedIn = !loading && !!user;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-blue-600/5 dark:from-gray-950 dark:via-gray-950 dark:to-blue-600/5" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse-glow" />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl animate-pulse-glow"
        style={{ animationDelay: '-2s' }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          {/* Badge */}
          <span className="inline-flex items-center mb-6 px-4 py-2 text-sm font-medium rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-500">
            <Sparkles className="w-4 h-4 mr-2" />
            {isLoggedIn ? `Welcome back, ${user!.email?.split('@')[0]}` : 'Powered by AI OCR'}
          </span>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="text-gray-900 dark:text-white">Turn Any Table Photo Into</span>
            <br />
            <span className="gradient-text">Organized Data</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload a photo of any table — receipts, textbooks, vocab sheets, menus.
            AI extracts it instantly. Then chat with it, study it, export it.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {isLoggedIn ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center text-base px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center text-base px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all"
              >
                Get Started Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            )}
            <a
              href="#how-it-works"
              className="inline-flex items-center text-base px-8 py-4 rounded-xl border border-blue-600/30 bg-blue-600/5 hover:bg-blue-600/15 hover:border-blue-600/50 text-gray-900 dark:text-white font-semibold transition-all"
            >
              <Play className="mr-2 w-5 h-5" />
              See How It Works
            </a>
          </div>

          {/* Hero visual mockup */}
          <div className="relative max-w-4xl mx-auto">
            <div className="glass-card rounded-2xl p-2 shadow-2xl shadow-blue-600/10">
              <div className="flex flex-col lg:flex-row gap-4 p-4 sm:p-6">
                {/* Left — camera/photo side */}
                <div className="flex-1 relative">
                  <div className="bg-gray-100/50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200/50 dark:border-gray-800/50">
                    <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center relative overflow-hidden">
                      {/* Camera viewfinder corners */}
                      <div className="absolute inset-4 border-2 border-dashed border-blue-600/30 rounded-lg" />
                      <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-blue-600/50" />
                      <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-blue-600/50" />
                      <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-blue-600/50" />
                      <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-blue-600/50" />

                      {/* Sample vocab table in viewfinder */}
                      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur rounded-lg p-3 shadow-lg transform rotate-1 scale-90">
                        <table className="text-xs">
                          <tbody>
                            <tr className="border-b border-gray-200/50 dark:border-gray-700/50">
                              <td className="p-1.5 font-medium">猫</td>
                              <td className="p-1.5 text-gray-500 dark:text-gray-400">cat</td>
                            </tr>
                            <tr className="border-b border-gray-200/50 dark:border-gray-700/50">
                              <td className="p-1.5 font-medium">犬</td>
                              <td className="p-1.5 text-gray-500 dark:text-gray-400">dog</td>
                            </tr>
                            <tr className="border-b border-gray-200/50 dark:border-gray-700/50">
                              <td className="p-1.5 font-medium">鳥</td>
                              <td className="p-1.5 text-gray-500 dark:text-gray-400">bird</td>
                            </tr>
                            <tr>
                              <td className="p-1.5 font-medium">魚</td>
                              <td className="p-1.5 text-gray-500 dark:text-gray-400">fish</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-3">
                      Japanese Vocabulary Sheet
                    </p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center lg:py-0 py-2">
                  <div className="w-12 h-12 rounded-full bg-blue-600/10 flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-blue-500 rotate-90 lg:rotate-0" />
                  </div>
                </div>

                {/* Right — extracted table */}
                <div className="flex-1 relative">
                  <div className="bg-gray-100/50 dark:bg-gray-800/50 rounded-xl p-4 border border-blue-600/30 shadow-lg shadow-blue-600/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Table2 className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold text-sm">Extracted Table</span>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        98% Confident
                      </span>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-blue-600/20">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-blue-600/10">
                            <th className="p-2 text-left font-medium text-blue-500">Japanese</th>
                            <th className="p-2 text-left font-medium text-blue-500">English</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[['猫','cat'],['犬','dog'],['鳥','bird'],['魚','fish']].map(([jp, en], i) => (
                            <tr
                              key={jp}
                              className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i < 3 ? 'border-b border-gray-200/50 dark:border-gray-700/50' : ''}`}
                            >
                              <td className="p-2">{jp}</td>
                              <td className="p-2 text-gray-500 dark:text-gray-400">{en}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">4 rows</span>
                      <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">2 columns</span>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Japanese</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow under card */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-blue-600/20 blur-3xl" />
          </div>
        </div>
      </div>

      {/* Floating language words around the edges */}
      <FloatingWords />
    </section>
  );
}
