// 화면 상태 한 덩어리 + localStorage 저장. 한 기기에서 4명을 전환하며 입력.

import { useState, useCallback, useEffect } from "react";
import type {
  Party,
  SearchWindow,
  Slot,
  ConcessionAsk,
  Branch,
  Minutes,
  Report,
  MMDD,
  Plan,
  Progress,
} from "../../../packages/core/types.ts";
import type { BranchCheck } from "../../../packages/core/concession.ts";
import { scenario } from "./demo.ts";

export type Step = "team" | "members" | "board" | "plan" | "minutes" | "close";
export type LlmMode = "cache-first" | "live";
export type LlmProvider = "gemini" | "claude";

export interface Attempt {
  at?: string;
  model: string;
  status: number;
  ms: number;
  reason: string;
}

export interface LogEntry {
  id: string;
  at: number;
  prompt: string;
  source: "live" | "cache" | "cache-fallback";
  ok: boolean;
  ms: number;
  model?: string;
  attempts?: Attempt[];
  note?: string;
}

export interface TimelineEntry {
  at: number;
  who: "agent" | "human" | "system";
  text: string;
}

export interface MailItem {
  id: string;
  at: number;
  alias: string;
  toName: string;
  subject: string;
  text: string;
  via: "gmail" | "mock";
  kind: "invite" | "notice" | "report" | "ask";
}

export interface RequestItem {
  id: string;
  branchId: string;
  ask: ConcessionAsk;
  slot: Slot;
  text: string;
  status: "대기" | "가능" | "불가";
  답?: string;
  분?: number;
}

export interface BranchView {
  branch: Branch;
  source: "llm" | "code";
  check: BranchCheck;
}

export interface RoundState {
  회차: number;
  확정슬롯: Slot;
  원문?: string;
  원문출처?: "demo" | "upload";
  minutes?: Minutes;
  next?: Slot | null;
  noticeSent?: boolean;
  progress?: Progress;
}

export interface AppState {
  version: 1;
  step: Step;
  llmMode: LlmMode;
  llmProvider?: LlmProvider;
  기준시각: string;
  team: { 이름: string; 과목: string; 기간: string };
  win: SearchWindow;
  parties: Party[];
  과제: string;
  마감: MMDD | null;
  plan: Plan | null;
  timetableSource: Record<string, "demo" | "upload" | "manual" | undefined>;
  uploadShots?: Record<string, string>;
  confirmed: Record<string, boolean>;
  constraintsFromDemo: boolean;
  branches: BranchView[];
  requests: RequestItem[];
  양보횟수: number;
  rounds: RoundState[];
  reports: Report[] | null;
  reportProblems: string[];
  closed: boolean;
  closedReason?: "manual" | "deadline";
  autoClosedAt?: number;
  inbox: MailItem[];
  timeline: TimelineEntry[];
  log: LogEntry[];
  activeMember: string;
}

const KEY = "matchum:v1";

export function freshState(): AppState {
  return {
    version: 1,
    step: "team",
    llmMode: "cache-first",
    llmProvider: "gemini",
    기준시각: scenario.기준시각,
    team: { ...scenario.팀 },
    win: structuredClone(scenario.탐색),
    parties: scenario.팀원.map((p) => ({
      ...p,
      시간표: [],
      제약: [],
      양보이력: [...p.양보이력],
    })),
    과제: "",
    마감: null,
    plan: null,
    timetableSource: {},
    confirmed: {},
    constraintsFromDemo: false,
    branches: [],
    requests: [],
    양보횟수: 0,
    rounds: [],
    reports: null,
    reportProblems: [],
    closed: false,
    inbox: [],
    timeline: [
      {
        at: Date.now(),
        who: "system",
        text: "데모 팀(가상 인물 4명)으로 시작. 시간표는 비어 있음",
      },
    ],
    log: [],
    activeMember: "p1",
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed as AppState;
    return freshState();
  } catch {
    return freshState();
  }
}

export type Update = (fn: (draft: AppState) => void) => void;

export function useAppState(): [AppState, Update, () => void] {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // 실패 무시
    }
  }, [state]);

  const update = useCallback<Update>((fn) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    setState(freshState());
  }, []);

  return [state, update, reset];
}

export const uid = () => Math.random().toString(36).slice(2, 10);
