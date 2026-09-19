import { useState, useEffect } from "react";
import type { AppState, Update } from "./store.ts";
import { Chip } from "./ui.tsx";
import { llmHealth, providerLabel, CLAUDE_HAIKU, type LlmHealth } from "./lib/client.ts";
import { downloadLogCsv } from "./lib/logExport.ts";
import { demoCacheList } from "./demo.ts";

export function Sidebar({ s, update }: { s: AppState; update: Update }) {
  const [health, setHealth] = useState<LlmHealth | null | undefined>(undefined);
  const [expandedMail, setExpandedMail] = useState<string | null>(null);

  useEffect(() => {
    llmHealth().then(setHealth);
  }, []);

  // 로그 통계
  const liveSuccess = s.log.filter((l) => l.source === "live" && l.ok).length;
  const liveFail = s.log.filter((l) => l.source === "live" && !l.ok).length;
  const modelCounts = new Map<string, number>();
  s.log
    .filter((l) => l.source === "live" && l.ok && l.model)
    .forEach((l) => {
      const count = modelCounts.get(l.model!) ?? 0;
      modelCounts.set(l.model!, count + 1);
    });

  // 시도 통계
  const totalAttempts = s.log.reduce(
    (sum, l) => sum + (l.attempts?.length ?? 0),
    0
  );
  const failedAttempts = s.log.reduce(
    (sum, l) =>
      sum + (l.attempts?.filter((a) => a.status !== 200).length ?? 0),
    0
  );

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  const demoCaches = demoCacheList();
  const selectedProviderKey =
    s.llmProvider === "claude"
      ? health?.keys?.claude
      : health?.keys?.gemini;

  return (
    <aside className="sidebar">
      {/* 1. LLM */}
      <section>
        <h3>LLM</h3>
        <div style={{ marginBottom: "0.7rem" }}>
          <p className="small muted" style={{ marginBottom: "0.3rem" }}>
            LLM 모드
          </p>
          <div className="mode">
            <button
              className={s.llmMode === "cache-first" ? "active" : ""}
              onClick={() => update((d) => { d.llmMode = "cache-first"; })}
            >
              캐시 우선
            </button>
            <button
              className={s.llmMode === "live" ? "active" : ""}
              onClick={() => update((d) => { d.llmMode = "live"; })}
            >
              라이브
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "0.7rem" }}>
          <p className="small muted" style={{ marginBottom: "0.3rem" }}>
            LLM 모델
          </p>
          <div className="mode">
            <button
              className={s.llmProvider !== "claude" ? "active" : ""}
              onClick={() => update((d) => { d.llmProvider = "gemini"; })}
            >
              Gemini 체인
            </button>
            <button
              className={s.llmProvider === "claude" ? "active" : ""}
              onClick={() => update((d) => { d.llmProvider = "claude"; })}
            >
              Claude Haiku
            </button>
          </div>
        </div>

        <div className="small" style={{ marginBottom: "0.5rem" }}>
          {health === undefined && "서버 확인 중…"}
          {health === null && (
            <>
              <Chip kind="bad">/api/llm 응답 없음</Chip>{" "}
              <span className="muted">— npm run local로 띄웠는지 확인</span>
            </>
          )}
          {health && (
            <>
              <span>키 </span>
              {selectedProviderKey ? (
                <Chip kind="ok">있음</Chip>
              ) : (
                <>
                  <Chip kind="bad">없음</Chip>
                  {s.llmProvider === "claude" && (
                    <span className="muted"> — 서버에 ANTHROPIC_API_KEY 필요</span>
                  )}
                </>
              )}
              <span className="muted">
                {" "}
                · {s.llmProvider === "claude" ? (
                  <>
                    모델 <span className="mono">{CLAUDE_HAIKU}</span> · 데모 캐시 안 씀
                  </>
                ) : (
                  <>
                    체인{" "}
                    <span className="mono">{health.chain.join(" → ")}</span>
                  </>
                )}
              </span>
            </>
          )}
        </div>

        <p className="small muted" style={{ marginBottom: "0.3rem" }}>
          데모 캐시 {demoCaches.length}개
          {demoCaches.length > 0 && `: ${demoCaches.join(", ")}`}
          {demoCaches.length === 0 &&
            " (scripts/e2e.ts 실호출로 생성)"}
        </p>

        <p className="small">
          라이브 성공 {liveSuccess} · 실패 {liveFail}
          {modelCounts.size > 0 &&
            Array.from(modelCounts.entries()).map(([model, count]) => (
              <span key={model}>
                {" "}
                · <span className="mono">{model}</span> {count}
              </span>
            ))}
        </p>
      </section>

      {/* 2. LLM 호출 로그 */}
      <section>
        <h3>LLM 호출 로그</h3>
        <div style={{ marginBottom: "0.7rem" }}>
          <button
            className="small"
            disabled={s.log.length === 0}
            onClick={() => downloadLogCsv(s.log)}
          >
            호출 기록 CSV 저장
          </button>
          <span className="muted small" style={{ marginLeft: "0.5rem" }}>
            시도 {totalAttempts}번 · 실패 {failedAttempts}번
          </span>
        </div>

        {s.log.length === 0 && (
          <p className="muted small">아직 호출 없음</p>
        )}

        {s.log.length > 0 && (
          <ol className="log">
            {s.log.map((entry) => {
              const sourceLabel =
                entry.source === "live"
                  ? entry.ok
                    ? "라이브"
                    : "라이브 실패"
                  : entry.source === "cache"
                  ? "캐시"
                  : "캐시 폴백";
              const chipKind =
                entry.source === "live"
                  ? entry.ok
                    ? "ok"
                    : "bad"
                  : "warn";

              return (
                <li key={entry.id} className={entry.ok ? "" : "fail"}>
                  <div className="log-head">
                    <span className="mono">{entry.prompt}</span>
                    <Chip kind={chipKind}>{sourceLabel}</Chip>
                  </div>
                  <div className="muted small">
                    {(entry.ms / 1000).toFixed(1)}초 · {formatTime(entry.at)}
                  </div>
                  {entry.attempts?.map((attempt, idx) => (
                    <div key={idx} className="attempt small">
                      {attempt.at && (
                        <span className="mono">
                          {attempt.at.slice(11)}{" "}
                        </span>
                      )}
                      <span className="mono">{attempt.model}</span> ·{" "}
                      {attempt.status || "—"} ·{" "}
                      {(attempt.ms / 1000).toFixed(1)}초 · {attempt.reason}
                    </div>
                  ))}
                  {entry.note && (
                    <div className="small muted">{entry.note}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* 3. 에이전트 기록 */}
      <section>
        <h3>에이전트 기록</h3>
        {s.timeline.length === 0 && (
          <p className="muted small">아직 기록 없음</p>
        )}
        {s.timeline.length > 0 && (
          <ol className="timeline">
            {s.timeline.map((entry, idx) => (
              <li key={idx} className={entry.who}>
                <div className="muted small">{formatTime(entry.at)}</div>
                <div>{entry.text}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 4. 수신함 */}
      <section>
        <h3>수신함 ({s.inbox.length})</h3>
        {s.inbox.length === 0 && (
          <p className="muted small">받은 메일 없음</p>
        )}
        {s.inbox.length > 0 && (
          <ol className="inbox">
            {s.inbox.map((mail) => {
              const isExpanded = expandedMail === mail.id;
              return (
                <li key={mail.id}>
                  <button
                    className="mail-head"
                    onClick={() =>
                      setExpandedMail(isExpanded ? null : mail.id)
                    }
                    aria-expanded={isExpanded}
                  >
                    <Chip kind={mail.via === "gmail" ? "ok" : "muted"}>
                      {mail.via === "gmail" ? "Gmail" : "모의"}
                    </Chip>{" "}
                    {mail.toName} · {mail.subject}
                  </button>
                  {isExpanded && <pre className="small">{mail.text}</pre>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}
