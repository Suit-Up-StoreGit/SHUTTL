import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { api, ApiError, errorMessage } from "../api.ts";
import { InlineError } from "./UI.tsx";

const temporaryAppearance: Record<string, string> = {};
let appearanceStorageUnavailable = false;
function appearanceValue(key: string, fallback: string) {
  if (temporaryAppearance[key]) return temporaryAppearance[key];
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    appearanceStorageUnavailable = true;
    return fallback;
  }
}
function saveAppearance(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    delete temporaryAppearance[key];
    return true;
  } catch {
    temporaryAppearance[key] = value;
    return false;
  }
}
export function applyAppearance() {
  const theme = appearanceValue("shuttl-appearance", "system");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
  document.documentElement.dataset.textSize = appearanceValue(
    "shuttl-text-size",
    "normal",
  );
}
export const passkeysSupported = () =>
  typeof PublicKeyCredential !== "undefined" &&
  isSecureContext &&
  !/^\d+(\.\d+){3}$/.test(location.hostname) &&
  !location.hostname.includes(":");
if (typeof matchMedia !== "undefined")
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    try {
      applyAppearance();
    } catch {}
  });
export function AppearanceChoices() {
  const [theme, setTheme] = useState(() =>
      appearanceValue("shuttl-appearance", "system"),
    ),
    [text, setText] = useState(() =>
      appearanceValue("shuttl-text-size", "normal"),
    ),
    [storageWarning, setStorageWarning] = useState(
      appearanceStorageUnavailable,
    );
  return (
    <section className="appearance-choices">
      <h3>Comfort on your device</h3>
      <div className="form-grid">
        <div>
          <label htmlFor="appearance-theme">Appearance</label>
          <select
            id="appearance-theme"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              setStorageWarning(
                !saveAppearance("shuttl-appearance", e.target.value),
              );
              applyAppearance();
            }}
          >
            <option value="system">Follow device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div>
          <label htmlFor="appearance-text">Text size</label>
          <select
            id="appearance-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setStorageWarning(
                !saveAppearance("shuttl-text-size", e.target.value),
              );
              applyAppearance();
            }}
          >
            <option value="normal">Standard</option>
            <option value="large">Large · 200%</option>
          </select>
        </div>
      </div>
      {storageWarning && (
        <p className="form-help" role="status">
          Your appearance choices apply for this visit. This browser could not
          save them for your next visit.
        </p>
      )}
      <p className="form-help">
        Appearance stays on this browser. Reduced motion follows your device’s
        preference.
      </p>
    </section>
  );
}
export function PortraitChoice({
  me,
  refresh,
  notify,
}: {
  me: any;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="portrait-choice">
      <h3>A familiar face on court</h3>
      <p className="form-help">
        Optional. Your portrait is visible to accepted friends. Other signed-in
        players see it only if you enable Public portrait in Your choices.
        Location metadata is removed by resizing locally.
      </p>
      <label htmlFor="portrait-file">Choose a portrait</label>
      <input
        id="portrait-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError("");
          setBusy(true);
          try {
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size > 8 * 1024 * 1024
            )
              throw new Error("Choose a JPG, PNG or WebP image under 8 MB.");
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 256;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#f6f7f2";
            ctx.fillRect(0, 0, 256, 256);
            const size = Math.min(bitmap.width, bitmap.height);
            ctx.drawImage(
              bitmap,
              (bitmap.width - size) / 2,
              (bitmap.height - size) / 2,
              size,
              size,
              0,
              0,
              256,
              256,
            );
            bitmap.close();
            const image = canvas.toDataURL("image/webp", 0.75);
            if (image.length > 59000)
              throw new Error(
                "This image is too detailed. Choose a simpler portrait.",
              );
            await api("/account/portrait", { image }, "PUT");
            refresh();
            notify("Your portrait is saved for accepted friends.");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {me.portrait && (
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await api("/account/portrait", {}, "DELETE");
              refresh();
              notify("Portrait removed.");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Remove portrait
        </button>
      )}
      <InlineError message={error} />
    </section>
  );
}
export function PasskeyChoices({ notify }: { notify: (s: string) => void }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [label, setLabel] = useState("My passkey"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api("/account/passkeys"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/account/passkeys")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="passkey-choices">
      <h3>Your other way back</h3>
      <p className="form-help">
        A passkey lets you sign in without remembering this password. Your
        device or passkey provider controls storage and syncing; keep your
        private recovery code for another fallback. No biometric data is sent to
        SHUTTL.
      </p>
      {loading && (
        <p className="form-help" role="status">
          Checking your passkeys…
        </p>
      )}
      {!data && !loading && error && (
        <p className="form-help">Your saved passkeys could not be checked.</p>
      )}
      {error && !loading && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setAttempt((v) => v + 1)}
        >
          Retry passkey controls
        </button>
      )}
      {data?.available && passkeysSupported() ? (
        <>
          <label htmlFor="passkey-label">Passkey label</label>
          <input
            id="passkey-label"
            value={label}
            maxLength={40}
            disabled={busy || loading}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label htmlFor="passkey-password">
            Current password to manage passkeys
          </label>
          <input
            id="passkey-password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy || loading}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="button secondary"
            disabled={busy || loading || !password || !label.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const options = await api("/account/passkeys/options", {
                  password,
                });
                const response = await startRegistration({
                  optionsJSON: options.options,
                });
                await api("/account/passkeys/verify", {
                  response,
                  challengeId: options.challengeId,
                  label,
                });
                setPassword("");
                await load();
                notify("Passkey added. You can use it at sign in.");
              } catch (e) {
                if (e instanceof ApiError && e.status === 0) setData(null);
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Add a passkey
          </button>
          {data.passkeys.map((p: any) => (
            <div className="device-row" key={p.id}>
              <strong>{p.label}</strong>
              <button
                className="text-button"
                disabled={busy || loading || !password}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(
                      "/account/passkeys/" + encodeURIComponent(p.id),
                      { password },
                      "DELETE",
                    );
                    setPassword("");
                    await load();
                    notify("Passkey removed from SHUTTL.");
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 0) setData(null);
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </>
      ) : (
        data && (
          <p className="form-help">
            Passkeys need a supported browser and a secure origin. Your password
            and recovery code remain available.
          </p>
        )
      )}
      <InlineError message={error} />
    </section>
  );
}
export function ResearchChoice() {
  const [enabled, setEnabled] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/account/research")
      .then((v) => {
        if (!active) return;
        setEnabled(v.enabled);
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="research-choice">
      <h3>Optional pilot research</h3>
      <p className="form-help">
        Off by default. If enabled, SHUTTL stores when you view home,
        comparisons, history, insights and group recaps, using your account ID.
        Each view type is counted at most once per 15 minutes and kept for 90
        days. No contacts, precise location, names, scores or device fingerprint
        are added to these events. This is research activity, not a measure of
        satisfaction.
      </p>
      <button
        className="button secondary"
        disabled={!ready || busy || loading}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api("/account/research", { enabled: !enabled }, "PUT");
            setEnabled(!enabled);
          } catch (e) {
            setError(errorMessage(e));
            setReady(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        {enabled
          ? "Withdraw and delete my view events"
          : "Opt in to pilot view research"}
      </button>
      <p role="status">
        {loading
          ? "Checking your research choice…"
          : !ready
            ? "Your research choice could not be checked."
            : enabled
              ? "Research participation is on."
              : "Research participation is off."}
      </p>
      {error && !loading && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setAttempt((v) => v + 1)}
        >
          Retry research choice
        </button>
      )}
      <InlineError message={error} />
    </section>
  );
}
export async function recordResearch(kind: string, owner: string) {
  try {
    const consent = await api("/account/research");
    if (consent.enabled && consent.owner === owner)
      await api("/account/research/events", { kind, owner });
  } catch {}
}
