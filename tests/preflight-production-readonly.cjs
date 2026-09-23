// Read-only compatibility check before applying the isolated migrations.
const fs = require('node:fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const env = dotenv.parse(fs.readFileSync('C:\\dev\\mathetf\\.env.local'));
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://eupclfzfouxzzmipjchz.supabase.co') throw new Error('Expected the existing live Supabase project.');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const checks = {
  profiles: 'id,earned_points,purchased_points',
  exam_materials: 'id,title,school,grade,semester,exam_type,subject,exam_year,content_type,uploader_id,price,file_type',
  payment_history: 'id,user_id,payment_id,merchant_uid,amount,points_added,status',
  purchased_items: 'id,user_id,payment_id,item_type,item_id,title,price_paid',
  point_transactions: 'id,user_id,type,amount,description,related_id',
  folders: 'id,user_id',
  user_items: 'id,user_id,folder_id,type,name,reference_id,details',
  questions: 'id,source_db_id,school,grade,year,semester,subject,work_status,question_number,difficulty,unit,is_off_curriculum,key_concepts,question_type',
};

async function main() {
  let failed = false;
  for (const [table, columns] of Object.entries(checks)) {
    const { error } = await sb.from(table).select(columns).limit(0);
    console.log(`${table}: ${error ? `FAIL ${error.code}` : 'OK'}`);
    failed ||= !!error;
  }
  for (const table of ['payment_orders', 'submission_earnings', 'question_bank_events']) {
    const { error } = await sb.from(table).select('id').limit(0);
    console.log(`${table}: ${error?.code === 'PGRST205' ? 'not installed' : error ? `CHECK ${error.code}` : 'already installed'}`);
  }
  const [history, purchases] = await Promise.all([
    sb.from('payment_history').select('payment_id', { count: 'exact', head: true }).like('payment_id', 'order-%'),
    sb.from('purchased_items').select('payment_id', { count: 'exact', head: true }).like('payment_id', 'order-%'),
  ]);
  if (history.error || purchases.error) throw new Error('Could not check new-order namespace.');
  console.log(`Existing order-prefix history/items: ${history.count}/${purchases.count}`);
  if (failed || history.count || purchases.count) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
