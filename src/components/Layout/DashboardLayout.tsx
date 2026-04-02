import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </main>
    </div>
  );
}