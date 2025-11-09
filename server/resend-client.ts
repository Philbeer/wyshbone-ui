import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  console.log('🔧 TEMPORARILY FORCING ENV VARIABLE USE FOR TESTING');
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = 'onboarding@resend.dev';
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable not set');
  }
  
  console.log(`🔑 Using Resend credentials from ENV - API key starts with: ${apiKey.substring(0, 10)}..., fromEmail: ${fromEmail}`);
  return {apiKey, fromEmail};
}

export async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}
