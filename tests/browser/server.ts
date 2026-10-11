import { buildApp } from "../../server/app.ts";
// Only this local fixture launcher raises signup capacity for independent
// regression accounts. The normal production launcher keeps its default limit.
const app = await buildApp({ authRateLimit: 100 });
app.service.db.run(
  "INSERT OR REPLACE INTO app_meta VALUES('demo_seeded','true')",
);
await app.listen({ host: "127.0.0.1", port: 4174 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
