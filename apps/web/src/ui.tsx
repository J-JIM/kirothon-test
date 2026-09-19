import type { ReactNode } from "react";
import type { Constraint, Weekday, ConstraintType } from "../../../packages/core/types.ts";
import type { AppState, LogEntry } from "./store.ts";

export const DAYS: Weekday[] = ["월", "화", "수", "목", "금", "토", "일"];
export const KINDS: ConstraintType[] = [
  "수업",
  "알바",
  "타팀플",
  "통학",
  "개인",
  "타과목마감",
];

// Card 컴포넌트
export function Card({
  title,
  tone = "default",
  aside,
  children,
}: {
  title?: string;
  tone?: "default" | "alert" | "ok";
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`card ${tone}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

// Chip 컴포넌트
export function Chip({
  kind = "muted",
  children,
}: {
  kind?: "ok" | "warn" | "bad" | "info" | "muted";
  children: ReactNode;
}) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

// timeline 추가
export function timeline(draft: AppState, who: "agent" | "human" | "system", text: string) {
  draft.timeline.unshift({
    at: Date.now(),
    who,
    text,
  });
}

// pushLog 추가
export function pushLog(draft: AppState, log: LogEntry) {
  draft.log.unshift(log);
}

// sourceLabel
export function sourceLabel(log: LogEntry): string {
  if (log.source === "live") {
    return log.ok ? `라이브 ${log.model ?? ""}` : "라이브 실패";
  } else if (log.source === "cache") {
    return "캐시";
  } else {
    return "캐시 폴백";
  }
}

// 시각 정규화 함수
function normalizeTime(value: string): string {
  // 숫자만 추출
  const digits = value.replace(/[^0-9]/g, "");
  
  if (digits.length === 3) {
    // "930" → "09:30"
    const h = parseInt(digits[0], 10);
    const m = parseInt(digits.slice(1), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  } else if (digits.length === 4) {
    // "0930" → "09:30"
    const h = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  } else if (digits.length === 1 || digits.length === 2) {
    // "9" → "09:00"
    const h = parseInt(digits, 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }
  
  // 검증: 기존 HH:MM 형식이면 그대로
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  
  // 정규화 실패 시 원본 반환
  return value;
}

// 시각 유효성 검사
function isValidTime(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// ConstraintTable 컴포넌트
export function ConstraintTable({
  rows,
  editable = false,
  showFlex = false,
  onChange,
  highlight,
}: {
  rows: Constraint[];
  editable?: boolean;
  showFlex?: boolean;
  onChange?: (updated: Constraint[]) => void;
  highlight?: (row: Constraint) => string;
}) {
  if (rows.length === 0) {
    return <p className="muted small">아직 없음</p>;
  }

  const handleChange = (index: number, field: keyof Constraint, value: any) => {
    if (!onChange) return;
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    
    // 유연성을 고정으로 바꾸면 조정폭분 0
    if (field === "유연성" && value === "고정") {
      updated[index].조정폭분 = 0;
    }
    // 유연성을 조정가능으로 바꾸면 기존값 또는 30
    if (field === "유연성" && value === "조정가능" && updated[index].조정폭분 === 0) {
      updated[index].조정폭분 = 30;
    }
    
    onChange(updated);
  };

  const handleDelete = (index: number) => {
    if (!onChange) return;
    const updated = rows.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleBlur = (index: number, field: "시작" | "끝", value: string) => {
    if (!onChange) return;
    const normalized = normalizeTime(value);
    if (normalized !== value) {
      handleChange(index, field, normalized);
    }
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>요일</th>
            <th>시작</th>
            <th>끝</th>
            {showFlex && (
              <>
                <th>종류</th>
                <th>조정</th>
              </>
            )}
            <th>이름</th>
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowClass = highlight ? highlight(row) : "";
            const isInvalid = !isValidTime(row.시작) || !isValidTime(row.끝);
            const finalClass = isInvalid ? "bad" : rowClass;

            return (
              <tr key={i} className={finalClass}>
                <td>
                  {editable ? (
                    <select
                      value={row.요일}
                      onChange={(e) => handleChange(i, "요일", e.target.value as Weekday)}
                      aria-label="요일"
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    row.요일
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      type="time"
                      className="time"
                      value={row.시작}
                      onChange={(e) => handleChange(i, "시작", e.target.value)}
                      onBlur={(e) => handleBlur(i, "시작", e.target.value)}
                      aria-label="시작 시각"
                    />
                  ) : (
                    row.시작
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      type="time"
                      className="time"
                      value={row.끝}
                      onChange={(e) => handleChange(i, "끝", e.target.value)}
                      onBlur={(e) => handleBlur(i, "끝", e.target.value)}
                      aria-label="끝 시각"
                    />
                  ) : (
                    row.끝
                  )}
                </td>
                {showFlex && (
                  <>
                    <td>
                      {editable ? (
                        <select
                          value={row.종류}
                          onChange={(e) => handleChange(i, "종류", e.target.value as ConstraintType)}
                          aria-label="종류"
                        >
                          {KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.종류
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <div className="flex-cell">
                          <select
                            value={row.유연성}
                            onChange={(e) => handleChange(i, "유연성", e.target.value)}
                            aria-label="유연성"
                          >
                            <option value="고정">고정</option>
                            <option value="조정가능">조정가능</option>
                          </select>
                          {row.유연성 === "조정가능" && (
                            <input
                              type="number"
                              className="mins"
                              step={10}
                              value={row.조정폭분}
                              onChange={(e) => handleChange(i, "조정폭분", parseInt(e.target.value, 10) || 0)}
                              aria-label="조정폭 (분)"
                            />
                          )}
                        </div>
                      ) : row.유연성 === "고정" ? (
                        "고정"
                      ) : (
                        `${row.조정폭분}분까지`
                      )}
                    </td>
                  </>
                )}
                <td>
                  {editable ? (
                    <input
                      type="text"
                      value={row.이름}
                      onChange={(e) => handleChange(i, "이름", e.target.value)}
                      aria-label="이름"
                    />
                  ) : (
                    <>
                      {row.이름}
                      {row.장소 && <span className="muted small"> · {row.장소}</span>}
                    </>
                  )}
                </td>
                {editable && (
                  <td>
                    <button className="ghost small" onClick={() => handleDelete(i)} aria-label="삭제">
                      삭제
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
