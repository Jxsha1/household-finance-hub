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
    const { debtName, interestRate, minimumPayment } = await request.json()
    if (!debtName) {
      return new Response(JSON.stringify({ error: 'Missing credit provider name identifier' }), { status: 400 })
    }

    // Convert text values into accurate database integers and floating points safely
    const parsedRate = parseFloat(interestRate.replace(/[^0-9.]/g, '')) || 0
    const parsedMinimum = Math.round(parseFloat(minimumPayment.replace(/[^0-9.]/g, '')) * 100) || 0

    const logId = crypto.randomUUID()

    // Determine if this specific card record already exists within the active household ecosystem
    const existingDebt = await db.prepare('SELECT id FROM debts WHERE household_id = ? AND debt_name = ?')
      .bind(user.householdId, debtName)
      .first()

    if (existingDebt) {
      // Refresh the existing ledger row with the newly scraped parameters
      await db.batch([
        db.prepare('UPDATE debts SET interest_rate = ?, minimum_payment = ? WHERE id = ?')
          .bind(parsedRate, parsedMinimum, existingDebt.id),
        db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
          .bind(logId, 'debts', existingDebt.id, 'UPDATE_FROM_STATEMENT', user.id)
      ])
      return new Response(JSON.stringify({ success: true, id: existingDebt.id, action: 'updated' }), { status: 200 })
    } else {
      // Initialise a new debt slot wrapper with zeroed tracking balances until manually configured
      const debtId = crypto.randomUUID()
      await db.batch([
        db.prepare('INSERT INTO debts (id, household_id, debt_name, total_amount, current_balance, interest_rate, minimum_payment) VALUES (?, ?, ?, 0, 0, ?, ?)')
          .bind(debtId, user.householdId, debtName, parsedRate, parsedMinimum),
        db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
          .bind(logId, 'debts', debtId, 'CREATE_FROM_STATEMENT', user.id)
      ])
      return new Response(JSON.stringify({ success: true, id: debtId, action: 'created' }), { status: 201 })
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
