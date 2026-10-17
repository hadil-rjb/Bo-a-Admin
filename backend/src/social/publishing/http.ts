/** Small HTTP helper for third-party APIs: JSON in/out, timeouts and readable errors. */
export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
  }
}

type Init = Omit<RequestInit, "body"> & { json?: unknown; form?: Record<string, string>; body?: BodyInit; timeoutMs?: number };

/** Best human-readable message out of the many error shapes networks return. */
export function errorText(body: any, fallback: string): string {
  if (!body || typeof body !== "object") return typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : fallback;
  const e = body.error;
  return (
    (typeof e === "object" && (e.error_user_msg || e.message || e.description)) ||
    (typeof e === "string" && (body.error_description || e)) ||
    body.description || body.detail || body.title || body.message ||
    (Array.isArray(body.errors) && (body.errors[0]?.message || body.errors[0]?.detail)) ||
    fallback
  );
}

export async function request<T = any>(url: string, init: Init = {}): Promise<T> {
  const { json, form, timeoutMs = 30_000, headers, ...rest } = init;
  const h: Record<string, string> = { ...(headers as Record<string, string>) };
  let body = init.body;
  if (json !== undefined) { body = JSON.stringify(json); h["Content-Type"] = "application/json"; }
  if (form) { body = new URLSearchParams(form); h["Content-Type"] = "application/x-www-form-urlencoded"; }
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: h, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    throw new ApiError(e?.name === "TimeoutError" ? "The service did not answer in time" : `Could not reach ${new URL(url).host}`);
  }
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new ApiError(errorText(data, `${res.status} ${res.statusText}`), res.status, data);
  return Object.assign(data ?? {}, { __headers: res.headers }) as T;
}

/** Same as request() but returns raw bytes (image downloads). */
export async function download(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ buf: Buffer; type: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) }).catch(() => {
    throw new ApiError(`Could not download ${new URL(url).host}`);
  });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
}
