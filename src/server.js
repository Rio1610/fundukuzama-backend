import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';

dotenv.config();

const app = express();

// Accept the fixed production URL, plus any Vercel preview URL for this project
// (e.g. https://fundukuzama-5u62am97n-smanga.vercel.app) — Vercel generates a
// new one of these on every push, so a single fixed FRONTEND_URL keeps breaking.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  /^https:\/\/fundukuzama[a-z0-9-]*\.vercel\.app$/
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / server-to-server requests
    const ok = allowedOrigins.some(rule =>
      rule instanceof RegExp ? rule.test(origin) : rule === origin
    );
    callback(ok ? null : new Error('Not allowed by CORS'), ok);
  }
}));
app.use(express.json());

// Basic protection against signup/login abuse — free, no extra service needed.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Fundukuzama backend running on port ${PORT}`);
});
