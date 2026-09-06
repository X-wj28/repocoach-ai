const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");

test("registers a user and manages a revocable session", async () => {
  const users = new Map();
  const sessions = new Map();
  const store = {
    async findByEmail(email) {
      return users.get(email);
    },
    async createUser(input) {
      const row = { id: randomUUID(), ...input, createdAt: new Date() };
      users.set(row.email, row);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      };
    },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt });
    },
    async findUserBySession(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= new Date()) return null;
      const row = [...users.values()].find(
        (user) => user.id === session.userId,
      );
      return row
        ? {
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.createdAt.toISOString(),
          }
        : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
  };
  const { AuthService } = require("../dist/auth/auth.service.js");
  const auth = new AuthService(store);

  const registered = await auth.register({
    email: "Student@gmail.com",
    name: "林同学",
    password: "secure-pass-123",
  });
  assert.equal(registered.user.email, "student@gmail.com");
  assert.equal(registered.user.name, "林同学");
  assert.equal(
    (await auth.findByToken(registered.token))?.id,
    registered.user.id,
  );

  const loggedIn = await auth.login({
    email: "student@gmail.com",
    password: "secure-pass-123",
  });
  assert.equal(loggedIn.user.id, registered.user.id);
  await auth.logout(loggedIn.token);
  assert.equal(await auth.findByToken(loggedIn.token), null);
});

test("rejects malformed and disposable email addresses", async () => {
  const { AuthService } = require("../dist/auth/auth.service.js");
  const auth = new AuthService({
    async findByEmail() {
      return null;
    },
  });

  await assert.rejects(
    auth.register({
      email: "not-an-email",
      name: "测试用户",
      password: "secure-pass-123",
    }),
    /有效邮箱地址/,
  );
  await assert.rejects(
    auth.register({
    email: "person@example.com",
      name: "测试用户",
      password: "secure-pass-123",
    }),
    /gmail.com/,
  );
});

test("requires and completes Gmail verification when enabled", async () => {
  const previous = process.env.EMAIL_VERIFICATION_REQUIRED;
  process.env.EMAIL_VERIFICATION_REQUIRED = "true";
  const row = {
    id: randomUUID(),
    email: "verify@gmail.com",
    name: "验证用户",
    passwordHash: "unused",
    createdAt: new Date(),
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationExpiresAt: null,
  };
  let created = false;
  const store = {
    async findByEmail() { return created ? row : null; },
    async createUser() { created = true; return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() }; },
    async setEmailVerification(_id, hash, expiresAt) { row.emailVerificationCodeHash = hash; row.emailVerificationExpiresAt = expiresAt; },
    async markEmailVerified() { row.emailVerifiedAt = new Date(); },
    async createSession() {},
  };
  let sentCode = "";
  const emailService = { async sendVerificationCode(_email, code) { sentCode = code; } };
  try {
    const { AuthService } = require("../dist/auth/auth.service.js");
    const auth = new AuthService(store, emailService);
    const registered = await auth.register({ email: row.email, name: row.name, password: "secure-pass-123" });
    assert.equal(registered.requiresEmailVerification, true);
    assert.equal(sentCode.length, 6);
    const verified = await auth.verifyEmail({ email: row.email, code: sentCode });
    assert.equal(verified.user.email, row.email);
    assert.ok(row.emailVerifiedAt);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED;
    else process.env.EMAIL_VERIFICATION_REQUIRED = previous;
  }
});
