import type { Party, SearchWindow } from "../../../packages/core/types.ts";
import scenarioJson from "../../../data/demo/scenario.json";

export interface Scenario {
  기준시각: string;
  팀: { 이름: string; 과목: string; 기간: string };
  탐색: SearchWindow;
  팀원: Party[];
  양보답: {
    관계자id: string;
    제약id: string;
    방향: "늦게시작" | "일찍끝";
    분: number;
    원문: string;
  }[];
}

export const scenario = scenarioJson as unknown as Scenario;

import p1 from "../../../data/demo/timetables/p1.png";
import p2 from "../../../data/demo/timetables/p2.png";
import p3 from "../../../data/demo/timetables/p3.png";
import p4 from "../../../data/demo/timetables/p4.png";

export const demoTimetables: Record<string, string> = { p1, p2, p3, p4 };
import minutes1 from "../../../data/demo/minutes_1.txt?raw";
import minutes2 from "../../../data/demo/minutes_2.txt?raw";

export const demoMinutes: Record<number, string> = { 1: minutes1, 2: minutes2 };

// 데모 캐시
const cacheFiles = import.meta.glob("../../../data/cache/demo/*.json", {
  eager: true,
  import: "default",
}) as Record<
  string,
  {
    prompt: string;
    key: string;
    model?: string;
    savedAt?: string;
    data: unknown;
  }
>;

export function demoCache(
  prompt: string,
  key: string | null
): { prompt: string; key: string; model?: string; savedAt?: string; data: unknown } | null {
  if (key === null) return null;
  
  for (const path in cacheFiles) {
    const cache = cacheFiles[path];
    if (cache.prompt === prompt && cache.key === key) {
      return cache;
    }
  }
  
  return null;
}

export function demoCacheList(): string[] {
  const list: string[] = [];
  for (const path in cacheFiles) {
    const cache = cacheFiles[path];
    list.push(`${cache.prompt}-${cache.key} (${cache.model ?? "?"})`);
  }
  return list;
}
