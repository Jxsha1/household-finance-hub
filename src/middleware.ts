import { defineMiddleware } from 'astro:middleware'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/manifest.json',
  '/sw.js'
]

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, redirect } = context
  const path = url.pathname

  if (PUBLIC_PATHS.includes(path) || path.startsWith('/icons/')) {
    return next()
  }

  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  const sessionId = cookies.get('session_id')?.value

  if (!sessionId) {
    return redirect('/login')
  }

  try {
    // Pull the account reset flag status directly from the user table join row
    const { results } = await db.prepare(
      'SELECT s.id, u.id as user_id, u.household_id, u.password_change_required FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?'
    ).bind(sessionId, new Date().toISOString()).all()

    const sessionUser = results[0]

    if (!sessionUser) {
      cookies.delete('session_id', { path: '/' })
      return redirect('/login')
    }

    // Force users to stay on the settings page if a password reset remains uncompleted
    if (sessionUser.password_change_required === 1 && path !== '/settings' && path !== '/api/user/password') {
      return redirect('/settings?force=1')
    }

    (context.locals as any).user = {
      id: sessionUser.user_id,
      householdId: sessionUser.household_id,
      passwordChangeRequired: sessionUser.password_change_required
    }

    return next()
  } catch (error) {
    console.error('Middleware path validation failure:', error)
    return redirect('/login')
  }
})
