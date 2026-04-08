import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  email: string;
  role: 'user' | 'super_admin';
  created_at: string;
  preferences: Record<string, unknown>;
}

export type TableSnapshot = {
  id: string;
  user_id: string;
  table_data: Record<string, string>[];
  column_names: string[];
  auto_tags: string[];
  ocr_confidence: number;
  row_count: number;
  column_count: number;
  created_at: string;

  // New optional metadata
  dataset_type?: 'language' | 'general' | null;
  language_code?: string | null;
  language_name?: string | null;
  detected_languages?: string[] | null;
  added_columns?: string[] | null;
  validation_warnings?: string[] | null;
};

export interface UserAnalytics {
  id: string;
  user_id: string;
  date: string;
  tables_created: number;
  rows_added: number;
  tags_used: Record<string, number>;
  updated_at: string;
}

export interface GlobalAnalytics {
  id: string;
  date: string;
  total_users: number;
  active_users: number;
  tables_created: number;
  total_rows: number;
  top_tags: Record<string, number>;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  frequency: 'daily' | 'weekly';
  delivery_method: 'email' | 'notification';
  enabled: boolean;
  created_at: string;
}
