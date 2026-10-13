export const MAX_REPOSITORY_FILE_BYTES = 256 * 1024;
export const MAX_MANIFEST_FILES = 3000;

export type RepositoryFile = { path: string; sha: string; size: number };

export function isRepositoryPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 500 &&
    !/[\\\x00-\x1f\x7f:?#%]/.test(value) &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

export function isReadableRepositoryFile(path: string) {
  const ignored =
    /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|public|assets|vendor)(\/|$)/i;
  const sensitive =
    /(^|\/)(\.env(?:\..*)?|.*\.(pem|key)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
  return (
    isRepositoryPath(path) &&
    !ignored.test(path) &&
    !sensitive.test(path) &&
    !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.min\.[jt]s$/i.test(
      path,
    ) &&
    /\.(tsx?|jsx?|mjs|cjs|json|md|css|scss|ya?ml)$/i.test(path)
  );
}

export function isRepositoryFile(value: unknown): value is RepositoryFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<RepositoryFile>;
  return (
    typeof file.path === "string" &&
    isReadableRepositoryFile(file.path) &&
    typeof file.sha === "string" &&
    /^[a-f0-9]{40}$/i.test(file.sha) &&
    typeof file.size === "number" &&
    Number.isInteger(file.size) &&
    file.size >= 0 &&
    file.size <= MAX_REPOSITORY_FILE_BYTES
  );
}
