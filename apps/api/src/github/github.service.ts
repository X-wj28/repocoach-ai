import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { Dispatcher, ProxyAgent } from "undici";
import { PrismaService } from "../database/prisma.service";
import {
  isRepositoryFile,
  MAX_MANIFEST_FILES,
  MAX_REPOSITORY_FILE_BYTES,
  type RepositoryFile,
} from "./repository-policy";

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

export type AnalyzedFile = {
  path: string;
  size: number;
  language: string;
  snippet: string;
  truncated?: boolean;
};

export type ProjectContext = {
  id: string;
  name: string;
  url: string;
  stack: string[];
  readmePreview: string;
  files: AnalyzedFile[];
  commitSha?: string;
  manifest?: RepositoryFile[];
  treeTruncated?: boolean;
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
    const repository = await this.request<GitHubRepository>(
      `/repos/${owner}/${repo}`,
    );

    if (repository.private) {
      throw new BadRequestException("RepoCoach 第一版只支持公开 GitHub 仓库。");
    }

    const commit = await this.request<{
      sha: string;
      commit: { tree: { sha: string } };
    }>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(repository.default_branch)}`,
    );
    if (
      !/^[a-f0-9]{40}$/i.test(commit.sha) ||
      !/^[a-f0-9]{40}$/i.test(commit.commit?.tree?.sha)
    ) {
      throw new BadGatewayException("GitHub 没有返回有效的代码版本。");
    }
    const tree = await this.request<GitHubTree>(
      `/repos/${owner}/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`,
    );
    const readable = tree.tree.filter(
      (entry) =>
        entry.type === "blob" &&
        ["100644", "100755"].includes(entry.mode) &&
        isRepositoryFile(entry),
    );
    const manifest = readable
      .slice(0, MAX_MANIFEST_FILES)
      .map(({ path, sha, size }) => ({ path, sha, size: size! }));

    const selectedEntries = this.selectRelevantFiles(
      readable.slice(0, MAX_MANIFEST_FILES),
    );
    const files = await Promise.all(
      selectedEntries.map((entry) => this.readBlob(owner, repo, entry)),
    );
    const usableFiles = files.filter(
      (file): file is AnalyzedFile => file !== null,
    );
    const stack = this.detectStack(repository, usableFiles);
    const projectId = `github-${owner}-${repo}`.toLowerCase();

    const context: ProjectContext = {
      id: projectId,
      name: repository.name,
      url: repository.html_url,
      stack,
      readmePreview:
        usableFiles
          .find((file) => /^readme\.md$/i.test(file.path))
          ?.snippet.slice(0, 1800) ?? "",
      files: usableFiles,
      commitSha: commit.sha,
      manifest,
      treeTruncated: tree.truncated || readable.length > MAX_MANIFEST_FILES,
    };
    this.contexts.set(projectId, context);
    await this.prisma.projectSnapshot.upsert({
      where: { id: projectId },
      create: {
        id: context.id,
        name: context.name,
        url: context.url,
        stack: context.stack,
        readmePreview: context.readmePreview,
        files: context.files,
        commitSha: context.commitSha,
        manifest: context.manifest,
        treeTruncated: context.treeTruncated,
      },
      update: {
        name: context.name,
        url: context.url,
        stack: context.stack,
        readmePreview: context.readmePreview,
        files: context.files,
        commitSha: context.commitSha,
        manifest: context.manifest,
        treeTruncated: context.treeTruncated,
      },
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
      keyFiles: usableFiles.map(({ path, size, language }) => ({
        path,
        size,
        language,
      })),
      commitSha: context.commitSha,
      indexedFiles: manifest.length,
      treeTruncated: context.treeTruncated,
      analyzedAt: new Date().toISOString(),
    };
  }

  async getProjectContext(
    projectId: string,
  ): Promise<ProjectContext | undefined> {
    const cached = this.contexts.get(projectId);
    if (cached) return cached;
    const snapshot = await this.prisma.projectSnapshot.findUnique({
      where: { id: projectId },
    });
    if (!snapshot) return undefined;
    const context: ProjectContext = {
      id: snapshot.id,
      name: snapshot.name,
      url: snapshot.url,
      stack: Array.isArray(snapshot.stack)
        ? snapshot.stack.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      readmePreview: snapshot.readmePreview,
      ...(snapshot.commitSha ? { commitSha: snapshot.commitSha } : {}),
      ...(Array.isArray(snapshot.manifest)
        ? { manifest: snapshot.manifest.filter(isRepositoryFile) }
        : {}),
      ...(snapshot.treeTruncated ? { treeTruncated: true } : {}),
      files: Array.isArray(snapshot.files)
        ? snapshot.files.filter((item): item is AnalyzedFile => {
            if (!item || typeof item !== "object") return false;
            const file = item as Record<string, unknown>;
            return (
              typeof file.path === "string" &&
              typeof file.size === "number" &&
              typeof file.language === "string" &&
              typeof file.snippet === "string"
            );
          })
        : [],
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
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      segments.length !== 2
    ) {
      throw new BadRequestException(
        "请输入公开 GitHub 仓库地址，例如 https://github.com/user/repository。",
      );
    }

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/, "");
    if (!owner || !repo)
      throw new BadRequestException("GitHub 仓库地址缺少用户名或仓库名。");
    return { owner: encodeURIComponent(owner), repo: encodeURIComponent(repo) };
  }

  async readSnapshotFile(
    project: ProjectContext,
    path: string,
    signal?: AbortSignal,
  ): Promise<AnalyzedFile> {
    if (!project.commitSha || !/^[a-f0-9]{40}$/i.test(project.commitSha))
      throw new BadRequestException("旧快照没有固定版本，请重新分析仓库。");
    const entry = project.manifest?.find(
      (file) => file.path === path && isRepositoryFile(file),
    );
    if (!entry)
      throw new BadRequestException("文件不在本次训练的可读代码清单中。");
    const { owner, repo } = this.parseRepositoryUrl(project.url);
    const content = await this.request<GitHubContent>(
      `/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
      signal,
      400000,
    );
    if (content.encoding !== "base64" || typeof content.content !== "string")
      throw new BadGatewayException("GitHub 没有返回可读取的文本文件。");
    const buffer = Buffer.from(content.content, "base64");
    if (buffer.length > MAX_REPOSITORY_FILE_BYTES || buffer.includes(0))
      throw new BadRequestException("文件过大或不是文本，无法读取。");
    const source = buffer.toString("utf8");
    return {
      path: entry.path,
      size: entry.size,
      language: this.languageFor(entry.path),
      snippet: source.slice(0, 12000),
      truncated: source.length > 12000,
    };
  }

  private async readBlob(
    owner: string,
    repo: string,
    entry: GitHubTreeEntry,
  ): Promise<AnalyzedFile | null> {
    try {
      const content = await this.request<GitHubContent>(
        `/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
        undefined,
        400000,
      );
      const text =
        content.content && content.encoding === "base64"
          ? Buffer.from(content.content, "base64").toString("utf8")
          : "";
      if (
        Buffer.byteLength(text) > MAX_REPOSITORY_FILE_BYTES ||
        text.includes("\0")
      )
        return null;
      return {
        path: entry.path,
        size: entry.size ?? Buffer.byteLength(text),
        language: this.languageFor(entry.path),
        snippet: text.slice(0, 12000),
        truncated: text.length > 12000,
      };
    } catch {
      return null;
    }
  }

  private selectRelevantFiles(entries: GitHubTreeEntry[]) {
    const ignored =
      /(^|\/)(node_modules|\.next|dist|build|coverage|public|assets)(\/|$)/i;
    const sourceFile = /\.(tsx?|jsx?)$/i;
    const candidates = entries.filter(
      (entry) =>
        entry.type === "blob" &&
        !ignored.test(entry.path) &&
        (sourceFile.test(entry.path) ||
          /^(readme\.md|package\.json)$/i.test(entry.path)),
    );

    return candidates
      .map((entry) => ({ entry, score: this.fileScore(entry.path) }))
      .sort(
        (a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path),
      )
      .slice(0, 14)
      .map(({ entry }) => entry);
  }

  private fileScore(filePath: string) {
    const normalized = filePath.toLowerCase();
    if (normalized === "package.json") return 100;
    if (normalized === "readme.md") return 95;
    if (
      /next\.config|tsconfig|src\/lib|src\/hooks|app\/|pages\//.test(normalized)
    )
      return 80;
    if (/components?\/|hooks?\//.test(normalized)) return 70;
    return 40;
  }

  private detectStack(repository: GitHubRepository, files: AnalyzedFile[]) {
    const packageFile = files.find(
      (file) => file.path.toLowerCase() === "package.json",
    );
    const stack: string[] = [];
    try {
      const packageJson = packageFile ? JSON.parse(packageFile.snippet) : {};
      const dependencies = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      if (dependencies.next) stack.push("Next.js");
      if (dependencies.react) stack.push("React");
      if (dependencies.typescript) stack.push("TypeScript");
      if (dependencies.tailwindcss) stack.push("Tailwind CSS");
      if (
        dependencies.zustand ||
        dependencies.redux ||
        dependencies["@reduxjs/toolkit"]
      )
        stack.push("状态管理");
    } catch {
      // The repository can still be analyzed when package.json is invalid or absent.
    }

    if (stack.length === 0 && repository.language)
      stack.push(repository.language);
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

  private async request<T>(
    path: string,
    signal?: AbortSignal,
    maxBytes = 8 * 1024 * 1024,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoCoach/0.1",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (process.env.GITHUB_TOKEN)
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000);
    const init: RequestInit & { dispatcher?: Dispatcher } = {
      headers,
      signal: requestSignal,
      redirect: "error",
    };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, init);
    } catch {
      throw new BadGatewayException(
        "无法连接 GitHub API，请检查网络或 HTTPS_PROXY 配置。",
      );
    }

    if (!response.ok) {
      if (response.status === 401)
        throw new BadGatewayException(
          "GitHub Token 已失效或无效，请更新 GITHUB_TOKEN；公开仓库也可移除 Token 后使用匿名只读访问。",
        );
      if (
        response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0"
      ) {
        throw new BadGatewayException(
          "GitHub API 请求次数已用尽，请配置只读 GITHUB_TOKEN 后重试。",
        );
      }
      if (response.status === 404)
        throw new BadRequestException(
          "找不到这个公开 GitHub 仓库，请确认地址和仓库可见性。",
        );
      throw new BadGatewayException(
        `GitHub API 返回了 ${response.status}，请稍后重试。`,
      );
    }

    try {
      if (Number(response.headers.get("content-length")) > maxBytes)
        throw new Error("Response too large");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing body");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new Error("Response too large");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
    } catch {
      throw new BadGatewayException(
        "GitHub 响应超时、过大或内容无效，请稍后重试。",
      );
    }
  }
}
