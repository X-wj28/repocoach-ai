const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

test("registers a user and manages a revocable session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "repocoach-auth-"));
  process.env.REPOCOACH_DB_PATH = join(directory, "test.db");
  const { DatabaseService } = require("../dist/database/database.service.js");
  const { AuthStore } = require("../dist/auth/auth.store.js");
  const { AuthService } = require("../dist/auth/auth.service.js");
  const database = new DatabaseService();
  const auth = new AuthService(new AuthStore(database));

  try {
    const registered = await auth.register({ email: "Student@Example.com", name: "林同学", password: "secure-pass-123" });
    assert.equal(registered.user.email, "student@example.com");
    assert.equal(registered.user.name, "林同学");
    assert.equal(auth.findByToken(registered.token)?.id, registered.user.id);

    const loggedIn = await auth.login({ email: "student@example.com", password: "secure-pass-123" });
    assert.equal(loggedIn.user.id, registered.user.id);
    auth.logout(loggedIn.token);
    assert.equal(auth.findByToken(loggedIn.token), null);
  } finally {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.REPOCOACH_DB_PATH;
  }
});
