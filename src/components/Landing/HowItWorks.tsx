import { Camera, Sparkles, MessageSquare, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: Camera,
    title: 'Snap or Upload',
    description: 'Take a photo of any table. Works with any language, any format.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Sparkles,
    title: 'AI Extracts',
    description: 'Our AI reads, cleans, and structures your data in seconds.',
    color: 'from-blue-600 to-blue-400',
  },
  {
    icon: MessageSquare,
    title: 'Use Your Data',
    description: 'Chat with it, export to CSV, make flashcards, send to Anki.',
    color: 'from-indigo-500 to-blue-600',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            Three simple steps to transform any table into actionable data
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line between cards */}
          <div className="hidden md:block absolute top-16 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-transparent via-gray-200/50 dark:via-gray-700/50 to-transparent" />

          {steps.map((step, index) => (
            <div key={step.title} className="relative group">
              <div className="glass-card rounded-2xl p-8 text-center hover:border-blue-600/30 transition-all duration-300 h-full">
                {/* Step number badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-sm font-bold text-blue-500">
                  {index + 1}
                </div>

                {/* Icon with gradient border */}
                <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} p-0.5`}>
                  <div className="w-full h-full rounded-2xl bg-white dark:bg-gray-900 flex items-center justify-center">
                    <step.icon className="w-8 h-8 text-blue-500" />
                  </div>
                </div>

                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{step.description}</p>

                {/* Arrow to next step */}
                {index < steps.length - 1 && (
                  <div className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
