# TableSnap - Universal OCR Table Organizer

A production-ready OCR table extraction and organization system with role-based dashboards and comprehensive analytics.

## Features

### Core Functionality
- **Multi-language OCR** - Extract tables from images in any language
- **Intelligent Auto-Tagging** - AI-powered tag detection (Languages, Expenses, Shopping, Recipes, Fitness, etc.)
- **Dynamic Column Detection** - Automatically detects 2-20 columns
- **Confidence Scoring** - OCR accuracy metrics for each extraction

### User Dashboard
- **My Tables** - View, filter, and manage all extracted tables
- **Multi-select Filters** - Filter by tags: Languages, Expenses, Inventory, Shopping, etc.
- **Table Preview** - View full table data in modal
- **CSV Export** - Export any table to CSV format
- **Tag Cloud** - Quick access to popular tags with counts

### Analytics Dashboard
- **Personal Analytics** - Track your usage with interactive charts
  - Tables created over time (Line chart - Last 30 days)
  - Rows added by day (Bar chart - Last 7 days)
  - Tables by tag (Pie chart)
  - Tag distribution (Doughnut chart)
- **Live Statistics** - Total tables, rows, and unique tags
- **CSV Export** - Export personal analytics data

### Super Admin Dashboard
- **Platform-wide Analytics** - Global insights across all users
  - Platform growth (Line chart - Last 30 days)
  - User adoption (Bar chart - Last 14 days)
  - Top content types (Pie chart)
  - Quick stats (avg tables/user, avg rows/table)
- **Global CSV Export** - Export all platform data

### Additional Features
- **Reminders** - Configure daily/weekly reminders via email or notification
- **Settings** - Manage preferences and account information
- **Responsive Design** - Mobile-first, works on all devices
- **Glassmorphism UI** - Modern, beautiful interface

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, React Router
- **Charts**: Chart.js + react-chartjs-2
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Database**: PostgreSQL with Row Level Security (RLS)

## Getting Started

### 1. Sign Up
- Navigate to `/login`
- Create an account with email and password
- You'll be automatically logged in

### 2. Upload Your First Table
- Go to the home page (`/`)
- Upload an image containing a table
- The system will extract the data and auto-tag it
- Edit column names if needed
- Save to your dashboard

### 3. View Your Tables
- Navigate to `/dashboard`
- Filter tables by tags
- View, export, or delete tables

### 4. Check Analytics
- Go to `/dashboard/analytics`
- View your personal usage statistics
- Export data as CSV

## Creating a Super Admin User

To make a user a super admin, run this SQL query in Supabase:

```sql
UPDATE users
SET role = 'super_admin'
WHERE email = 'your-email@example.com';
```

Super admin users can:
- Access `/super-admin` dashboard
- View platform-wide analytics
- Export all user data
- See the crown icon in the sidebar

## Database Schema

### tables
- `users` - User profiles with role management
- `table_snapshots` - Extracted tables with metadata
- `user_analytics` - Individual user analytics
- `global_analytics` - Platform-wide analytics
- `reminders` - User reminder configurations

### Security
- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- Super admins can access global analytics
- JWT-based authentication

## Auto-Tagging Logic

The system intelligently detects content types:
- **Languages** - Detects Kanji, Chinese, Japanese characters
- **Expenses** - Currency symbols (€, $, ¥, £, ₹) or keywords (price, cost, total)
- **Inventory** - Keywords (qty, quantity, stock, inventory)
- **Shopping** - Clothing items (shirt, pants, dress, shoes)
- **Recipes** - Food-related keywords (recipe, ingredients, meal)
- **Fitness** - Health metrics (weight, calories, exercise)
- **Dated Records** - Date patterns (MM/DD/YYYY, etc.)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```

## Routes

- `/login` - Authentication
- `/` - Photo upload
- `/dashboard` - Tables list
- `/dashboard/analytics` - Personal analytics
- `/dashboard/reminders` - Reminder configuration
- `/dashboard/settings` - User settings
- `/super-admin` - Global analytics (admin only)

## Environment Variables

Create a `.env` file with:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Production Deployment

The app is ready for deployment on:
- Vercel (Frontend)
- Netlify (Frontend)
- Supabase (Backend + Database)
- Railway (Full stack)

---

Built with React 18, TypeScript, Tailwind CSS, and Supabase.
