import type {
  GitHubService,
  ProjectContext,
  AnalyzedFile,
} from "../github/github.service";
import {
  isRepositoryPath,
  isReadableRepositoryFile,
} from "../github/repository-policy";
import type { LlmTool, LlmToolCall } from "../llm/deepseek.service";
import type { EvidenceTrace } from "./interview.types";
import type { EvidenceExcerpt } from "./rubric";

const pathParameter = {
  type: "string",
  description:
    "An exact repository-relative path returned by search_code, using forward slashes.",
};
export const evidenceTools: LlmTool[] = [
  {
    type: "function",
    function: {
      name: "search_code",
      description:
        "Search readable indexed file paths and already loaded code using a literal case-insensitive query. Unloaded content is not searched. Use a returned path with read_file to retrieve more evidence.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A literal identifier or path fragment, maximum 120 characters.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read at most 120 lines from a public repository file in the saved commit manifest. startLine/endLine are inclusive; endLine must be no greater than startLine + 119. Omit both to read the first 80 lines. No URLs, local files or writes are allowed.",
      parameters: {
        type: "object",
        properties: {
          path: pathParameter,
          startLine: {
            type: "integer",
            minimum: 1,
            maximum: 10000,
            description: "First line, default 1.",
          },
          endLine: {
            type: "integer",
            minimum: 1,
            maximum: 10000,
            description:
              "Inclusive final line; at most startLine + 119. Default startLine + 79.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_outline",
      description:
        "Return a lexical outline of exports/functions/classes and their line numbers from a readable file prefix. This is not a complete AST or dependency graph.",
      parameters: {
        type: "object",
        properties: { path: pathParameter },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

type Observation = { status: string; [key: string]: unknown };
export class EvidenceToolSession {
  readonly project: ProjectContext;
  readonly filesRead = new Set<string>();
  readonly records: EvidenceTrace["tools"] = [];
  readonly excerpts: EvidenceExcerpt[] = [];
  private remoteReads = 0;
  private outputCharacters = 0;

  constructor(
    project: ProjectContext,
    private readonly github: Pick<GitHubService, "readSnapshotFile">,
    private readonly signal: AbortSignal,
  ) {
    this.project = structuredClone(project);
  }

  async execute(call: LlmToolCall) {
    const started = Date.now();
    let args: Record<string, unknown> = {};
    let result: Observation;
    let argumentError = "Arguments must match the tool schema and limits.";
    try {
      if (this.signal.aborted) result = { status: "time-limit" };
      else if (
        !evidenceTools.some((tool) => tool.function.name === call.function.name)
      )
        result = { status: "denied", reason: "Tool is not registered." };
      else {
        const parsed = JSON.parse(call.function.arguments);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("invalid arguments");
        args = parsed;
        if (call.function.name === "search_code") {
          if (
            Object.keys(args).some((key) => key !== "query") ||
            typeof args.query !== "string" ||
            !args.query.trim() ||
            args.query.length > 120
          )
            throw new Error("invalid query");
          result = this.search(args.query);
        } else {
          const allowed =
            call.function.name === "read_file"
              ? ["path", "startLine", "endLine"]
              : ["path"];
          if (
            Object.keys(args).some((key) => !allowed.includes(key)) ||
            !isRepositoryPath(args.path) ||
            !isReadableRepositoryFile(args.path)
          ) {
            result = {
              status: "denied",
              reason: "Invalid arguments or unreadable repository path.",
            };
          } else {
            const start = args.startLine ?? 1;
            const end = args.endLine ?? Math.min(Number(start) + 79, 10000);
            if (
              !Number.isInteger(start) ||
              !Number.isInteger(end) ||
              Number(start) < 1 ||
              Number(end) < Number(start) ||
              Number(end) > 10000 ||
              Number(end) - Number(start) >= 120
            ) {
              argumentError =
                "startLine and endLine must be integers from 1 to 10000, startLine <= endLine <= startLine + 119. Omit both for the first 80 lines.";
              throw new Error("invalid line range");
            }
            const file = await this.read(args.path);
            if ("status" in file) result = file;
            else if (call.function.name === "get_file_outline") {
              const symbols = file.snippet
                .split(/\r?\n/)
                .flatMap((line, index) =>
                  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|interface|type|const)\s+([\w$]+)/.test(
                    line,
                  )
                    ? [{ line: index + 1, declaration: line.slice(0, 200) }]
                    : [],
                )
                .slice(0, 30);
              result = {
                status: "ok",
                path: file.path,
                symbols,
                sourceTruncated: Boolean(file.truncated),
                outline: "lexical",
              };
            } else {
              const lines = file.snippet.split(/\r?\n/);
              if (Number(start) > lines.length)
                result = {
                  status: file.truncated
                    ? "outside-loaded-prefix"
                    : "empty-range",
                  path: file.path,
                  availableLines: lines.length,
                };
              else {
                const snippet = lines
                  .slice(Number(start) - 1, Number(end))
                  .join("\n")
                  .slice(0, 3500);
                result = {
                  status: "ok",
                  path: file.path,
                  startLine: start,
                  endLine: Number(start) + snippet.split("\n").length - 1,
                  snippet,
                  sourceTruncated: Boolean(file.truncated),
                  outputTruncated:
                    snippet.length <
                    lines.slice(Number(start) - 1, Number(end)).join("\n")
                      .length,
                };
              }
            }
          }
        }
      }
    } catch {
      result = {
        status: "invalid-arguments",
        reason: argumentError,
      };
    }
    if (this.signal.aborted) result = { status: "time-limit" };
    let content = JSON.stringify(result);
    if (content.length > 5000) {
      let preview = content.slice(0, 4200);
      do {
        content = JSON.stringify({
          status: result.status,
          outputTruncated: true,
          preview,
        });
        if (content.length <= 5000) break;
        preview = preview.slice(0, Math.floor(preview.length / 2));
      } while (preview.length);
    }
    // Reserve space for budget-denial observations within the six-execution run.
    if (this.outputCharacters + content.length > 19800) {
      result = { status: "output-budget" };
      content = JSON.stringify(result);
    }
    this.outputCharacters += content.length;
    if (
      result.status === "ok" &&
      typeof result.path === "string" &&
      call.function.name !== "search_code"
    )
      this.filesRead.add(result.path);
    if (
      result.status === "ok" &&
      typeof result.path === "string" &&
      typeof result.snippet === "string" &&
      typeof result.startLine === "number" &&
      typeof result.endLine === "number"
    )
      this.excerpts.push({
        path: result.path,
        startLine: result.startLine,
        endLine: result.endLine,
        snippet: result.snippet,
      });
    this.records.push({
      name: call.function.name,
      status: result.status,
      durationMs: Date.now() - started,
      outputCharacters: content.length,
      ...(typeof args.path === "string"
        ? { path: args.path.slice(0, 500) }
        : {}),
      ...(typeof args.query === "string"
        ? { query: args.query.slice(0, 120) }
        : {}),
    });
    return content;
  }

  private search(query: string): Observation {
    const needle = query.trim().toLowerCase();
    const paths = [
      ...new Set([
        ...(this.project.manifest?.map((file) => file.path) ?? []),
        ...this.project.files.map((file) => file.path),
      ]),
    ].filter(isReadableRepositoryFile);
    const pathMatches = paths
      .filter((path) => path.toLowerCase().includes(needle))
      .slice(0, 20);
    const matches = this.project.files
      .filter((file) => isReadableRepositoryFile(file.path))
      .flatMap((file) =>
        file.snippet
          .split(/\r?\n/)
          .flatMap((line, index) =>
            line.toLowerCase().includes(needle)
              ? [
                  {
                    path: file.path,
                    line: index + 1,
                    snippet: line.slice(0, 180),
                  },
                ]
              : [],
          )
          .slice(0, 5),
      )
      .slice(0, 15);
    return {
      status:
        pathMatches.length || matches.length
          ? "ok"
          : "no-match-in-loaded-content",
      pathMatches,
      matches,
      scope: "indexed-paths-and-loaded-prefixes",
      loadedFiles: this.project.files.length,
      indexedFiles: this.project.manifest?.length ?? 0,
      indexTruncated: Boolean(this.project.treeTruncated),
      canReadMore: Boolean(this.project.commitSha && this.project.manifest),
    };
  }

  private async read(path: string): Promise<AnalyzedFile | Observation> {
    const existing = this.project.files.find((file) => file.path === path);
    if (existing) return existing;
    if (!this.project.commitSha || !this.project.manifest)
      return {
        status: "legacy-snapshot",
        reason:
          "Reanalyze this repository to enable reads beyond the saved files.",
      };
    if (!this.project.manifest.some((file) => file.path === path))
      return {
        status: "not-indexed",
        indexTruncated: Boolean(this.project.treeTruncated),
      };
    if (this.remoteReads >= 2) return { status: "read-budget" };
    this.remoteReads += 1;
    try {
      const file = await this.github.readSnapshotFile(
        this.project,
        path,
        this.signal,
      );
      this.project.files.push(file);
      return file;
    } catch {
      return {
        status: this.signal.aborted ? "time-limit" : "read-failed",
        reason:
          "Pinned GitHub blob could not be retrieved; no evidence was invented.",
      };
    }
  }
}
