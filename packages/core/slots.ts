// 교집합 계산·달력화·순위·근거문장 생성.
// 4명 모두 비는 구간을 찾고, 주간 반복을 날짜로 변환.
import type { Party, Slot, Weekday, MMDD, SearchWindow } from "./types.ts";

export type Overrides = Record<string, [number, number]>; // 제약id → [시작분, 끝분]

export function commonFree(
  parties: Party[],
  day: Weekday,
  win: SearchWindow,
  overrides?: Overrides
): [number, number][] {
  throw new Error("TODO A1");
}

export function intersect(
  parties: Party[],
  win: SearchWindow,
  overrides?: Overrides
): Slot[] {
  throw new Error("TODO A1");
}

export interface CalendarizeOptions {
  기준시각: string;
  마감?: MMDD | null;
  days?: number;
  공휴일?: MMDD[];
}

export function calendarize(weekly: Slot[], opt: CalendarizeOptions): Slot[] {
  throw new Error("TODO A1");
}

export function rank(slots: Slot[], 희망시간대?: string | null): Slot[] {
  throw new Error("TODO A1");
}

export function explain(
  slot: Slot,
  parties: Party[],
  total: number,
  마감?: MMDD | null
): string[] {
  throw new Error("TODO A1");
}
