import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { name, amount, direction, bank_name, day_of_month, start_date, end_date } = await request.json()
    if (!name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 })
    }

    const finalStartDate = start_date || new Date().toISOString().split('T')[0]
    const recurringId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('INSERT INTO recurring_payments (id, household_id, name, amount, direction, bank_name, day_of_month, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(recurringId, user.householdId, name, amount, direction, bank_name, day_of_month, finalStartDate, end_date || null),
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

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { id, name, amount, direction, bank_name, day_of_month, start_date, end_date } = await request.json()
    if (!id || !name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing update parameters' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    // Overwrite the existing columns directly instead of splitting historical timelines
    await db.batch([
      db.prepare('UPDATE recurring_payments SET name = ?, amount = ?, direction = ?, bank_name = ?, day_of_month = ?, start_date = ?, end_date = ? WHERE id = ? AND household_id = ?')
        .bind(name, amount, direction, bank_name, day_of_month, start_date, end_date || null, id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'recurring_payments', id, 'OVERWRITE_UPDATE', user.id)
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
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { id, purge } = await request.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing target ID' }), { status: 400 })
    }

    const logId = crypto.randomUUID()

    if (purge === true) {
      // Execute a complete database purge run for ended entries
      await db.batch([
        db.prepare('DELETE FROM recurring_payments WHERE id = ? AND household_id = ?')
          .bind(id, user.householdId),
        db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
          .bind(logId, 'recurring_payments', id, 'HARD_PURGE', user.id)
      ])
      return new Response(JSON.stringify({ success: true, action: 'purged' }), { status: 200 })
    } else {
      // Regular soft delete applying an end date marker configuration
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      await db.batch([
        db.prepare('UPDATE recurring_payments SET end_date = ? WHERE id = ? AND household_id = ?')
          .bind(yesterdayStr, id, user.householdId),
        db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
          .bind(logId, 'recurring_payments', id, 'SOFT_CLOSE', user.id)
      ])
      return new Response(JSON.stringify({ success: true, action: 'closed' }), { status: 200 })
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
