export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      value.error?.message || "Request failed",
      value.error?.code || "UNKNOWN",
      response.status,
    );
  }
  return value;
}
export const json = (
  method: string,
  body: unknown,
  key?: string,
): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: key ? { "Idempotency-Key": key } : {},
});
