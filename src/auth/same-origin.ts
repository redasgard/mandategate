export function isTrustedMutationOrigin(request: Request) {
  const expected = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(expected).origin; } catch { return false; }
}
