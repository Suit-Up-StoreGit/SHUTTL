import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Plus,
  Search,
  X,
  Copy,
  Check,
  UserPlus,
} from "lucide-react";
import {
  api,
  ApiError,
  errorMessage,
  dateLabel,
  dateTimeLabel,
} from "../api.ts";
import { recentRosters } from "../experience.ts";
import { ResultReward } from "./Progress.tsx";
import { Encouragement } from "./Community.tsx";
import { startAuthentication } from "@simplewebauthn/browser";
import { passkeysSupported } from "./Preferences.tsx";
import {
  CATEGORIES,
  FORMATS,
  validateGames,
  type Category,
  type Format,
  type Player,
  type Game,
} from "../domain.ts";
import { Avatar, Brand, Modal, InlineError, ScoreGames } from "./UI.tsx";
export function Auth({
  done,
  invited = false,
}: {
  done: (result: any) => void;
  invited?: boolean;
}) {
  const [mode, setMode] = useState<"register" | "login" | "recover">(
      "register",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState({
    username: "",
    name: "",
    password: "",
    adult: false,
    recoveryCode: "",
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload =
        mode === "register"
          ? {
              username: credentials.username,
              name: credentials.name,
              password: credentials.password,
              adult: credentials.adult,
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            }
          : mode === "recover"
            ? {
                username: credentials.username,
                password: credentials.password,
                recoveryCode: credentials.recoveryCode,
              }
            : {
                username: credentials.username,
                password: credentials.password,
              };
      done(
        await api(
          "/auth/" +
            (mode === "login"
              ? "login"
              : mode === "recover"
                ? "recover"
                : "register"),
          payload,
        ),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Brand />
        <h1>
          Your game.
          <br />
          Your people.
          <br />
          <span>Your next level.</span>
        </h1>
        <p>
          A badminton identity earned on the court. Track your progress, compare
          your circle, and make every confirmed result count.
        </p>
        <div className="story-bottom">
          SINGLES / DOUBLES / MIXED
          <br />
          NO SHORTCUTS. JUST YOUR GAME.
        </div>
      </section>
      <main className="auth-form">
        <div className="auth-inner">
          <div className="mobile-brand">
            <Brand />
          </div>
          <h2>
            {mode === "login"
              ? "Welcome back."
              : mode === "recover"
                ? "Back to your court."
                : "Know your game."}
          </h2>
          <p className="auth-intro">
            {invited
              ? "Keep your invitation. After signing in, review the exact score before agreeing."
              : mode === "recover"
                ? "Use the private recovery code you saved when you joined."
                : "Turn confirmed matches into a playing estimate. Compare progress with the people you already play with."}
          </p>
          <div className="auth-tabs">
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Join SHUTTL
            </button>
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
          </div>
          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="signup-name">Your display name</label>
                <input
                  id="signup-name"
                  autoComplete="nickname"
                  value={credentials.name}
                  onChange={(e) =>
                    setCredentials({ ...credentials, name: e.target.value })
                  }
                  maxLength={60}
                  required
                  placeholder="What your circle calls you"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={credentials.username}
                onChange={(e) =>
                  setCredentials({ ...credentials, username: e.target.value })
                }
                minLength={3}
                maxLength={24}
                required
                placeholder="Choose your court identity"
              />
            </div>
            {mode === "recover" && (
              <div className="field">
                <label htmlFor="recovery-code">Private recovery code</label>
                <input
                  id="recovery-code"
                  autoComplete="off"
                  value={credentials.recoveryCode}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      recoveryCode: e.target.value,
                    })
                  }
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="signup-password">
                {mode === "recover" ? "New password" : "Password"}
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={credentials.password}
                onChange={(e) =>
                  setCredentials({ ...credentials, password: e.target.value })
                }
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                required
                placeholder={
                  mode === "login" ? "Your password" : "At least 12 characters"
                }
              />
            </div>
            {mode === "register" && (
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={credentials.adult}
                  onChange={(e) =>
                    setCredentials({ ...credentials, adult: e.target.checked })
                  }
                  required
                />
                <span>
                  I am 18 or older. I understand that rated play is optional and
                  each player decides whether a result counts.
                </span>
              </label>
            )}
            <InlineError message={error} />
            <button className="button block" disabled={busy}>
              {busy
                ? "Getting your court ready…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "recover"
                    ? "Recover my account"
                    : "Create my player identity"}
              <ArrowRight size={17} />
            </button>
          </form>
          {passkeysSupported() && (
            <button
              className="button secondary block"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const options = await api("/auth/passkey/options", {});
                  const response = await startAuthentication({
                    optionsJSON: options.options,
                  });
                  done(await api("/auth/passkey/verify", { response }));
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign in with a passkey
            </button>
          )}
          {mode !== "register" && (
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "recover" ? "login" : "recover");
                setError("");
              }}
            >
              {mode === "recover"
                ? "Return to sign in"
                : "Use my recovery code"}
            </button>
          )}
          <p className="auth-footer">
            For players aged 18 and over. Singles, Doubles and Mixed stay
            separate. Accepted friends see your name and confirmed activity.
            Public identity and declared local-area sharing are optional. No
            precise location is collected.
          </p>
          <p className="auth-footer">
            Founded by Featherballer. Built around the people already on your
            court.
          </p>
        </div>
      </main>
    </div>
  );
}
export function RecoveryCode({
  code,
  close,
}: {
  code: string;
  close: () => void;
}) {
  const [saved, setSaved] = useState(false),
    [copied, setCopied] = useState(false);
  return (
    <Modal title="Keep a way back to your court" close={close}>
      <p className="form-help">
        Save this private code somewhere safe. It can recover your account if
        you forget your password. This is the only time the full code is shown.
      </p>
      <div className="recovery-code">{code}</div>
      <button
        className="button secondary block"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}Copy recovery code
      </button>
      <label className="check-line">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>I have saved my recovery code privately.</span>
      </label>
      <button className="button block" disabled={!saved} onClick={close}>
        Continue to my court
        <ArrowRight size={16} />
      </button>
    </Modal>
  );
}
export function PlayerLookup({
  close,
  choose,
  invite = true,
  suggestions,
  excludeIds = [],
}: {
  close: () => void;
  choose: (player: Player) => void;
  invite?: boolean;
  suggestions?: Player[];
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState(""),
    [players, setPlayers] = useState<Player[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [guest, setGuest] = useState(""),
    [invitePath, setInvitePath] = useState(""),
    [newPlayer, setNewPlayer] = useState<Player | null>(null),
    [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Player[]>(suggestions || []);
  useEffect(() => {
    if (suggestions) {
      setFriends(suggestions);
      return;
    }
    let active = true;
    api("/dashboard")
      .then((d) => {
        if (active) setFriends(d.friends);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [suggestions]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setPlayers([]);
        setBusy(false);
        return;
      }
      setBusy(true);
      api("/players?q=" + encodeURIComponent(query.trim()))
        .then((data) => {
          if (active) {
            setPlayers(data.players);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  const createGuest = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/guests", { name: guest });
      setNewPlayer(response.player);
      setInvitePath(location.origin + response.invitePath);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Find a player" close={close}>
      <div className="field">
        <label htmlFor="player-search">Username or public display name</label>
        <input
          id="player-search"
          autoFocus
          type="search"
          autoCapitalize="none"
          placeholder="Try their username"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setBusy(e.target.value.trim().length >= 2);
          }}
        />
      </div>
      <InlineError message={error} />
      {!query.trim() &&
        friends.filter((p) => !excludeIds.includes(p.id)).length > 0 && (
          <p className="eyebrow">YOUR ACCEPTED FRIENDS</p>
        )}
      <div className="lookup-results">
        {(query.trim().length >= 2
          ? [
              ...friends.filter((p) =>
                (p.name + " " + p.username)
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              ),
              ...players,
            ]
          : friends
        )
          .filter(
            (p, i, all) =>
              !excludeIds.includes(p.id) &&
              all.findIndex((v) => v.id === p.id) === i,
          )
          .map((p) => (
            <button key={p.id} onClick={() => choose(p)}>
              <Avatar player={p} />
              <span>
                <strong>{p.name}</strong>
                <small>@{p.username}</small>
              </span>
              <Plus size={17} className="result-action" />
            </button>
          ))}
      </div>
      {busy && (
        <p className="form-help" role="status">
          Looking for players…
        </p>
      )}
      {query.length >= 2 &&
        !players.length &&
        !friends.some((p) =>
          (p.name + " " + p.username)
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        ) &&
        !busy && (
          <p className="form-help">
            No available profiles match that search. Try their exact username.
          </p>
        )}
      {invite && (
        <>
          <hr />
          <h3>They have not joined yet?</h3>
          <p className="form-help">
            Create a private invitation using a nickname. You will verify who
            claims it. Their exact score still needs their own approval.
          </p>
          {newPlayer ? (
            <>
              <div className="notice">
                <strong>{newPlayer.name} is invited</strong>
                <p>
                  Copy the private link and share it directly with this player.
                </p>
              </div>
              <input
                aria-label="Private invitation link"
                readOnly
                value={invitePath}
              />
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invitePath);
                      setCopied(true);
                    } catch {
                      setError("Copy the selected invitation link manually.");
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                  <Copy size={15} />
                </button>
                <button className="button" onClick={() => choose(newPlayer)}>
                  Use this player
                  <Check size={16} />
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={createGuest}>
              <div className="field">
                <label htmlFor="guest-name">Invited player’s nickname</label>
                <input
                  id="guest-name"
                  value={guest}
                  onChange={(e) => setGuest(e.target.value)}
                  maxLength={60}
                  required
                />
              </div>
              <button className="button secondary block" disabled={busy}>
                <UserPlus size={16} />
                Create a private invitation
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
function RosterEditor({
  roster,
  category,
  setRoster,
  pick,
}: {
  roster: (Player | null)[];
  category: Category;
  setRoster: (players: (Player | null)[]) => void;
  pick: (index: number) => void;
}) {
  const labels =
    category === "Singles"
      ? ["Your player", "Opponent"]
      : ["Your player", "Your partner", "Opponent", "Opponent’s partner"];
  return (
    <div className="player-picker">
      {roster.map((p, i) => (
        <div key={i}>
          {<label>{labels[i]}</label>}
          {p ? (
            <div className="picked-player">
              <Avatar player={p} small />
              <span>
                {p.name}
                <small>
                  {i === 0
                    ? "You"
                    : p.guest
                      ? "Private invitation"
                      : "@" + p.username}
                </small>
              </span>
              {i !== 0 && (
                <button
                  type="button"
                  aria-label={"Change " + labels[i]}
                  onClick={() => {
                    const next = [...roster];
                    next[i] = null;
                    setRoster(next);
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            <button
              className="picker-empty"
              onClick={() => pick(i)}
              type="button"
            >
              <Plus size={16} />
              Choose player
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
export function RecordResult({
  me,
  category: initialCategory,
  scopes,
  close,
  done,
  correction,
  results = [],
  friends = [],
}: {
  me: any;
  category: Category;
  scopes: any[];
  close: () => void;
  done: () => void;
  correction?: any;
  results?: any[];
  friends?: Player[];
}) {
  const storageKey = "shuttl:draft:" + me.id;
  const saved = (() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null");
      return value?.owner === me.id && Date.now() - value.savedAt < 7 * 86400000
        ? value
        : null;
    } catch {
      return null;
    }
  })();
  const [category, setCategory] = useState<Category>(
      correction?.category || saved?.category || initialCategory,
    ),
    [format, setFormat] = useState<Format>(
      correction?.format || saved?.format || "ONE_21",
    );
  const [roster, setRoster] = useState<(Player | null)[]>(
    correction?.players ||
      saved?.roster || [
        me,
        null,
        ...(initialCategory === "Singles" ? [] : [null, null]),
      ],
  );
  const [scores, setScores] = useState<string[][]>(
    correction?.games.map((g: number[]) => g.map(String)) ||
      saved?.scores || [["", ""]],
  );
  const [played, setPlayed] = useState(
      correction?.playedAt
        ? localDate(new Date(correction.playedAt))
        : saved?.played || localDate(new Date()),
    ),
    [scopeId, setScopeId] = useState<string>(saved?.scopeId || ""),
    [requestKey] = useState(saved?.requestKey || crypto.randomUUID()),
    [unitId] = useState(saved?.unitId || crypto.randomUUID());
  const [pick, setPick] = useState<number | null>(null),
    [acknowledged, setAcknowledged] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const exactDraft = JSON.stringify([
    category,
    format,
    roster.map((p) => p?.id),
    scores,
    played,
    scopeId,
  ]);
  const agree = acknowledged === exactDraft;
  useEffect(() => {
    if (!correction)
      try {
        if (
          !roster.some((player, index) => index > 0 && player) &&
          !scores.some((game) => game.some((score) => score !== ""))
        ) {
          localStorage.removeItem(storageKey);
          return;
        }
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            owner: me.id,
            category,
            format,
            roster,
            scores,
            played,
            scopeId,
            requestKey,
            unitId,
            savedAt: Date.now(),
          }),
        );
      } catch {
        setError(
          "This browser cannot save a draft. Keep this tab open until the result is sent.",
        );
      }
  }, [category, format, roster, scores, played, scopeId, requestKey, unitId]);
  function changeFormat(value: Format) {
    setFormat(value);
    setScores((previous) =>
      FORMATS[value].series
        ? previous.length === 1
          ? [previous[0], ["", ""]]
          : previous
        : previous.slice(0, 1),
    );
    setScopeId("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (scores.some((g) => g.some((v) => !/^\d{1,2}$/.test(v))))
        throw new Error("Enter a whole score for both sides of every game.");
      const games = scores.map((g) => g.map(Number)) as Game[];
      validateGames(format, games);
      if (roster.some((p) => !p))
        throw new Error("Choose every player on both sides.");
      if (new Set(roster.map((p) => p!.id)).size !== roster.length)
        throw new Error("Each player can appear only once.");
      if (!agree)
        throw new Error(
          "Choose whether this exact result should count toward your rating.",
        );
      setBusy(true);
      if (correction)
        await api("/results/" + correction.id + "/correct", {
          revisionId: correction.revisionId,
          format,
          games,
          agree: true,
        });
      else
        await api(
          "/results",
          {
            unitId,
            category,
            format,
            roster: roster.map((p) => p!.id),
            games,
            playedAt: new Date(played).toISOString(),
            scopeId: scopeId || null,
            agree: true,
          },
          "POST",
          requestKey,
        );
      if (!correction) localStorage.removeItem(storageKey);
      done();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 0
          ? "You are offline. Your unsent result stays a local draft on this device. Reconnect and send it again."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const recent = recentRosters(results, me, category);
  const applicable = scopes.filter(
    (s) =>
      s.category === category &&
      s.format === format &&
      JSON.stringify(s.players.map((p: Player) => p.id).sort()) ===
        JSON.stringify(
          roster
            .map((p) => p?.id)
            .filter(Boolean)
            .sort(),
        ),
  );
  return (
    <>
      <Modal
        title={correction ? "Correct the exact score" : "Record a result"}
        close={close}
        wide
      >
        <p className="form-help">
          {correction
            ? "The previous rating stays visible until the correction has the required fresh approvals."
            : "One completed match. All players choose rated play, then the exact score is approved."}
        </p>
        <form onSubmit={submit}>
          {!correction && !saved && recent.length > 0 && (
            <details className="recent-rosters">
              <summary>Use a recent lineup</summary>
              <p className="form-help">
                Same players and sides. Enter a fresh score and start time;
                every match still needs approval.
              </p>
              {recent.map((r, i) => (
                <button
                  type="button"
                  className="roster-shortcut"
                  key={i}
                  onClick={() => {
                    setRoster(r.roster);
                    changeFormat(r.format);
                    setScores(
                      FORMATS[r.format as Format].series
                        ? [
                            ["", ""],
                            ["", ""],
                          ]
                        : [["", ""]],
                    );
                    setPlayed(localDate(new Date()));
                    setAcknowledged("");
                  }}
                >
                  {r.roster
                    .slice(0, r.roster.length / 2)
                    .map((p: Player) => (p.id === me.id ? "You" : p.name))
                    .join(" + ")}{" "}
                  <span>vs</span>{" "}
                  {r.roster
                    .slice(r.roster.length / 2)
                    .map((p: Player) => p.name)
                    .join(" + ")}
                </button>
              ))}
            </details>
          )}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="result-category">Category</label>
              <select
                id="result-category"
                disabled={!!correction}
                value={category}
                onChange={(e) => {
                  const c = e.target.value as Category;
                  setCategory(c);
                  setRoster([
                    me,
                    null,
                    ...(c === "Singles" ? [] : [null, null]),
                  ]);
                  setScopeId("");
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="result-format">Played format</label>
              <select
                id="result-format"
                value={format}
                onChange={(e) => changeFormat(e.target.value as Format)}
              >
                {Object.entries(FORMATS).map(([key, f]) => (
                  <option key={key} value={key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {correction ? (
            <div className="team-row">
              <div>
                Side A<br />
                {roster
                  .slice(0, roster.length / 2)
                  .map((p) => p?.name)
                  .join(" + ")}
              </div>
              <div>
                Side B<br />
                {roster
                  .slice(roster.length / 2)
                  .map((p) => p?.name)
                  .join(" + ")}
              </div>
            </div>
          ) : (
            <RosterEditor
              roster={roster}
              category={category}
              setRoster={setRoster}
              pick={setPick}
            />
          )}
          {scores.map((g, i) => (
            <div className="score-inputs" key={i}>
              <div className="game-label">Completed game {i + 1}</div>
              <div>
                {g.map((v, side) => (
                  <div key={side}>
                    <label htmlFor={`score-${i}-${side}`}>
                      {correction
                        ? side === 0
                          ? "Side A"
                          : "Side B"
                        : side === 0
                          ? "Your side"
                          : "Other side"}
                    </label>
                    <input
                      id={`score-${i}-${side}`}
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      value={v}
                      onChange={(e) =>
                        setScores(
                          scores.map((game, j) =>
                            j === i
                              ? game.map((x, k) =>
                                  k === side ? e.target.value : x,
                                )
                              : game,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {FORMATS[format].series && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setScores(
                  scores.length === 2
                    ? [...scores, ["", ""]]
                    : scores.slice(0, 2),
                )
              }
            >
              {scores.length === 2
                ? "Add the deciding third game"
                : "Remove the third game"}
            </button>
          )}
          {!correction && (
            <>
              <div className="field">
                <label htmlFor="result-time">Started at</label>
                <input
                  type="datetime-local"
                  step="1"
                  id="result-time"
                  value={played}
                  onChange={(e) => setPlayed(e.target.value)}
                  required
                />
                <p className="form-help">
                  Time entered in your device’s timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}. Review
                  shows your profile timezone.
                </p>
              </div>
              <div className="field">
                <label htmlFor="result-scope">Earlier rated agreement</label>
                <select
                  id="result-scope"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                >
                  <option value="">
                    No earlier agreement · everyone approves
                  </option>
                  {applicable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {dateLabel(s.starts)} · {s.accepted.length}/
                      {s.players.length} agreed
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="notice neutral">
            <strong>
              {scopeId
                ? "Prior consent and score approval stay separate."
                : "Every player approves this retrospective result."}
            </strong>
            <p>
              {scopeId
                ? "When the earlier agreement covers this match, one eligible opponent confirms the exact score. Otherwise every player must approve."
                : "Without an earlier all-player agreement, each player must approve the exact score and its rated status. Silence never changes a rating."}
            </p>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) =>
                setAcknowledged(e.target.checked ? exactDraft : "")
              }
              required
            />
            <span>
              I confirm these sides and scores, and agree that this exact
              completed result counts toward my rating.
            </span>
          </label>
          <InlineError message={error} />
          <button className="button block" disabled={busy}>
            {busy
              ? "Saving your result…"
              : correction
                ? "Propose correction"
                : "Send for exact-score approval"}
            <ArrowRight size={16} />
          </button>
          <p className="form-help">
            {correction
              ? "Changed values require fresh approvals."
              : "An unsent draft stays on this device for seven days. It never changes a rating."}
          </p>
        </form>
      </Modal>
      {pick !== null && (
        <PlayerLookup
          suggestions={friends}
          excludeIds={roster.filter(Boolean).map((p) => p!.id)}
          close={() => setPick(null)}
          choose={(p) => {
            setRoster(roster.map((current, i) => (i === pick ? p : current)));
            setPick(null);
          }}
        />
      )}
    </>
  );
}
export function AgreementForm({
  me,
  close,
  done,
}: {
  me: any;
  close: () => void;
  done: () => void;
}) {
  const [category, setCategory] = useState<Category>("Doubles"),
    [format, setFormat] = useState<Format>("ONE_21"),
    [roster, setRoster] = useState<(Player | null)[]>([me, null, null, null]),
    [pick, setPick] = useState<number | null>(null),
    [recurring, setRecurring] = useState(false),
    [acknowledgedAgreement, setAcknowledgedAgreement] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const agreementKey = JSON.stringify([
    category,
    format,
    roster.map((p) => p?.id),
    recurring,
  ]);
  const agree = acknowledgedAgreement === agreementKey;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (roster.some((p) => !p)) throw new Error("Choose every player.");
      if (!agree) throw new Error("Choose whether you agree to rated play.");
      setBusy(true);
      const starts = new Date(),
        ends = new Date(
          starts.getTime() + (recurring ? 30 * 86400000 : 8 * 3600000),
        );
      await api("/scopes", {
        category,
        format,
        roster: roster.map((p) => p!.id),
        starts: starts.toISOString(),
        ends: ends.toISOString(),
        agree: true,
      });
      done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal title="Agree before you play" close={close} wide>
        <p className="form-help">
          Every player chooses for themselves. The same four may rotate teams
          within a covered doubles or mixed agreement.
        </p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="agreement-category">Category</label>
              <select
                id="agreement-category"
                value={category}
                onChange={(e) => {
                  const c = e.target.value as Category;
                  setCategory(c);
                  setRoster([
                    me,
                    null,
                    ...(c === "Singles" ? [] : [null, null]),
                  ]);
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="agreement-format">Format</label>
              <select
                id="agreement-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                {Object.entries(FORMATS).map(([key, f]) => (
                  <option value={key} key={key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <RosterEditor
            roster={roster}
            category={category}
            setRoster={setRoster}
            pick={setPick}
          />
          <div className="field">
            <label htmlFor="agreement-length">Agreement length</label>
            <select
              id="agreement-length"
              value={recurring ? "recurring" : "session"}
              onChange={(e) => setRecurring(e.target.value === "recurring")}
            >
              <option value="session">This session · next 8 hours</option>
              <option value="recurring">
                Same players and format · 30 days
              </option>
            </select>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) =>
                setAcknowledgedAgreement(e.target.checked ? agreementKey : "")
              }
              required
            />
            <span>
              I agree that covered completed matches count toward my rating.
              Each other player must choose separately. I can stop future rated
              play.
            </span>
          </label>
          <InlineError message={error} />
          <button className="button block" disabled={busy}>
            {busy
              ? "Creating your agreement…"
              : "Create agreement and accept for myself"}
          </button>
          <p className="form-help">
            A different player, category or format needs a new agreement.
            Revocation does not erase matches already started under a valid
            agreement.
          </p>
        </form>
      </Modal>
      {pick !== null && (
        <PlayerLookup
          close={() => setPick(null)}
          choose={(p) => {
            setRoster(roster.map((v, i) => (i === pick ? p : v)));
            setPick(null);
          }}
        />
      )}
    </>
  );
}
export function ResultReview({
  result,
  close,
  refresh,
  correct,
  share,
}: {
  result: any;
  close: () => void;
  refresh: () => void;
  correct: (r: any) => void;
  share?: () => void;
}) {
  const [acknowledgedRevision, setAcknowledgedRevision] = useState(""),
    [disputing, setDisputing] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lastRevision = useRef(result.revisionId);
  const [revisionChanged, setRevisionChanged] = useState(false);
  const agree = acknowledgedRevision === result.revisionId;
  useEffect(() => {
    if (lastRevision.current !== result.revisionId) {
      lastRevision.current = result.revisionId;
      setAcknowledgedRevision("");
      setRevisionChanged(true);
      setDisputing(false);
    }
  }, [result.revisionId]);
  const approved = result.approvals.includes(result.ownParticipant),
    size = result.players.length / 2;
  const ownIndex = result.players.findIndex(
      (p: Player) => p.id === result.ownParticipant,
    ),
    authorIndex = result.players.findIndex(
      (p: Player) => p.id === (result.authorParticipant || result.author.id),
    ),
    opposite = ownIndex < size !== authorIndex < size;
  const canApprove =
    ["pending", "correction_pending"].includes(result.status) &&
    !approved &&
    (result.retrospective || opposite);
  const awaiting = result.players.filter(
    (p: Player, i: number) =>
      !result.approvals.includes(p.id) &&
      (result.retrospective || i < size !== authorIndex < size),
  );
  async function action(type: "approve" | "dispute") {
    if (type === "approve" && acknowledgedRevision !== result.revisionId)
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/results/" + result.id + "/" + type,
        type === "approve"
          ? { revisionId: result.revisionId, agree: true }
          : { revisionId: result.revisionId, reason },
      );
      refresh();
      setDisputing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        result.status === "rated"
          ? "Your confirmed result"
          : "Review the exact result"
      }
      close={close}
      wide
    >
      <div className="result-top">
        <span>
          {result.category} · {FORMATS[result.format as Format].label}
        </span>
        <span>{dateTimeLabel(result.playedAt)}</span>
      </div>
      <div className="team-row">
        <div>
          {result.players
            .slice(0, size)
            .map((p: Player) => p.name)
            .join(" + ")}
        </div>
        <div>
          {result.players
            .slice(size)
            .map((p: Player) => p.name)
            .join(" + ")}
        </div>
      </div>
      <ScoreGames games={result.games} />
      {revisionChanged && (
        <div className="notice revision-notice" role="alert">
          <strong>
            The score has changed to revision {result.revisionNumber}.
          </strong>
          <p>
            Your earlier acknowledgement was cleared. Read these sides and
            scores again before approving.
          </p>
        </div>
      )}
      <ResultReward result={result} share={share} />
      <Encouragement result={result} />
      {result.publishedResult && (
        <div className="notice neutral">
          <strong>The earlier approved score still counts</strong>
          <p>
            {result.publishedResult.games
              .map((g: number[]) => g.join("–"))
              .join(" / ")}{" "}
            · {FORMATS[result.publishedResult.format as Format].label}. This
            proposed correction needs fresh approval before ratings change.
          </p>
        </div>
      )}
      <div className="notice">
        <strong>
          {result.status === "rated"
            ? "Rating published"
            : result.status === "confirmed"
              ? "Score confirmed · rating processing"
              : result.status === "disputed"
                ? "Under independent review"
                : result.status === "void"
                  ? "Unrated result"
                  : result.retrospective
                    ? "All-player exact approval required"
                    : "One eligible opponent confirms this exact revision"}
        </strong>
        <p>
          {result.status === "confirmed"
            ? "Your score approval is recorded. Final ratings appear after processing."
            : result.status === "disputed"
              ? "A review does not automatically create a winner or erase a published loss."
              : `${result.approvals.length} of ${result.players.length} players approved. ${result.retrospective ? "Every player must also agree to rated status." : "All players agreed to rated play before this covered match."}`}
        </p>
      </div>
      <p className="form-help">
        {["pending", "correction_pending"].includes(result.status) &&
          awaiting.length > 0 && (
            <>
              <strong>
                {result.retrospective
                  ? "Waiting for "
                  : "An eligible opponent can confirm: "}
                {awaiting.map((p: Player) => p.name).join(", ")}.
              </strong>
              <br />
            </>
          )}
        Submitted by {result.author.name}. Revision {result.revisionNumber}.
        Correcting or disputing an incorrect score does not hurt your response
        record.
      </p>
      <InlineError message={error} />
      {canApprove && (
        <>
          <label className="check-line">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) =>
                setAcknowledgedRevision(
                  e.target.checked ? result.revisionId : "",
                )
              }
            />
            <span>
              These are the correct sides, scores and rated status. I approve
              this exact revision.
            </span>
          </label>
          <button
            className="button block"
            disabled={!agree || busy}
            onClick={() => action("approve")}
          >
            Confirm this exact score
            <Check size={16} />
          </button>
        </>
      )}
      {approved &&
        ["pending", "correction_pending"].includes(result.status) && (
          <p className="form-help">
            Your approval is recorded. Other required players still need to
            respond.
          </p>
        )}
      {!["disputed", "confirmed"].includes(result.status) && (
        <div className="modal-actions">
          {result.status !== "void" && (
            <button
              className="button secondary"
              onClick={() => correct(result)}
            >
              Correct the score
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => setDisputing(true)}
          >
            {result.status === "void"
              ? "Appeal this decision"
              : "Ask for review"}
          </button>
        </div>
      )}
      {disputing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action("dispute");
          }}
        >
          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="dispute-reason">What needs reviewing?</label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={8}
              maxLength={1500}
              required
              placeholder="Explain the score, roster or consent issue. This stays private."
            />
          </div>
          <button className="button secondary block" disabled={busy}>
            Submit private review request
          </button>
        </form>
      )}
    </Modal>
  );
}
