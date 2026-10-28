import type { Project } from "./api";

export const workspaceStorageKey = (userId: string) =>
  `repocoach-workspace-v1:${userId}`;
export function readWorkspace(
  storage: Pick<Storage, "getItem">,
  userId: string,
): { project: Project; jobDescription: string } | null {
  try {
    const value = JSON.parse(
      storage.getItem(workspaceStorageKey(userId)) ?? "null",
    );
    const project = value?.project;
    if (
      !project ||
      typeof project.id !== "string" ||
      typeof project.name !== "string" ||
      typeof project.url !== "string" ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(project.url) ||
      project.visibility !== "public" ||
      !Array.isArray(project.stack) ||
      !project.stack.every((item: unknown) => typeof item === "string") ||
      !Number.isFinite(project.analyzedFiles) ||
      !["synced", "analyzing"].includes(project.status)
    )
      return null;
    const restored: Project = {
      id: project.id,
      name: project.name,
      url: project.url,
      visibility: "public",
      stack: project.stack,
      analyzedFiles: project.analyzedFiles,
      status: project.status,
    };
    for (const field of [
      "jobDescription",
      "description",
      "defaultBranch",
      "owner",
      "readmePreview",
      "commitSha",
    ] as const) {
      if (typeof project[field] === "string") restored[field] = project[field];
    }
    if (typeof project.treeTruncated === "boolean")
      restored.treeTruncated = project.treeTruncated;
    if (Number.isFinite(project.indexedFiles))
      restored.indexedFiles = project.indexedFiles;
    if (Array.isArray(project.keyFiles))
      restored.keyFiles = project.keyFiles.filter(
        (item: { path?: unknown; size?: unknown; language?: unknown } | null) =>
          item &&
          typeof item.path === "string" &&
          typeof item.size === "number" &&
          typeof item.language === "string",
      );
    return {
      project: restored,
      jobDescription:
        typeof value.jobDescription === "string" ? value.jobDescription : "",
    };
  } catch {
    return null;
  }
}
export function writeWorkspace(
  storage: Pick<Storage, "setItem">,
  userId: string,
  project: Project,
  jobDescription: string,
) {
  try {
    storage.setItem(
      workspaceStorageKey(userId),
      JSON.stringify({ project, jobDescription }),
    );
    return true;
  } catch {
    return false;
  }
}
