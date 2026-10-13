import { randomUUID } from "node:crypto";
import type { ProjectContext } from "../github/github.service";
import type { Question } from "./interview.types";
import {
  isRepositoryFile,
  MAX_MANIFEST_FILES,
} from "../github/repository-policy";

type QuestionDraft = Omit<Question, "id" | "evidence">;

const signals = {
  react: /useState|useReducer|useContext|zustand|redux/i,
  nextjs: /fetch\s*\(|axios|useSWR|useQuery|use client/i,
  performance: /\.map\s*\(|useMemo|useCallback|memo\s*\(|cache|Promise\.all/i,
  engineering: /catch\s*[({]|throw |error|loading|pending|abort/i,
};

export function withCodeEvidence(
  question: QuestionDraft & { id: string },
  project: ProjectContext,
): Question | undefined {
  const file = project.files.find(
    (item) => item.path === question.contextPath && item.snippet.trim(),
  );
  if (!file) return undefined;
  const lines = file.snippet.split(/\r?\n/);
  const matchedLine = lines.findIndex((line) =>
    signals[question.dimension].test(line),
  );
  const startIndex = Math.max(0, matchedLine - 3);
  const snippet = lines
    .slice(startIndex, startIndex + 16)
    .join("\n")
    .slice(0, 1600);
  return {
    id: question.id,
    prompt: question.prompt,
    contextPath: file.path,
    dimension: question.dimension,
    difficulty: question.difficulty,
    evidence: {
      startLine: startIndex + 1,
      endLine: startIndex + snippet.split("\n").length,
      snippet,
    },
  };
}

export function planInterviewQuestions(project: ProjectContext): Question[] {
  const usable = project.files.filter((file) => file.snippet.trim());
  const source = usable.filter((file) => /\.[jt]sx?$/i.test(file.path));
  const files = source.length ? source : usable;
  if (!files.length) return [];
  const hasReact = project.stack.some((name) => /react|next/i.test(name));
  const hasNext = project.stack.some((name) => /next/i.test(name));
  const pick = (dimension: Question["dimension"]) =>
    files.find((file) => signals[dimension].test(file.snippet)) ?? files[0];
  const dataFile = pick("nextjs");
  const specs: QuestionDraft[] = [
    {
      prompt: signals.nextjs.test(dataFile.snippet)
        ? `请结合 ${dataFile.path} 说明当前数据获取的执行位置和调用链。这个选择解决了什么问题，在加载速度、缓存和错误处理方面还有哪些改进空间？`
        : `请结合 ${dataFile.path} 说明这个模块的核心职责、调用关系和主要技术取舍。如果需求继续增长，你会优先重构哪里？`,
      contextPath: dataFile.path,
      dimension: signals.nextjs.test(dataFile.snippet)
        ? hasNext
          ? "nextjs"
          : hasReact
            ? "react"
            : "engineering"
        : "engineering",
      difficulty: "进阶",
    },
    {
      prompt: `请结合 ${pick("react").path} 解释${hasReact ? "状态的归属、共享范围和更新方式" : "模块的数据流与职责边界"}。你如何判断哪些逻辑应该拆分或复用？`,
      contextPath: pick("react").path,
      dimension: hasReact ? "react" : "engineering",
      difficulty: "基础",
    },
    {
      prompt: `如果需要优化 ${pick("performance").path} 的性能，你会怎样测量和定位瓶颈？请结合已有实现解释优化的收益、代价和验证方法。`,
      contextPath: pick("performance").path,
      dimension: "performance",
      difficulty: "深入",
    },
    {
      prompt: `请结合 ${pick("engineering").path} 说明异常、边界输入和等待状态如何处理。你会增加哪些测试来验证失败后的行为？`,
      contextPath: pick("engineering").path,
      dimension: "engineering",
      difficulty: "进阶",
    },
  ];
  return specs.map((spec) =>
    withCodeEvidence({ ...spec, id: `question-${randomUUID()}` }, project)!,
  );
}

// Current and planned files get priority within the bounded model context.
export function selectEvidenceContext(
  project: ProjectContext,
  current: Question,
  next?: Question,
): ProjectContext {
  const paths = [
    current.contextPath,
    next?.contextPath,
    ...project.files.map((file) => file.path),
  ];
  const orderedPaths = [
    ...new Set(paths.filter((path): path is string => Boolean(path))),
  ];
  return {
    ...project,
    files: orderedPaths
      .map((path) => project.files.find((file) => file.path === path))
      .filter((file): file is ProjectContext["files"][number] =>
        Boolean(file?.snippet.trim()),
      )
      .slice(0, 4)
      .map((file) => ({ ...file, snippet: file.snippet.slice(0, 6000) })),
  };
}

export function restoreProjectContext(
  value: unknown,
): ProjectContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const project = value as Partial<ProjectContext>;
  if (
    typeof project.id !== "string" ||
    typeof project.name !== "string" ||
    typeof project.url !== "string" ||
    typeof project.readmePreview !== "string" ||
    !Array.isArray(project.stack) ||
    !project.stack.every((item) => typeof item === "string") ||
    !Array.isArray(project.files) ||
    !project.files.every(
      (file) =>
        file &&
        typeof file.path === "string" &&
        typeof file.snippet === "string" &&
        typeof file.size === "number" &&
        typeof file.language === "string",
    )
  )
    return undefined;
  // Old snapshots remain usable, but cannot authorize additional remote reads.
  return {
    id: project.id,
    name: project.name,
    url: project.url,
    stack: project.stack,
    readmePreview: project.readmePreview,
    files: project.files,
    ...(typeof project.commitSha === "string" &&
    /^[a-f0-9]{40}$/i.test(project.commitSha)
      ? { commitSha: project.commitSha }
      : {}),
    ...(Array.isArray(project.manifest)
      ? {
          manifest: project.manifest
            .filter(isRepositoryFile)
            .slice(0, MAX_MANIFEST_FILES),
        }
      : {}),
    ...(typeof project.treeTruncated === "boolean"
      ? { treeTruncated: project.treeTruncated }
      : {}),
  };
}
