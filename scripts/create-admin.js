/**
 * One-time script to create an admin account. There is no public admin
 * signup on purpose — this is the only way an admin account gets created.
 *
 * Usage (from the backend project root, with .env already set up):
 *   node scripts/create-admin.js "Your Name" "you@email.com" "a-strong-password"
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { supabase } from '../src/supabaseClient.js';

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error('Usage: node scripts/create-admin.js "Your Name" "you@email.com" "a-strong-password"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

async function main() {
  const { data: existing } = await supabase
    .from('admins')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    console.error(`An admin with email ${email} already exists.`);
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('admins')
    .insert({ name, email, password_hash })
    .select()
    .single();

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`✅ Admin account created: ${data.name} <${data.email}>`);
  console.log('You can now sign in at /admin-login.html with this email and password.');
}

main();
