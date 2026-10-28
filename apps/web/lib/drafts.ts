export const ANSWER_LIMIT = 5000;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 20;
type Draft = {
  projectId: string;
  interviewId: string;
  questionId: string;
  answer: string;
  savedAt: number;
};
export type DraftIdentity = Pick<
  Draft,
  "projectId" | "interviewId" | "questionId"
>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const key = (userId: string) => `repocoach-drafts-v1:${userId}`;
const matches = (a: DraftIdentity, b: DraftIdentity) =>
  a.projectId === b.projectId &&
  a.interviewId === b.interviewId &&
  a.questionId === b.questionId;
function entries(storage: Storage, userId: string, now: number): Draft[] {
  const raw: unknown = JSON.parse(storage.getItem(key(userId)) ?? "[]");
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Draft =>
        !!item &&
        typeof item.projectId === "string" &&
        typeof item.interviewId === "string" &&
        typeof item.questionId === "string" &&
        typeof item.answer === "string" &&
        item.answer.length <= ANSWER_LIMIT &&
        Number.isFinite(item.savedAt) &&
        item.savedAt <= now &&
        now - item.savedAt < DRAFT_TTL_MS,
    )
    .slice(0, MAX_DRAFTS);
}
export function readDraft(
  storage: Storage,
  userId: string,
  identity: DraftIdentity,
  now = Date.now(),
) {
  try {
    return {
      answer:
        entries(storage, userId, now).find((item) => matches(item, identity))
          ?.answer ?? "",
      available: true,
    };
  } catch {
    return { answer: "", available: false };
  }
}
export function writeDraft(
  storage: Storage,
  userId: string,
  identity: DraftIdentity,
  answer: string,
  now = Date.now(),
) {
  try {
    let drafts: Draft[];
    try {
      drafts = entries(storage, userId, now);
    } catch {
      drafts = [];
    }
    const other = drafts.filter((item) => !matches(item, identity));
    const next = answer
      ? [
          { ...identity, answer: answer.slice(0, ANSWER_LIMIT), savedAt: now },
          ...other,
        ].slice(0, MAX_DRAFTS)
      : other;
    if (next.length) storage.setItem(key(userId), JSON.stringify(next));
    else storage.removeItem(key(userId));
    return true;
  } catch {
    return false;
  }
}
export function clearUserDrafts(storage: Storage, userId: string) {
  try {
    storage.removeItem(key(userId));
  } catch {
    /* logout must still work if browser storage is unavailable */
  }
}
