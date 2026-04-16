import { Languages, MessageSquare, Layers, Send, Download, BarChart3 } from 'lucide-react';

const features = [
  {
    icon: Languages,
    title: 'Multi-Language OCR',
    description: 'Supports Japanese, Arabic, Hindi, Korean, Chinese and 50+ languages with high accuracy.',
    badge: null,
    highlight: '日本語 中文 한국어',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
  },
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description: 'Ask questions about your tables in plain English. "Find all expenses over $100"',
    badge: 'Popular',
    highlight: null,
    color: 'text-blue-500',
    bgColor: 'bg-blue-600/10',
    borderColor: 'border-blue-600/20',
  },
  {
    icon: Layers,
    title: 'Flashcard Mode',
    description: 'Turn any 2-column table into a flashcard deck instantly. Perfect for studying.',
    badge: null,
    highlight: null,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  {
    icon: Send,
    title: 'Anki Integration',
    description: 'Send cards directly to Anki desktop with one click. Seamless workflow.',
    badge: 'Integration',
    highlight: null,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
  },
  {
    icon: Download,
    title: 'Smart Export',
    description: 'CSV, clipboard, plain text. Your data, your format. Export anywhere.',
    badge: null,
    highlight: null,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track your learning and usage over time with beautiful charts and insights.',
    badge: 'Pro',
    highlight: null,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/20',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-600/5 to-transparent" />

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-16">
          <span className="inline-block mb-4 px-3 py-1 text-sm rounded-full border border-blue-600/30 text-blue-500">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Everything You Need to <span className="gradient-text">Master Your Data</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            Powerful tools designed for students, researchers, and language learners
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className={`group glass-card rounded-2xl p-6 hover:border-blue-600/30 transition-all duration-300 cursor-default ${feature.borderColor}`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                {feature.badge && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/10 text-blue-500 border border-blue-600/20">
                    {feature.badge}
                  </span>
                )}
              </div>

              <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-500 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>

              {feature.highlight && (
                <div className={`mt-4 text-lg font-medium ${feature.color} opacity-60`}>
                  {feature.highlight}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
