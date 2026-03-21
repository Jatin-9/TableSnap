import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, Reminder } from '../../lib/supabase';
import { Bell, Plus, Trash2, Mail, BellRing } from 'lucide-react';

export default function RemindersPage() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [deliveryMethod, setDeliveryMethod] = useState<'email' | 'notification'>('email');

  useEffect(() => {
    if (user) {
      fetchReminders();
    }
  }, [user]);

  const fetchReminders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', user!.id);

    if (data) {
      setReminders(data);
    }
    setLoading(false);
  };

  const createReminder = async () => {
    const { error } = await supabase.from('reminders').insert({
      user_id: user!.id,
      frequency,
      delivery_method: deliveryMethod,
      enabled: true,
    });

    if (!error) {
      fetchReminders();
      setShowForm(false);
    }
  };

  const toggleReminder = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from('reminders')
      .update({ enabled: !enabled })
      .eq('id', id);

    if (!error) {
      fetchReminders();
    }
  };

  const deleteReminder = async (id: string) => {
    if (!confirm('Delete this reminder?')) return;

    const { error } = await supabase.from('reminders').delete().eq('id', id);

    if (!error) {
      fetchReminders();
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reminders</h1>
        <p className="text-gray-600">
          Get reminded to review random rows from your tables
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Your Reminders</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Reminder
          </button>
        </div>

        {showForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">New Reminder</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Method
                </label>
                <select
                  value={deliveryMethod}
                  onChange={(e) =>
                    setDeliveryMethod(e.target.value as 'email' | 'notification')
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="email">Email</option>
                  <option value="notification">Notification</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createReminder}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No reminders yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      reminder.enabled ? 'bg-blue-100' : 'bg-gray-200'
                    }`}
                  >
                    {reminder.delivery_method === 'email' ? (
                      <Mail
                        className={`w-6 h-6 ${
                          reminder.enabled ? 'text-blue-600' : 'text-gray-400'
                        }`}
                      />
                    ) : (
                      <BellRing
                        className={`w-6 h-6 ${
                          reminder.enabled ? 'text-blue-600' : 'text-gray-400'
                        }`}
                      />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 capitalize">
                      {reminder.frequency} Reminder
                    </p>
                    <p className="text-sm text-gray-500 capitalize">
                      via {reminder.delivery_method}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleReminder(reminder.id, reminder.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      reminder.enabled
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {reminder.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
