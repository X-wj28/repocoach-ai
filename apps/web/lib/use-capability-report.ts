"use client";

import { useCallback, useEffect, useState } from "react";
import { getProjectReport, type CapabilityReport } from "./api";

type State = {
  scope: string;
  report: CapabilityReport | null;
  loading: boolean;
  error: string | null;
};

export function useCapabilityReport(
  projectId: string,
  userId: string | undefined,
  enabled: boolean,
) {
  const scope = JSON.stringify([userId, projectId]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({
    scope: "",
    report: null,
    loading: false,
    error: null,
  });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!enabled || !userId) return;
    setState((old) => ({
      scope,
      report: old.scope === scope ? old.report : null,
      loading: true,
      error: null,
    }));
    void getProjectReport(projectId)
      .then((report) => {
        if (report.projectId !== projectId)
          throw new Error("报告与当前项目不一致，请重新加载。");
        if (!cancelled)
          setState({ scope, report, loading: false, error: null });
      })
      .catch((reason) => {
        if (!cancelled)
          setState((old) => ({
            scope,
            report: old.scope === scope ? old.report : null,
            loading: false,
            error:
              reason instanceof Error
                ? reason.message
                : "暂时无法读取能力报告。",
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [scope, projectId, userId, enabled, revision]);
  const visible = enabled && !!userId && state.scope === scope;
  return {
    report: visible ? state.report : null,
    loading: enabled && !!userId && (!visible || state.loading),
    error: visible ? state.error : null,
    refresh,
  };
}
