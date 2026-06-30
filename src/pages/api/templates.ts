import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised session access' }), { status: 401 })
  }

  try {
    const { bankName, rate, min } = await request.json()
    if (!bankName || !rate || !min) {
      return new Response(JSON.stringify({ error: 'Missing required coordinate layout parameters' }), { status: 400 })
    }

    const templateId = crypto.randomUUID()
    const logId = crypto.randomUUID()

    // Insert or replace the spatial bounding metrics map for this specific banking entity safely
    await db.batch([
      db.prepare('INSERT OR REPLACE INTO statement_templates (id, household_id, bank_name, rate_x, rate_y, rate_w, rate_h, min_x, min_y, min_w, min_h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(templateId, user.householdId, bankName, rate.x, rate.y, rate.w, rate.h, min.x, min.y, min.w, min.h),
      db.prepare('INSERT INTO audit_logs (id, table_name, record_id, action, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(logId, 'statement_templates', templateId, 'SAVE_TEMPLATE', user.id)
    ])

    return new Response(JSON.stringify({ success: true, id: templateId }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
