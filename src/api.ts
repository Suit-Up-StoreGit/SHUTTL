let csrf = "";
export const setCsrf = (token: string) => {
  csrf = token;
};
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  requestId?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(!["GET", "HEAD"].includes(method)
          ? {
              "X-CSRF-Token": csrf,
              "Idempotency-Key": requestId || crypto.randomUUID(),
            }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      "You are offline. Reconnect and try again. This action has not been confirmed by SHUTTL.",
      0,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(data.error || "Please try again.", response.status);
  return data;
}
let displayTimezone = "Asia/Singapore";
export const setDisplayTimezone = (timezone: string) => {
  displayTimezone = timezone;
};
export const dateLabel = (date: string, timezone = displayTimezone) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  }).format(new Date(date));
export const dateTimeLabel = (date: string, timezone = displayTimezone) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
export type Page =
  | "home"
  | "friends"
  | "rankings"
  | "profile"
  | "inbox"
  | "agreements"
  | "reviewer";
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";
