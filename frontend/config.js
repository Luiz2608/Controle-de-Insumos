const SUPABASE_URL = 'https://tetzbcsbaghokarlsqzj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRldHpiY3NiYWdob2thcmxzcXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjIzNzYsImV4cCI6MjA4MzE5ODM3Nn0.CAE_DBSCgHuxwh7oPX9fKBjYps_oB8w8pujt7Oc8RFs';

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
