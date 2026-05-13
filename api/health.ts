import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  return res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    env: {
      hasDb: !!process.env.DATABASE_URL,
      hasClerkSecret: !!process.env.CLERK_SECRET_KEY,
      hasResend: !!process.env.RESEND_API_KEY,
      hasTelegramAlert: !!process.env.TELEGRAM_ALERT_BOT_TOKEN,
    },
  })
}
