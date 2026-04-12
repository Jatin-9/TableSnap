import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Send, Loader2, Bot, User, AlertCircle } from 'lucide-react';

// A single message in the chat — either from the user or from the AI assistant
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function NLQPage() {
  const { user } = useAuth();

  // The user's tables — loaded once when the page mounts and passed to the AI
  // so it can search through them when answering questions
  const [tables, setTables] = useState<TableSnapshot[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  // The conversation history shown in the chat window
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! I can search through all your saved tables and answer questions about them. Try asking something like:\n\n• \"What does 猫 mean?\"\n• \"Find all expenses over $100\"\n• \"Which table has a word for 'run'?\"\n• \"List all ingredients from my recipe tables\"",
    },
  ]);

  // The text the user is currently typing in the input box
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');

  // We keep a ref to the bottom of the chat window so we can auto-scroll
  // whenever a new message is added — same pattern as most chat apps
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load user's tables ────────────────────────────────────────────────────

  useEffect(() => {
    if (user) loadTables();
  }, [user]);

  // Scroll to the latest message every time the messages list changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadTables = async () => {
    setTablesLoading(true);
    const { data, error } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading tables for NLQ:', error);
    } else if (data) {
      setTables(data);
    }
    setTablesLoading(false);
  };

  // ── Send question to the AI ───────────────────────────────────────────────

  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || isAsking) return;

    setError('');
    setInput('');

    // Add the user's question to the chat right away so it feels instant
    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setIsAsking(true);

    try {
      // We send a compact version of each table to keep the payload small.
      // For each table we include:
      //   - its title (or column names as fallback)
      //   - the column names
      //   - up to 50 rows (enough for most queries without overloading the AI)
      const compactTables = tables.map((t) => ({
        title: t.title || t.column_names.join(' / '),
        columns: t.column_names,
        // Only send the first 50 rows to avoid hitting token limits
        rows: t.table_data.slice(0, 50),
        tags: t.auto_tags,
        language: t.language_name ?? null,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/table-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            question,
            tables: compactTables,
          }),
        }
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Query failed (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText);
      const answer = data.answer ?? 'I could not generate an answer.';

      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setError(errMsg);
      // Still add an error message to the chat so the conversation isn't broken
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I ran into an error: ${errMsg}` },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  // Allow submitting with Enter (Shift+Enter inserts a newline)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Ask AI</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Ask anything about your saved tables — words, values, patterns
        </p>
        {!tablesLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Searching across {tables.length} table{tables.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* If no tables exist yet, show a helpful nudge rather than letting the user
          send questions that will return empty results */}
      {!tablesLoading && tables.length === 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-900/10 dark:border-amber-900/30">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            You don't have any saved tables yet. Upload some images first, then come back here to search them.
          </p>
        </div>
      )}

      {/* Chat window — grows to fill available space */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm mb-4 p-4 space-y-4 min-h-0">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar icon — Bot for AI, User for the human */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {msg.role === 'assistant' ? (
                <Bot className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>

            {/* Message bubble — different colours for user vs AI */}
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'assistant'
                  ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Thinking indicator — shown while the AI is generating a response */}
        {isAsking && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
            </div>
          </div>
        )}

        {/* Invisible div at the bottom — we scroll to this on new messages */}
        <div ref={bottomRef} />
      </div>

      {/* Error banner — shown below the chat if something went wrong */}
      {error && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your tables... (Enter to send)"
          rows={2}
          disabled={isAsking || tablesLoading}
          className="flex-1 resize-none px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400 disabled:opacity-50"
        />
        <button
          onClick={sendQuestion}
          disabled={!input.trim() || isAsking || tablesLoading}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
        >
          {isAsking ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
