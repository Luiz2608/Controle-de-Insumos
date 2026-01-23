const SUPABASE_URL = 'https://hgwfbbwdnncrofofqtso.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-7JLyKsL2q995jQMdXYHw_KQwuSXPQ';

const GEMINI_API_KEY = 'AIzaSyBqRBIP4mxb3JFqnfegn9FdmAKkdZZVKzg';


const isLocalBackend = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
// Backend desativado para versão GitHub Pages (Serverless via Supabase)
const API_URL = '';

window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
};

window.API_CONFIG = {
    baseUrl: API_URL,
    geminiKey: GEMINI_API_KEY
};
