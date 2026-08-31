import express from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/wallet
 * Balance + recent transactions.
 */
router.get('/', async (req, res) => {
  const { data: business } = await supabase
    .from('businesses')
    .select('wallet_balance')
    .eq('id', req.businessId)
    .single();

  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false })
    .limit(50);

  res.json({ balance: business?.wallet_balance ?? 0, transactions: transactions ?? [] });
});

/**
 * POST /api/wallet/deposit
 * body: { amount, method }
 * NOTE: this records the deposit as instant/complete for MVP purposes.
 * Once you wire in Stitch, this becomes: create a Stitch payment request,
 * return the redirect URL to the frontend, and only credit the balance
 * after the Stitch webhook confirms success — see README note below.
 */
router.post('/deposit', async (req, res) => {
  try {
    const { amount, method } = req.body;
    const val = parseFloat(amount);
    if (!val || val < 10) return res.status(400).json({ error: 'Minimum deposit is R10.' });

    const { data: business } = await supabase
      .from('businesses')
      .select('wallet_balance')
      .eq('id', req.businessId)
      .single();

    const newBalance = parseFloat(business.wallet_balance) + val;

    await supabase.from('businesses').update({ wallet_balance: newBalance }).eq('id', req.businessId);
    await supabase.from('wallet_transactions').insert({
      business_id: req.businessId,
      type: 'deposit',
      method: method || 'eft',
      amount: val
    });

    res.json({ message: 'Deposit successful.', balance: newBalance });
  } catch (err) {
    console.error('Deposit error:', err);
    res.status(500).json({ error: 'Something went wrong processing the deposit.' });
  }
});

/**
 * POST /api/wallet/withdraw
 * body: { amount, method }
 */
router.post('/withdraw', async (req, res) => {
  try {
    const { amount, method } = req.body;
    const val = parseFloat(amount);
    if (!val || val < 10) return res.status(400).json({ error: 'Minimum withdrawal is R10.' });

    const { data: business } = await supabase
      .from('businesses')
      .select('wallet_balance')
      .eq('id', req.businessId)
      .single();

    if (val > parseFloat(business.wallet_balance)) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    const newBalance = parseFloat(business.wallet_balance) - val;

    await supabase.from('businesses').update({ wallet_balance: newBalance }).eq('id', req.businessId);
    await supabase.from('wallet_transactions').insert({
      business_id: req.businessId,
      type: 'withdrawal',
      method: method || 'eft',
      amount: val
    });

    res.json({ message: 'Withdrawal successful.', balance: newBalance });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Something went wrong processing the withdrawal.' });
  }
});

export default router;
