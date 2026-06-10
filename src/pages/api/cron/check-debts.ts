import type { APIRoute } from 'astro'

async function createVapidHeader(endpoint: string, privateKeyJWK: any, publicKeyBase64: string, subEmail: string) {
  const origin = new URL(endpoint).origin
  const expiry = Math.floor(Date.now() / 1000) + 43200
  
  const header = { alg: 'ES256', typ: 'JWT' }
  const payload = { aud: origin, exp: expiry, sub: `mailto:${subEmail}` }
  
  const textEncoder = new TextEncoder()
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  const tokenToSign = `${encodedHeader}.${encodedPayload}`
  
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    textEncoder.encode(tokenToSign)
  )
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    
  return `vapid t=${encodedHeader}.${encodedPayload}.${encodedSignature}, k=${publicKeyBase64}`
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const cronSecret = (locals as any).runtime?.env?.CRON_SECRET

  const authHeader = request.headers.get('Authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorised background trigger' }), { status: 401 })
  }

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database instance unavailable' }), { status: 500 })
  }

  try {
    const { results: debts } = await db.prepare(
      'SELECT d.household_id, d.debt_name, d.current_balance, d.interest_rate, d.minimum_payment FROM debts d WHERE d.current_balance > 0'
    ).all()

    if (!debts || debts.length === 0) {
      return new Response(JSON.stringify({ message: 'No active balances to notify' }), { status: 200 })
    }

    const VAPID_PRIVATE_JWK = {
      kty: 'EC',
      crv: 'P-256',
      x: 'rc-O6snkeRREf9661s2K6Z909Yc30n_n4O_G1TzGvW0',
      y: 'z_jE_vQc_qP_s49_X8v61s2K6Z909Yc30n_n4O_G1T0',
      d: 'x30n_n4O_G1TzGvWz_jE_vQc_qP_s49_X8v61s2K6Z9'
    }
    const VAPID_PUBLIC_KEY = 'BEl62OhSreZREf9661s2K6Z909Yc30n_n4O_G1TzGvWz_jE_vQc_qP_s49_X8'

    let notificationsSent = 0

    for (const debt of debts as any[]) {
      const { results: subs } = await db.prepare(
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (SELECT id FROM users WHERE household_id = ?)'
      ).bind(debt.household_id).all()

      if (!subs || subs.length === 0) continue

      const balanceInPounds = (debt.current_balance / 100).toFixed(2)
      const minDueInPounds = (debt.minimum_payment / 100).toFixed(2)
      
      const alertTitle = `Debt Alert: ${debt.debt_name}`
      const alertBody = `Balance stands at £${balanceInPounds}. Minimum monthly payment of £${minDueInPounds} is approaching tracking limits.`

      for (const sub of subs as any[]) {
        const vapidHeader = await createVapidHeader(sub.endpoint, VAPID_PRIVATE_JWK, VAPID_PUBLIC_KEY, 'finance@hub.local')
        
        await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': vapidHeader,
            'TTL': '2419200',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: alertTitle,
            body: alertBody,
            url: '/budgets'
          })
        })
        notificationsSent++
      }
    }

    return new Response(JSON.stringify({ success: true, notificationsSent }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
