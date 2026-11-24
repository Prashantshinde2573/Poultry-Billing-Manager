/**
 * Drivers and staff often have no email. They sign in with a mobile number,
 * which is mapped to an internal login email (never shown, never emailed).
 */
export function normalizeMobile(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return null;
}

export function loginEmailFor(identifier: string, domain = process.env.LOGIN_EMAIL_DOMAIN || 'phone.poulgo.local'): string | null {
  const v = identifier.trim().toLowerCase();
  if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  const m = normalizeMobile(v);
  return m ? `${m}@${domain}` : null;
}
