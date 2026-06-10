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
    const { name, amount, direction, bank_name, day_of_month } = await request.json()
    if (!name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 })
    }

    const recurringId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    // Execute the creation query alongside an audit trail injection dynamically
    await db.batch([
      db.prepare('INSERT INTO recurring_payments (id, household_id, name, amount, direction, bank_name, day_of_month) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(recurringId, user.householdId, name, amount, direction, bank_name, day_of_month),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'recurring_payments', recurringId, 'CREATE', user.id)
    ])

    return new Response(JSON.stringify({ success: true, id: recurringId }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const PUT: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { id, name, amount, direction, bank_name, day_of_month } = await request.json()
    if (!id || !name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing required update parameters' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    // Enforce isolation by matching against the active household id context
    await db.batch([
      db.prepare('UPDATE recurring_payments SET name = ?, amount = ?, direction = ?, bank_name = ?, day_of_month = ? WHERE id = ? AND household_id = ?')
        .bind(name, amount, direction, bank_name, day_of_month, id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'recurring_payments', id, 'UPDATE', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
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
    const { id } = await request.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing target allocation ID' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('DELETE FROM recurring_payments WHERE id = ? AND household_id = ?')
        .bind(id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'recurring_payments', id, 'DELETE', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}