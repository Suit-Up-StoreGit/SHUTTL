import { backup } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { Database } from "./database.ts";
const db = new Database(),
  directory = resolve("data/backups");
mkdirSync(directory, { recursive: true });
const path = resolve(
  directory,
  "shuttl-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
);
if (existsSync(path)) throw new Error("Backup already exists.");
try {
  await backup(db.raw, path);
  console.log("Consistent database backup created: " + path);
} finally {
  db.close();
}
