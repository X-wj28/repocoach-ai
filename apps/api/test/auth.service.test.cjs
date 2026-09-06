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
    email: "Student@sample.dev",
    name: "林同学",
    password: "secure-pass-123",
  });
  assert.equal(registered.user.email, "student@sample.dev");
  assert.equal(registered.user.name, "林同学");
  assert.equal(
    (await auth.findByToken(registered.token))?.id,
    registered.user.id,
  );

  const loggedIn = await auth.login({
    email: "student@sample.dev",
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
    /测试或临时邮箱/,
  );
});
