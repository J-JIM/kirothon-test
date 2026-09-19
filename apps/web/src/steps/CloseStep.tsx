import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function CloseStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="6 종료 보고서 — 준비 중"></Card>;
}
