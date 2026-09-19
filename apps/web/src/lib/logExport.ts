import type { LogEntry } from "../store.ts";

const KST = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const LOG_HEADER = [
  "기록시각(KST)",
  "출처",
  "프롬프트",
  "최종결과",
  "답한모델",
  "전체초",
  "시도순번",
  "시도시각(KST)",
  "시도모델",
  "상태코드",
  "시도초",
  "이유",
  "메모",
];

function cell(v: any): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function logToCsv(log: LogEntry[]): string {
  const rows: string[] = [];

  // BOM + 헤더
  rows.push("\ufeff" + LOG_HEADER.map(cell).join(","));

  // 오래된 것부터
  const sorted = [...log].reverse();

  for (const entry of sorted) {
    const kstTime = KST.format(entry.at).replace(",", "");
    const source =
      entry.source === "live"
        ? "라이브"
        : entry.source === "cache"
        ? "캐시"
        : "캐시 폴백";
    const result = entry.ok ? "성공" : "실패";
    const totalSec = (entry.ms / 1000).toFixed(1);

    const base = [
      kstTime,
      source,
      entry.prompt,
      result,
      entry.model ?? "",
      totalSec,
    ];

    if (!entry.attempts || entry.attempts.length === 0) {
      // 시도 없음
      rows.push([...base, "", "", "", "", "", "", entry.note ?? ""].map(cell).join(","));
    } else {
      // 시도별 행
      entry.attempts.forEach((attempt, idx) => {
        const attemptKst = attempt.at ? KST.format(new Date(attempt.at)).replace(",", "") : "";
        const attemptSec = (attempt.ms / 1000).toFixed(1);
        const note = idx === 0 ? entry.note ?? "" : "";

        rows.push(
          [
            ...base,
            String(idx + 1),
            attemptKst,
            attempt.model,
            String(attempt.status),
            attemptSec,
            attempt.reason,
            note,
          ]
            .map(cell)
            .join(",")
        );
      });
    }
  }

  return rows.join("\n") + "\n";
}

export function downloadLogCsv(log: LogEntry[]): void {
  const csv = logToCsv(log);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const kstParts = KST.format(now).replace(/[^\d]/g, "").slice(0, 12); // YYYYMMDDHHMM
  const filename = `llm-calls-${kstParts}.csv`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
