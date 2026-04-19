import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot, ChatMessage, ChatSession } from '../../lib/supabase';
import {
  Send, Loader2, Bot, User, AlertCircle, Trash2,
  Plus, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useUsage, LIMITS } from '../../hooks/useUsage';
import UpgradeModal from '../ui/UpgradeModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hello! I can help you explore and understand your table data. What would you like to know?",
};

const HISTORY_LIMIT = 10;
const SIDEBAR_PREF_KEY = 'tablesnap_chat_sidebar_open';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Formats a date string as DD/MM/YYYY for the session list
function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NLQPage() {
  const { user } = useAuth();

  const [tables, setTables] = useState<TableSnapshot[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);

  // On mobile (< 768px) default the history sidebar to closed so the full
  // screen is used for the chat. On desktop, honour the saved preference.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) return false;
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) !== 'false'; } catch { return true; }
  });

  const { canChat, chatQueriesThisMonth, chatRemaining, incrementChatCount } = useUsage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user) { loadTables(); loadSessions(); }
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarOpen)); } catch { /* ignore */ }
  }, [sidebarOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTables = async () => {
    setTablesLoading(true);
    const { data, error } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    if (!error && data) setTables(data);
    setTablesLoading(false);
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .order('last_message_at', { ascending: false });

    if (!error && data && data.length > 0) {
      setSessions(data);
      openSession(data[0]);
    }
    setSessionsLoading(false);
  };

  // ── Session management ────────────────────────────────────────────────────

  const openSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages([GREETING, ...session.messages]);
    setError('');
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([GREETING]);
    setInput('');
    setError('');
  };

  const saveSession = async (
    allMessages: ChatMessage[],
    userMsg: ChatMessage,
    currentSessionId: string | null
  ): Promise<string> => {
    if (currentSessionId) {
      await supabase
        .from('chat_sessions')
        .update({
          messages: allMessages,
          message_count: allMessages.length,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', currentSessionId);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: allMessages, message_count: allMessages.length, last_message_at: new Date().toISOString() }
            : s
        )
      );
      return currentSessionId;
    } else {
      const title = userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? '…' : '');
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user!.id,
          title,
          messages: allMessages,
          message_count: allMessages.length,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && data) {
        setSessions((prev) => [data, ...prev]);
        setActiveSessionId(data.id);
        return data.id;
      }
      return '';
    }
  };

  const deleteSession = async (id: string) => {
    await supabase.from('chat_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeSessionId) startNewChat();
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || isAsking) return;

    // Block and show upgrade modal when the monthly chat limit is reached
    if (!canChat) {
      setShowUpgradeModal(true);
      return;
    }

    setError('');
    setInput('');

    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setIsAsking(true);

    try {
      const fullConversation = [...messages, userMessage].slice(1);
      const historyToSend = fullConversation.slice(-HISTORY_LIMIT);

      const compactTables = tables.map((t) => ({
        title: t.title || t.column_names.join(' / '),
        columns: t.column_names,
        rows: t.table_data.slice(0, 50),
        tags: t.auto_tags,
        language: t.language_name ?? null,
      }));

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/table-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ question, tables: compactTables, history: historyToSend }),
        }
      );

      const responseText = await response.text();
      if (!response.ok) throw new Error(`Query failed (${response.status}): ${responseText}`);

      const data = JSON.parse(responseText);
      const answer = data.answer ?? 'I could not generate an answer.';
      const aiMessage: ChatMessage = { role: 'assistant', content: answer };

      const updatedConversation = [...fullConversation, aiMessage];
      setMessages((prev) => [...prev, aiMessage]);
      // Record this query in Supabase so the limit is enforced server-side
      await incrementChatCount();
      await saveSession(updatedConversation, userMessage, activeSessionId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I ran into an error: ${errMsg}` },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Chat history sidebar ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="w-44 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/95">

          {/* New Chat button — top of sidebar */}
          <div className="p-3 border-b border-gray-200 dark:border-zinc-800/60">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto py-2">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 px-3">
                No chats yet
              </p>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => openSession(session)}
                    className={`group relative flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-gray-100 dark:bg-zinc-800/60'
                        : 'hover:bg-gray-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 dark:text-gray-200 truncate leading-tight mb-0.5">
                        {session.title}
                      </p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatSessionDate(session.last_message_at)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          {session.message_count}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 absolute right-2 top-2 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Toggle tab — always centered at the seam ─────────────────────── */}
      {/* Sits between the sidebar and main area; vertically centered via flex */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="h-10 w-5 flex items-center justify-center rounded-r-md bg-gray-200 hover:bg-gray-300 dark:bg-zinc-700 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* New Chat shortcut — only shown when sidebar is collapsed */}
        {!sidebarOpen && (
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        )}

        {/* No tables warning */}
        {!tablesLoading && tables.length === 0 && (
          <div className="mx-4 mt-4 flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-900/10 dark:border-amber-900/30">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No saved tables yet. Upload some images first, then ask questions here.
            </p>
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 min-h-0">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'assistant'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 dark:bg-zinc-600 text-white'
                }`}
              >
                {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'assistant'
                    ? 'bg-white dark:bg-zinc-800/60 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-zinc-700/50'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {isAsking && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700/50 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mb-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Low-query warning — shows when ≤2 queries remain this month */}
        {!canChat ? (
          <div className="mx-6 mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl text-xs text-red-600 dark:text-red-400">
            <span>You've used all {LIMITS.CHAT_QUERIES_PER_MONTH} AI queries for this month.</span>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="font-semibold underline whitespace-nowrap"
            >
              Upgrade
            </button>
          </div>
        ) : chatRemaining <= LIMITS.WARN_THRESHOLD ? (
          <div className="mx-6 mb-2 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{chatRemaining} AI {chatRemaining === 1 ? 'query' : 'queries'} left this month.</span>
          </div>
        ) : null}

        {/* Input bar — single-line, compact */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={canChat ? "Ask about your tables..." : "Upgrade to send more queries"}
              disabled={tablesLoading || !canChat}
              className="flex-1 text-sm text-gray-900 dark:text-white bg-transparent placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:opacity-50"
            />
            <button
              onClick={sendQuestion}
              disabled={!input.trim() || isAsking || tablesLoading || !canChat}
              className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isAsking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade modal — shown when chat limit is hit */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        limitType="chat"
        current={chatQueriesThisMonth}
      />
    </div>
  );
}
