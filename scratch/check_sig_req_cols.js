const { supabase } = require('../src/lib/supabaseClient');

async function checkCols() {
  const { data, error } = await supabase.from('signature_requests').select('*').limit(1);
  if (error) console.error(error);
  else console.log('signature_requests sample/columns:', data);
}

checkCols();
