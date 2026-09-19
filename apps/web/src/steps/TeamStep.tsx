import type { AppState, Update } from "../store.ts";
import { Card, Chip } from "../ui.tsx";
import { isValidMMDD } from "../../../packages/core/time.ts";
import { fmtKST } from "../../../packages/core/time.ts";

export function TeamStep({ s, update }: { s: AppState; update: Update }) {
  const invalidDeadline = s.마감 && !isValidMMDD(s.마감);

  const handleDemoTask = () => {
    update((d) => {
      d.과제 =
        "소프트웨어공학 팀 프로젝트: 캠퍼스 분실물 찾기 앱. 산출물은 요구사항 명세서, 화면 설계, 중간 발표 슬라이드. 발표는 수업 시간에 한다.";
      d.마감 = "10-07";
    });
  };

  return (
    <div className="stack">
      <Card title="팀플 만들기">
        <div className="form-grid">
          <div>
            <label htmlFor="team-name">프로젝트 이름</label>
            <input
              id="team-name"
              type="text"
              className="wide"
              value={s.team.이름}
              onChange={(e) =>
                update((d) => {
                  d.team.이름 = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label htmlFor="team-subject">과목</label>
            <input
              id="team-subject"
              type="text"
              className="wide"
              value={s.team.과목}
              onChange={(e) =>
                update((d) => {
                  d.team.과목 = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label htmlFor="team-period">기간</label>
            <input
              id="team-period"
              type="text"
              className="wide"
              value={s.team.기간}
              onChange={(e) =>
                update((d) => {
                  d.team.기간 = e.target.value;
                })
              }
            />
          </div>

          <div>
            <label htmlFor="base-time">
              기준 시각 (이 다음 날부터 7일을 찾음)
            </label>
            <input
              id="base-time"
              type="text"
              className="wide mono"
              value={s.기준시각}
              onChange={(e) =>
                update((d) => {
                  d.기준시각 = e.target.value;
                })
              }
            />
            <div className="muted small" style={{ marginTop: "0.3rem" }}>
              한국 시각 {fmtKST(s.기준시각)}
              <button
                className="ghost small"
                style={{ marginLeft: "0.5rem" }}
                onClick={() =>
                  update((d) => {
                    d.기준시각 = new Date().toISOString();
                  })
                }
              >
                지금 시각으로
              </button>
              <button
                className="ghost small"
                style={{ marginLeft: "0.3rem" }}
                onClick={() =>
                  update((d) => {
                    d.기준시각 = "2026-09-21T09:00:00+09:00";
                  })
                }
              >
                데모 기준(09-21)
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="deadline">마감일 (MM-DD)</label>
            <input
              id="deadline"
              type="text"
              className="wide"
              value={s.마감 ?? ""}
              onChange={(e) =>
                update((d) => {
                  d.마감 = e.target.value || null;
                })
              }
            />
            {invalidDeadline && (
              <div style={{ marginTop: "0.3rem" }}>
                <Chip kind="bad">MM-DD 형식</Chip>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="task">과제 정보</label>
            <textarea
              id="task"
              rows={3}
              className="wide"
              placeholder="예: 캠퍼스 분실물 찾기 앱을 만들고 중간 발표를 한다. 산출물은 요구사항 명세서, 화면 설계, 발표 슬라이드."
              value={s.과제}
              onChange={(e) =>
                update((d) => {
                  d.과제 = e.target.value;
                })
              }
            />
          </div>
        </div>

        <div className="actions wrap">
          <button className="ghost small" onClick={handleDemoTask}>
            데모 과제 정보 넣기
          </button>
        </div>

        <p className="muted small" style={{ marginTop: "0.7rem" }}>
          탐색: {s.win.요일.join("·")} {s.win.시작}~{s.win.끝}, 회의{" "}
          {s.win.회의길이분}분 · 06:00~22:00 밖은 추천 안 함
        </p>
      </Card>

      <Card title="팀원">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>이름</th>
                <th>메일</th>
              </tr>
            </thead>
            <tbody>
              {s.parties.map((party, i) => (
                <tr key={party.id}>
                  <td className="mono">{party.id}</td>
                  <td>
                    <input
                      type="text"
                      value={party.이름}
                      onChange={(e) =>
                        update((d) => {
                          d.parties[i].이름 = e.target.value;
                        })
                      }
                    />
                  </td>
                  <td className="muted small">발송 계정 +{party.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              update((d) => {
                d.step = "members";
              })
            }
          >
            팀원 입력으로
          </button>
        </div>
      </Card>
    </div>
  );
}
