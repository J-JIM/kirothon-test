import { useState } from "react";
import type { AppState, Update } from "../store.ts";
import type { Slot } from "../../../../packages/core/types.ts";
import { Card, Chip, timeline, pushLog } from "../ui.tsx";
import { uid } from "../store.ts";
import { callLLM, providerLabel } from "../lib/client.ts";
import { intersect, calendarize, rank } from "../../../../packages/core/slots.ts";
import { assignRounds, sanitizePlan, withDates } from "../../../../packages/core/plan.ts";
import { kstParts, mmddAfter, isValidMMDD } from "../../../../packages/core/time.ts";

export function PlanStep({ s, update }: { s: AppState; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 첫 미팅이 확정되지 않았으면 조율 보드로 안내
  if (s.rounds.length === 0 || !s.rounds[0].확정슬롯) {
    return (
      <Card title="다음 행동">
        <p className="big">첫 미팅이 아직 확정되지 않았습니다</p>
        <div className="actions">
          <button
            className="primary"
            onClick={() => update((d) => { d.step = "board"; })}
          >
            조율 보드로
          </button>
        </div>
      </Card>
    );
  }

  const makePlan = async () => {
    if (!s.과제.trim() || !s.마감 || !isValidMMDD(s.마감)) return;

    setBusy(`마감 ${s.마감}까지 회차를 나누는 중… (${providerLabel(s.llmProvider)}, 최대 40초)`);
    setError(null);

    // 1회차 확정 날짜 밤을 기준으로 후보 계산
    const firstSlot = s.rounds[0].확정슬롯;
    const today = kstParts(s.기준시각);
    const meetDate = mmddAfter(firstSlot.날짜!, { y: today.y, m: today.m, d: today.d });
    const base = `${meetDate.y}-${String(meetDate.m).padStart(2, "0")}-${String(meetDate.d).padStart(2, "0")}T21:00:00+09:00`;

    const dated = rank(
      calendarize(intersect(s.parties, s.win), {
        기준시각: base,
        마감: s.마감,
        days: 30,
      })
    );

    // 후보가 1개 이하면 LLM 호출 안 함
    if (dated.length <= 1) {
      setError(
        `마감 ${s.마감}까지 4명 모두 비는 시간이 ${dated.length}곳뿐입니다 — 조율 보드에서 양보를 요청하거나 마감·탐색 범위를 넓히세요.`
      );
      setBusy(null);
      return;
    }

    const 만날수있는날 = dated.slice(0, 10).map((slot) => `${slot.날짜} ${slot.시작}`);

    const r = await callLLM(
      "makePlan",
      {
        과제: s.과제,
        마감: s.마감,
        오늘: firstSlot.날짜,
        만날수있는날,
        인원: s.parties.length,
        회의길이분: s.win.회의길이분,
      },
      {
        mode: s.llmMode,
        provider: s.llmProvider,
        demoKey: null,
      }
    );

    update((d) => {
      pushLog(d, r.log);

      let plan0;
      if (r.ok && r.data) {
        try {
          plan0 = sanitizePlan(r.data, {
            과제: s.과제,
            마감: s.마감!,
            최대회차: Math.min(5, 1 + dated.length),
          });
        } catch (e) {
          setError(`계획 검증 실패: ${String(e)} — 기본 계획으로 대체`);
          plan0 = null;
        }
      } else {
        setError(`계획 생성 실패: ${r.error} — 기본 계획으로 대체`);
        plan0 = null;
      }

      // 실패 시 기본 계획 (2회차)
      if (!plan0) {
        plan0 = {
          과제: s.과제,
          마감: s.마감!,
          근거: "LLM 실패로 기본 계획 생성",
          회차수: 2,
          회차들: [
            { 회차: 1, 목표: "1회차 진행", 산출물: "", 할일: [] },
            { 회차: 2, 목표: "2회차 진행", 산출물: "", 할일: [] },
          ],
        };
      }

      // 기존 회의록이 있는 회차 수 확인
      const maxMinutesRound = d.rounds.reduce(
        (max, r) => (r.minutes ? Math.max(max, r.회차) : max),
        0
      );
      const 필요한회차 = Math.max(plan0.회차수, maxMinutesRound);

      // 부족한 회차 채우기
      if (plan0.회차수 < 필요한회차) {
        for (let i = plan0.회차수 + 1; i <= 필요한회차; i++) {
          plan0.회차들.push({
            회차: i,
            목표: `${i}회차 진행`,
            산출물: "",
            할일: [],
          });
        }
        plan0.회차수 = 필요한회차;
      }

      // 날짜 배정
      const { 배정, 부족 } = assignRounds(dated, 필요한회차, firstSlot);
      d.plan = withDates(plan0, 배정);

      // rounds 갱신
      for (let i = 0; i < 필요한회차; i++) {
        const existing = d.rounds[i];
        const assigned = 배정[i];

        if (existing) {
          // 기존 회차가 있으면 날짜만 갱신 (회의록·메일 정보 보존)
          if (assigned) {
            d.rounds[i].확정슬롯 = { ...assigned, 상태: "확정" };
          }
        } else {
          // 새 회차 생성 (배정이 있을 때만)
          if (assigned) {
            d.rounds.push({
              회차: i + 1,
              확정슬롯: { ...assigned, 상태: "확정" },
            });
          }
        }
      }

      timeline(d, "agent", `계획 ${d.plan.회차수}회차 — ${d.plan.근거}`);
      if (부족 > 0) {
        timeline(
          d,
          "agent",
          `기한 안에 ${부족}회차는 날짜를 못 잡았습니다 (마감·탐색 범위 확인 필요)`
        );
      }
    });

    setBusy(null);
  };

  const plan = s.plan;
  const 마감Valid = s.마감 && isValidMMDD(s.마감);

  return (
    <div className="stack">
      {/* 과제 정보 */}
      <Card
        title="과제 정보"
        aside={<Chip kind="info">마감일까지 회차를 나눕니다</Chip>}
      >
        <p className="muted small">
          마감 <strong>{s.마감 ?? "없음"}</strong>
        </p>
        <p>{s.과제 || "(과제 정보 없음)"}</p>

        <div className="stack" style={{ marginTop: "1rem" }}>
          <label>
            과제 (팀 단위)
            <textarea
              rows={4}
              value={s.과제}
              onChange={(e) =>
                update((d) => {
                  d.과제 = e.target.value;
                })
              }
            />
          </label>
          <label>
            마감일 (팀 단위)
            <input
              type="text"
              placeholder="MM-DD"
              value={s.마감 ?? ""}
              onChange={(e) =>
                update((d) => {
                  d.마감 = e.target.value || null;
                })
              }
            />
          </label>
          <p className="muted small">
            두 값은 1 팀 단계와 같은 필드를 고치는 것입니다.
          </p>
        </div>

        {!마감Valid && (
          <Chip kind="bad">1 팀 단계에서 마감일(MM-DD)을 먼저 넣으세요</Chip>
        )}

        <div className="actions">
          <button
            className="primary"
            onClick={makePlan}
            disabled={!s.과제.trim() || !마감Valid || !!busy}
          >
            계획 만들기
          </button>
        </div>

        <p className="muted small">
          회차 수와 할 일은 LLM이 쓰고, 날짜는 코드가 4명 모두 비는 시간에서 배정합니다.
        </p>

        {busy && <p className="busy">{busy}</p>}
        {error && <p className="error">{error}</p>}
      </Card>

      {/* 회차 계획 표시 */}
      {plan && (
        <Card
          title="회차 계획"
          aside={<Chip>{plan.회차수}회차 · 마감 {plan.마감}</Chip>}
        >
          <p className="muted small">근거: {plan.근거}</p>

          <div className="stack" style={{ marginTop: "1rem" }}>
            {plan.회차들.map((round, i) => (
              <div key={i} className="branch">
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>{round.회차}회차</strong>
                  {round.날짜 ? (
                    <Chip>{round.날짜} {round.시작}</Chip>
                  ) : (
                    <Chip kind="bad">날짜 미배정</Chip>
                  )}
                </div>

                <label>
                  목표
                  <input
                    type="text"
                    className="wide"
                    value={round.목표}
                    onChange={(e) =>
                      update((d) => {
                        if (d.plan) {
                          d.plan.회차들[i].목표 = e.target.value;
                        }
                      })
                    }
                  />
                </label>

                <label>
                  산출물
                  <input
                    type="text"
                    className="wide"
                    value={round.산출물}
                    onChange={(e) =>
                      update((d) => {
                        if (d.plan) {
                          d.plan.회차들[i].산출물 = e.target.value;
                        }
                      })
                    }
                  />
                </label>

                <div>
                  <strong style={{ fontSize: "0.9rem" }}>할 일</strong>
                  {round.할일.map((item, j) => (
                    <div key={j} style={{ display: "flex", gap: "0.3rem", marginTop: "0.3rem" }}>
                      <input
                        type="text"
                        className="wide"
                        value={item}
                        onChange={(e) =>
                          update((d) => {
                            if (d.plan) {
                              d.plan.회차들[i].할일[j] = e.target.value;
                            }
                          })
                        }
                      />
                      <button
                        className="ghost small"
                        onClick={() =>
                          update((d) => {
                            if (d.plan) {
                              d.plan.회차들[i].할일.splice(j, 1);
                            }
                          })
                        }
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  <button
                    className="ghost small"
                    style={{ marginTop: "0.3rem" }}
                    onClick={() =>
                      update((d) => {
                        if (d.plan) {
                          d.plan.회차들[i].할일.push("");
                        }
                      })
                    }
                  >
                    할 일 추가
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              className="primary"
              onClick={() => update((d) => { d.step = "minutes"; })}
            >
              회의록 단계로
            </button>
            <button className="ghost" onClick={makePlan}>
              계획 다시 만들기
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
