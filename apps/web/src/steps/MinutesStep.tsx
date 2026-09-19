import { useState } from "react";
import type { AppState, Update } from "../store.ts";
import type { Party, Slot, MMDD, Assignment } from "../../../../packages/core/types.ts";
import { Card, Chip, timeline, pushLog } from "../ui.tsx";
import { uid } from "../store.ts";
import { callLLM, sendMail, providerLabel } from "../lib/client.ts";
import { intersect, calendarize, rank } from "../../../../packages/core/slots.ts";
import { kstParts, mmddAfter, isValidMMDD } from "../../../../packages/core/time.ts";
import { sanitizeMinutes, evidenceOk, utterances, previousUtterance } from "../../../../packages/core/minutes.ts";
import { minutesInput } from "../../../../packages/core/llmInputs.ts";
import { noticeMail } from "../../../../packages/core/templates.ts";
import { carryOver, sanitizeProgress } from "../../../../packages/core/plan.ts";
import { demoMinutes } from "../demo.ts";
import type { RawMinutes } from "../../../../packages/core/minutes.ts";
import type { Progress } from "../../../../packages/core/types.ts";

export function MinutesStep({ s, update }: { s: AppState; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; source: "demo" | "upload" } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);

  if (s.rounds.length === 0) {
    return (
      <Card title="다음 행동">
        <p className="big">첫 미팅이 아직 확정되지 않았습니다</p>
        <div className="actions">
          <button className="primary" onClick={() => update((d) => { d.step = "board"; })}>
            조율 보드로
          </button>
        </div>
      </Card>
    );
  }

  const firstUnsent = s.rounds.findIndex((r) => !r.noticeSent);
  const targetIdx = firstUnsent >= 0 ? firstUnsent : s.rounds.length - 1;
  const round = s.rounds[targetIdx];
  const allSent = s.rounds.every((r) => r.noticeSent);
  const 계획 = s.plan?.회차들.find((x) => x.회차 === round.회차) ?? null;

  const today = kstParts(s.기준시각);
  const meet = mmddAfter(round.확정슬롯.날짜!, { y: today.y, m: today.m, d: today.d });
  const text = draft?.text ?? round.원문 ?? "";

  // nextFor: 다음 미팅 계산 (마감 우선 규칙)
  const nextFor = (parties: Party[], due: MMDD | null, 희망: string | null): Slot | null => {
    const base = `${meet.y}-${String(meet.m).padStart(2, "0")}-${String(meet.d).padStart(2, "0")}T21:00:00+09:00`;
    
    let actualDue = due;
    let didClamp = false;

    if (s.마감) {
      if (!due || (isValidMMDD(due) && isValidMMDD(s.마감) && due > s.마감)) {
        actualDue = s.마감;
        didClamp = !!due;
      }
    }

    const slots = rank(
      calendarize(intersect(parties, s.win), {
        기준시각: base,
        마감: actualDue,
        days: 7,
      }),
      희망
    );

    return slots[0] ?? null;
  };

  const m = round.minutes;
  const next = round.next;

  // checkProgress: 진행도 확인
  const checkProgress = async () => {
    if (!계획 || 계획.할일.length === 0 || !m || !m.원문.trim()) return;

    setBusy(`${round.회차}회차 진행도 확인 중… (${providerLabel(s.llmProvider)}, 최대 40초)`);
    setProgressError(null);

    const r = await callLLM(
      "reviewProgress",
      {
        회차: round.회차,
        목표: 계획.목표,
        할일: 계획.할일,
        원문: m.원문,
      },
      {
        mode: s.llmMode,
        provider: s.llmProvider,
        demoKey: null,
      }
    );

    update((d) => {
      pushLog(d, r.log);

      if (r.ok && r.data) {
        try {
          d.rounds[targetIdx].progress = sanitizeProgress(r.data, {
            회차: round.회차,
            할일: 계획.할일,
            원문: m.원문,
          });
          const prog = d.rounds[targetIdx].progress!;
          timeline(
            d,
            "agent",
            `${round.회차}회차 진행도 ${prog.진행률}% — 다음 시작점: ${prog.다음시작점}`
          );
        } catch (e) {
          setProgressError(`진행도 검증 실패: ${String(e)}`);
          d.rounds[targetIdx].progress = sanitizeProgress(
            {},
            { 회차: round.회차, 할일: 계획.할일, 원문: m.원문 }
          );
        }
      } else {
        setProgressError(`진행도 확인 실패: ${r.error} — 표에서 직접 고치세요.`);
        d.rounds[targetIdx].progress = sanitizeProgress(
          {},
          { 회차: round.회차, 할일: 계획.할일, 원문: m.원문 }
        );
      }
    });

    setBusy(null);
  };

  // extract: 회의록 추출
  const extract = async () => {
    if (!text.trim()) return;

    const source = draft?.source ?? round.원문출처 ?? "upload";
    setBusy(
      `${round.회차}회차 회의록에서 뽑는 중… (${providerLabel(s.llmProvider)}, 최대 40초)`
    );
    setError(null);

    const r = await callLLM<RawMinutes>(
      "extractMinutes",
      minutesInput(s.parties, meet, text),
      {
        mode: s.llmMode,
        provider: s.llmProvider,
        demoKey:
          source === "demo" && text === demoMinutes[round.회차]
            ? String(round.회차)
            : null,
      }
    );

    update((d) => {
      pushLog(d, r.log);

      if (r.ok && r.data) {
        const partyIds = d.parties.map((p) => p.id);
        const minutes = sanitizeMinutes(r.data, {
          사건id: "demo",
          회차: round.회차,
          원문: text,
          partyIds,
        });

        const nextSlot = nextFor(d.parties, minutes.다음기한 ?? null, minutes.희망시간대);

        d.rounds[targetIdx].원문 = text;
        d.rounds[targetIdx].원문출처 = source;
        d.rounds[targetIdx].minutes = minutes;
        d.rounds[targetIdx].next = nextSlot;

        const bad = minutes.준비물.filter((a) => !evidenceOk(a, text)).length;

        timeline(
          d,
          "agent",
          `${round.회차}회차 회의록: 준비물 ${minutes.준비물.length}개 (근거 원문 불일치 ${bad}), 기한 ${
            minutes.다음기한 ?? "없음→7일"
          } → 다음 미팅 ${
            nextSlot ? `${nextSlot.날짜} ${nextSlot.시작}` : "기한 안에 빈 시간 없음"
          }`
        );
      } else {
        setError(
          `회의록 추출 실패: ${r.error} — "LLM 없이 직접 입력"으로 계속할 수 있습니다.`
        );
      }
    });

    setDraft(null);
    setBusy(null);
  };

  // manual: LLM 없이 직접 입력
  const manual = () => {
    update((d) => {
      const source = draft?.source ?? "upload";
      const nextSlot = nextFor(d.parties, null, null);

      d.rounds[targetIdx].원문 = text;
      d.rounds[targetIdx].원문출처 = source;
      d.rounds[targetIdx].minutes = {
        사건id: "demo",
        회차: round.회차,
        원문: text,
        중점: "",
        다음주제: "",
        준비물: [],
        기한원문: null,
        다음기한: null,
        희망시간대: null,
      };
      d.rounds[targetIdx].next = nextSlot;

      timeline(d, "human", `${round.회차}회차 회의록 직접 입력으로 전환`);
    });

    setDraft(null);
  };

  // recompute: 다음 미팅 재계산
  const recompute = () => {
    if (!m) return;

    const due = m.다음기한 && /^\d{2}-\d{2}$/.test(m.다음기한) ? m.다음기한 : null;
    const nextSlot = nextFor(s.parties, due, m.희망시간대);

    update((d) => {
      d.rounds[targetIdx].next = nextSlot;
      timeline(
        d,
        "human",
        `다음 미팅 다시 계산 → ${nextSlot ? `${nextSlot.날짜} ${nextSlot.시작}` : "빈 시간 없음"}`
      );
    });
  };

  // sendNotices: 정리 메일 발송
  const sendNotices = async () => {
    if (!m) return;

    setBusy("정리 메일 4통 보내는 중…");

    // 메일 본문에 계획 정보 반영
    const progress = round.progress ?? null;
    const 이월 = s.plan && 계획
      ? carryOver(
          s.plan,
          round.회차,
          progress ?? sanitizeProgress({}, { 회차: round.회차, 할일: 계획.할일, 원문: "" })
        )
      : [];

    const mails = s.parties.map((p) => {
      let mail;
      if (s.plan && 계획) {
        mail = noticeMail(
          p,
          s.parties,
          m,
          next ?? null,
          s.team.이름,
          undefined,
          { round: 계획, progress, 이월 }
        );
      } else {
        mail = noticeMail(p, s.parties, m, next ?? null, s.team.이름);
      }
      return { alias: p.id, subject: mail.subject, text: mail.text };
    });

    const res = await sendMail(mails);

    update((d) => {
      s.parties.forEach((p) => {
        let mail;
        if (s.plan && 계획) {
          mail = noticeMail(
            p,
            s.parties,
            m,
            next ?? null,
            s.team.이름,
            undefined,
            { round: 계획, progress, 이월 }
          );
        } else {
          mail = noticeMail(p, s.parties, m, next ?? null, s.team.이름);
        }
        d.inbox.unshift({
          id: uid(),
          at: Date.now(),
          alias: p.id,
          toName: p.이름,
          subject: mail.subject,
          text: mail.text,
          via: res.via,
          kind: "notice",
        });
      });

      d.rounds[targetIdx].noticeSent = true;

      timeline(
        d,
        "agent",
        `${round.회차}회차 정리 메일 4통 (${
          res.via === "gmail" ? res.note : `모의 수신함: ${res.note}`
        })`
      );

      // 다음 회차 처리
      if (d.plan) {
        // 계획이 있으면 rounds는 이미 존재하므로 이월만 반영
        if (이월.length > 0 && targetIdx < d.rounds.length - 1) {
          const nextRoundPlan = d.plan.회차들.find(
            (x) => x.회차 === round.회차 + 1
          );
          if (nextRoundPlan) {
            nextRoundPlan.할일 = [...이월, ...nextRoundPlan.할일];
            timeline(
              d,
              "agent",
              `이월 ${이월.length}개를 ${round.회차 + 1}회차 할 일 앞에 넣었습니다`
            );
          }
        }
      } else {
        // 계획이 없으면 기존 동작: 다음 회차 push
        if (next && targetIdx === d.rounds.length - 1) {
          d.rounds.push({
            회차: round.회차 + 1,
            확정슬롯: { ...next, 상태: "확정" },
          });
          timeline(
            d,
            "agent",
            `다음 조율: ${round.회차 + 1}회차 ${next.날짜} ${next.시작} (데모는 첫 후보 자동 확정)`
          );
        }
      }
    });

    setBusy(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDraft({ text, source: "upload" });
    e.target.value = "";
  };

  // 마감 조정 확인
  let didClampDeadline = false;
  if (m && m.다음기한 && s.마감 && isValidMMDD(m.다음기한) && isValidMMDD(s.마감)) {
    didClampDeadline = m.다음기한 > s.마감;
  }

  return (
    <div className="stack">
      {/* 0. 회차 계획 표시 */}
      <Card title={`${round.회차}회차 계획`}>
        {계획 ? (
          <dl className="kv">
            <dt>목표</dt>
            <dd>{계획.목표}</dd>
            <dt>산출물</dt>
            <dd>{계획.산출물 || <span className="muted">(없음)</span>}</dd>
            <dt>할 일</dt>
            <dd>
              {계획.할일.length > 0 ? (
                <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
                  {계획.할일.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">(없음)</span>
              )}
            </dd>
          </dl>
        ) : (
          <p className="muted small">
            계획 단계에서 회차 계획을 만들면 여기 목표와 할 일이 보입니다.
          </p>
        )}
      </Card>

      {/* 1. 회의록 입력 */}
      <Card
        title={`${round.회차}회차 미팅 — ${round.확정슬롯.날짜} ${round.확정슬롯.시작}`}
        aside={allSent && <Chip kind="ok">모든 회차 메일 보냄</Chip>}
      >
        <div className="actions wrap">
          {demoMinutes[round.회차] && (
            <button
              onClick={() =>
                setDraft({ text: demoMinutes[round.회차], source: "demo" })
              }
            >
              데모 회의록 {round.회차} 넣기
            </button>
          )}
          <label className="file">
            txt 올리기
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileUpload}
            />
          </label>
          <span className="muted small">
            daglo·클로바노트 txt 그대로. 요약하지 않고 정해진 것만 뽑습니다.
          </span>
        </div>

        <textarea
          className="transcript"
          rows={8}
          placeholder="회의록 txt"
          value={text}
          onChange={(e) => setDraft({ text: e.target.value, source: "upload" })}
        />

        <div className="actions">
          <button
            className="primary"
            onClick={extract}
            disabled={!!busy || !text.trim()}
          >
            회의록에서 다음 회의 뽑기
          </button>
          <button className="ghost" onClick={manual} disabled={!!busy}>
            LLM 없이 직접 입력
          </button>
        </div>

        {busy && <p className="busy">{busy}</p>}
        {error && <p className="error">{error}</p>}
      </Card>

      {/* 2. 뽑은 것 확인 */}
      {m && (
        <Card
          title="뽑은 것 — 사람이 확인"
          aside={<Chip kind="info">요약 본문 없음</Chip>}
        >
          <dl className="kv">
            <dt>오늘 중점</dt>
            <dd>
              <input
                type="text"
                className="wide"
                value={m.중점}
                onChange={(e) =>
                  update((d) => {
                    if (d.rounds[targetIdx].minutes) {
                      d.rounds[targetIdx].minutes!.중점 = e.target.value;
                    }
                  })
                }
              />
            </dd>

            <dt>다음 주제</dt>
            <dd>
              <input
                type="text"
                className="wide"
                value={m.다음주제}
                onChange={(e) =>
                  update((d) => {
                    if (d.rounds[targetIdx].minutes) {
                      d.rounds[targetIdx].minutes!.다음주제 = e.target.value;
                    }
                  })
                }
              />
            </dd>

            <dt>기한</dt>
            <dd>
              <div className="flex-cell">
                {m.기한원문 && (
                  <span className="muted">"{m.기한원문}" →</span>
                )}
                <input
                  type="text"
                  placeholder="MM-DD"
                  value={m.다음기한 ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      if (d.rounds[targetIdx].minutes) {
                        d.rounds[targetIdx].minutes!.다음기한 =
                          e.target.value || null;
                      }
                    })
                  }
                />
                {!m.다음기한 && (
                  <span className="muted small">비우면 7일</span>
                )}
                {m.희망시간대 && (
                  <span className="muted small">희망 {m.희망시간대}</span>
                )}
                <button className="ghost small" onClick={recompute}>
                  다음 미팅 다시 계산
                </button>
              </div>
              {didClampDeadline && (
                <div className="muted small" style={{ marginTop: "0.3rem" }}>
                  회의록 기한 {m.다음기한} → 프로젝트 마감 {s.마감}으로 맞춤
                </div>
              )}
            </dd>

            <dt>다음 미팅</dt>
            <dd className="strong">
              {next
                ? `${next.날짜} ${next.시작}~${next.끝}`
                : "기한 안에 4명 모두 비는 시간이 없음 → 조율 보드에서 양보 판단 필요"}
            </dd>
          </dl>

          <h4 style={{ marginTop: "1rem" }}>준비물</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>담당</th>
                  <th>준비물</th>
                  <th>근거문장 (회의록 원문)</th>
                </tr>
              </thead>
              <tbody>
                {m.준비물.map((a, i) => {
                  const isValid = evidenceOk(a, m.원문);
                  const prev = previousUtterance(m.원문, a.근거문장);

                  return (
                    <tr key={i}>
                      <td>
                        <select
                          value={a.관계자id ?? ""}
                          onChange={(e) =>
                            update((d) => {
                              if (d.rounds[targetIdx].minutes) {
                                d.rounds[targetIdx].minutes!.준비물[i].관계자id =
                                  e.target.value || null;
                              }
                            })
                          }
                        >
                          <option value="">미정</option>
                          {s.parties.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.이름}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="wide"
                          value={a.항목}
                          onChange={(e) =>
                            update((d) => {
                              if (d.rounds[targetIdx].minutes) {
                                d.rounds[targetIdx].minutes!.준비물[i].항목 =
                                  e.target.value;
                              }
                            })
                          }
                        />
                      </td>
                      <td>
                        <Chip kind={isValid ? "ok" : "bad"}>
                          {isValid ? "원문 일치" : "원문에 없음"}
                        </Chip>{" "}
                        "{a.근거문장}"
                        {prev && (
                          <div className="muted small">앞 발화: {prev}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button
              className="ghost small"
              onClick={() =>
                update((d) => {
                  if (d.rounds[targetIdx].minutes) {
                    d.rounds[targetIdx].minutes!.준비물.push({
                      관계자id: null,
                      항목: "",
                      근거문장: "",
                    });
                  }
                })
              }
            >
              준비물 행 추가 (직접 입력은 근거문장 없음으로 표시)
            </button>
          </div>

          <h4 style={{ marginTop: "1rem" }}>팀원별 메일 미리보기</h4>
          <div className="mail-previews">
            {s.parties.map((p) => {
              const mail = noticeMail(p, s.parties, m, next ?? null, s.team.이름);
              const isOpen = open === p.id;

              return (
                <div key={p.id} className="mail">
                  <button
                    className="mail-head"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    aria-expanded={isOpen}
                  >
                    <strong>{p.이름}</strong>{" "}
                    <span className="muted small">{mail.subject}</span>
                  </button>
                  {isOpen && <pre className="small">{mail.text}</pre>}
                </div>
              );
            })}
          </div>

          <div className="actions">
            <button
              className="primary"
              onClick={sendNotices}
              disabled={!!busy || round.noticeSent}
            >
              {round.noticeSent ? "보냄" : "메일 4통 보내기"}
            </button>
            <button onClick={() => update((d) => { d.step = "close"; })}>
              팀 프로젝트 종료 단계로
            </button>
          </div>
        </Card>
      )}

      {/* 3. 진행도 */}
      {m && 계획 && (
        <Card title="계획 대비 진행도">
          {계획.할일.length === 0 ? (
            <p className="muted small">
              이 회차에 할 일이 없어 진행도를 판정할 수 없습니다 — 계획 단계에서 할 일을 넣으세요
            </p>
          ) : round.progress ? (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <Chip
                  kind={
                    round.progress.진행률 === 100
                      ? "ok"
                      : round.progress.진행률 >= 50
                      ? "warn"
                      : "bad"
                  }
                >
                  진행률 {round.progress.진행률}%
                </Chip>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th>상태</th>
                      <th>근거문장</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.progress.항목들.map((item, i) => (
                      <tr key={i}>
                        <td>{item.항목}</td>
                        <td>
                          <select
                            value={item.상태}
                            onChange={(e) => {
                              const newStatus = e.target.value as "완료" | "부분" | "미완";
                              update((d) => {
                                if (d.rounds[targetIdx].progress) {
                                  d.rounds[targetIdx].progress!.항목들[i].상태 = newStatus;
                                  // 진행률 재계산
                                  const items = d.rounds[targetIdx].progress!.항목들;
                                  const sum = items.reduce((acc, it) => {
                                    if (it.상태 === "완료") return acc + 1;
                                    if (it.상태 === "부분") return acc + 0.5;
                                    return acc;
                                  }, 0);
                                  d.rounds[targetIdx].progress!.진행률 = Math.round(
                                    (sum / items.length) * 100
                                  );
                                }
                              });
                            }}
                          >
                            <option value="완료">완료</option>
                            <option value="부분">부분</option>
                            <option value="미완">미완</option>
                          </select>
                        </td>
                        <td>
                          {item.근거문장 ? (
                            <span title={item.근거문장}>…</span>
                          ) : (
                            <span className="muted">회의록 근거 없음</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label style={{ marginTop: "1rem" }}>
                다음 시작점
                <input
                  type="text"
                  className="wide"
                  value={round.progress.다음시작점}
                  onChange={(e) =>
                    update((d) => {
                      if (d.rounds[targetIdx].progress) {
                        d.rounds[targetIdx].progress!.다음시작점 = e.target.value;
                      }
                    })
                  }
                />
              </label>

              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                근거 문장이 회의록 원문에 없으면 완료로 인정하지 않습니다.
              </p>

              {progressError && <p className="error">{progressError}</p>}
            </>
          ) : (
            <>
              <div className="actions">
                <button
                  className="primary"
                  onClick={checkProgress}
                  disabled={!!busy || !m.원문.trim()}
                >
                  진행도 확인
                </button>
              </div>
              {progressError && <p className="error">{progressError}</p>}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
