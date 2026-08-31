import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'Fundukuzama <onboarding@resend.dev>';

export async function sendVerificationEmail(toEmail, firstName, verifyUrl) {
  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Verify your Fundukuzama account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0D2B55">Welcome to Fundukuzama, ${firstName} 👋</h2>
        <p>Confirm your email to activate your account and start auto-investing your business's sales revenue.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#F0C040;color:#0D2B55;font-weight:600;
           padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Verify my email</a>
        <p style="color:#888;font-size:13px">This link expires in 24 hours. If you didn't sign up for Fundukuzama, you can ignore this email.</p>
      </div>
    `
  });
}

export async function sendWelcomeEmail(toEmail, firstName) {
  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'You\'re verified — welcome to Fundukuzama',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0D2B55">You're all set, ${firstName} 🎉</h2>
        <p>Your Fundukuzama account is verified. Sign in to connect your sales channel and start auto-investing.</p>
      </div>
    `
  });
}
