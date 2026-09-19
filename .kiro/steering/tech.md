---
inclusion: always
---
# 기술 규칙

## 스택
- 화면: Vite + React 19 + TypeScript, `apps/web/` (Vite 루트). 상태는 localStorage 한 덩어리.
- 서버: Vercel 함수 2개뿐 — `api/llm.ts`(프롬프트 이름 + 입력 → Gemini), `api/mail.ts`(Gmail). 교집합·날짜·순위·템플릿·보고서 조립·검증은 브라우저에서 core 함수로.
- 로컬: `npm run local` = `vercel dev --local --listen 8000` 한 포트로 화면과 `/api`를 같이. `vite`만 켜면 `/api`가 안 돈다.
- 테스트: `node --test packages/core/core.test.ts` (Node 24가 .ts를 타입만 지우고 실행).

## LLM
- Gemini API 직접 호출 (AI Studio 키, 이미지 입력, OCR 없음). Bedrock 사용 불가(주최 측 확정).
- 체인: 환경변수 `GEMINI_MODELS`(쉼표) 순서, 비면 `gemini-3.5-flash → 3.6 → 3.7 → 3.8`. 모델당 최대 40초, 체인 전체 90초. `api/llm.ts`는 `maxDuration: 120`.
- 503·429·500·타임아웃·JSON 파싱 실패면 다음 모델, 그 외 HTTP 오류는 즉시 중단.
  (9/17 실측: extractMinutes 10~15초, writeReport 4명분 14초, chooseConcession 12~35초, 시간표 9~26초. 15초로 끊으면 양보 판단은 거의 항상 실패.)
- `thinkingConfig`로 생각 수준을 낮추지 않는다. (9/17: low에서 준비물 2개를 1개로 합치고 보고서에 없는 말을 지어냄. 속도 이득도 없음)
- 무료 한도: 모델마다 분당 5회 · 하루 20회, 한국 16:00 초기화, 구글 계정(프로젝트) 단위. 503·타임아웃도 20회에서 깎이는 정황 → 같은 입력 반복 호출 금지, 호출 전에 캐시 확인, 연속 호출은 13초 간격.
- 모든 LLM 출력은 JSON schema로 강제. 받은 뒤 코드가 형식·내용을 다시 검사한다.
- 전부 실패하면: 캐시 → 그것도 없으면 "LLM 없이 직접 입력" 버튼. 화면에 "읽는 중…" 대기 표시 필수.

## LLM 호출 지점 — 이 7개뿐
| 프롬프트 | 입력 → 출력 | 쓰는 화면 |
|---|---|---|
| extractTimetable | 캡처 이미지 → [{요일,시작,끝,이름,장소}] | 팀원 입력 |
| extractConstraints | 한 줄 발화 → [{요일,시작,끝,종류,유연성,조정폭분,이름}] | 팀원 입력 |
| chooseConcession | 탐색 범위 + 팀원 제약 → Branch 초안 최대 3개 | 조율 보드 (교집합 0일 때만) |
| makePlan | 과제 + 마감 + 만날 수 있는 날 → 회차수·근거·회차별 목표·산출물·할 일 (날짜는 쓰지 않음) | 계획 |
| extractMinutes | 회의 날짜 + 팀원 + txt → Minutes 초안 | 회의록 |
| reviewProgress | 회차 목표 + 할 일 + 회의록 → 항목별 완료·부분·미완 + 근거문장 + 다음 시작점 | 회의록 |
| writeReport | 4명분 내가한것 → [{관계자id, 포트폴리오문장[]}] (1회 호출, 항목당 1줄, 최대 5줄) | 종료 |
교집합·날짜 변환·순위·회차 날짜 배정·진행률 계산·이월·메일 조립·상태 전이는 코드다. writeReport에 "3~5줄" 같은 최소 줄 수를 주지 않는다 (9/17: 항목 1개인 사람에게 같은 말 3번).

## 불변 규칙
- core는 IO 없음. 기준 시각은 인자로 받는다.
- 메일은 core/templates.ts 조립. LLM 문장은 Minutes.중점·다음주제·Report.포트폴리오문장뿐.
- 날짜·요일·시각 계산과 표기는 전부 `timeZone: "Asia/Seoul"`을 명시한다. Vercel 서버는 UTC. 지정 없이 getHours()·getDay()를 쓰면 9시간 틀리고 자정 근처엔 요일까지 틀린다. 달력 날짜 더하기는 Date.UTC 정수 날짜로만.
- 회의 시간은 06:00~22:00 안에서만 만든다 (core `ALLOWED_HOURS`, 탐색 범위를 항상 이 안으로 자른다). ★
- 끝 < 시작인 일정은 자정을 넘는 일정이다: 그 요일 시작~24:00 + 다음 요일 00:00~끝. ★
- 준비물·보고서 항목은 근거문장(회의록 원문 발화) 없이 만들지 않는다. 근거문장이 "네 알겠어요"처럼 대답만일 수 있으니 화면에는 바로 앞 발화도 보여준다.
- 메일 템플릿에서 LLM 문장 뒤 조사(을/를·은/는·이/가)는 받침으로 고르는 josa()로 붙인다. "{중점}을"로 박으면 "자료 조사을"이 된다.
- 비밀 값은 .env.example에 키 이름만.

## import 규칙 (9/17 함정)
- `packages/core`, `apps/web`, `scripts`: 상대경로 + **`.ts` 확장자** (`../../../../packages/core/slots.ts`). Node 테스트가 확장자 없이는 못 찾는다.
- `api`, `packages/prompts`: 상대경로 + **`.js` 확장자** (`../packages/prompts/index.js`). 확장자가 없으면 로컬은 되는데 **배포본에서만** ERR_MODULE_NOT_FOUND.
- `api`는 `packages/core`를 import하지 않는다 (확장자 규칙이 달라 배포에서 깨짐). api가 쓰는 건 `packages/prompts`뿐.
- core·prompts에 `enum`, `namespace`, 생성자 매개변수 프로퍼티 금지 (Node 타입 제거 실행이 못 읽음). 유니온 타입을 쓴다.
- `api`에서 `require` 금지 (ESM). `import nodemailer from "nodemailer"`.
- 화면에서 데이터 파일: `import scenario from "../../../data/demo/scenario.json"`, 회의록은 `?raw`, PNG는 기본 import, 캐시는 `import.meta.glob("../../../data/cache/demo/*.json", { eager: true, import: "default" })`.

## 배포·로컬 실행 (9/17 실제 배포로 검증)
- `package.json`의 `"dev"`에 `vercel dev`를 넣지 않는다 → "must not recursively invoke itself". 이름은 `"local"`.
- 시간대 버그는 `TZ=UTC npm run local`로 띄워 로컬에서 잡는다.
- 환경변수 등록: `vercel env add 이름 production` (값은 파일에서 `< 파일`로). 넣은 뒤 **재배포해야** 반영.
- 브라우저용 `VITE_` 변수는 빌드 때 박힌다. 이름에 KEY가 든 `VITE_` 변수는 `--type config`를 붙여야 등록된다. secret 키는 절대 `VITE_`에 넣지 않는다.
- 시간표 캡처는 브라우저에서 canvas로 긴 변 1280px · JPEG 0.8로 줄여 base64로 보낸다. Vercel 함수 요청 한도 약 4.5MB (9/17: 3.2MB 통과, 3.5MB 413).
- Vercel 무료 플랜 로그는 짧게 보관 → 호출 기록은 테스트 직후 받는다.
