
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hgwfbbwdnncrofofqtso.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-7JLyKsL2q995jQMdXYHw_KQwuSXPQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testFetch() {
    console.log('Fetching last 5 records...');
    const { data, error } = await supabase
        .from('plantio_diario')
        .select('*')
        .order('id', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Fetch error:', error);
    } else {
        console.log('Fetched records:', JSON.stringify(data, null, 2));
        
        // Check equipment table for the IDs
        const ids = data.map(d => d.id);
        const { data: equip, error: equipError } = await supabase
            .from('equipamento_operador')
            .select('*')
            .in('plantio_diario_id', ids);
            
        if (equipError) console.error('Equip fetch error:', equipError);
        else console.log('Equip records:', equip);
    }
}

testFetch();
