import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/api.ts";

test("stalled requests are bounded and report an unconfirmed outcome", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new Error("Synthetic stalled connection")),
          { once: true },
        );
      }),
  );
  const pending = api(
    "/results",
    { unitId: "synthetic-unchanged-unit" },
    "POST",
    "original-request-id",
  );
  const rejected = assert.rejects(
    pending,
    (e: unknown) =>
      e instanceof ApiError &&
      e.status === 0 &&
      e.message.includes("not been confirmed"),
  );
  t.mock.timers.tick(30_000);
  await rejected;
});

test("a malformed success body is unconfirmed rather than successful empty data", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("invalid json", { status: 200 }),
  );
  await assert.rejects(
    api("/results", {}, "POST", "original-request-id"),
    (e: unknown) => e instanceof ApiError && e.status === 0,
  );
});
