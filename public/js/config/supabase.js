// public/js/config/supabase.js
const SUPABASE_URL = 'https://pnesafdvblgdnsuxuerj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZXNhZmR2YmxnZG5zdXh1ZXJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzM1OTQsImV4cCI6MjA4MzkwOTU5NH0.R_Sw5gpBKRWVQ6Nw6HLRq4ELkc4t6pdC3KNgrHVypos';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabase };
