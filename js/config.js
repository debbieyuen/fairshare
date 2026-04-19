const APP_NAME = 'Union';
const APP_TAG_LINE = 'Find the others';

const IS_NATIVE = typeof window !== 'undefined'
  && window.Capacitor !== undefined
  && window.Capacitor.isNativePlatform();

// Canonical public web origin. Used whenever we need to mint a URL that will
// be opened *outside* this client (QR codes, share links, vCards, push deep
// links, etc.). On the iOS Capacitor shell window.location.origin resolves to
// "capacitor://localhost" which is meaningless to anyone else, so we fall back
// to the production host in that case.
const PUBLIC_APP_ORIGIN = 'https://app.fairshare.social';

function publicAppUrl(pathAndQuery = '/') {
  if (IS_NATIVE) {
    const suffix = pathAndQuery.startsWith('/') ? pathAndQuery : '/' + pathAndQuery;
    return PUBLIC_APP_ORIGIN + suffix;
  }
  // On the web, keep the user on whatever origin/path they're already using
  // (works for localhost dev, preview deploys, custom domains, etc.).
  const base = window.location.origin + window.location.pathname;
  if (!pathAndQuery || pathAndQuery === '/') return base;
  if (pathAndQuery.startsWith('?') || pathAndQuery.startsWith('#')) return base + pathAndQuery;
  return window.location.origin + (pathAndQuery.startsWith('/') ? pathAndQuery : '/' + pathAndQuery);
}

const SUPABASE_URL = 'https://vdpqgmrfvlaieqpvpdcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkcHFnbXJmdmxhaWVxcHZwZGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUzNjcsImV4cCI6MjA4NzIwMTM2N30.ORvkYqcrDjnhdpCvXaIBzjRLyzi3WSIqMmIxWecpgl8';
const VAPID_PUBLIC_KEY = 'BD5fpwPiaJc8UKWeZ4dywopR1qWavor9RBYxbQlRfNa6DvLtYWEkMydT9woA9dv8bNfeo7j907PappcOkykN21Q';
