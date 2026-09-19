import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function MinutesStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="5 회의록 — 준비 중"></Card>;
}
