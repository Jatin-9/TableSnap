import { X, Upload, MessageSquare, Database, Sparkles } from 'lucide-react';
import { LIMITS } from '../../hooks/useUsage';

type LimitType = 'uploads' | 'storage' | 'chat';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitType: LimitType;
  current: number;
}

const CONFIG: Record<LimitType, {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  limit: number;
  unit: string;
  description: string;
}> = {
  uploads: {
    icon: Upload,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: "You've used all your uploads",
    limit: LIMITS.UPLOADS_PER_MONTH,
    unit: 'uploads this month',
    description: 'Free accounts can extract up to 10 tables per month. Upgrade to Pro for 100 uploads/month.',
  },
  storage: {
    icon: Database,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    title: "You've hit your storage limit",
    limit: LIMITS.TOTAL_TABLES,
    unit: 'tables stored',
    description: 'Free accounts can store up to 25 tables. Upgrade to Pro for 500 tables.',
  },
  chat: {
    icon: MessageSquare,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    title: "You've used all your AI queries",
    limit: LIMITS.CHAT_QUERIES_PER_MONTH,
    unit: 'AI queries this month',
    description: 'Free accounts get 20 AI chat queries per month. Upgrade to Pro for 200 queries/month.',
  },
};

export default function UpgradeModal({ isOpen, onClose, limitType, current }: UpgradeModalProps) {
  if (!isOpen) return null;

  const { icon: Icon, iconBg, iconColor, title, limit, unit, description } = CONFIG[limitType];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mx-auto mb-4`}>
          <Icon className={`w-7 h-7 ${iconColor}`} />
        </div>

        {/* Text */}
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
          {title}
        </h3>

        {/* Usage bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>{unit}</span>
            <span className="font-semibold text-red-500">{current} / {limit}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full transition-all"
              style={{ width: `${Math.min((current / limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
          {description}
        </p>

        {/* CTAs */}
        <div className="space-y-2">
          <button
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade to Pro — $8/month
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
