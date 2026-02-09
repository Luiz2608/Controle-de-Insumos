const SUPABASE_URL = 'https://hgwfbbwdnncrofofqtso.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-7JLyKsL2q995jQMdXYHw_KQwuSXPQ';

const GEMINI_API_KEY = 'AIzaSyC2hHNdbxhhvnJhXSAUbzwn73viGnpFwqA';


const isLocalBackend = false; 
// Backend local desativado conforme solicitação. O frontend agora fala direto com o Supabase.
const API_URL = ''; 

window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
};

window.API_CONFIG = {
    baseUrl: API_URL,
    geminiKey: GEMINI_API_KEY
};