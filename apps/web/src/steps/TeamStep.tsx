import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function TeamStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="1 팀 — 준비 중"></Card>;
}
