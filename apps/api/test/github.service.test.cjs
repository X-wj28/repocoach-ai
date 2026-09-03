const assert = require("node:assert/strict");
const test = require("node:test");

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
