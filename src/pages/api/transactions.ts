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
