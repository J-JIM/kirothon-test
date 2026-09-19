// 보고서 조립·LLM 입력 준비·포트폴리오문장 적용.
// 회차 기록을 팀원별로 재구성하고 LLM 출력을 검증.
import type { Party, Report, Slot, Minutes } from "./types.ts";

export interface RoundRecord {
  회차: number;
  확정슬롯?: Slot;
  minutes?: Minutes;
}

export function assembleReports(
  parties: Party[],
  rounds: RoundRecord[],
  project: { 이름: string; 기간: string },
  양보횟수: number
): Report[] {
  throw new Error("TODO A3");
}

export function reportPromptInput(
  reports: Report[],
  parties: Party[]
): {
  프로젝트: Report["프로젝트"] | null;
  팀원: { 관계자id: string; 이름: string; 내가한것: Report["내가한것"] }[];
} {
  throw new Error("TODO A3");
}

export function applySentences(
  reports: Report[],
  out: { 관계자id: string; 포트폴리오문장: string[] }[]
): { reports: Report[]; problems: string[] } {
  throw new Error("TODO A3");
}
