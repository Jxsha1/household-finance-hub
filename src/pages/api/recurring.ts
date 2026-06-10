import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
  }

  try {
    const { name, amount, direction, bank_name, day_of_month, start_date } = await request.json()
    if (!name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 })
    }

    const finalStartDate = start_date || new Date().toISOString().split('T')[0]
    const recurringId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    await db.batch([
      db.prepare('INSERT INTO recurring_payments (id, household_id, name, amount, direction, bank_name, day_of_month, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(recurringId, user.householdId, name, amount, direction, bank_name, day_of_month, finalStartDate),
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
    const { id, name, amount, direction, bank_name, day_of_month, start_date } = await request.json()
    if (!id || !name || !amount || !direction || !bank_name || !day_of_month) {
      return new Response(JSON.stringify({ error: 'Missing required update parameters' }), { status: 400 })
    }

    const oldRecord: any = await db.prepare('SELECT * FROM recurring_payments WHERE id = ? AND household_id = ?')
      .bind(id, user.householdId)
      .first()

    if (!oldRecord) {
      return new Response(JSON.stringify({ error: 'Record not found' }), { status: 404 })
    }

    const finalStartDate = start_date || new Date().toISOString().split('T')[0]
    const logId = crypto.randomUUID()

    const isAmended = oldRecord.name !== name || 
                      oldRecord.amount !== amount || 
                      oldRecord.direction !== direction || 
                      oldRecord.bank_name !== bank_name || 
                      oldRecord.day_of_month !== day_of_month

    if (isAmended) {
      const newStart = new Date(finalStartDate)
      const endYesterday = new Date(newStart.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const newRecurringId = crypto.randomUUID()

      // Archive the old version record row and spawn a fresh replacement row entry track
      await db.batch([
        db.prepare('UPDATE recurring_payments SET end_date = ? WHERE id = ?')
          .bind(endYesterday, id),
        db.prepare('INSERT INTO recurring_payments (id, household_id, name, amount, direction, bank_name, day_of_month, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(newRecurringId, user.householdId, name, amount, direction, bank_name, day_of_month, finalStartDate),
        db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
          .bind(logId, 'recurring_payments', newRecurringId, 'AMEND_NEW_VERSION', user.id)
      ])
      return new Response(JSON.stringify({ success: true, id: newRecurringId, action: 'amended' }), { status: 200 })
    } else {
      // If fields match exactly, just update the start date parameter without running a full log break
      await db.prepare('UPDATE recurring_payments SET start_date = ? WHERE id = ?')
        .bind(finalStartDate, id)
        .run()
      return new Response(JSON.stringify({ success: true, id, action: 'updated_start_date' }), { status: 200 })
    }
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
    const { id, end_date } = await request.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing target ID' }), { status: 400 })
    }

    const finalEndDate = end_date || new Date().toISOString().split('T')[0]
    const logId = crypto.randomUUID()

    // Enforce soft deletion rule by applying an end date tracker property restriction
    await db.batch([
      db.prepare('UPDATE recurring_payments SET end_date = ? WHERE id = ? AND household_id = ?')
        .bind(finalEndDate, id, user.householdId),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'recurring_payments', id, 'SOFT_DELETE', user.id)
    ])

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
