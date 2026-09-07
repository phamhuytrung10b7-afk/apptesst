/// <reference types="vite/client" />
/**
 * Supabase Client initialization for WIP Inventory Management System.
 * Connects to online PostgreSQL / Supabase instance using Vite client-side environment variables.
 */
import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();

// Validates whether the user has provided actual Supabase credentials
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key'
);

// Fallback dummy URL to prevent createClient from crashing if env vars are missing during setup
const effectiveUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder-project.supabase.co';
const effectiveKey = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(effectiveUrl, effectiveKey, {
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
