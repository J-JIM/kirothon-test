import { useState } from "react";
import type { AppState, Update } from "../store.ts";
import type { Constraint } from "../../../packages/core/types.ts";
import { Card, Chip, ConstraintTable, timeline, pushLog } from "../ui.tsx";
import { uid } from "../store.ts";
import { callLLM, imageToPayload, providerLabel } from "../lib/client.ts";
import { timetableToConstraints, utteranceToConstraints } from "../../../packages/core/llmInputs.ts";
import { scenario, demoTimetables } from "../demo.ts";

const SHOT_KEY = (pid: string) => `matchum:shot:${pid}`;

function readShot(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function MembersStep({ s, update }: { s: AppState; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [utter, setUtter] = useState("");
  const [imgInfo, setImgInfo] = useState<Record<string, string>>({});
  const [shots, setShots] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(false);

  const pid = s.activeMember;
  const idx = s.parties.findIndex((p) => p.id === pid);
  const party = s.parties[idx];
  const truth = scenario.팀원.find((p) => p.id === pid)?.시간표 ?? [];
  const src = s.timetableSource[pid];

  const uploadedShot =
    src !== "demo" && src !== "manual" && s.uploadShots?.[pid]
      ? shots[pid] ?? readShot(s.uploadShots[pid])
      : null;

  const matchCount =
    src === "demo"
      ? party.시간표.filter((c) =>
          truth.some(
            (t) =>
              t.요일 === c.요일 && t.시작 === c.시작 && t.끝 === c.끝
          )
        ).length
      : null;

  // extract: 시간표 1장 → LLM
  const extract = async (
    targetPid: string,
    blob: Blob,
    source: "demo" | "upload"
  ): Promise<boolean> => {
    setBusy(
      `${targetPid} 시간표 읽는 중… (${providerLabel(s.llmProvider)}, 최대 40초)`
    );
    setError(null);

    const payload = await imageToPayload(blob);
    setImgInfo((prev) => ({
      ...prev,
      [targetPid]: `${payload.width}×${payload.height} JPEG ${payload.kb}KB`,
    }));

    if (source === "upload") {
      const url = `data:${payload.mimeType};base64,${payload.data}`;
      setShots((prev) => ({ ...prev, [targetPid]: url }));
      try {
        localStorage.setItem(SHOT_KEY(targetPid), url);
      } catch {
        // 무시
      }
      update((d) => {
        if (!d.uploadShots) d.uploadShots = {};
        d.uploadShots[targetPid] = SHOT_KEY(targetPid);
        if (d.timetableSource[targetPid] !== "upload") {
          d.timetableSource[targetPid] = undefined;
        }
      });
    }

    const r = await callLLM("extractTimetable", {}, {
      mode: s.llmMode,
      provider: s.llmProvider,
      demoKey: source === "demo" ? targetPid : null,
      image: payload,
    });

    update((d) => {
      pushLog(d, {
        ...r.log,
        note: `${targetPid} · ${payload.kb}KB${
          r.log.note ? ` · ${r.log.note}` : ""
        }`,
      });

      if (r.ok) {
        const { items, dropped } = timetableToConstraints(targetPid, r.data);
        const partyIdx = d.parties.findIndex((p) => p.id === targetPid);
        d.parties[partyIdx].시간표 = items;
        d.timetableSource[targetPid] = source;
        d.confirmed[targetPid] = false;

        const partyName = d.parties[partyIdx].이름;
        timeline(
          d,
          "agent",
          `${partyName} 시간표에서 수업 ${items.length}개를 읽음${
            dropped ? ` (형식 오류 ${dropped}개 버림)` : ""
          } — 확인 필요`
        );

        if (items.length === 0) {
          setError(
            "읽은 수업이 0개입니다 — 캡처가 잘렸는지 확인하고 다시 올리거나 표에 직접 넣으세요."
          );
        }
      } else {
        setError(
          `시간표 추출 실패: ${r.error}. 아래 표에 직접 입력하거나 "LLM 없이 직접 입력"을 누르세요.`
        );
      }
    });

    setBusy(null);
    return r.ok;
  };

  // extractDemo: 데모 캡처 추출
  const extractDemo = async (pid: string) => {
    const response = await fetch(demoTimetables[pid]);
    const blob = await response.blob();
    return await extract(pid, blob, "demo");
  };

  // extractAllDemo: 4명 연속 추출
  const extractAllDemo = async () => {
    for (let i = 0; i < s.parties.length; i++) {
      const p = s.parties[i];
      
      if (i > 0 && s.llmMode === "live") {
        setBusy("다음 호출까지 13초 대기 (분당 5회 한도)");
        await new Promise((resolve) => setTimeout(resolve, 13000));
      }

      const success = await extractDemo(p.id);
      if (!success) {
        setError(
          (prev) =>
            (prev ?? "") + " 연속 추출을 멈췄습니다 — 한도 보호"
        );
        break;
      }
    }
  };

  // fromUtterance: 한 줄 → 제약
  const fromUtterance = async () => {
    if (!utter.trim()) return;

    setBusy("한 줄 입력을 제약으로 바꾸는 중…");
    setError(null);

    const r = await callLLM("extractConstraints", { utterance: utter }, {
      mode: s.llmMode,
      provider: s.llmProvider,
    });

    update((d) => {
      pushLog(d, r.log);

      if (r.ok) {
        const seed = Date.now() % 100000;
        const { items, dropped } = utteranceToConstraints(pid, r.data, seed);
        const partyIdx = d.parties.findIndex((p) => p.id === pid);
        d.parties[partyIdx].제약.push(...items);

        timeline(
          d,
          "agent",
          `${party.이름}의 한 줄 입력에서 제약 ${items.length}개 추출${
            dropped ? ` (형식 오류 ${dropped}개 버림)` : ""
          } — 확인 필요`
        );
      } else {
        setError(`제약 추출 실패: ${r.error}`);
      }
    });

    if (r.ok) {
      setUtter("");
    }
    setBusy(null);
  };

  // loadDemoConstraints: 데모 제약 로드
  const loadDemoConstraints = () => {
    update((d) => {
      for (const p of d.parties) {
        const demoParty = scenario.팀원.find((sp) => sp.id === p.id);
        if (demoParty) {
          p.제약 = structuredClone(demoParty.제약);
        }
      }
      d.constraintsFromDemo = true;
      d.branches = [];
      d.requests = [];
      timeline(
        d,
        "human",
        "데모 조건 2: 알바·타팀플·통학 제약 입력 (4명)"
      );
    });
  };

  // loadTruthTimetables: LLM 없이 직접 입력
  const loadTruthTimetables = () => {
    const filled: string[] = [];
    update((d) => {
      for (const p of d.parties) {
        if (d.timetableSource[p.id] === "upload") continue;

        const demoParty = scenario.팀원.find((sp) => sp.id === p.id);
        if (demoParty) {
          p.시간표 = structuredClone(demoParty.시간표);
          d.timetableSource[p.id] = "manual";
          d.confirmed[p.id] = true;
          filled.push(p.이름);
        }
      }
      timeline(
        d,
        "human",
        `LLM 없이 시간표 직접 입력 (데모 정답) — ${
          filled.length > 0 ? filled.join(", ") : "없음"
        } (올린 캡처는 유지)`
      );
    });
  };

  // confirmAll: 시간표 확인 처리
  const confirmAll = () => {
    update((d) => {
      for (const p of d.parties) {
        if (p.시간표.length > 0) {
          d.confirmed[p.id] = true;
        }
      }
      timeline(d, "human", "시간표 확인 완료 처리");
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await extract(pid, file, "upload");
    e.target.value = "";
  };

  const handleAddTimetableRow = () => {
    update((d) => {
      const partyIdx = d.parties.findIndex((p) => p.id === pid);
      d.parties[partyIdx].시간표.push({
        id: `${pid}-m${uid()}`,
        요일: "월",
        시작: "09:00",
        끝: "10:30",
        종류: "수업",
        유연성: "고정",
        조정폭분: 0,
        이름: "",
      });
      if (!d.timetableSource[pid]) {
        d.timetableSource[pid] = "manual";
      }
    });
  };

  const handleAddConstraintRow = () => {
    update((d) => {
      const partyIdx = d.parties.findIndex((p) => p.id === pid);
      d.parties[partyIdx].제약.push({
        id: `${pid}-k${uid()}`,
        요일: "월",
        시작: "18:00",
        끝: "21:00",
        종류: "아르바이트",
        유연성: "고정",
        조정폭분: 0,
        이름: "",
      });
    });
  };

  const confirmed = s.confirmed[pid] ?? false;

  return (
    <div className="stack">
      {/* 1. 데모 빠른 입력 */}
      <Card
        title="데모 빠른 입력"
        aside={
          <Chip kind="info">
            {s.llmMode === "live"
              ? s.llmProvider === "claude"
                ? "라이브: Claude Haiku (유료)"
                : "라이브: 캡처 1장 = Gemini 하루 한도 1회"
              : "캐시 우선"}
          </Chip>
        }
      >
        <div className="actions wrap">
          <button disabled={!!busy} onClick={extractAllDemo}>
            4명 데모 캡처 한 번에 추출
          </button>
          <button disabled={!!busy} onClick={loadDemoConstraints}>
            조건 2 제약 넣기 (알바·타팀플·통학)
          </button>
          <button disabled={!!busy} onClick={confirmAll}>
            읽은 시간표 전부 확인 처리
          </button>
          <button className="ghost" disabled={!!busy} onClick={loadTruthTimetables}>
            LLM 없이 직접 입력 (데모 정답)
          </button>
        </div>
        {busy && <p className="busy">{busy}</p>}
        {error && <p className="error">{error}</p>}
      </Card>

      {/* 2. 팀원 탭 */}
      <nav className="member-tabs" aria-label="팀원 전환">
        {s.parties.map((p) => {
          const isActive = p.id === pid;
          const isConfirmed = s.confirmed[p.id] ?? false;
          const hasTimetable = p.시간표.length > 0;

          return (
            <button
              key={p.id}
              className={isActive ? "active" : ""}
              onClick={() =>
                update((d) => {
                  d.activeMember = p.id;
                })
              }
            >
              <strong>{p.이름}</strong>
              {isConfirmed ? (
                <Chip kind="ok">시간표 확인</Chip>
              ) : hasTimetable ? (
                <Chip kind="warn">확인 전</Chip>
              ) : (
                <Chip>시간표 없음</Chip>
              )}
              <Chip>제약 {p.제약.length}</Chip>
            </button>
          );
        })}
      </nav>

      {/* 3. 시간표 카드 */}
      <Card
        title={`${party.이름} — 시간표`}
        aside={
          matchCount !== null && (
            <Chip
              kind={
                matchCount === truth.length &&
                party.시간표.length === truth.length
                  ? "ok"
                  : "bad"
              }
            >
              데모 정답과 {matchCount}/{truth.length} 일치
              {party.시간표.length !== truth.length &&
                ` (읽은 ${party.시간표.length})`}
            </Chip>
          )
        }
      >
        <div className="timetable-row">
          <figure className={`shot${zoom ? " zoomed" : ""}`}>
            <button
              className="shot-btn"
              aria-label={zoom ? "작게 보기" : "크게 보기"}
              onClick={() => setZoom(!zoom)}
            >
              <img
                className="thumb"
                src={uploadedShot ?? demoTimetables[pid]}
                alt={`${party.이름} 시간표`}
              />
            </button>
            <figcaption className="small muted">
              {uploadedShot ? (
                <Chip kind="ok">올린 캡처</Chip>
              ) : (
                <Chip>데모 캡처 (가상 인물)</Chip>
              )}{" "}
              {zoom ? "누르면 작게" : "누르면 크게"}
            </figcaption>
          </figure>

          <div className="stack grow">
            <div className="actions wrap">
              <button
                className="primary"
                disabled={!!busy}
                onClick={() => extractDemo(pid)}
              >
                데모 캡처로 추출
              </button>
              <label className="file">
                내 캡처 올리기
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={!!busy}
                />
              </label>
              {imgInfo[pid] && (
                <span className="muted small">
                  보낸 이미지 {imgInfo[pid]}
                </span>
              )}
            </div>

            <ConstraintTable
              rows={party.시간표}
              editable
              showFlex={false}
              onChange={(updated) =>
                update((d) => {
                  const partyIdx = d.parties.findIndex((p) => p.id === pid);
                  d.parties[partyIdx].시간표 = updated;
                  d.confirmed[pid] = false;
                })
              }
              highlight={
                src === "demo"
                  ? (row: Constraint) =>
                      truth.some(
                        (t) =>
                          t.요일 === row.요일 &&
                          t.시작 === row.시작 &&
                          t.끝 === row.끝
                      )
                        ? ""
                        : "bad"
                  : undefined
              }
            />

            <div className="actions">
              <button className="ghost" onClick={handleAddTimetableRow}>
                행 추가
              </button>
              <button
                className="primary"
                disabled={confirmed || party.시간표.length === 0}
                onClick={() =>
                  update((d) => {
                    d.confirmed[pid] = true;
                    timeline(
                      d,
                      "human",
                      `${party.이름}: 시간표 ${party.시간표.length}개 확인`
                    );
                  })
                }
              >
                {confirmed ? "확인됨" : "맞아요"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. 제약 카드 */}
      <Card title={`${party.이름} — 다른 일정 (알바·타팀플·통학 등)`}>
        <ConstraintTable
          rows={party.제약}
          editable
          showFlex
          onChange={(updated) =>
            update((d) => {
              const partyIdx = d.parties.findIndex((p) => p.id === pid);
              d.parties[partyIdx].제약 = updated;
            })
          }
        />

        <div className="actions">
          <button className="ghost" onClick={handleAddConstraintRow}>
            행 추가
          </button>
        </div>

        <div className="utter">
          <input
            type="text"
            placeholder='한 줄로: "화요일 알바 6시부터 9시, 30분은 늦출 수 있어요"'
            aria-label="한 줄 입력"
            value={utter}
            onChange={(e) => setUtter(e.target.value)}
            disabled={!!busy}
          />
          <button
            onClick={fromUtterance}
            disabled={!!busy || !utter.trim()}
          >
            한 줄 → 칸 채우기
          </button>
        </div>

        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          끝이 시작보다 이르면 자정을 넘는 일정으로 봅니다 (예: 22:00~02:00)
        </p>
      </Card>

      {/* 5. 조율 보드로 */}
      <div className="actions">
        <button
          className="primary"
          onClick={() =>
            update((d) => {
              d.step = "board";
            })
          }
        >
          조율 보드로
        </button>
      </div>
    </div>
  );
}
