// 시각·날짜·요일 변환과 KST 계산.
// 모든 Date 연산은 timeZone "Asia/Seoul" 명시. UTC 정수 날짜로 더하기.
import type { Weekday, HHMM, MMDD, ISO, SearchWindow } from "./types.ts";

export const WEEKDAYS: Weekday[] = ["일", "월", "화", "수", "목", "금", "토"];
export const ALLOWED_HOURS = { 시작: "06:00", 끝: "22:00" };

export function toMin(t: HHMM): number {
  throw new Error("TODO A1");
}

export function toHHMM(x: number): HHMM {
  throw new Error("TODO A1");
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export function kstParts(iso: ISO): YMD & { hh: number; mm: number } {
  throw new Error("TODO A1");
}

export function addDays(date: YMD, n: number): YMD {
  throw new Error("TODO A1");
}

export function weekdayOf(date: YMD): Weekday {
  throw new Error("TODO A1");
}

export function toMMDD(date: YMD): MMDD {
  throw new Error("TODO A1");
}

export function compareYMD(a: YMD, b: YMD): number {
  throw new Error("TODO A1");
}

export function mmddAfter(mmdd: MMDD, base: YMD): YMD {
  throw new Error("TODO A1");
}

export function fmtKST(iso: ISO): string {
  throw new Error("TODO A1");
}

export function slotLabel(slot: { 날짜?: MMDD; 시작: HHMM; 끝?: HHMM }): string {
  throw new Error("TODO A1");
}

export function isValidMMDD(s: string | null | undefined): s is MMDD {
  throw new Error("TODO A1");
}

export function clampWindow(win: SearchWindow): SearchWindow {
  throw new Error("TODO A1");
}
