// 양보안 검증·Branch 전수열거·양보 적용.
// LLM 제안을 코드가 다시 계산해 검증하고, 실패 시 전부 열거.
import type {
  Party,
  Constraint,
  ConcessionAsk,
  Branch,
  Weekday,
  SearchWindow,
} from "./types.ts";
import type { Overrides } from "./slots.ts";

export function findConstraint(
  parties: Party[],
  id: string
): { party: Party; c: Constraint } | null {
  throw new Error("TODO A2");
}

export function asksToOverrides(
  parties: Party[],
  asks: ConcessionAsk[]
): { overrides: Overrides; problems: string[] } {
  throw new Error("TODO A2");
}

export interface BranchCheck {
  ok: boolean;
  problems: string[];
}

export function validateBranch(
  parties: Party[],
  win: SearchWindow,
  b: {
    양보요청: ConcessionAsk[];
    생성슬롯: { 요일: Weekday; 시작: string; 끝: string };
  }
): BranchCheck {
  throw new Error("TODO A2");
}

export function enumerateBranches(
  parties: Party[],
  win: SearchWindow,
  사건id: string
): Branch[] {
  throw new Error("TODO A2");
}

export function applyAnswer(
  parties: Party[],
  ask: ConcessionAsk,
  분: number
): Party[] {
  throw new Error("TODO A2");
}
