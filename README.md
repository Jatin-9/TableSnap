# TableSnap

**Snap a photo. Get a table. Talk to your data.**

TableSnap is an AI-powered web app that extracts structured tables from photos and PDFs, then lets you study, export, and chat with your data. Point your camera at a receipt, vocabulary sheet, textbook table, or any printed grid — TableSnap turns it into clean, organized data in seconds.

---

## Features

- **OCR Extraction** — Upload images or PDFs (up to 10 pages) and AI extracts the table automatically
- **Language Enrichment** — Detects language tables (Japanese, Arabic, Chinese, etc.) and enriches them with pronunciation, meaning, and romanisation columns
- **AI Chat** — Ask questions about your tables in plain English
- **Flashcard Study Mode** — Study any 2-column table as flashcards directly in the browser
- **Anki Export** — Send tables straight to Anki via AnkiConnect
- **CSV / Clipboard Export** — Export any table as a CSV or copy to clipboard
- **Public Sharing** — Share a read-only link to any table with no login required
- **Analytics Dashboard** — Track your uploads, languages, and usage over time
- **Email Reminders** — Daily or weekly digest emails to keep you studying
- **Dark / Light Mode** — Persisted per account across devices

### Pricing

| | Free | Pro ($8/month) |
|---|---|---|
| Uploads / month | 10 | 100 |
| Tables stored | 25 | 500 |
| AI chat queries / month | 20 | 200 |
| PDF support | ✓ | ✓ |
| All other features | ✓ | ✓ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Edge Functions | Supabase Edge Functions (Deno) |
| AI | OpenAI GPT-4o (OCR pipeline + chat) |
| Charts | Chart.js + react-chartjs-2 |
| PDF rendering | pdfjs-dist |
| Icons | Lucide React |

---

## Running Locally

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An OpenAI API key (for OCR extraction and AI chat)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/tablesnap.git
cd tablesnap
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Both values are in your Supabase project under **Settings → API**.

### 4. Set up the database

Run all migrations in order in your Supabase **SQL Editor**:

```
supabase/migrations/20260321083134_create_tablesnap_schema.sql
supabase/migrations/20260321083905_add_promote_to_admin_function.sql
supabase/migrations/20260412000000_add_title_to_table_snapshots.sql
supabase/migrations/20260413000002_schedule_vocab_emails.sql
supabase/migrations/20260416000001_add_saved_queries.sql
supabase/migrations/20260416000002_add_updated_at_to_snapshots.sql
supabase/migrations/20260416000003_add_chat_sessions.sql
supabase/migrations/20260417000001_add_chat_queries.sql
```

### 5. Deploy the edge functions

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy ocr-extract
supabase functions deploy table-query
supabase functions deploy send-vocab-email
```

Each function needs your OpenAI key set as a secret:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

### 6. Start the dev server

```bash
npm run dev
```

The app will be running at `http://localhost:5173`.

---

## Project Structure

```
src/
├── components/
│   ├── Auth/           # Login page, ProtectedRoute
│   ├── Dashboard/      # Tables, Analytics, AI Chat, Study, Reminders, Settings
│   ├── Landing/        # Homepage, Navbar, Hero, Features, Pricing
│   ├── Layout/         # DashboardLayout, Sidebar
│   ├── Share/          # Public shared table page
│   ├── SuperAdmin/     # Admin analytics (role-gated)
│   ├── ui/             # Reusable components (Skeleton, UpgradeModal)
│   └── Upload/         # Upload modal and OCR pipeline
├── contexts/           # AuthContext, ThemeContext
├── hooks/              # useUsage (free tier limits)
└── lib/                # Supabase client + shared types
supabase/
├── functions/          # Edge functions (ocr-extract, table-query, send-vocab-email)
└── migrations/         # All database migrations in order
```

---

## Deployment

The app is built with Vite and deploys to Vercel in one click.

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**
4. Framework preset: **Vite** — build command `npm run build`, output directory `dist`
5. Deploy

---

## License

MIT
