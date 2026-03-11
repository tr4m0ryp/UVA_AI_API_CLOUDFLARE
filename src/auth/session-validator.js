/*
 * Validate a cookie against the UvA aichat session endpoint.
 * Returns { valid, email, name } or { valid: false }.
 */
async function validateSession(cookie) {
  try {
    const res = await fetch('https://aichat.uva.nl/api/auth/session', {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });

    if (!res.ok) return { valid: false };

    const data = await res.json();
    if (data && data.user && data.user.email) {
      return {
        valid: true,
        email: data.user.email,
        name: data.user.name || '',
      };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

module.exports = { validateSession };
