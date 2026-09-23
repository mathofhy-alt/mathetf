// Verify a direct material order without opening the PG checkout or charging money.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { createServerClient } = require('@supabase/ssr');
const { createClient } = require('@supabase/supabase-js');

const root = path.join(__dirname, '..');
const envPath = process.env.MATHETF_STAGING_ENV_PATH || path.join(root, '.env.portone-staging.local');
const env = dotenv.parse(fs.readFileSync(envPath));
const accountPath = process.env.MATHETF_STAGING_USER_PATH || path.join(__dirname, 'output/staging-user.json');
const account = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://fnamfsijayavwakvgzaf.supabase.co') throw new Error('Only the isolated test project is allowed.');
if (account.id !== 'e3bf87b3-241a-4f9e-b385-0f7c93970d6f') throw new Error('Unexpected test user.');

async function main() {
  const cookies = new Map();
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: entries => entries.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error || data.user?.id !== account.id) throw new Error('Staging test login failed.');
  const headers = { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  const cartRes = await fetch('http://127.0.0.1:3200/api/cart', { headers });
  const cart = await cartRes.json();
  if (!cartRes.ok || cart.items?.length !== 1 || cart.items[0].item_id !== '8b872791-b928-4b21-a226-9af3df5c7e02') throw new Error('Staging cart is not ready.');

  const rejectedTopup = await fetch('http://127.0.0.1:3200/api/payments/orders', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'topup', packages: { '1000': 1 } }),
  });
  if (rejectedTopup.status !== 400) throw new Error('The removed point top-up is still accepted.');
  console.log('Point top-up request rejected.');

  let paymentId;
  try {
    const orderRes = await fetch('http://127.0.0.1:3200/api/payments/orders', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'cart', items: cart.items, usedPoints: 0 }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok || !/^order-[a-f0-9]{32}$/.test(order.paymentId || '') || order.amount !== 1100) throw new Error(`Staging order failed: ${orderRes.status} ${order.message || ''}`);
    paymentId = order.paymentId;
    console.log('Direct purchase order prepared: one test PDF, 1,100 KRW; no PG request made.');
  } finally {
    if (paymentId) {
      const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { error: cleanupError } = await admin.from('payment_orders').delete().eq('payment_id', paymentId);
      if (cleanupError) throw new Error('Could not remove the uncharged test order.');
      console.log('Uncharged test order removed.');
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
