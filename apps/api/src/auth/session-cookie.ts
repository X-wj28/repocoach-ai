export const sessionCookieName = "repocoach_session";

function secureAttribute() {
  const configured = process.env.COOKIE_SECURE;
  const secure =
    configured === undefined
      ? process.env.NODE_ENV === "production"
      : configured === "true";
  return secure ? "; Secure" : "";
}

function sameSiteAttribute() {
  const configured = process.env.COOKIE_SAME_SITE?.toLowerCase();
  if (configured === "none") return "; SameSite=None";
  if (configured === "strict") return "; SameSite=Strict";
  return "; SameSite=Lax";
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
    "; HttpOnly; Path=/" +
    sameSiteAttribute() +
    "; Max-Age=" +
    maxAgeSeconds +
    secureAttribute()
  );
}

export function clearSessionCookie() {
  return (
    sessionCookieName +
    "=; HttpOnly; Path=/" +
    sameSiteAttribute() +
    "; Max-Age=0" +
    secureAttribute()
  );
}
