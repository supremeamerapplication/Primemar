import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://mkccjauzbknuebrezfyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rY2NqYXV6YmtudWVicmV6Znl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzODI3MjMsImV4cCI6MjA4Mzk1ODcyM30.cWHqls8a2dUkBQI0el4BfALET9jDz54CD_gLzarhdmA';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
