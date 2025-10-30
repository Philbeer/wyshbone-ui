import { Resend } from 'resend';

async function getCredentials() {
  // Use environment variables directly (set via Replit Secrets)
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable not set');
  }
  
  console.log(`🔑 Using Resend credentials - API key starts with: ${apiKey.substring(0, 10)}..., fromEmail: ${fromEmail}`);
  
  return {apiKey, fromEmail};
}

export async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}
