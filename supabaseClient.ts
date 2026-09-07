/// <reference types="vite/client" />
/**
 * Supabase Client initialization for WIP Inventory Management System.
 * Connects to online PostgreSQL / Supabase instance using Vite client-side environment variables.
 */
import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const DEFAULT_SUPABASE_URL = 'https://hgaqtcjhejqnhvsdiose.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-YU6_8jz8ffxganjKvxZGA_FPVqtzFd';

const supabaseUrl = String(env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY).trim();

// Validates whether the user has provided actual Supabase credentials
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key'
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
