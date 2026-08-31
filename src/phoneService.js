import dotenv from 'dotenv';
dotenv.config();

const TWILIO_CONFIGURED = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_VERIFY_SERVICE_SID
);

export const phoneVerificationRequired = process.env.PHONE_VERIFICATION_REQUIRED === 'true';

// Lazily import Twilio only if it's actually configured — keeps it an
// optional dependency, so you're not paying for or setting up SMS until
// you're ready to turn PHONE_VERIFICATION_REQUIRED on.
let twilioClient = null;
async function getTwilioClient() {
  if (!TWILIO_CONFIGURED) return null;
  if (!twilioClient) {
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendPhoneOtp(phoneNumber) {
  if (!TWILIO_CONFIGURED) {
    console.log(`[phoneService] Twilio not configured — skipping SMS OTP for ${phoneNumber}`);
    return { skipped: true };
  }
  const client = await getTwilioClient();
  return client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({ to: phoneNumber, channel: 'sms' });
}

export async function checkPhoneOtp(phoneNumber, code) {
  if (!TWILIO_CONFIGURED) {
    return { skipped: true, valid: true }; // don't block signup when SMS isn't set up
  }
  const client = await getTwilioClient();
  const result = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: phoneNumber, code });
  return { valid: result.status === 'approved' };
}
