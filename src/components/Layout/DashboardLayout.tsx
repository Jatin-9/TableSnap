import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import UploadPage from '../Upload/UploadPage';

export default function DashboardLayout() {
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    const openHandler = () => setShowUploadModal(true);
    const closeHandler = () => setShowUploadModal(false);

    window.addEventListener('open-upload-modal', openHandler);
    window.addEventListener('close-upload-modal', closeHandler);

    return () => {
      window.removeEventListener('open-upload-modal', openHandler);
      window.removeEventListener('close-upload-modal', closeHandler);
    };
  }, []);

  const handleSaved = () => {
    setShowUploadModal(false);
    window.dispatchEvent(new Event('refresh-tables'));
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar />

      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </main>

      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-6xl max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <UploadPage
              onSaved={handleSaved}
              onClose={() => setShowUploadModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}