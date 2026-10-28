"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearTrainingMemory,
  getTrainingMemory,
  type TrainingMemory,
} from "./api";

type State = {
  projectId: string;
  memory: TrainingMemory | null;
  loading: boolean;
  error: string | null;
};

export function useTrainingMemory(projectId: string, revision = 0) {
  const [state, setState] = useState<State>({
    projectId,
    memory: null,
    loading: projectId !== "demo-project",
    error: null,
  });
  const [reload, setReload] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const generation = useRef(0);
  const clearingRef = useRef(false);
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    if (clearingRef.current) return;
    const token = ++generation.current;
    let cancelled = false;
    if (projectId === "demo-project") {
      setState({ projectId, memory: null, loading: false, error: null });
      return;
    }
    setState((old) => ({
      projectId,
      memory: old.projectId === projectId ? old.memory : null,
      loading: true,
      error: null,
    }));
    void getTrainingMemory(projectId)
      .then((memory) => {
        if (
          cancelled ||
          token !== generation.current ||
          currentProject.current !== projectId
        )
          return;
        if (memory.projectId !== projectId)
          throw new Error("训练计划与当前项目不一致，请重新加载。");
        setState({ projectId, memory, loading: false, error: null });
      })
      .catch((error) => {
        if (
          !cancelled &&
          token === generation.current &&
          currentProject.current === projectId
        )
          setState((old) => ({
            ...old,
            loading: false,
            error:
              error instanceof Error ? error.message : "暂时无法读取训练计划。",
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, revision, reload]);

  const clear = async (onCleared?: () => void) => {
    if (clearingRef.current || projectId === "demo-project") return null;
    clearingRef.current = true;
    const token = ++generation.current;
    setClearing(true);
    setClearError(null);
    // Invalidate a GET already in flight before sending the account-wide clear.
    setState((old) => ({ ...old, loading: false }));
    try {
      const result = await clearTrainingMemory();
      // The account owner can refresh another page even if this panel unmounted.
      onCleared?.();
      if (
        !mounted.current ||
        token !== generation.current ||
        currentProject.current !== projectId
      )
        return null;
      setState((old) => ({
        projectId,
        memory:
          old.projectId === projectId && old.memory
            ? { ...old.memory, focus: [], observations: [], practiced: 0 }
            : null,
        loading: false,
        error: null,
      }));
      return result;
    } catch (error) {
      if (
        mounted.current &&
        token === generation.current &&
        currentProject.current === projectId
      )
        setClearError(
          error instanceof Error ? error.message : "清除未完成，请重试。",
        );
      return null;
    } finally {
      clearingRef.current = false;
      if (mounted.current) {
        setClearing(false);
        refresh();
      }
    }
  };
  const visible = state.projectId === projectId;
  return {
    memory: visible ? state.memory : null,
    loading: !visible || state.loading,
    error: visible ? state.error : null,
    refresh,
    clear,
    clearing,
    clearError,
  };
}
