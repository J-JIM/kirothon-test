import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function PlanStep({ s, update }: { s: AppState; update: Update }) {
  return (
    <Card title="4 계획 — 준비 중">
      <p className="muted">C6에서 채움</p>
    </Card>
  );
}
