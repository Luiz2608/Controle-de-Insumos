require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  AVISO: SUPABASE_URL ou SUPABASE_KEY não definidos no .env');
    console.warn('⚠️  O backend tentará rodar, mas chamadas ao banco falharão.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
