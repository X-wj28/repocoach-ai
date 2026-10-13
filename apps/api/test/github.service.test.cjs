const assert = require("node:assert/strict");
const test = require("node:test");
const { GitHubService } = require("../dist/github/github.service.js");

function mockNetwork(t, handler) {
  const previous = {
    fetch: global.fetch,
    https: process.env.HTTPS_PROXY,
    http: process.env.HTTP_PROXY,
  };
  delete process.env.HTTPS_PROXY;
  delete process.env.HTTP_PROXY;
  global.fetch = handler;
  t.after(() => {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ["HTTPS_PROXY", previous.https],
      ["HTTP_PROXY", previous.http],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("restores a project context snapshot after an API restart", async () => {
  let reads = 0;
  const prisma = {
    projectSnapshot: {
      async findUnique({ where }) {
        reads += 1;
        assert.equal(where.id, "github-user-project");
        return {
          id: "github-user-project",
          name: "project",
          url: "https://github.com/user/project",
          stack: ["Next.js", "React"],
          readmePreview: "A project",
          files: [
            {
              path: "app/page.tsx",
              size: 80,
              language: "TSX",
              snippet: "export default function Page() {}",
            },
          ],
        };
      },
    },
  };
  const { GitHubService } = require("../dist/github/github.service.js");
  const service = new GitHubService(prisma);

  const first = await service.getProjectContext("github-user-project");
  const second = await service.getProjectContext("github-user-project");

  assert.equal(first.name, "project");
  assert.equal(first.files[0].path, "app/page.tsx");
  assert.equal(second, first);
  assert.equal(reads, 1);
});

test("repository analysis pins the commit tree and excludes secrets, symlinks and large files", async (t) => {
  const commitSha = "a".repeat(40),
    treeSha = "b".repeat(40),
    blobSha = "c".repeat(40);
  const requests = [];
  mockNetwork(t, async (url) => {
    requests.push(url);
    const path = new URL(url).pathname;
    if (path === "/repos/example/repo")
      return Response.json({
        name: "repo",
        html_url: "https://github.com/example/repo",
        default_branch: "main",
        language: "TypeScript",
        private: false,
      });
    if (path.endsWith("/commits/main"))
      return Response.json({
        sha: commitSha,
        commit: { tree: { sha: treeSha } },
      });
    if (path.endsWith(`/trees/${treeSha}`))
      return Response.json({
        truncated: false,
        tree: [
          {
            path: "src/App.tsx",
            type: "blob",
            mode: "100644",
            sha: blobSha,
            size: 50,
          },
          {
            path: ".env",
            type: "blob",
            mode: "100644",
            sha: blobSha,
            size: 50,
          },
          {
            path: "secrets.json",
            type: "blob",
            mode: "100644",
            sha: blobSha,
            size: 50,
          },
          {
            path: "src/link.ts",
            type: "blob",
            mode: "120000",
            sha: blobSha,
            size: 50,
          },
          {
            path: "src/huge.ts",
            type: "blob",
            mode: "100644",
            sha: blobSha,
            size: 300000,
          },
        ],
      });
    if (path.endsWith(`/blobs/${blobSha}`))
      return Response.json({
        content: Buffer.from("export const App = () => null;").toString(
          "base64",
        ),
        encoding: "base64",
      });
    throw new Error(`Unexpected request: ${path}`);
  });
  let snapshot;
  const service = new GitHubService({
    projectSnapshot: {
      async upsert(input) {
        snapshot = input.create;
      },
    },
  });
  const result = await service.analyzePublicRepository(
    "https://github.com/example/repo",
    "React",
  );
  assert.equal(result.commitSha, commitSha);
  assert.equal(result.indexedFiles, 1);
  assert.equal(snapshot.commitSha, commitSha);
  assert.deepEqual(
    snapshot.manifest.map((file) => file.path),
    ["src/App.tsx"],
  );
  assert.ok(
    !requests.some(
      (url) => url.includes("/trees/main") || url.includes("/readme"),
    ),
  );
});

test("additional evidence is fetched by the saved blob SHA, never by a moving branch", async (t) => {
  const blobSha = "d".repeat(40);
  let reads = 0;
  mockNetwork(t, async (url, init) => {
    reads++;
    assert.equal(
      url,
      `https://api.github.com/repos/example/repo/git/blobs/${blobSha}`,
    );
    assert.equal(init.redirect, "error");
    return Response.json({
      content: Buffer.from("export const savedVersion = true;").toString(
        "base64",
      ),
      encoding: "base64",
    });
  });
  const service = new GitHubService({});
  const project = {
    id: "test",
    name: "repo",
    url: "https://github.com/example/repo",
    stack: [],
    readmePreview: "",
    files: [],
    commitSha: "a".repeat(40),
    manifest: [{ path: "src/version.ts", sha: blobSha, size: 50 }],
  };
  const file = await service.readSnapshotFile(project, "src/version.ts");
  assert.match(file.snippet, /savedVersion/);
  await assert.rejects(service.readSnapshotFile(project, "src/missing.ts"));
  await assert.rejects(
    service.readSnapshotFile(
      { ...project, commitSha: undefined },
      "src/version.ts",
    ),
  );
  assert.equal(reads, 1);
});

test("oversized GitHub bodies cannot enter a saved evidence snapshot", async (t) => {
  mockNetwork(t, async () => new Response("x".repeat(400001)));
  const service = new GitHubService({});
  const project = {
    id: "test",
    name: "repo",
    url: "https://github.com/example/repo",
    stack: [],
    readmePreview: "",
    files: [],
    commitSha: "a".repeat(40),
    manifest: [{ path: "src/version.ts", sha: "b".repeat(40), size: 50 }],
  };
  await assert.rejects(
    service.readSnapshotFile(project, "src/version.ts"),
    /响应超时、过大或内容无效/,
  );
});
