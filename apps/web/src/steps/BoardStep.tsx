import { useState } from "react";
import type { AppState, Update, BranchView } from "../store.ts";
import type { Branch, Slot } from "../../../packages/core/types.ts";
import { Card, Chip, timeline, pushLog } from "../ui.tsx";
import { uid } from "../store.ts";
import { intersect, calendarize, rank, explain } from "../../../packages/core/slots.ts";
import {
  applyAnswer,
  enumerateBranches,
  findConstraint,
  validateBranch,
} from "../../../packages/core/concession.ts";
import { concessionInput } from "../../../packages/core/llmInputs.ts";
import { askText, inviteMail } from "../../../packages/core/templates.ts";
import { callLLM, sendMail, providerLabel } from "../lib/client.ts";
import { scenario } from "../demo.ts";

export function BoardStep({ s, update }: { s: AppState; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Record<string, { 분: number; 답: string }>>({});

  // 계산
  const notReady = s.parties.filter((p) => !s.confirmed[p.id]);
  const weekly = intersect(s.parties, s.win);
  const dated = rank(calendarize(weekly, { 기준시각: s.기준시각 }));
  const first = s.rounds[0];
  const top = dated.slice(0, 3);
  const pending = s.requests.filter((r) => r.status === "대기");

  // askAgent: 교집합 0일 때 에이전트 판단
  const askAgent = async () => {
    setBusy(
      `에이전트가 누구에게 무엇을 부탁할지 판단하는 중… (${providerLabel(
        s.llmProvider
      )}, 최대 40초)`
    );
    setError(null);

    const demoKey =
      s.constraintsFromDemo &&
      s.parties.every(
        (p) => s.timetableSource[p.id] === "demo" || s.timetableSource[p.id] === "manual"
      )
        ? "demo"
        : null;

    const r = await callLLM<Branch[]>(
      "chooseConcession",
      concessionInput(s.parties, s.win),
      {
        mode: s.llmMode,
        provider: s.llmProvider,
        demoKey,
      }
    );

    update((d) => {
      pushLog(d, r.log);

      const views: BranchView[] = [];

      if (r.ok && Array.isArray(r.data)) {
        r.data.forEach((b, i) => {
          if (b && b.생성슬롯 && Array.isArray(b.양보요청)) {
            const branch: Branch = {
              ...b,
              id: `llm-${uid()}-${i}`,
              사건id: "demo",
              상태: "열림",
              생성슬롯: {
                ...b.생성슬롯,
                가능: s.parties.map((p) => p.id),
                불가: [],
                상태: "후보",
              },
            };
            const check = validateBranch(d.parties, d.win, branch);
            views.push({ branch, source: "llm", check });
          }
        });
      }

      const valid = views.filter((v) => v.check.ok).length;

      if (valid === 0) {
        const code = enumerateBranches(d.parties, d.win, "demo");
        code.forEach((branch) => {
          const check = validateBranch(d.parties, d.win, branch);
          views.push({ branch, source: "code", check });
        });

        if (r.ok) {
          timeline(
            d,
            "agent",
            `LLM 안 ${r.data?.length ?? 0}개가 모두 검증 실패 → 코드가 찾은 안 ${code.length}개로 대체`
          );
        } else {
          timeline(d, "agent", `LLM 실패 → 코드가 찾은 안 ${code.length}개로 대체`);
        }
      } else {
        timeline(
          d,
          "agent",
          `양보안 ${views.length}개 제안 — 코드 검증 통과 ${valid}, 버림 ${views.length - valid}`
        );
      }

      d.branches = views;
      d.requests = [];
    });

    if (!r.ok) {
      setError(`LLM 실패: ${r.error} → 코드 열거로 대체했습니다.`);
    }

    setBusy(null);
  };

  // sendAsk: 요청 보내기
  const sendAsk = (v: BranchView) => {
    update((d) => {
      v.branch.양보요청.forEach((ask) => {
        const hit = findConstraint(d.parties, ask.제약id);
        if (!hit) return;

        const text = askText(hit.party, hit.c, ask, v.branch.생성슬롯);
        const reqId = uid();

        d.requests.push({
          id: reqId,
          branchId: v.branch.id,
          ask,
          slot: { ...v.branch.생성슬롯 },
          text,
          status: "대기",
        });

        d.inbox.unshift({
          id: reqId,
          at: Date.now(),
          alias: hit.party.id,
          toName: hit.party.이름,
          subject: "[양보 요청] 팀 미팅 시간을 만들 수 있을까요?",
          text,
          via: "mock",
          kind: "ask",
        });

        timeline(
          d,
          "agent",
          `${hit.party.이름}에게 양보 요청: ${ask.제약id} ${ask.방향} ${ask.분}분`
        );
      });
    });
  };

  // reply: 요청 답변
  const reply = (reqId: string, ok: boolean) => {
    update((d) => {
      const req = d.requests.find((r) => r.id === reqId);
      if (!req) return;

      const a = answer[reqId] ?? { 분: req.ask.분, 답: "" };
      const party = d.parties.find((p) => p.id === req.ask.관계자id);
      if (!party) return;

      if (!ok) {
        // 불가
        req.status = "불가";
        req.답 = a.답;

        const branch = d.branches.find((b) => b.branch.id === req.branchId);
        if (branch) {
          branch.branch.상태 = "닫힘";
        }

        timeline(
          d,
          "human",
          `${party.이름}: 불가${a.답 ? ` — "${a.답}"` : ""}`
        );
      } else {
        // 가능
        const 분 = Math.max(0, Math.min(a.분, req.ask.분));
        req.status = "가능";
        req.분 = 분;
        req.답 = a.답;

        d.parties = applyAnswer(d.parties, req.ask, 분);
        party.양보이력.push(req.branchId);
        d.양보횟수 += 1;

        // 브랜치 상태 업데이트
        const branchRequests = d.requests.filter((r) => r.branchId === req.branchId);
        const allPossible = branchRequests.every((r) => r.status === "가능");

        if (allPossible) {
          d.branches.forEach((b) => {
            if (b.branch.id === req.branchId) {
              b.branch.상태 = "머지";
            } else if (b.branch.상태 === "열림") {
              b.branch.상태 = "닫힘";
            }
          });
        }

        timeline(d, "human", `${party.이름}: 가능 (${분}분)${a.답 ? ` — "${a.답}"` : ""}`);

        const newIntersect = intersect(d.parties, d.win);
        timeline(d, "agent", `답 반영 → 4명 모두 비는 시간 ${newIntersect.length}곳`);
      }
    });
  };

  // confirm: 첫 미팅 확정
  const confirm = async (slot: Slot) => {
    setBusy("확정 메일 4통 보내는 중…");

    const mails = s.parties.map((p) => {
      const mail = inviteMail(p, slot, s.team.이름);
      return { alias: p.id, subject: mail.subject, text: mail.text };
    });

    const res = await sendMail(mails);

    update((d) => {
      d.rounds = [
        {
          회차: 1,
          확정슬롯: { ...slot, 상태: "확정" },
        },
      ];

      s.parties.forEach((p) => {
        const mail = inviteMail(p, slot, s.team.이름);
        d.inbox.unshift({
          id: uid(),
          at: Date.now(),
          alias: p.id,
          toName: p.이름,
          subject: mail.subject,
          text: mail.text,
          via: res.via,
          kind: "invite",
        });
      });

      timeline(
        d,
        "agent",
        `1회차 확정 ${slot.날짜} ${slot.시작} → 확정 메일 4통 (${
          res.via === "gmail" ? res.note : `모의 수신함: ${res.note}`
        })`
      );

      d.step = "minutes";
    });

    setBusy(null);
  };

  // A. first가 있으면
  if (first) {
    return (
      <Card title="1회차 미팅 확정됨" tone="ok">
        <p className="big">
          {first.확정슬롯.날짜} {first.확정슬롯.시작}
        </p>
        <div className="actions">
          <button className="primary" onClick={() => update((d) => { d.step = "minutes"; })}>
            회의록 단계로
          </button>
        </div>
      </Card>
    );
  }

  // B. notReady가 있으면
  if (notReady.length > 0) {
    return (
      <Card title="다음 행동">
        <p className="big">{notReady.length}명 시간표 확인 대기</p>
        <p className="muted">
          {notReady.map((p) => p.이름).join(", ")} — 팀원 입력 단계에서
          시간표를 읽고 "맞아요"를 눌러야 계산을 시작합니다.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => update((d) => { d.step = "members"; })}>
            팀원 입력으로
          </button>
        </div>
      </Card>
    );
  }

  // C. 그 외
  return (
    <div className="stack">
      {/* 1. 제안 또는 교집합 0 */}
      {top.length > 0 ? (
        <Card
          title="다음 행동 — 첫 미팅 제안"
          tone="ok"
          aside={
            <Chip kind="info">
              가능한 날짜 {dated.length}곳 · 주간 {weekly.length}곳
            </Chip>
          }
        >
          <p className="big">
            {top[0].날짜} {top[0].시작}에 만나면 됩니다
          </p>
          <ul className="reasons">
            {explain(top[0], s.parties, dated.length).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="slot-list">
            {top.map((slot, i) => (
              <div key={i} className="slot">
                <span className="mono">
                  {slot.날짜} {slot.시작}~{slot.끝}
                </span>
                <span className="muted small">
                  {slot.요일} · 4명 모두 {slot.구간끝}까지 빔
                </span>
                <button
                  className="primary small"
                  onClick={() => confirm(slot)}
                  disabled={!!busy}
                >
                  이 시간으로 확정
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card title="다음 행동 — 겹치는 시간이 없음" tone="alert">
          <p className="zero">0</p>
          <p>
            {s.win.요일.join("·")} {s.win.시작}~{s.win.끝} 안에 4명 모두 비는{" "}
            {s.win.회의길이분}분이 없습니다. when2meet은 여기서 멈춥니다.
          </p>
          <div className="actions">
            <button className="primary" onClick={askAgent} disabled={!!busy}>
              에이전트에게 양보안 받기
            </button>
          </div>
        </Card>
      )}

      {/* 2. busy·error */}
      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {/* 3. branches */}
      {s.branches.length > 0 && (
        <Card title="양보안 (코드가 다시 계산해 검증)">
          <div className="branches">
            {s.branches.map((v, i) => {
              const alreadySent = s.requests.some((r) => r.branchId === v.branch.id);

              return (
                <div
                  key={i}
                  className={`branch ${v.check.ok ? "" : "invalid"} ${v.branch.상태}`}
                >
                  <div className="branch-head">
                    <Chip kind={v.check.ok ? "ok" : "bad"}>
                      {v.check.ok ? "유효" : "버림"}
                    </Chip>
                    <Chip kind="info">{v.source === "llm" ? "LLM 판단" : "코드 열거"}</Chip>
                    <Chip>부담 {v.branch.부담점수}</Chip>
                    {v.branch.상태 !== "열림" && (
                      <Chip kind={v.branch.상태 === "머지" ? "ok" : "muted"}>
                        {v.branch.상태}
                      </Chip>
                    )}
                  </div>
                  <p>
                    <strong>
                      {v.branch.양보요청
                        .map((ask) => {
                          const party = s.parties.find((p) => p.id === ask.관계자id);
                          const constraint = party?.제약.find((c) => c.id === ask.제약id);
                          return `${party?.이름}의 ${ask.요일} ${
                            constraint?.이름 ?? ask.제약id
                          } ${ask.분}분 ${ask.방향 === "늦게시작" ? "늦게 시작" : "일찍 끝"}`;
                        })
                        .join(" + ")}
                    </strong>{" "}
                    → {v.branch.생성슬롯.요일} {v.branch.생성슬롯.시작}~
                    {v.branch.생성슬롯.끝}
                  </p>
                  {v.branch.이유 && <p className="muted small">{v.branch.이유}</p>}
                  {!v.check.ok && (
                    <ul className="problems">
                      {v.check.problems.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {v.check.ok && v.branch.상태 === "열림" && (
                    <div className="actions">
                      <button onClick={() => sendAsk(v)} disabled={alreadySent}>
                        {alreadySent ? "요청 보냄" : "요청 보내기"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 4. requests */}
      {s.requests.length > 0 && (
        <Card title="요청받은 사람 화면">
          {s.requests.map((req) => {
            const party = s.parties.find((p) => p.id === req.ask.관계자id);
            if (!party) return null;

            const isPending = req.status === "대기";
            const a = answer[req.id] ?? { 분: req.ask.분, 답: "" };

            const demoAnswer = scenario.양보답.find(
              (da) =>
                da.관계자id === req.ask.관계자id && da.제약id === req.ask.제약id
            );

            return (
              <div key={req.id} className="request">
                <p>
                  <Chip>{party.이름}에게</Chip> {req.text}
                </p>
                {isPending ? (
                  <>
                    <div className="actions wrap">
                      <label className="inline">
                        몇 분
                        <input
                          type="number"
                          className="mins"
                          min={0}
                          max={req.ask.분}
                          step={10}
                          value={a.분}
                          onChange={(e) =>
                            setAnswer((prev) => ({
                              ...prev,
                              [req.id]: {
                                ...prev[req.id],
                                분: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </label>
                      <input
                        type="text"
                        className="grow"
                        placeholder="한 줄 (선택)"
                        value={a.답}
                        onChange={(e) =>
                          setAnswer((prev) => ({
                            ...prev,
                            [req.id]: { ...prev[req.id], 답: e.target.value },
                          }))
                        }
                      />
                      {demoAnswer && (
                        <button
                          className="ghost small"
                          onClick={() =>
                            setAnswer((prev) => ({
                              ...prev,
                              [req.id]: {
                                분: demoAnswer.분,
                                답: demoAnswer.원문,
                              },
                            }))
                          }
                        >
                          데모 답 채우기
                        </button>
                      )}
                      <button className="primary" onClick={() => reply(req.id, true)}>
                        가능
                      </button>
                      <button onClick={() => reply(req.id, false)}>불가</button>
                    </div>
                  </>
                ) : (
                  <p className="muted small">
                    답: {req.status}
                    {req.분 !== undefined && ` (${req.분}분)`}
                    {req.답 && ` — "${req.답}"`}
                  </p>
                )}
              </div>
            );
          })}
          {pending.length === 0 &&
            s.requests.some((r) => r.status === "가능") &&
            top.length === 0 && (
              <p className="error">
                답을 반영했지만 아직 비는 시간이 없습니다. 다른 안을 요청해 보세요.
              </p>
            )}
        </Card>
      )}
    </div>
  );
}
