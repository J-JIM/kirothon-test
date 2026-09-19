// 외부 IO 래퍼. callLLM: 캐시 → /api/llm → 실패 시 캐시 / sendMail: /api/mail → 모의 수신함

import type { LlmMode, LlmProvider, LogEntry } from "../store.ts";
import { uid } from "../store.ts";
import { demoCache } from "../demo.ts";

export const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

export const providerLabel = (p?: LlmProvider) =>
  p === "claude" ? "Claude Haiku" : "Gemini";

export interface LlmResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  log: LogEntry;
}

// djb2 해시
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const LOCAL_CACHE = "matchum:llmcache:";

export async function callLLM<T>(
  prompt: string,
  input: unknown,
  opt: {
    mode: LlmMode;
    provider?: LlmProvider;
    demoKey?: string | null;
    image?: { mimeType: string; data: string };
  }
): Promise<LlmResult<T>> {
  const t0 = performance.now();
  const claude = opt.provider === "claude";

  // fingerprint 계산
  const imageStr = opt.image
    ? opt.image.data.length +
      opt.image.data.slice(0, 2000) +
      opt.image.data.slice(-2000)
    : "";
  const fp = fingerprint(
    (claude ? "claude|" : "") + prompt + JSON.stringify(input) + imageStr
  );

  // 캐시 확인
  const staticHit = claude ? null : demoCache(prompt, opt.demoKey ?? null);
  let localHit: { data: T; model: string } | null = null;
  try {
    const raw = localStorage.getItem(LOCAL_CACHE + fp);
    if (raw) {
      localHit = JSON.parse(raw);
    }
  } catch {
    // 무시
  }

  // cache-first 모드에서 캐시 있으면 반환
  if (opt.mode === "cache-first" && (staticHit || localHit)) {
    const ms = performance.now() - t0;
    const cache = staticHit || localHit!;
    return {
      ok: true,
      data: cache.data as T,
      log: {
        id: uid(),
        at: Date.now(),
        prompt,
        source: "cache",
        ok: true,
        ms,
        model: cache.model,
        note: staticHit
          ? "데모 캐시 (실호출 저장본)"
          : "이 브라우저의 이전 실호출 결과",
      },
    };
  }

  // /api/llm 호출
  let response: Response;
  let json: any;
  try {
    response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        input,
        image: opt.image,
        models: claude ? [CLAUDE_HAIKU] : undefined,
      }),
    });
    json = await response.json();
  } catch (e) {
    const ms = performance.now() - t0;
    const error = `네트워크 오류: ${e}`;

    // 캐시 폴백
    const fallbackCache = staticHit ?? localHit;
    if (fallbackCache) {
      return {
        ok: true,
        data: fallbackCache.data as T,
        log: {
          id: uid(),
          at: Date.now(),
          prompt,
          source: "cache-fallback",
          ok: true,
          ms,
          model: fallbackCache.model,
          note: `라이브 실패(${error}) → 캐시로 대체`,
        },
      };
    }

    return {
      ok: false,
      error,
      log: {
        id: uid(),
        at: Date.now(),
        prompt,
        source: "live",
        ok: false,
        ms,
        note: error,
      },
    };
  }

  // JSON 파싱 실패
  if (!response.ok) {
    const ms = performance.now() - t0;
    const error = `HTTP ${response.status}`;

    // 캐시 폴백
    const fallbackCache = staticHit ?? localHit;
    if (fallbackCache) {
      return {
        ok: true,
        data: fallbackCache.data as T,
        log: {
          id: uid(),
          at: Date.now(),
          prompt,
          source: "cache-fallback",
          ok: true,
          ms,
          model: fallbackCache.model,
          attempts: json?.attempts,
          note: `라이브 실패(${error}) → 캐시로 대체`,
        },
      };
    }

    return {
      ok: false,
      error,
      log: {
        id: uid(),
        at: Date.now(),
        prompt,
        source: "live",
        ok: false,
        ms,
        attempts: json?.attempts,
        note: json?.error ?? error,
      },
    };
  }

  // 성공
  if (json.ok) {
    const ms = performance.now() - t0;
    // localStorage에 저장
    try {
      localStorage.setItem(
        LOCAL_CACHE + fp,
        JSON.stringify({ data: json.data, model: json.model })
      );
    } catch {
      // 무시
    }

    return {
      ok: true,
      data: json.data as T,
      log: {
        id: uid(),
        at: Date.now(),
        prompt,
        source: "live",
        ok: true,
        ms,
        model: json.model,
        attempts: json.attempts,
      },
    };
  }

  // 실패
  const ms = performance.now() - t0;
  const error = json.error ?? "알 수 없는 오류";

  // 캐시 폴백
  const fallbackCache = staticHit ?? localHit;
  if (fallbackCache) {
    return {
      ok: true,
      data: fallbackCache.data as T,
      log: {
        id: uid(),
        at: Date.now(),
        prompt,
        source: "cache-fallback",
        ok: true,
        ms,
        model: fallbackCache.model,
        attempts: json.attempts,
        note: `라이브 실패(${error}) → 캐시로 대체`,
      },
    };
  }

  return {
    ok: false,
    error,
    log: {
      id: uid(),
      at: Date.now(),
      prompt,
      source: "live",
      ok: false,
      ms,
      attempts: json.attempts,
      note: error,
    },
  };
}

export async function sendMail(
  messages: { alias: string; subject: string; text: string }[]
): Promise<{ via: "gmail" | "mock"; note: string }> {
  try {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json.ok) {
        return {
          via: "gmail",
          note: `Gmail ${json.sent}통 ${json.ms}ms (본인 +별칭)`,
        };
      }
      return { via: "mock", note: json.error ?? "알 수 없는 오류" };
    }

    return { via: "mock", note: `HTTP ${response.status}` };
  } catch (e) {
    return { via: "mock", note: String(e) };
  }
}

export interface LlmHealth {
  keyPresent: boolean;
  keys?: { gemini: boolean; claude: boolean };
  chain: string[];
}

export async function llmHealth(): Promise<LlmHealth | null> {
  try {
    const response = await fetch("/api/llm");
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// Vercel 함수 요청 한도 4.5MB, 9/17 실측 3.5MB부터 413
export async function imageToPayload(
  blob: Blob
): Promise<{ mimeType: string; data: string; width: number; height: number; kb: number }> {
  const bitmap = await createImageBitmap(blob);
  const longer = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 1280 / longer);

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const compressed = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8);
  });

  const arrayBuffer = await compressed.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // base64 인코딩 (0x8000씩 나눠서 스택 초과 방지)
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  const data = btoa(binary);

  return {
    mimeType: "image/jpeg",
    data,
    width,
    height,
    kb: Math.round(compressed.size / 1024),
  };
}
