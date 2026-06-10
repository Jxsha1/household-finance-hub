import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { endpoint, p256dh, auth } = await request.json()
    if (!endpoint || !p256dh || !auth) {
      return new Response(JSON.stringify({ error: 'Missing required push token parameters' }), { status: 400 })
    }

    // Check if this specific device endpoint is already registered for the active user
    const existing = await db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .bind(user.id, endpoint)
      .first()

    if (existing) {
      return new Response(JSON.stringify({ success: true, id: existing.id, message: 'Device already registered' }), { status: 200 })
    }

    const subscriptionId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    // Write the network subscription tokens into D1 while registering a trackable security log row
    await db.batch([
      db.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)')
        .bind(subscriptionId, user.id, endpoint, p256dh, auth),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'push_subscriptions', subscriptionId, 'REGISTER_PUSH', user.id)
    ])

    return new Response(JSON.stringify({ success: true, id: subscriptionId }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { endpoint } = await request.json()
    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Missing endpoint target parameter' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    // Purge the device push registrations to turn off notifications instantly
    await db.batch([
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
        .bind(user.id, endpoint),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'push_subscriptions', endpoint, 'UNREGISTER_PUSH', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
