import { Outlet } from 'react-router-dom';

import UploadPage from '../Upload/UploadPage';

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-50">

      <main className="flex-1 overflow-auto">
        <Outlet />
        <UploadPage />
      </main>
    </div>
  );
}
