// Verbindung zum Sync-Dienst (Supabase).
// Beides darf öffentlich sein: Der "publishable key" ist für Browser-Apps gedacht. Die Sicherheit
// kommt von Row Level Security (jedes Konto sieht nur seine eigenen Zeilen, siehe supabase/setup.sql).
// NIEMALS hier einen "secret"- oder "service_role"-Key eintragen.
// Leer lassen = App läuft ohne Konto/Sync.
export const SUPABASE_URL = 'https://cqtvhdfquvknxndiwgkp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_2uFJmCvIsXDtnJ4_sXmt-Q_i2WKEbcL';
