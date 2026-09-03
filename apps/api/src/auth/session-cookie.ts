export const sessionCookieName = "repocoach_session";

export function readSessionCookie(cookieHeader?: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function createSessionCookie(token: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
