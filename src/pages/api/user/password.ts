import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).runtime?.env?.DB
  const user = (locals as any).user

  if (!db || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised profile modification attempt' }), { status: 401 })
  }

  try {
    const { newPassword } = await request.json()
    if (!newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Password length must be at least 6 characters' }), { status: 400 })
    }

    // Hash the clear text choice securely using native edge Web Crypto SHA-256 subroutines
    const encoder = new TextEncoder()
    const data = encoder.encode(newPassword)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const newHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Overwrite the old record hash value and clear the required reset tracking flag completely
    await db.prepare('UPDATE users SET password_hash = ?, password_change_required = 0 WHERE id = ?')
      .bind(newHash, user.id)
      .run()

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
