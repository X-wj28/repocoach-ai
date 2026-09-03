const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clearSessionCookie,
  createSessionCookie,
} = require("../dist/auth/session-cookie.js");

test("creates a local development session cookie", () => {
  process.env.COOKIE_SECURE = "false";
  const cookie = createSessionCookie("token value", 3600);
  assert.match(cookie, /^repocoach_session=token%20value;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /; Secure/);
  delete process.env.COOKIE_SECURE;
});

test("supports secure cookies for HTTPS deployments", () => {
  process.env.COOKIE_SECURE = "true";
  assert.match(createSessionCookie("token", 3600), /; Secure$/);
  assert.match(clearSessionCookie(), /Max-Age=0; Secure$/);
  delete process.env.COOKIE_SECURE;
});
