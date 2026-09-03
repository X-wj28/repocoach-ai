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

test("supports cross-site secure cookies for separate web and API origins", () => {
  process.env.COOKIE_SECURE = "true";
  process.env.COOKIE_SAME_SITE = "none";
  assert.match(createSessionCookie("token", 3600), /SameSite=None/);
  assert.match(createSessionCookie("token", 3600), /; Secure$/);
  assert.match(clearSessionCookie(), /SameSite=None; Max-Age=0; Secure$/);
  delete process.env.COOKIE_SECURE;
  delete process.env.COOKIE_SAME_SITE;
});
