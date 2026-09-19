---
inclusion: always
---
# 폴더 구조와 분담

```
matchum/
├─ packages/core/        A. 순수 TS. 계약·시간 계산·교집합·양보 검증·회의록 검사·회차 계획·진행도·보고서 조립·메일 템플릿·LLM 입력 조립
│  ├─ types.ts  time.ts  slots.ts  concession.ts  minutes.ts  report.ts  templates.ts  llmInputs.ts  plan.ts
│  └─ core.test.ts
├─ packages/prompts/     B. 프롬프트 7개 + JSON schema (types.ts, index.ts, 프롬프트별 파일)
├─ api/                  B. llm.ts, mail.ts — 이 2개뿐
├─ apps/web/             C. index.html, vite.config.ts
│  └─ src/  main.tsx App.tsx store.ts demo.ts ui.tsx Sidebar.tsx styles.css
│           lib/client.ts lib/logExport.ts
│           steps/TeamStep.tsx MembersStep.tsx BoardStep.tsx PlanStep.tsx MinutesStep.tsx CloseStep.tsx
├─ data/                 D. demo/scenario.json, demo/minutes_1.txt, demo/minutes_2.txt, demo/timetables/p1~p4.png, cache/demo/*.json, evidence/
├─ scripts/              D. make_timetables.py, e2e.ts
└─ .kiro/                steering/, agents/
```

## 경계
- 한 프롬프트는 한 폴더만 건드린다. 다른 폴더를 고쳐야 하면 멈추고 담당에게 넘긴다.
- B·C·D는 A를 기다리지 않는다. core 함수는 P0에서 시그니처만 있는 껍데기로 먼저 존재한다.
- types.ts와 아래 "core 함수 목록"은 09:40 이후 변경 금지. 필요하면 4명 합의 후 A가 바꾼다.

## 형식 약속
요일 = "월"~"일" 문자열 (숫자 아님) · 시각 = "HH:MM" 24시간 · 날짜 = "MM-DD" · 발송·수신·마감 = ISO 문자열 · id = string.
Constraint id: 시간표 추출 `${pid}-x${n}`, 한 줄 입력 `${pid}-u${seed}-${n}`, 직접 추가 `${pid}-m${랜덤}`/`${pid}-k${랜덤}`.
상태 전이: 편성 → 조율중 → 확정 → 회의완료 → (조율중 | 종료)

## core 함수 목록 (시그니처 계약)
time.ts
- `WEEKDAYS: Weekday[]` = ["일","월","화","수","목","금","토"] (getUTCDay 인덱스)
- `ALLOWED_HOURS = { 시작: "06:00", 끝: "22:00" }` ★
- `toMin(t: HHMM): number` · `toHHMM(x: number): HHMM`
- `interface YMD { y: number; m: number; d: number }`
- `kstParts(iso: ISO): YMD & { hh: number; mm: number }`
- `addDays(date: YMD, n: number): YMD` · `weekdayOf(date: YMD): Weekday` · `toMMDD(date: YMD): MMDD` · `compareYMD(a: YMD, b: YMD): number`
- `mmddAfter(mmdd: MMDD, base: YMD): YMD` · `fmtKST(iso: ISO): string` · `slotLabel(slot: { 날짜?: MMDD; 시작: HHMM; 끝?: HHMM }): string`
- `isValidMMDD(s: string | null | undefined): s is MMDD`
- `clampWindow(win: SearchWindow): SearchWindow` ★
slots.ts
- `type Overrides = Record<string, [number, number]>` (제약id → [시작분, 끝분])
- `commonFree(parties: Party[], day: Weekday, win: SearchWindow, overrides?: Overrides): [number, number][]`
- `intersect(parties: Party[], win: SearchWindow, overrides?: Overrides): Slot[]`
- `interface CalendarizeOptions { 기준시각: string; 마감?: MMDD | null; days?: number; 공휴일?: MMDD[] }`
- `calendarize(weekly: Slot[], opt: CalendarizeOptions): Slot[]`
- `rank(slots: Slot[], 희망시간대?: string | null): Slot[]`
- `explain(slot: Slot, parties: Party[], total: number, 마감?: MMDD | null): string[]`
concession.ts
- `findConstraint(parties: Party[], id: string): { party: Party; c: Constraint } | null`
- `asksToOverrides(parties: Party[], asks: ConcessionAsk[]): { overrides: Overrides; problems: string[] }`
- `interface BranchCheck { ok: boolean; problems: string[] }`
- `validateBranch(parties: Party[], win: SearchWindow, b: { 양보요청: ConcessionAsk[]; 생성슬롯: { 요일: Weekday; 시작: string; 끝: string } }): BranchCheck`
- `enumerateBranches(parties: Party[], win: SearchWindow, 사건id: string): Branch[]`
- `applyAnswer(parties: Party[], ask: ConcessionAsk, 분: number): Party[]`
minutes.ts
- `norm(s: string): string`
- `interface RawMinutes { 중점?: string; 다음주제?: string; 준비물?: Assignment[]; 기한원문?: string | null; 다음기한?: string | null; 희망시간대?: string | null }`
- `sanitizeMinutes(raw: RawMinutes, ctx: { 사건id: string; 회차: number; 원문: string; partyIds: string[] }): Minutes`
- `evidenceOk(a: Assignment, transcript: string): boolean`
- `utterances(transcript: string): string[]` · `previousUtterance(transcript: string, sentence: string): string | null`
report.ts
- `interface RoundRecord { 회차: number; 확정슬롯?: Slot; minutes?: Minutes }`
- `assembleReports(parties: Party[], rounds: RoundRecord[], project: { 이름: string; 기간: string }, 양보횟수: number): Report[]`
- `reportPromptInput(reports: Report[], parties: Party[]): { 프로젝트: Report["프로젝트"] | null; 팀원: { 관계자id: string; 이름: string; 내가한것: Report["내가한것"] }[] }`
- `applySentences(reports: Report[], out: { 관계자id: string; 포트폴리오문장: string[] }[]): { reports: Report[]; problems: string[] }`
templates.ts
- `interface Mail { subject: string; text: string }`
- `josa(word: string, pair: "을/를" | "은/는" | "이/가" | "과/와"): string`
- `inviteMail(party: Party, slot: Slot, team: string, 장소?: string): Mail`
- `noticeMail(party: Party, parties: Party[], m: Minutes, next: Slot | null, team: string, 장소?: string): Mail`
- `reportMail(party: Party, r: Report, team: string, 요약줄?: string[]): Mail` (요약줄은 A6. 안 주면 본문 동일)
- `askText(party: Party, c: Constraint, ask: ConcessionAsk, slot: Slot): string`
- `planLines(round: PlanRound | null, progress: Progress | null, 이월: string[]): string[]` (A5)
- noticeMail의 7번째 선택 인자 `계획?: { round: PlanRound | null; progress: Progress | null; 이월: string[] }` (A5. 안 주면 본문 동일)
plan.ts
- `assignRounds(slots: Slot[], n: number, 시작슬롯?: Slot): { 배정: Slot[]; 부족: number }`
- `sanitizePlan(raw: unknown, ctx: { 과제: string; 마감: MMDD; 최대회차: number }): Plan`
- `withDates(plan: Plan, 배정: Slot[]): Plan`
- `sanitizeProgress(raw: unknown, ctx: { 회차: number; 할일: string[]; 원문: string }): Progress`
- `carryOver(plan: Plan, 회차: number, progress: Progress): string[]`
- `interface DeadlineStatus { 마감일: MMDD; 남은일: number; 지남: boolean }` · `deadlineStatus(마감: MMDD, 기준시각: ISO, 지금: ISO): DeadlineStatus` (A6)
- `planSummaryLines(plan: Plan | null, rounds: {...}[]): string[]` (A6)
llmInputs.ts
- `concessionInput(parties: Party[], win: SearchWindow): { 탐색: SearchWindow; 팀원: {...}[] }`
- `minutesInput(parties: Party[], 회의날짜: YMD, 원문: string): { 회의날짜: string; 팀원: { id: string; 이름: string }[]; 원문: string }`
- `timetableToConstraints(pid: string, raw: unknown): { items: Constraint[]; dropped: number }`
- `utteranceToConstraints(pid: string, raw: unknown, seed: number): { items: Constraint[]; dropped: number }`
