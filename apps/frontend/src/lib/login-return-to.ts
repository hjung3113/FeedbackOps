// Match the backend OIDC sanitizeReturnTo acceptance rules; never normalize
// the accepted value. The frontend's default destination is /home.
// Rejecting control characters is the whole point of this pattern.
// biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors the backend return_to allowlist
const RETURN_TO_SAFE = /^\/[^\s\\\u0000-\u001f\u007f-\u009f]*$/;

export function sanitizeLoginReturnTo(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '/home';
  if (raw.length > 2048 || !RETURN_TO_SAFE.test(raw) || raw.startsWith('//')) return '/home';
  try {
    const resolved = new URL(raw, 'http://return-to.invalid');
    if (resolved.origin !== 'http://return-to.invalid' || resolved.pathname.startsWith('//')) {
      return '/home';
    }
  } catch {
    return '/home';
  }
  return raw;
}
