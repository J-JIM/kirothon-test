import type { AppState, Update } from "../store.ts";
import { Card } from "../ui.tsx";

export function MembersStep({ s, update }: { s: AppState; update: Update }) {
  return <Card title="2 팀원 입력 — 준비 중"></Card>;
}
