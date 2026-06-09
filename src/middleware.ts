import { defineMiddleware } from 'astro:middleware'

// Define the paths that do not require an active user session cookie
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/manifest.json',
  '/sw.js'
]

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, redirect } = context
  const path = url.pathname

  // Allow immediate access if the path is a public asset or explicitly excluded
  if (PUBLIC_PATHS.includes(path) || path.startsWith('/icons/')) {
    return next()
  }

  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing within middleware context' }), { status: 500 })
  }

  const sessionId = cookies.get('session_id')?.value

  // Redirect to the login screen immediately if the cookie container is completely missing
  if (!sessionId) {
    return redirect('/login')
  }

  try {
    // Validate the session ID against the D1 storage layer and check expiration boundaries
    const { results } = await db.prepare(
      'SELECT s.id, u.id as user_id, u.household_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?'
    ).bind(sessionId, new Date().toISOString()).all()

    const sessionUser = results[0]

    // Purge invalid cookies and enforce gatekeeping rules if no active database record exists
    if (!sessionUser) {
      cookies.delete('session_id', { path: '/' })
      return redirect('/login')
    }

    // Attach the validated identity variables safely to the request context for downstream pages
    (context.locals as any).user = {
      id: sessionUser.user_id,
      householdId: sessionUser.household_id
    }

    return next()
  } catch (error) {
    console.error('Middleware database validation failure:', error)
    return redirect('/login')
  }
})
