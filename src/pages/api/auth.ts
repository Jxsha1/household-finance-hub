import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const db = (locals as any).runtime?.env?.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database connection missing' }), { status: 500 })
  }

  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    // Pull the matching user record from the serverless database instance
    const { results } = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).all()
    const user = results[0]

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })
    }

    // Hash the password input using native high-performance Web Crypto SHA-256
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const clientHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (user.password_hash !== clientHash) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })
    }

    // Generate a secure unique session tracking token
    const sessionId = crypto.randomUUID()
    const oneWeekInSeconds = 60 * 60 * 24 * 7
    const expiresAt = new Date(Date.now() + oneWeekInSeconds * 1000).toISOString()

    // Write the active session state record to the D1 storage table
    await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, user.id, expiresAt)
      .run()

    // Drop an isolated HTTP-only cookie into the user client browser
    cookies.set('session_id', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: oneWeekInSeconds
    })

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ locals, cookies }) => {
  const db = (locals as any).runtime?.env?.DB
  const sessionId = cookies.get('session_id')?.value

  if (db && sessionId) {
    // Purge the session identity record from the storage layer instantly
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }

  // Instruct the client application layer to drop the cookie target
  cookies.delete('session_id', { path: '/' })
  return new Response(JSON.stringify({ success: true }), { status: 200 })
}
