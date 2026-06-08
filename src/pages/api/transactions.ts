import type { APIRoute } from 'astro'

async function getAuthenticatedUser(cookies: any, db: any) {
  const sessionId = cookies.get('session_id')?.value
  if (!sessionId) {
    return null
  }

  const { results } = await db.prepare(
    'SELECT u.id, u.household_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?'
  ).bind(sessionId, new Date().toISOString()).all()

  return results[0] || null
}

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  const user = await getAuthenticatedUser(cookies, db)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { amount, date, description } = await request.json()
    const transactionId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('INSERT INTO transactions (id, household_id, amount, date, description, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(transactionId, user.household_id, amount, date, description, user.id),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', transactionId, 'CREATE', user.id)
    ])

    return new Response(JSON.stringify({ success: true, id: transactionId }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  const user = await getAuthenticatedUser(cookies, db)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { id, amount, date, description } = await request.json()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('UPDATE transactions SET amount = ?, date = ?, description = ? WHERE id = ? AND household_id = ?')
        .bind(amount, date, description, id, user.household_id),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', id, 'UPDATE', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ request, locals, cookies }) => {
  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  const user = await getAuthenticatedUser(cookies, db)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { id } = await request.json()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('DELETE FROM transactions WHERE id = ? AND household_id = ?')
        .bind(id, user.household_id),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', id, 'DELETE', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
