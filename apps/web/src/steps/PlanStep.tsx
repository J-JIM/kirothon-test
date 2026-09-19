import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function PlanStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="4 계획 — 준비 중"></Card>;
}
