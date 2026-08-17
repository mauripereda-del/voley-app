// =========================================================
// CONFIGURACIÓN DE SUPABASE
// Reemplazá estos dos valores por los de tu proyecto:
// Supabase Dashboard > Project Settings > API
// =========================================================
const SUPABASE_URL = "https://rkfbawekyqpqjoltlrxm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VG5XknwEwTSBD69OfjSc7Q_5_HowJ5N";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
