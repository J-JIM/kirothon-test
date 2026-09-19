import { useState } from "react";
import type { AppState, Update } from "../store.ts";
import { Card, Chip, timeline, pushLog } from "../ui.tsx";
import { uid } from "../store.ts";
import { callLLM, sendMail, providerLabel } from "../lib/client.ts";
import { assembleReports, reportPromptInput, applySentences } from "../../../../packages/core/report.ts";
import { reportMail } from "../../../../packages/core/templates.ts";
import { demoMinutes } from "../demo.ts";

export function CloseStep({ s, update }: { s: AppState; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = s.rounds.filter((r) => r.minutes);

  // build: 보고서 만들기
  const build = async () => {
    setBusy(`보고서 문장 쓰는 중… (${providerLabel(s.llmProvider)} 1회, 4명분)`);
    setError(null);

    const reports = assembleReports(
      s.parties,
      done.map((r) => ({
        회차: r.회차,
        확정슬롯: r.확정슬롯,
        minutes: r.minutes,
      })),
      { 이름: s.team.이름, 기간: s.team.기간 },
      s.양보횟수
    );

    const allDemo =
      done.length === 2 &&
      done.every(
        (r) =>
          r.원문출처 === "demo" && r.원문 === demoMinutes[r.회차]
      );

    const r = await callLLM(
      "writeReport",
      reportPromptInput(reports, s.parties),
      {
        mode: s.llmMode,
        provider: s.llmProvider,
        demoKey: allDemo ? "demo" : null,
      }
    );

    update((d) => {
      pushLog(d, r.log);

      if (!r.ok || !Array.isArray(r.data)) {
        d.reports = reports;
        d.reportProblems = [
          "LLM 실패 → 포트폴리오 문장 없이 코드 부분만",
        ];
      } else {
        const result = applySentences(reports, r.data);
        d.reports = result.reports;
        d.reportProblems = result.problems;

        const totalSentences = result.reports.reduce(
          (sum, rep) => sum + rep.포트폴리오문장.length,
          0
        );

        timeline(
          d,
          "agent",
          `보고서 ${result.reports.length}명분 — 문장 ${totalSentences}개, 경고 ${result.problems.length}`
        );
      }
    });

    if (!r.ok) {
      setError(`보고서 문장 실패: ${r.error}`);
    }

    setBusy(null);
  };

  // sendReports: 보고서 발송
  const sendReports = async () => {
    if (!s.reports) return;

    setBusy("보고서 메일 4통 보내는 중…");

    const mails = s.parties.map((p) => {
      const report = s.reports!.find((r) => r.관계자id === p.id);
      if (!report) return null;

      const mail = reportMail(p, report, s.team.이름);
      return { alias: p.id, subject: mail.subject, text: mail.text };
    }).filter((m) => m !== null) as { alias: string; subject: string; text: string }[];

    const res = await sendMail(mails);

    update((d) => {
      s.parties.forEach((p) => {
        const report = s.reports!.find((r) => r.관계자id === p.id);
        if (!report) return;

        const mail = reportMail(p, report, s.team.이름);
        d.inbox.unshift({
          id: uid(),
          at: Date.now(),
          alias: p.id,
          toName: p.이름,
          subject: mail.subject,
          text: mail.text,
          via: res.via,
          kind: "report",
        });
      });

      d.closed = true;

      timeline(
        d,
        "agent",
        `팀 프로젝트 종료 — 보고서 메일 4통 (${
          res.via === "gmail" ? res.note : `모의 수신함: ${res.note}`
        })`
      );
    });

    setBusy(null);
  };

  return (
    <div className="stack">
      {/* 1. 팀 프로젝트 종료 */}
      <Card
        title="팀 프로젝트 종료"
        aside={
          s.closed ? (
            <Chip kind="ok">종료됨</Chip>
          ) : (
            <Chip>회의 {done.length}회 기록</Chip>
          )
        }
      >
        {done.length === 0 ? (
          <p className="muted">회의록이 있는 회차가 없습니다.</p>
        ) : (
          <ul className="rounds">
            {done.map((r) => (
              <li key={r.회차}>
                <strong>{r.회차}회차</strong> {r.확정슬롯.날짜}{" "}
                {r.확정슬롯.시작} · {r.minutes?.중점} · 준비물{" "}
                {r.minutes?.준비물.length ?? 0}개
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button
            className="primary"
            onClick={build}
            disabled={done.length === 0 || !!busy}
          >
            보고서 만들기
          </button>
        </div>

        {busy && <p className="busy">{busy}</p>}
        {error && <p className="error">{error}</p>}
      </Card>

      {/* 2. 보고서 미리보기 */}
      {s.reports && (
        <Card
          title="보고서 미리보기"
          aside={
            s.reportProblems.length > 0 ? (
              <Chip kind="warn">경고 {s.reportProblems.length}</Chip>
            ) : (
              <Chip kind="ok">검증 통과</Chip>
            )
          }
        >
          {s.reportProblems.length > 0 && (
            <ul className="problems">
              {s.reportProblems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}

          <div className="mail-previews">
            {s.parties.map((p) => {
              const report = s.reports!.find((r) => r.관계자id === p.id);
              if (!report) return null;

              const mail = reportMail(p, report, s.team.이름);

              return (
                <div key={p.id} className="mail">
                  <div className="mail-head static">
                    <strong>{p.이름}</strong>{" "}
                    <span className="muted small">
                      준비물 {report.내가한것.length}개 → 문장{" "}
                      {report.포트폴리오문장.length}개
                    </span>
                  </div>
                  <pre className="small">{mail.text}</pre>
                </div>
              );
            })}
          </div>

          <div className="actions">
            <button
              className="primary"
              onClick={sendReports}
              disabled={s.closed || !!busy}
            >
              {s.closed ? "보냄" : "보고서 4통 보내기"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
