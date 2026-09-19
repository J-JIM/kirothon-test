// 맞춤 계약. 모든 폴더가 이것을 기준으로 동작한다.
// 형식: 요일 "월"~"일" · 시각 "HH:MM" 24시간 · 날짜 "MM-DD" · 발송·수신·마감 ISO
export type Weekday = "월" | "화" | "수" | "목" | "금" | "토" | "일";
export type HHMM = string;
export type MMDD = string;
export type ISO = string;
export type EventStatus = "편성" | "조율중" | "확정" | "회의완료" | "종료";
export type ConstraintType = "수업" | "알바" | "타팀플" | "통학" | "개인" | "타과목마감";
export type Flexibility = "고정" | "조정가능";
export type SlotStatus = "후보" | "확정" | "취소";
export type RequestType = "초대" | "가용확인" | "양보요청";
export type Direction = "늦게시작" | "일찍끝";
export type BranchStatus = "열림" | "머지" | "닫힘";

export interface Event {
  id: string;
  팀id: string;
  회차: number;
  상태: EventStatus;
  마감: ISO;
}

export interface Party {
  id: string;
  팀id: string;
  이름: string;
  이메일: string;
  시간표: Constraint[];
  제약: Constraint[];
  양보이력: string[]; // Branch id
}

export interface Constraint {
  id: string;
  요일: Weekday;
  시작: HHMM;
  끝: HHMM;
  종류: ConstraintType;
  유연성: Flexibility;
  조정폭분: number;
  이름?: string; // 과목명·알바명 (표시용)
  장소?: string; // 강의실 (표시용, 위치 추천은 안 함)
}

export interface Slot {
  요일: Weekday;
  시작: HHMM;
  끝: HHMM;
  날짜?: MMDD;
  가능: string[]; // Party id
  불가: string[]; // Party id
  상태: SlotStatus;
  구간끝?: HHMM; // 4명이 연속으로 비는 구간의 끝 (근거 표시용)
}

export interface Request {
  id: string;
  관계자id: string;
  종류: RequestType;
  대상슬롯?: Slot;
  본문: string;
  발송시각: ISO;
}

export interface Reply {
  id: string;
  요청id: string;
  관계자id: string;
  원문: string;
  추출: {
    가능: boolean;
    사유?: string;
    조정가능폭?: number;
  };
  수신시각: ISO;
}

export interface State {
  사건id: string;
  후보슬롯: Slot[];
  확정슬롯?: Slot;
  미응답: string[];
  진행단계: EventStatus;
  다음행동: string;
}

export interface ConcessionAsk {
  관계자id: string;
  제약id: string;
  방향: Direction;
  분: number;
}

export interface Branch {
  id: string;
  사건id: string;
  양보요청: ConcessionAsk[];
  생성슬롯: Slot;
  부담점수: number; // 0~100
  상태: BranchStatus;
  이유?: string;
}

export interface Assignment {
  관계자id: string | null; // Party에 없으면 null → 화면에서 사람이 고름
  항목: string;
  근거문장: string;
}

export interface Minutes {
  사건id: string;
  회차: number;
  원문: string;
  중점: string;
  다음주제: string;
  준비물: Assignment[];
  기한원문: string | null;
  다음기한: MMDD | null;
  희망시간대: string | null;
}

export interface Report {
  관계자id: string;
  프로젝트: {
    이름: string;
    기간: string;
    회차수: number;
    주제흐름: string[];
  };
  내가한것: {
    회차: number;
    항목: string;
    근거문장: string;
  }[];
  조율기록: {
    양보횟수: number;
    확정슬롯: string[]; // "MM-DD HH:MM"
  };
  포트폴리오문장: string[]; // 항목 1개당 1줄, 최대 5줄
}

// 탐색 설정 (계약 외 보조 타입)
export interface SearchWindow {
  요일: Weekday[];
  시작: HHMM;
  끝: HHMM;
  회의길이분: number;
}

// 회차별 계획 (LLM은 내용만, 날짜는 코드가 배정)
export interface PlanRound {
  회차: number;
  목표: string;
  산출물: string;
  할일: string[];
  날짜?: MMDD;
  시작?: HHMM;
}

export interface Plan {
  과제: string;
  마감: MMDD;
  회차수: number;
  근거: string;
  회차들: PlanRound[];
}

// 진행도 (계획 대비 어디까지 했는지. 근거문장 없이는 완료로 인정하지 않는다)
export type CheckStatus = "완료" | "부분" | "미완";

export interface ProgressItem {
  항목: string;
  상태: CheckStatus;
  근거문장: string | null;
}

export interface Progress {
  회차: number;
  항목들: ProgressItem[];
  진행률: number; // 0~100
  다음시작점: string;
}
