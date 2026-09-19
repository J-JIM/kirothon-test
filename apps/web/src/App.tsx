import { useAppState, type Step } from "./store.ts";
import { Sidebar } from "./Sidebar.tsx";
import { TeamStep } from "./steps/TeamStep.tsx";
import { MembersStep } from "./steps/MembersStep.tsx";
import { BoardStep } from "./steps/BoardStep.tsx";
import { PlanStep } from "./steps/PlanStep.tsx";
import { MinutesStep } from "./steps/MinutesStep.tsx";
import { CloseStep } from "./steps/CloseStep.tsx";

const STEPS: { key: Step; label: string }[] = [
  { key: "team", label: "1 팀" },
  { key: "members", label: "2 팀원 입력" },
  { key: "board", label: "3 조율 보드" },
  { key: "plan", label: "4 계획" },
  { key: "minutes", label: "5 회의록" },
  { key: "close", label: "6 종료 보고서" },
];

export function App() {
  const [s, update, reset] = useAppState();

  const handleReset = () => {
    if (window.confirm("처음부터 다시 시작할까요? (이 브라우저 저장 내용 삭제)")) {
      reset();
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">팀플 일정 조율 에이전트</p>
          <h1>맞춤</h1>
        </div>
        <nav className="steps" aria-label="단계">
          {STEPS.map((step) => (
            <button
              key={step.key}
              className={s.step === step.key ? "active" : ""}
              onClick={() => update((d) => { d.step = step.key; })}
            >
              {step.label}
            </button>
          ))}
        </nav>
        <button className="ghost small" onClick={handleReset}>
          처음부터
        </button>
      </header>
      <div className="layout">
        <main>
          {s.step === "team" && <TeamStep s={s} update={update} />}
          {s.step === "members" && <MembersStep s={s} update={update} />}
          {s.step === "board" && <BoardStep s={s} update={update} />}
          {s.step === "plan" && <PlanStep s={s} update={update} />}
          {s.step === "minutes" && <MinutesStep s={s} update={update} />}
          {s.step === "close" && <CloseStep s={s} update={update} />}
        </main>
        <Sidebar s={s} update={update} />
      </div>
    </div>
  );
}
