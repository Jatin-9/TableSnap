import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Settings as SettingsIcon, User, Shield, Save } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [preferences, setPreferences] = useState(user?.preferences || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ preferences })
      .eq('id', user!.id);

    if (!error) {
      // Push the new preferences into the shared AuthContext so every
      // component reading user.preferences (e.g. TablesPage) updates instantly.
      updateUser({ preferences });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-blue-500">Manage your account preferences</p>
      </div>

      <div className="grid gap-6 max-w-4xl">
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Account Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">

                Role
              </label>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-400 fill-green-500" />
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium capitalize">
                  {user?.role}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Member Since
              </label>
              <input
                type="text"
                value={new Date(user?.created_at || '').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
              />
            </div>
          </div>
        </div>

        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-green-700" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg dark:bg-gray-700 dark:text-gray-300">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-300">Show Confidence Scores</p>
                <p className="text-sm text-gray-500 dark:text-blue-500">
                  Display OCR confidence in table list
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.showConfidence !== false}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    showConfidence: e.target.checked,
                  })
                }
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
            {saved && (
              <span className="text-green-600 font-medium">Saved successfully!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
