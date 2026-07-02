import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised session access' }), { status: 401 })
  }

  try {
    const { description, amount, date, bank_name } = await request.json()
    if (!description || amount === undefined || !date || !bank_name) {
      return new Response(JSON.stringify({ error: 'Missing required transaction configuration variables' }), { status: 400 })
    }

    const txId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('INSERT INTO transactions (id, household_id, created_by_user_id, description, amount, date, bank_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(txId, user.householdId, user.id, description, amount, date, bank_name),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', txId, 'RECORD_ONE_OFF_PAYMENT', user.id)
    ])

    return new Response(JSON.stringify({ success: true, id: txId }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const PUT: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised session access' }), { status: 401 })
  }

  try {
    const { id, description, amount, date, bank_name } = await request.json()
    if (!id || !description || amount === undefined || !date || !bank_name) {
      return new Response(JSON.stringify({ error: 'Missing required modification parameters' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('UPDATE transactions SET description = ?, amount = ?, date = ?, bank_name = ? WHERE id = ? AND household_id = ?')
        .bind(description, amount, date, bank_name, id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', id, 'UPDATE_ONE_OFF_PAYMENT', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised session access' }), { status: 401 })
  }

  try {
    const { id } = await request.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing target record identifier' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('DELETE FROM transactions WHERE id = ? AND household_id = ?')
        .bind(id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'transactions', id, 'PURGE_ONE_OFF_PAYMENT', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
