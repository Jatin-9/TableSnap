import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ── Free tier limits ───────────────────────────────────────────────────────────
export const LIMITS = {
  UPLOADS_PER_MONTH: 10,
  TOTAL_TABLES: 25,
  CHAT_QUERIES_PER_MONTH: 30,
  // Warning banners appear when remaining slots hit this number
  WARN_THRESHOLD: 2,
};

// ── Pro tier limits ────────────────────────────────────────────────────────────
export const PRO_LIMITS = {
  UPLOADS_PER_MONTH: 200,
  TOTAL_TABLES: 500,
  CHAT_QUERIES_PER_MONTH: 300,
  WARN_THRESHOLD: 10,
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useUsage() {
  const { user } = useAuth();

  const [uploadsThisMonth, setUploadsThisMonth] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [chatQueriesThisMonth, setChatQueriesThisMonth] = useState(0);
  const [tier, setTier] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    const now = new Date();
    // YYYY-MM-01 — matches the `date` column type in user_analytics
    const monthStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    // Full ISO timestamp for tables that use timestamptz columns
    const monthStartISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [uploadsResult, totalResult, chatResult, tierResult] = await Promise.all([
      // Upload count comes from user_analytics, not table_snapshots.
      // user_analytics.tables_created is incremented by a DB trigger on INSERT
      // and is never decremented — so deleting a table doesn't reduce the count.
      supabase
        .from('user_analytics')
        .select('tables_created')
        .eq('user_id', user.id)
        .gte('date', monthStartDate),
      // Total tables currently stored (this one correctly goes down on delete)
      supabase
        .from('table_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      // AI queries this month — tracked server-side so it can't be spoofed
      supabase
        .from('chat_queries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStartISO),
      // Fetch the user's tier so we know which limit set to apply
      supabase
        .from('users')
        .select('tier')
        .eq('id', user.id)
        .single(),
    ]);

    // Sum up tables_created across all days in the current month
    const uploadCount = (uploadsResult.data ?? []).reduce(
      (sum, row) => sum + (row.tables_created || 0),
      0
    );
    setUploadsThisMonth(uploadCount);
    setTotalTables(totalResult.count ?? 0);
    setChatQueriesThisMonth(chatResult.count ?? 0);
    if (tierResult.data?.tier) setTier(tierResult.data.tier as 'free' | 'pro');
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

  // Apply the right limit set based on the user's tier
  const isPro = tier === 'pro';
  const activeLimits = isPro ? PRO_LIMITS : LIMITS;

  // Derived convenience booleans
  const canUpload = uploadsThisMonth < activeLimits.UPLOADS_PER_MONTH;
  const canStore  = totalTables < activeLimits.TOTAL_TABLES;
  const canChat   = chatQueriesThisMonth < activeLimits.CHAT_QUERIES_PER_MONTH;

  const uploadsRemaining = activeLimits.UPLOADS_PER_MONTH - uploadsThisMonth;
  const tablesRemaining  = activeLimits.TOTAL_TABLES - totalTables;
  const chatRemaining    = activeLimits.CHAT_QUERIES_PER_MONTH - chatQueriesThisMonth;

  return {
    loading,
    isPro,
    tier,
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
