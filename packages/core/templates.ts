// 메일 본문 조립·조사 처리.
// LLM 문장 뒤 조사는 받침으로 고르는 josa()로 붙인다.
import type {
  Party,
  Slot,
  Minutes,
  Report,
  Constraint,
  ConcessionAsk,
  PlanRound,
  Progress,
} from "./types.ts";

export interface Mail {
  subject: string;
  text: string;
}

export function josa(
  word: string,
  pair: "을/를" | "은/는" | "이/가" | "과/와"
): string {
  throw new Error("TODO A4");
}

export function inviteMail(
  party: Party,
  slot: Slot,
  team: string,
  장소?: string
): Mail {
  throw new Error("TODO A4");
}

export function noticeMail(
  party: Party,
  parties: Party[],
  m: Minutes,
  next: Slot | null,
  team: string,
  장소?: string,
  계획?: { round: PlanRound | null; progress: Progress | null; 이월: string[] }
): Mail {
  throw new Error("TODO A4");
}

export function reportMail(
  party: Party,
  r: Report,
  team: string,
  요약줄?: string[]
): Mail {
  throw new Error("TODO A4");
}

export function askText(
  party: Party,
  c: Constraint,
  ask: ConcessionAsk,
  slot: Slot
): string {
  throw new Error("TODO A4");
}

export function planLines(
  round: PlanRound | null,
  progress: Progress | null,
  이월: string[]
): string[] {
  throw new Error("TODO A5");
}
