"use client";

import { useEffect, useRef, useState } from "react";
import {
  getActiveInterview,
  retryEvaluationRun,
  startInterview,
  submitInterviewAnswer,
  watchEvaluationRun,
  type Evaluation,
  type EvaluationRun,
  type PracticeFocus,
  type Project,
  type Question,
  type RunEvent,
} from "./api";
import { ANSWER_LIMIT, readDraft, writeDraft } from "./drafts";

type State = {
  scope: string;
  interviewId: string | null;
  question: Question | null;
  questionNumber: number;
  totalQuestions: number;
  answer: string;
  evaluation: Evaluation | null;
  pendingRun: EvaluationRun | null;
  practiceFocus: PracticeFocus[];
  runEvents: RunEvent[];
  connection: string;
  starting: boolean;
  submitting: boolean;
  recovering: boolean;
  recoveryError: string | null;
  draftStatus: "saved" | "unavailable" | null;
};
const empty = (scope: string): State => ({
  scope,
  interviewId: null,
  question: null,
  questionNumber: 1,
  totalQuestions: 4,
  answer: "",
  evaluation: null,
  pendingRun: null,
  practiceFocus: [],
  runEvents: [],
  connection: "",
  starting: false,
  submitting: false,
  recovering: true,
  recoveryError: null,
  draftStatus: null,
});

export function useTrainingSession({
  project,
  jobDescription,
  userId,
  enabled,
  fallbackQuestion,
  localEvaluation,
  onNotice,
  onCompleted,
  onProjectId,
}: {
  project: Project;
  jobDescription: string;
  userId: string;
  enabled: boolean;
  fallbackQuestion: Question;
  localEvaluation: (id: string, answer: string, number: number) => Evaluation;
  onNotice: (message: string | null) => void;
  onCompleted: () => void;
  onProjectId: (id: string) => void;
}) {
  const scope = JSON.stringify([userId, project.id]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [state, setState] = useState<State>(() => empty(scope));
  const [revision, setRevision] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const isCurrent = (token: number) =>
    mounted.current &&
    currentScope.current === scope &&
    token === serial.current;
  const callbacks = useRef({ onNotice, onCompleted, onProjectId });
  callbacks.current = { onNotice, onCompleted, onProjectId };
  const draftIdentity = (id: string, question: Question) => ({
    projectId: project.id,
    interviewId: id,
    questionId: question.id,
  });
  const loadDraft = (id: string, question: Question) => {
    try {
      return readDraft(
        window.localStorage,
        userId,
        draftIdentity(id, question),
      );
    } catch {
      return { answer: "", available: false };
    }
  };
  const saveDraft = (id: string, question: Question, answer: string) => {
    try {
      return writeDraft(
        window.localStorage,
        userId,
        draftIdentity(id, question),
        answer,
      );
    } catch {
      return false;
    }
  };
  useEffect(() => {
    if (!enabled) return;
    const token = ++serial.current;
    let cancelled = false;
    setState(empty(scope));
    if (project.id === "demo-project") {
      setState({ ...empty(scope), recovering: false });
      return;
    }
    void getActiveInterview(project.id)
      .then((active) => {
        if (cancelled || !isCurrent(token)) return;
        if (!active) {
          setState({ ...empty(scope), recovering: false });
          return;
        }
        if (active.projectId !== project.id)
          throw new Error("恢复的训练与当前项目不一致，请重试。");
        const draft = loadDraft(active.interviewId, active.question);
        const run = active.pendingRun ?? null;
        setState({
          ...empty(scope),
          recovering: false,
          interviewId: active.interviewId,
          question: active.question,
          questionNumber: active.questionNumber,
          totalQuestions: active.totalQuestions,
          practiceFocus: active.practiceFocus ?? [],
          answer: run?.answer ?? draft.answer,
          pendingRun: run,
          evaluation: run?.status === "completed" ? run.evaluation : null,
          draftStatus: run
            ? null
            : !draft.available
              ? "unavailable"
              : draft.answer
                ? "saved"
                : null,
        });
      })
      .catch((error) => {
        if (!cancelled && isCurrent(token))
          setState({
            ...empty(scope),
            recovering: false,
            recoveryError:
              error instanceof Error ? error.message : "无法恢复训练进度。",
          });
      });
    return () => {
      cancelled = true;
    };
    // Loading drafts is deliberately tied to the restored question, never to keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, project.id, enabled, revision]);

  const visible = enabled && state.scope === scope;
  const shown = visible ? state : empty(scope);
  const runId = shown.pendingRun?.id;
  const runActive =
    shown.pendingRun?.status === "running" ||
    shown.pendingRun?.status === "pending";
  useEffect(() => {
    if (!runId || runId === "legacy" || !runActive) return;
    const token = serial.current;
    return watchEvaluationRun(runId, {
      onState(run) {
        if (!isCurrent(token) || stateRef.current.pendingRun?.id !== runId)
          return;
        setState((old) => ({
          ...old,
          pendingRun: run,
          evaluation:
            run.status === "completed" ? run.evaluation : old.evaluation,
        }));
        if (run.status === "completed") callbacks.current.onCompleted();
      },
      onEvent(event) {
        if (isCurrent(token))
          setState((old) => ({
            ...old,
            runEvents: old.runEvents.some(
              (item) => item.sequence === event.sequence,
            )
              ? old.runEvents
              : [...old.runEvents, event],
          }));
      },
      onConnection(connection) {
        if (isCurrent(token)) setState((old) => ({ ...old, connection }));
      },
    });
    // The persisted run identity and scope own this subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, runId, runActive]);

  const operation = useRef<number | null>(null);
  const begin = () => {
    if (
      !visible ||
      shown.recovering ||
      shown.recoveryError ||
      shown.starting ||
      shown.submitting ||
      operation.current === serial.current
    )
      return null;
    const token = ++serial.current;
    operation.current = token;
    return token;
  };
  const start = async () => {
    if (runActive) return;
    const token = begin();
    if (token === null) return;
    setState((old) => ({ ...old, starting: true }));
    callbacks.current.onNotice(null);
    try {
      if (project.id === "demo-project") {
        setState({
          ...empty(scope),
          recovering: false,
          interviewId: `local-${Date.now()}`,
          question: fallbackQuestion,
          totalQuestions: 2,
        });
        callbacks.current.onNotice(
          "当前为示例项目的本地演示，回答不会保存到服务器。导入公开仓库可开始真实训练。",
        );
        return;
      }
      const result = await startInterview(
        project.id,
        jobDescription,
        project.url,
      );
      if (!isCurrent(token)) return;
      setState({
        ...empty(scope),
        recovering: false,
        interviewId: result.interviewId,
        question: result.question,
        questionNumber: result.questionNumber,
        totalQuestions: result.totalQuestions,
        practiceFocus: result.practiceFocus ?? [],
      });
      if (result.projectId !== project.id)
        callbacks.current.onProjectId(result.projectId);
      callbacks.current.onCompleted();
    } catch (error) {
      if (isCurrent(token))
        callbacks.current.onNotice(
          `${error instanceof Error ? error.message : "训练启动失败。"} 原题和草稿仍保留。`,
        );
    } finally {
      if (isCurrent(token)) setState((old) => ({ ...old, starting: false }));
      if (operation.current === token) operation.current = null;
    }
  };
  const changeAnswer = (answer: string) => {
    if (
      !shown.interviewId ||
      !shown.question ||
      shown.submitting ||
      shown.pendingRun ||
      shown.evaluation
    )
      return;
    const persisted = saveDraft(shown.interviewId, shown.question, answer);
    setState((old) => ({
      ...old,
      answer,
      draftStatus: persisted ? (answer ? "saved" : null) : "unavailable",
    }));
  };
  const submit = async () => {
    if (
      !shown.question ||
      !shown.interviewId ||
      !shown.answer.trim() ||
      shown.pendingRun ||
      shown.evaluation
    )
      return;
    if (shown.answer.length > ANSWER_LIMIT) {
      callbacks.current.onNotice(`回答最多 ${ANSWER_LIMIT} 字，请精简后提交。`);
      return;
    }
    if (shown.interviewId.startsWith("local-")) {
      setState((old) => ({
        ...old,
        evaluation: localEvaluation(
          shown.interviewId!,
          shown.answer.trim(),
          shown.questionNumber,
        ),
      }));
      return;
    }
    const token = begin();
    if (token === null) return;
    setState((old) => ({ ...old, submitting: true }));
    callbacks.current.onNotice(null);
    try {
      const run = await submitInterviewAnswer(
        shown.interviewId,
        shown.answer.trim(),
        shown.question.id,
      );
      if (!isCurrent(token)) return;
      saveDraft(shown.interviewId, shown.question, "");
      setState((old) => ({
        ...old,
        answer: run.answer,
        pendingRun: run,
        evaluation: run.status === "completed" ? run.evaluation : null,
        draftStatus: null,
      }));
      if (run.status === "completed") callbacks.current.onCompleted();
    } catch (error) {
      if (isCurrent(token))
        callbacks.current.onNotice(
          `${error instanceof Error ? error.message : "提交失败。"} 回答已保留，可以重试同一回答。`,
        );
    } finally {
      if (isCurrent(token)) setState((old) => ({ ...old, submitting: false }));
      if (operation.current === token) operation.current = null;
    }
  };
  const retry = async () => {
    if (
      !shown.pendingRun ||
      shown.pendingRun.status !== "failed" ||
      !shown.pendingRun.retryable
    )
      return;
    const token = begin();
    if (token === null) return;
    setState((old) => ({ ...old, submitting: true }));
    callbacks.current.onNotice(null);
    try {
      const run = await retryEvaluationRun(shown.pendingRun.id);
      if (!isCurrent(token)) return;
      setState((old) => ({
        ...old,
        pendingRun: run,
        evaluation:
          run.status === "completed" ? run.evaluation : old.evaluation,
      }));
      if (run.status === "completed") callbacks.current.onCompleted();
    } catch (error) {
      if (isCurrent(token))
        callbacks.current.onNotice(
          error instanceof Error
            ? error.message
            : "重试失败，回答和代码依据仍已保存。",
        );
    } finally {
      if (isCurrent(token)) setState((old) => ({ ...old, submitting: false }));
      if (operation.current === token) operation.current = null;
    }
  };
  const next = () => {
    const evaluation = shown.evaluation;
    if (!evaluation?.nextQuestion || !shown.interviewId) return;
    const question = evaluation.nextQuestion;
    const draft = loadDraft(shown.interviewId, question);
    setState((old) => ({
      ...old,
      question,
      questionNumber: evaluation.questionNumber ?? old.questionNumber + 1,
      answer: draft.answer,
      evaluation: null,
      pendingRun: null,
      runEvents: [],
      connection: "",
      draftStatus: !draft.available
        ? "unavailable"
        : draft.answer
          ? "saved"
          : null,
    }));
  };
  return {
    ...shown,
    submitted: !!shown.evaluation,
    start,
    submit,
    retry,
    next,
    changeAnswer,
    restore: () => setRevision((value) => value + 1),
    canStart:
      visible &&
      !shown.recovering &&
      !shown.recoveryError &&
      !shown.starting &&
      !shown.submitting &&
      !runActive,
    unfinished: !!shown.interviewId && !shown.evaluation?.completed,
  };
}
