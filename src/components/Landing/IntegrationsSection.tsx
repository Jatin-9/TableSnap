import { FileSpreadsheet, Clipboard, Layers, Plus } from 'lucide-react';

const integrations = [
  {
    name: 'Anki',
    icon: Layers,
    description: 'Spaced repetition',
  },
  {
    name: 'CSV Files',
    icon: FileSpreadsheet,
    description: 'Universal format',
  },
  {
    name: 'Clipboard',
    icon: Clipboard,
    description: 'Quick copy',
  },
  {
    name: 'More Soon',
    icon: Plus,
    description: 'Coming soon',
    soon: true,
  },
];

export default function IntegrationsSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Works With Your <span className="gradient-text">Tools</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            Seamlessly integrate with your favorite apps and workflows
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className={`glass-card rounded-xl p-6 text-center hover:border-blue-600/30 transition-all duration-300 ${
                integration.soon ? 'opacity-60' : ''
              }`}
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center">
                <integration.icon className="w-7 h-7 text-blue-500" />
              </div>
              <h3 className="font-semibold mb-1">{integration.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{integration.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
