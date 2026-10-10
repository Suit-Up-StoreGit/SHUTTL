import { buildApp } from "./app.ts";
const app = await buildApp();
await app.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT) || 3000,
});
console.log("SHUTTL is running on port " + (process.env.PORT || 3000));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
