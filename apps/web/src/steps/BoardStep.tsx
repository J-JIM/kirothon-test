import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function BoardStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="3 조율 보드 — 준비 중"></Card>;
}
