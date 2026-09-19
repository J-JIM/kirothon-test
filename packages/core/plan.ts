// 회차 날짜 배정·계획 정제·진행도 정제·이월.
// LLM이 날짜 없이 회차 수·목표·할 일만 만들고, 코드가 날짜 배정.
import type { Slot, Plan, PlanRound, Progress, MMDD, ISO } from "./types.ts";

export function assignRounds(
  slots: Slot[],
  n: number,
  시작슬롯?: Slot
): { 배정: Slot[]; 부족: number } {
  throw new Error("TODO A5");
}

export function sanitizePlan(
  raw: unknown,
  ctx: { 과제: string; 마감: MMDD; 최대회차: number }
): Plan {
  throw new Error("TODO A5");
}

export function withDates(plan: Plan, 배정: Slot[]): Plan {
  throw new Error("TODO A5");
}

export function sanitizeProgress(
  raw: unknown,
  ctx: { 회차: number; 할일: string[]; 원문: string }
): Progress {
  throw new Error("TODO A5");
}

export function carryOver(
  plan: Plan,
  회차: number,
  progress: Progress
): string[] {
  throw new Error("TODO A5");
}

export interface DeadlineStatus {
  마감일: MMDD;
  남은일: number;
  지남: boolean;
}

export function deadlineStatus(
  마감: MMDD,
  기준시각: ISO,
  지금: ISO
): DeadlineStatus {
  throw new Error("TODO A6");
}

export function planSummaryLines(
  plan: Plan | null,
  rounds: { 회차: number; 확정슬롯?: Slot; minutes?: { 중점: string } }[]
): string[] {
  throw new Error("TODO A6");
}
