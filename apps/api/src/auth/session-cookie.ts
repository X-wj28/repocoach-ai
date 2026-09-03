export const sessionCookieName = "repocoach_session";

function secureAttribute() {
  const configured = process.env.COOKIE_SECURE;
  const secure =
    configured === undefined
      ? process.env.NODE_ENV === "production"
      : configured === "true";
  return secure ? "; Secure" : "";
}

export function readSessionCookie(cookieHeader?: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function createSessionCookie(token: string, maxAgeSeconds: number) {
  return (
    sessionCookieName +
    "=" +
    encodeURIComponent(token) +
    "; HttpOnly; Path=/; SameSite=Lax; Max-Age=" +
    maxAgeSeconds +
    secureAttribute()
  );
}

export function clearSessionCookie() {
  return (
    sessionCookieName +
    "=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0" +
    secureAttribute()
  );
}
