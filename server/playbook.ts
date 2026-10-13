import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { CATEGORIES } from "../src/domain.ts";
import { FOCUS_AREAS } from "../src/playbook.ts";
import { now, requireThat } from "./service.ts";

export function registerPlaybook(app: FastifyInstance) {
  const db = app.service.db;
  const category = z.enum(CATEGORIES);
  const focus = z.enum(FOCUS_AREAS.map((f) => f.id) as [string, ...string[]]);
  const read = (owner: string, cat: string) =>
    db.get(
      "SELECT category,focus,intention,reflection,version,updated_at AS updatedAt FROM playbooks WHERE owner=? AND category=?",
      owner,
      cat,
    ) || {
      category: cat,
      focus: "custom",
      intention: "",
      reflection: "",
      version: 0,
      updatedAt: null,
    };
  const snapshot = (owner: string, cat: string) => ({
    owner,
    ...read(owner, cat),
    entries: db.all(
      "SELECT id,focus,intention,reflection,created_at AS createdAt FROM playbook_entries WHERE owner=? AND category=? ORDER BY created_at DESC,id DESC LIMIT 50",
      owner,
      cat,
    ),
  });
  app.get("/api/playbook", async (req) => {
    const input = z.object({ category }).strict().parse(req.query);
    return snapshot(req.actor.id, input.category);
  });
  app.put("/api/playbook", async (req) => {
    const input = z
      .object({
        category,
        focus,
        intention: z.string().trim().max(500),
        reflection: z.string().trim().max(1000),
        version: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    return db.transaction(() => {
      const current = read(req.actor.id, input.category);
      requireThat(
        current.version === input.version,
        "Your playbook changed in another window. Reload the saved version before saving again.",
        409,
      );
      db.run(
        "INSERT INTO playbooks(owner,category,focus,intention,reflection,version,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,category) DO UPDATE SET focus=excluded.focus,intention=excluded.intention,reflection=excluded.reflection,version=excluded.version,updated_at=excluded.updated_at",
        req.actor.id,
        input.category,
        input.focus,
        input.intention,
        input.reflection,
        input.version + 1,
        now(),
      );
      return snapshot(req.actor.id, input.category);
    });
  });
  app.delete("/api/playbook", async (req) => {
    const input = z
      .object({ category, version: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    return db.transaction(() => {
      const current = read(req.actor.id, input.category);
      requireThat(
        current.version === input.version,
        "Your playbook changed in another window. Reload the saved version before clearing it.",
        409,
      );
      // Keep the revision counter to prevent an older open editor from restoring cleared notes.
      db.run(
        "INSERT INTO playbooks(owner,category,focus,intention,reflection,version,updated_at) VALUES(?,?,'custom','','',?,?) ON CONFLICT(owner,category) DO UPDATE SET focus='custom',intention='',reflection='',version=excluded.version,updated_at=excluded.updated_at",
        req.actor.id,
        input.category,
        input.version + 1,
        now(),
      );
      return snapshot(req.actor.id, input.category);
    });
  });
  app.post("/api/playbook/archive", async (req) => {
    const input = z
      .object({ category, version: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    return db.transaction(() => {
      const current = read(req.actor.id, input.category);
      requireThat(
        current.version === input.version,
        "Your playbook changed in another window. Reload the saved version before archiving.",
        409,
      );
      requireThat(
        current.reflection.length > 0,
        "Save a reflection before adding it to your journal.",
      );
      db.run(
        "INSERT INTO playbook_entries VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        req.actor.id,
        input.category,
        current.focus,
        current.intention,
        current.reflection,
        now(),
      );
      db.run(
        "UPDATE playbooks SET reflection='',version=version+1,updated_at=? WHERE owner=? AND category=?",
        now(),
        req.actor.id,
        input.category,
      );
      return snapshot(req.actor.id, input.category);
    });
  });
  app.delete("/api/playbook/entries/:id", async (req) => {
    const input = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(req.params);
    const entry = db.get(
      "SELECT category FROM playbook_entries WHERE id=? AND owner=?",
      input.id,
      req.actor.id,
    );
    requireThat(entry, "This private journal entry is unavailable.", 404);
    db.run(
      "DELETE FROM playbook_entries WHERE id=? AND owner=?",
      input.id,
      req.actor.id,
    );
    return snapshot(req.actor.id, entry.category);
  });
}
