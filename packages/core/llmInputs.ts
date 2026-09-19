// LLM 입력 구조체 변환.
// LLM 출력(시간표·한 줄 입력)을 Constraint로 변환.
import type { Party, Constraint, SearchWindow } from "./types.ts";
import type { YMD } from "./time.ts";

export function concessionInput(
  parties: Party[],
  win: SearchWindow
): {
  탐색: SearchWindow;
  팀원: {
    id: string;
    이름: string;
    시간표: Constraint[];
    제약: Constraint[];
  }[];
} {
  throw new Error("TODO A4");
}

export function minutesInput(
  parties: Party[],
  회의날짜: YMD,
  원문: string
): {
  회의날짜: string;
  팀원: { id: string; 이름: string }[];
  원문: string;
} {
  throw new Error("TODO A4");
}

export function timetableToConstraints(
  pid: string,
  raw: unknown
): { items: Constraint[]; dropped: number } {
  throw new Error("TODO A4");
}

export function utteranceToConstraints(
  pid: string,
  raw: unknown,
  seed: number
): { items: Constraint[]; dropped: number } {
  throw new Error("TODO A4");
}
