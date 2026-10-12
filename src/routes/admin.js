import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabaseClient.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

const router = express.Router();

function signAdminToken(adminId) {
  // Shorter-lived than business sessions (30d) since this is a privileged
  // account — 7 days means a stolen/forgotten-open admin session expires
  // sooner rather than staying valid for a month.
  return jwt.sign({ adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * POST /api/admin/login
 * Admins are never created via public signup — only via the
 * scripts/create-admin.js script, run manually against the database.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signAdminToken(admin.id);
    res.json({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Something went wrong signing you in.' });
  }
});

/**
 * GET /api/admin/me
 */
router.get('/me', requireAdminAuth, async (req, res) => {
  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, name, email')
    .eq('id', req.adminId)
    .single();

  if (error || !admin) return res.status(404).json({ error: 'Admin account not found.' });
  res.json(admin);
});

/**
 * GET /api/admin/overview
 * First useful thing an admin actually wants to see: how many businesses
 * are signed up, how many SME listings are waiting for review, and total
 * wallet activity. Expand this as real admin features get built.
 */
router.get('/overview', requireAdminAuth, async (req, res) => {
  try {
    const [{ count: totalBusinesses }, { count: pendingListings }, { count: verifiedBusinesses }] = await Promise.all([
      supabase.from('businesses').select('id', { count: 'exact', head: true }),
      supabase.from('sme_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('email_verified', true),
    ]);

    const { data: recentBusinesses } = await supabase
      .from('businesses')
      .select('id, business_name, email, email_verified, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: pendingSmeListings } = await supabase
      .from('sme_listings')
      .select('id, business_id, sector, amount_seeking, status, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      totalBusinesses: totalBusinesses || 0,
      verifiedBusinesses: verifiedBusinesses || 0,
      pendingListings: pendingListings || 0,
      recentBusinesses: recentBusinesses || [],
      pendingSmeListings: pendingSmeListings || []
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Something went wrong loading the overview.' });
  }
});

export default router;
