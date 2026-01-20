const SUPABASE_URL = 'https://hgwfbbwdnncrofofqtso.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-7JLyKsL2q995jQMdXYHw_KQwuSXPQ';

const GEMINI_API_KEY = 'AIzaSyBqRBIP4mxb3JFqnfegn9FdmAKkdZZVKzg';


const isLocalBackend = window.location.hostname === 'localhost' && window.location.port === '3000';
// ATENÇÃO: Para produção (GitHub Pages), altere 'http://localhost:3000' para a URL do seu backend hospedado (ex: Render, Railway)
const API_URL = isLocalBackend ? '' : 'http://localhost:3000';

window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
};

window.API_CONFIG = {
    baseUrl: API_URL,
    geminiKey: GEMINI_API_KEY
};
