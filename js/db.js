let db;
try {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error('Failed to initialize Supabase client:', e);
}
