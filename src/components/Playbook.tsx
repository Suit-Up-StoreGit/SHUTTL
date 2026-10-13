import { useEffect, useState } from "react";
import { api, dateTimeLabel, errorMessage } from "../api.ts";
import type { Category } from "../domain.ts";
import { FOCUS_AREAS } from "../playbook.ts";
import { InlineError, Spinner } from "./UI.tsx";

export default function Playbook({
  owner,
  category,
  timezone,
  mock,
  onDirty,
}: {
  owner: string;
  category: Category;
  timezone: string;
  mock: boolean;
  onDirty: (value: boolean) => void;
}) {
  const [saved, setSaved] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const dirty =
    !!draft &&
    !!saved &&
    ["focus", "intention", "reflection"].some(
      (key) => draft[key] !== saved[key],
    );
  useEffect(() => {
    onDirty(dirty || busy);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    let active = true;
    setSaved(null);
    setDraft(null);
    setError("");
    setNotice("");
    if (mock) {
      const value = {
        owner,
        category,
        focus: "custom",
        intention: "",
        reflection: "",
        version: 0,
      };
      setSaved(value);
      setDraft(value);
      return;
    }
    api(`/playbook?category=${encodeURIComponent(category)}`)
      .then((value) => {
        if (!active) return;
        if (value.owner !== owner || value.category !== category)
          throw new Error("Your account changed. Reopen your Studio.");
        setSaved(value);
        setDraft(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [owner, category, mock, attempt]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const focus =
    FOCUS_AREAS.find((f) => f.id === draft?.focus) || FOCUS_AREAS.at(-1)!;
  const save = async (clear = false) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api(
        "/playbook",
        clear
          ? { category, version: saved.version }
          : {
              category,
              focus: draft.focus,
              intention: draft.intention,
              reflection: draft.reflection,
              version: saved.version,
            },
        clear ? "DELETE" : "PUT",
      );
      setSaved(value);
      setDraft(value);
      setNotice(
        clear
          ? "Your private playbook was cleared."
          : "Saved to your private playbook. No rating points or public post.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const journal = async (entryId?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = entryId
        ? await api(`/playbook/entries/${entryId}`, {}, "DELETE")
        : await api("/playbook/archive", { category, version: saved.version });
      setSaved(value);
      setDraft(value);
      setNotice(
        entryId
          ? "Private journal entry removed."
          : "Reflection added to your private journal. Your next-session intention is kept.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="studio-playbook" aria-label="Private practice playbook">
      <span className="eyebrow">NEXT SESSION / ONE INTENTION</span>
      <h3>Make your next game count.</h3>
      <p>
        A private place to prepare and reflect, even before your first rating.
        Choose your own focus; these prompts do not diagnose your technique.
      </p>
      <InlineError message={error} />
      {!saved && !error && <Spinner />}
      {!saved && error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry playbook
        </button>
      )}
      {draft && (
        <>
          <label htmlFor="playbook-focus">Session focus</label>
          <select
            id="playbook-focus"
            value={draft.focus}
            disabled={busy || mock}
            onChange={(e) => setDraft({ ...draft, focus: e.target.value })}
          >
            {FOCUS_AREAS.filter(
              (f) => category !== "Singles" || f.id !== "partnership",
            ).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <div className="playbook-cue">
            <strong>Before play</strong>
            <p>{focus.cue}</p>
            <strong>After play</strong>
            <p>{focus.review}</p>
          </div>
          <label htmlFor="playbook-intention">My next-session intention</label>
          <textarea
            id="playbook-intention"
            rows={3}
            maxLength={500}
            value={draft.intention}
            disabled={busy || mock}
            placeholder="One intention I can actually notice on court…"
            onChange={(e) => setDraft({ ...draft, intention: e.target.value })}
          />
          <label htmlFor="playbook-reflection">
            What I learned from my last session
          </label>
          <textarea
            id="playbook-reflection"
            rows={4}
            maxLength={1000}
            value={draft.reflection}
            disabled={busy || mock}
            placeholder="What worked, what surprised me, what I want to try next…"
            onChange={(e) => setDraft({ ...draft, reflection: e.target.value })}
          />
          <p>
            {saved.updatedAt
              ? `Last saved ${dateTimeLabel(saved.updatedAt, timezone)}. `
              : ""}
            Only you can access these notes. The playbook holds your current
            intention and latest reflection; saving replaces them. Add a saved
            reflection to your journal to keep it for later.
          </p>
          <div className="playbook-actions">
            <button
              className="button"
              disabled={!dirty || busy || mock}
              onClick={() => save()}
            >
              {busy ? "Saving…" : "Save private playbook"}
            </button>
            {dirty && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setAttempt((n) => n + 1);
                }}
              >
                Discard edits and reload
              </button>
            )}
            {!dirty && (saved.intention || saved.reflection) && (
              <button
                className="text-button"
                disabled={busy || mock}
                onClick={() => save(true)}
              >
                Clear saved playbook
              </button>
            )}
            {!dirty && saved.reflection && (
              <button
                className="button secondary"
                disabled={busy || mock}
                onClick={() => journal()}
              >
                Add reflection to journal
              </button>
            )}
          </div>
          <details className="playbook-journal">
            <summary>
              Your private session journal · {saved.entries?.length || 0}{" "}
              entries shown
            </summary>
            <p>
              Your latest 50 saved reflections. Your full journal is available
              in your account data export. These are your notes, not confirmed
              match evidence.
            </p>
            {(saved.entries || []).map((entry: any) => (
              <article key={entry.id}>
                <strong>
                  {FOCUS_AREAS.find((f) => f.id === entry.focus)?.name ||
                    "My own focus"}
                </strong>
                <small>
                  {dateTimeLabel(entry.createdAt, timezone)} · saved reflection
                </small>
                {entry.intention && (
                  <p>
                    <b>Intention</b>
                    <br />
                    {entry.intention}
                  </p>
                )}
                <p>
                  <b>Reflection</b>
                  <br />
                  {entry.reflection}
                </p>
                <button
                  className="text-button"
                  disabled={busy || dirty || mock}
                  onClick={() => journal(entry.id)}
                  aria-label={`Remove journal entry ${dateTimeLabel(entry.createdAt, timezone)}`}
                >
                  Remove this entry
                </button>
              </article>
            ))}
            {!saved.entries?.length && (
              <p>Your first saved reflection starts the story.</p>
            )}
          </details>
          <button
            className="button secondary"
            disabled={busy || dirty || mock}
            onClick={() => {
              const content = `SHUTTL PRIVATE PLAYBOOK — ${category}\nSaved snapshot\n\nFOCUS: ${focus.name}\nNEXT SESSION: ${saved.intention}\nLATEST REFLECTION: ${saved.reflection}\n\nJOURNAL — LATEST 50\n${(saved.entries || []).map((entry: any) => `${dateTimeLabel(entry.createdAt, timezone)}\n${entry.intention}\n${entry.reflection}`).join("\n\n")}\n\nThese are personal notes, not confirmed match evidence.`;
              const url = URL.createObjectURL(
                new Blob([content], { type: "text/plain;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `shuttl-${category.toLowerCase()}-private-playbook.txt`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
              setNotice(
                "Downloaded your private notes. Share the file only if you choose to.",
              );
            }}
          >
            Download my private playbook
          </button>
          {mock && (
            <p>
              This design preview does not save notes. Open your signed-in
              Studio to use the playbook.
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}
