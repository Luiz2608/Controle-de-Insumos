const SUPABASE_URL = 'https://hgwfbbwdnncrofofqtso.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-7JLyKsL2q995jQMdXYHw_KQwuSXPQ';

const GEMINI_API_KEY = localStorage.getItem('gemini_api_key') || '';


const isLocalBackend = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
// Backend local apenas se estiver rodando localmente. Em produção (GitHub Pages), usa apenas Supabase.
const API_URL = isLocalBackend ? 'http://localhost:3000' : ''; 

window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
};

window.API_CONFIG = {
    baseUrl: API_URL,
    geminiKey: GEMINI_API_KEY
};