import { buildApp } from "../../server/app.ts";
import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
// Each run owns this named disposable fixture database. Refuse to reset any
// other path or run outside the test environment; preview/production data stays separate.
const fixturePath = resolve("data/browser-tests.sqlite");
if (
  process.env.NODE_ENV !== "test" ||
  resolve(process.env.DATABASE_PATH || "") !== fixturePath
)
  throw new Error(
    "The browser fixture requires its named test database and NODE_ENV=test.",
  );
for (const file of [fixturePath, fixturePath + "-wal", fixturePath + "-shm"])
  if (existsSync(file)) unlinkSync(file);
// Only this local fixture launcher raises signup capacity for independent
// regression accounts. The normal production launcher keeps its default limit.
const app = await buildApp({ authRateLimit: 200 });
app.service.db.run(
  "INSERT OR REPLACE INTO app_meta VALUES('demo_seeded','true')",
);
await app.listen({ host: "127.0.0.1", port: 4174 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
