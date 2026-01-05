require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  AVISO: SUPABASE_URL ou chave do Supabase não definidos no .env');
    console.warn('⚠️  Defina SUPABASE_SERVICE_ROLE_KEY (preferencial) ou SUPABASE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
