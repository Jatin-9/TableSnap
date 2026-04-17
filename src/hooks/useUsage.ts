import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ── Free tier limits ───────────────────────────────────────────────────────────
export const LIMITS = {
  UPLOADS_PER_MONTH: 10,
  TOTAL_TABLES: 25,
  CHAT_QUERIES_PER_MONTH: 20,
  // Warning banners appear when remaining slots hit this number
  WARN_THRESHOLD: 2,
};

// localStorage key format: "tablesnap_chat_YYYY-MM"
function chatStorageKey() {
  const now = new Date();
  return `tablesnap_chat_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getChatCount(): number {
  try {
    return parseInt(localStorage.getItem(chatStorageKey()) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function setChatCount(n: number) {
  try {
    localStorage.setItem(chatStorageKey(), String(n));
  } catch { /* ignore */ }
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useUsage() {
  const { user } = useAuth();

  const [uploadsThisMonth, setUploadsThisMonth] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [chatQueriesThisMonth, setChatQueriesThisMonth] = useState(getChatCount);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    // First day of the current month in ISO format
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [monthResult, totalResult] = await Promise.all([
      // Uploads this month
      supabase
        .from('table_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart),
      // Total tables stored
      supabase
        .from('table_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    setUploadsThisMonth(monthResult.count ?? 0);
    setTotalTables(totalResult.count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Call this after a successful upload so counts stay in sync without refetch
  const incrementUploadCount = useCallback(() => {
    setUploadsThisMonth((prev) => prev + 1);
    setTotalTables((prev) => prev + 1);
  }, []);

  // Call this after each AI message is sent
  const incrementChatCount = useCallback(() => {
    const next = getChatCount() + 1;
    setChatCount(next);
    setChatQueriesThisMonth(next);
  }, []);

  // Derived convenience booleans
  const canUpload = uploadsThisMonth < LIMITS.UPLOADS_PER_MONTH;
  const canStore  = totalTables < LIMITS.TOTAL_TABLES;
  const canChat   = chatQueriesThisMonth < LIMITS.CHAT_QUERIES_PER_MONTH;

  const uploadsRemaining = LIMITS.UPLOADS_PER_MONTH - uploadsThisMonth;
  const tablesRemaining  = LIMITS.TOTAL_TABLES - totalTables;
  const chatRemaining    = LIMITS.CHAT_QUERIES_PER_MONTH - chatQueriesThisMonth;

  return {
    loading,
    uploadsThisMonth,
    totalTables,
    chatQueriesThisMonth,
    canUpload,
    canStore,
    canChat,
    uploadsRemaining,
    tablesRemaining,
    chatRemaining,
    incrementUploadCount,
    incrementChatCount,
    refetch: fetchCounts,
  };
}
