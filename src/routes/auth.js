import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabaseClient.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../emailService.js';
import { sendPhoneOtp, checkPhoneOtp, phoneVerificationRequired } from '../phoneService.js';

const router = express.Router();

function signToken(businessId) {
  return jwt.sign({ businessId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

/**
 * POST /api/auth/signup
 * Creates the business account. Email verification is required.
 * Phone verification is OPTIONAL by default (PHONE_VERIFICATION_REQUIRED=false) —
 * this is what keeps launch free, since Twilio SMS costs per message.
 */
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, businessName, businessType, password } = req.body;

    if (!firstName || !lastName || !email || !businessName || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: business, error } = await supabase
      .from('businesses')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        business_name: businessName,
        business_type: businessType || null,
        password_hash: passwordHash
      })
      .select()
      .single();

    if (error) throw error;

    // Email verification (free via Resend)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await supabase.from('email_verification_tokens').insert({
      business_id: business.id,
      token,
      expires_at: expiresAt
    });

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${token}`;
    await sendVerificationEmail(email, firstName, verifyUrl);

    // Phone OTP: only fires if you've configured Twilio AND turned on PHONE_VERIFICATION_REQUIRED.
    // Otherwise this silently skips — signup is not blocked on it.
    if (phone && phoneVerificationRequired) {
      await sendPhoneOtp(phone);
    }

    res.status(201).json({
      message: 'Account created. Check your email to verify your account.',
      businessId: business.id,
      phoneVerificationRequired
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

/**
 * GET /api/auth/verify-email?token=...
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token.' });

    const { data: record } = await supabase
      .from('email_verification_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!record) return res.status(400).json({ error: 'Invalid or already-used verification link.' });
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This verification link has expired.' });
    }

    const { data: business } = await supabase
      .from('businesses')
      .update({ email_verified: true })
      .eq('id', record.business_id)
      .select()
      .single();

    await supabase.from('email_verification_tokens').delete().eq('token', token);
    await sendWelcomeEmail(business.email, business.first_name);

    const jwtToken = signToken(business.id);
    res.json({ message: 'Email verified!', token: jwtToken });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Something went wrong verifying your email.' });
  }
});

/**
 * POST /api/auth/resend-verification
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!business) return res.status(404).json({ error: 'No account found with that email.' });
    if (business.email_verified) return res.status(400).json({ error: 'This account is already verified.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await supabase.from('email_verification_tokens').insert({
      business_id: business.id, token, expires_at: expiresAt
    });

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${token}`;
    await sendVerificationEmail(business.email, business.first_name, verifyUrl);

    res.json({ message: 'Verification email resent.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!business) return res.status(401).json({ error: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, business.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    if (!business.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before signing in.' });
    }

    const token = signToken(business.id);
    res.json({
      token,
      business: {
        id: business.id,
        firstName: business.first_name,
        businessName: business.business_name,
        email: business.email,
        walletBalance: business.wallet_balance
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong signing you in.' });
  }
});

/**
 * POST /api/auth/phone/send-otp
 * Optional endpoint — only does anything once Twilio is configured.
 * Call this from Settings later ("Verify phone number") rather than at signup.
 */
router.post('/phone/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await sendPhoneOtp(phone);
    if (result.skipped) {
      return res.json({ message: 'Phone verification isn\'t enabled yet — skipping.' });
    }
    res.json({ message: 'OTP sent.' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Could not send OTP.' });
  }
});

/**
 * POST /api/auth/phone/verify-otp
 */
router.post('/phone/verify-otp', async (req, res) => {
  try {
    const { businessId, phone, code } = req.body;
    const result = await checkPhoneOtp(phone, code);
    if (!result.valid) return res.status(400).json({ error: 'Invalid or expired code.' });

    await supabase.from('businesses').update({ phone_verified: true }).eq('id', businessId);
    res.json({ message: 'Phone verified.' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Could not verify code.' });
  }
});

export default router;
