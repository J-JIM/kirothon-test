import type { AppState, Update } from "./store.ts";
import { Card } from "./ui.tsx";

export function Sidebar({ s, update }: { s: AppState; update: Update }) {
  return (
    <aside className="sidebar">
      <Card title="사이드바 — 준비 중">
        <p className="muted small">LLM 모드, 호출 로그, 타임라인, 수신함</p>
      </Card>
    </aside>
  );
}
