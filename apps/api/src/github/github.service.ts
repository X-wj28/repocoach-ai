import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import { Dispatcher, ProxyAgent } from "undici";
import { PrismaService } from "../database/prisma.service";

type GitHubRepository = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  private: boolean;
};

type GitHubContent = {
  content?: string;
  encoding?: string;
};

type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
};

type GitHubTree = {
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

type AnalyzedFile = {
  path: string;
  size: number;
  language: string;
  snippet: string;
};

export type ProjectContext = {
  id: string;
  name: string;
  url: string;
  stack: string[];
  readmePreview: string;
  files: AnalyzedFile[];
};

@Injectable()
export class GitHubService {
  private readonly dispatcher?: Dispatcher;
  private readonly contexts = new Map<string, ProjectContext>();

  constructor(private readonly prisma: PrismaService) {
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    if (proxyUrl) this.dispatcher = new ProxyAgent(proxyUrl);
  }

  async analyzePublicRepository(repoUrl: string, jobDescription: string) {
    const { owner, repo } = this.parseRepositoryUrl(repoUrl);
    const repository = await this.request<GitHubRepository>(`/repos/${owner}/${repo}`);

    if (repository.private) {
      throw new BadRequestException("RepoCoach 第一版只支持公开 GitHub 仓库。");
    }

    const [readme, tree] = await Promise.all([
      this.readReadme(owner, repo),
      this.request<GitHubTree>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`)
    ]);

    const selectedEntries = this.selectRelevantFiles(tree.tree);
    const files = await Promise.all(selectedEntries.map((entry) => this.readBlob(owner, repo, entry)));
    const usableFiles = files.filter((file): file is AnalyzedFile => file !== null);
    const stack = this.detectStack(repository, usableFiles);
    const projectId = `github-${owner}-${repo}`.toLowerCase();

    const context: ProjectContext = {
      id: projectId,
      name: repository.name,
      url: repository.html_url,
      stack,
      readmePreview: readme.slice(0, 1800),
      files: usableFiles
    };
    this.contexts.set(projectId, context);
    await this.prisma.projectSnapshot.upsert({
      where: { id: projectId },
      create: { id: context.id, name: context.name, url: context.url, stack: context.stack, readmePreview: context.readmePreview, files: context.files },
      update: { name: context.name, url: context.url, stack: context.stack, readmePreview: context.readmePreview, files: context.files }
    });

    return {
      id: projectId,
      name: repository.name,
      url: repository.html_url,
      visibility: "public" as const,
      stack,
      analyzedFiles: usableFiles.length,
      status: "synced" as const,
      description: repository.description,
      defaultBranch: repository.default_branch,
      owner,
      jobDescription,
      readmePreview: context.readmePreview,
      keyFiles: usableFiles.map(({ path, size, language }) => ({ path, size, language })),
      treeTruncated: tree.truncated,
      analyzedAt: new Date().toISOString()
    };
  }

  async getProjectContext(projectId: string): Promise<ProjectContext | undefined> {
    const cached = this.contexts.get(projectId);
    if (cached) return cached;
    const snapshot = await this.prisma.projectSnapshot.findUnique({ where: { id: projectId } });
    if (!snapshot) return undefined;
    const context: ProjectContext = {
      id: snapshot.id,
      name: snapshot.name,
      url: snapshot.url,
      stack: Array.isArray(snapshot.stack) ? snapshot.stack.filter((item): item is string => typeof item === "string") : [],
      readmePreview: snapshot.readmePreview,
      files: Array.isArray(snapshot.files) ? snapshot.files.filter((item): item is AnalyzedFile => {
        if (!item || typeof item !== "object") return false;
        const file = item as Record<string, unknown>;
        return typeof file.path === "string" && typeof file.size === "number" && typeof file.language === "string" && typeof file.snippet === "string";
      }) : []
    };
    this.contexts.set(projectId, context);
    return context;
  }

  private parseRepositoryUrl(repoUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(repoUrl);
    } catch {
      throw new BadRequestException("GitHub 仓库地址格式不正确。");
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || segments.length !== 2) {
      throw new BadRequestException("请输入公开 GitHub 仓库地址，例如 https://github.com/user/repository。");
    }

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/, "");
    if (!owner || !repo) throw new BadRequestException("GitHub 仓库地址缺少用户名或仓库名。");
    return { owner: encodeURIComponent(owner), repo: encodeURIComponent(repo) };
  }

  private async readReadme(owner: string, repo: string) {
    try {
      const content = await this.request<GitHubContent>(`/repos/${owner}/${repo}/readme`);
      return content.content && content.encoding === "base64" ? Buffer.from(content.content, "base64").toString("utf8") : "";
    } catch {
      return "";
    }
  }

  private async readBlob(owner: string, repo: string, entry: GitHubTreeEntry): Promise<AnalyzedFile | null> {
    try {
      const content = await this.request<GitHubContent>(`/repos/${owner}/${repo}/git/blobs/${entry.sha}`);
      const text = content.content && content.encoding === "base64" ? Buffer.from(content.content, "base64").toString("utf8") : "";
      return {
        path: entry.path,
        size: entry.size ?? Buffer.byteLength(text),
        language: this.languageFor(entry.path),
        snippet: text.slice(0, 12000)
      };
    } catch {
      return null;
    }
  }

  private selectRelevantFiles(entries: GitHubTreeEntry[]) {
    const ignored = /(^|\/)(node_modules|\.next|dist|build|coverage|public|assets)(\/|$)/i;
    const sourceFile = /\.(tsx?|jsx?)$/i;
    const candidates = entries.filter((entry) => entry.type === "blob" && !ignored.test(entry.path) && (sourceFile.test(entry.path) || /^(readme\.md|package\.json)$/i.test(entry.path)));

    return candidates
      .map((entry) => ({ entry, score: this.fileScore(entry.path) }))
      .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
      .slice(0, 14)
      .map(({ entry }) => entry);
  }

  private fileScore(filePath: string) {
    const normalized = filePath.toLowerCase();
    if (normalized === "package.json") return 100;
    if (normalized === "readme.md") return 95;
    if (/next\.config|tsconfig|src\/lib|src\/hooks|app\/|pages\//.test(normalized)) return 80;
    if (/components?\/|hooks?\//.test(normalized)) return 70;
    return 40;
  }

  private detectStack(repository: GitHubRepository, files: AnalyzedFile[]) {
    const packageFile = files.find((file) => file.path.toLowerCase() === "package.json");
    const stack: string[] = [];
    try {
      const packageJson = packageFile ? JSON.parse(packageFile.snippet) : {};
      const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
      if (dependencies.next) stack.push("Next.js");
      if (dependencies.react) stack.push("React");
      if (dependencies.typescript) stack.push("TypeScript");
      if (dependencies.tailwindcss) stack.push("Tailwind CSS");
      if (dependencies.zustand || dependencies.redux || dependencies["@reduxjs/toolkit"]) stack.push("状态管理");
    } catch {
      // The repository can still be analyzed when package.json is invalid or absent.
    }

    if (stack.length === 0 && repository.language) stack.push(repository.language);
    return stack.length > 0 ? stack.slice(0, 5) : ["前端项目"];
  }

  private languageFor(filePath: string) {
    if (/\.tsx$/i.test(filePath)) return "TSX";
    if (/\.ts$/i.test(filePath)) return "TypeScript";
    if (/\.jsx$/i.test(filePath)) return "JSX";
    if (/\.js$/i.test(filePath)) return "JavaScript";
    if (/package\.json$/i.test(filePath)) return "JSON";
    return "Text";
  }

  private async request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoCoach/0.1",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const init: RequestInit & { dispatcher?: Dispatcher } = { headers };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, init);
    } catch {
      throw new BadGatewayException("无法连接 GitHub API，请检查网络或 HTTPS_PROXY 配置。");
    }

    if (!response.ok) {
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
        throw new BadGatewayException("GitHub API 请求次数已用尽，请配置只读 GITHUB_TOKEN 后重试。");
      }
      if (response.status === 404) throw new BadRequestException("找不到这个公开 GitHub 仓库，请确认地址和仓库可见性。");
      throw new BadGatewayException(`GitHub API 返回了 ${response.status}，请稍后重试。`);
    }

    return response.json() as Promise<T>;
  }
}
