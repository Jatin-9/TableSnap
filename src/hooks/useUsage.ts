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

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useUsage() {
  const { user } = useAuth();

  const [uploadsThisMonth, setUploadsThisMonth] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [chatQueriesThisMonth, setChatQueriesThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    // First day of the current month in ISO format
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [uploadsResult, totalResult, chatResult] = await Promise.all([
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
      // AI queries sent this month — tracked server-side so it can't be spoofed
      supabase
        .from('chat_queries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart),
    ]);

    setUploadsThisMonth(uploadsResult.count ?? 0);
    setTotalTables(totalResult.count ?? 0);
    setChatQueriesThisMonth(chatResult.count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Call this after a successful upload so counts stay in sync without a full refetch
  const incrementUploadCount = useCallback(() => {
    setUploadsThisMonth((prev) => prev + 1);
    setTotalTables((prev) => prev + 1);
  }, []);

  // Inserts a row into chat_queries and bumps the local counter.
  // The DB insert is what actually enforces the limit — the local state is just
  // for instant UI feedback without waiting for the next fetchCounts call.
  const incrementChatCount = useCallback(async () => {
    if (!user) return;
    await supabase.from('chat_queries').insert({ user_id: user.id });
    setChatQueriesThisMonth((prev) => prev + 1);
  }, [user]);

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
