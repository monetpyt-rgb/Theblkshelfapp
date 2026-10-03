// Public browser credentials; reader data is protected by Supabase RLS.
// Retain this project to keep the website catalog and existing reader logins.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://njgprucvnayyiooiftaw.supabase.co").replace(/\/$/, "");
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZ3BydWN2bmF5eWlvb2lmdGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDg0ODMsImV4cCI6MjA5MzMyNDQ4M30.1r6r8vyYB0PnrZtugcBz3CPuCP9MMlTTMYXfewEINNw";
