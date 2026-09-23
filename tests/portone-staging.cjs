// Launch a payment-only staging app. Never point this at the production database or PG channel.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const file = process.env.MATHETF_STAGING_ENV_PATH || path.join(root, '.env.portone-staging.local');
const existingPortOneFile = 'C:\\dev\\mathetf\\.env.local';
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
  if (fs.existsSync(path.join(root, name))) throw new Error(`Remove ${name} from the isolated checkout before starting staging.`);
}
if (!fs.existsSync(file)) throw new Error('Create .env.portone-staging.local from tests/portone-staging.example.txt first.');
const config = dotenv.parse(fs.readFileSync(file));
if (!fs.existsSync(existingPortOneFile)) throw new Error('The existing local PortOne settings file was not found.');
const existing = dotenv.parse(fs.readFileSync(existingPortOneFile));
const projectUrl = 'https://fnamfsijayavwakvgzaf.supabase.co';
const testChannel = 'channel-key-150aa6e6-24e8-4ce1-bb9b-520778ed1aed';
if (config.NEXT_PUBLIC_SUPABASE_URL !== projectUrl) throw new Error('Only the isolated Supabase test project is allowed.');
for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!config[name] || config[name].includes('FILL_')) throw new Error(`Missing staging setting: ${name}`);
}
for (const name of ['NEXT_PUBLIC_PORTONE_STORE_ID', 'PORTONE_API_SECRET']) {
  if (!existing[name]) throw new Error(`Missing existing PortOne setting: ${name}`);
}
if (config.NEXT_PUBLIC_PORTONE_CHANNEL_KEY && config.NEXT_PUBLIC_PORTONE_CHANNEL_KEY !== testChannel) throw new Error('Only the verified KG test channel is allowed.');
const env = {
  ...process.env,
  ...config,
  NEXT_PUBLIC_PORTONE_STORE_ID: existing.NEXT_PUBLIC_PORTONE_STORE_ID,
  PORTONE_API_SECRET: existing.PORTONE_API_SECRET,
  NEXT_PUBLIC_PORTONE_CHANNEL_KEY: testChannel,
  NEXT_PUBLIC_LOCAL_PREVIEW: '0',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
  VERCEL_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
};
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '3200'], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
child.on('exit', code => { process.exitCode = code || 0; });
console.log('PortOne staging only: http://127.0.0.1:3200/cart');
