const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('exam_materials').select('*').eq('content_type', '개인DB').order('created_at', {ascending: false}).limit(1)
  .then(res => {
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(0);
  });
