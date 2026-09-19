// 회의록 정제·근거문장 검증·발화 추출.
// LLM 출력을 검사하고 근거문장이 원문에 실제로 있는지 확인.
import type { Minutes, Assignment } from "./types.ts";

export function norm(s: string): string {
  throw new Error("TODO A3");
}

export interface RawMinutes {
  중점?: string;
  다음주제?: string;
  준비물?: Assignment[];
  기한원문?: string | null;
  다음기한?: string | null;
  희망시간대?: string | null;
}

export function sanitizeMinutes(
  raw: RawMinutes,
  ctx: { 사건id: string; 회차: number; 원문: string; partyIds: string[] }
): Minutes {
  throw new Error("TODO A3");
}

export function evidenceOk(a: Assignment, transcript: string): boolean {
  throw new Error("TODO A3");
}

export function utterances(transcript: string): string[] {
  throw new Error("TODO A3");
}

export function previousUtterance(
  transcript: string,
  sentence: string
): string | null {
  throw new Error("TODO A3");
}
