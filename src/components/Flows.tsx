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
  invitationKind = "result",
}: {
  done: (result: any) => void;
  invited?: boolean;
  invitationKind?: "result" | "friendship" | "player";
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
  function changeMode(next: "register" | "login" | "recover") {
    if (busy || mode === next) return;
    setMode(next);
    setError("");
    setCredentials((previous) => ({
      ...previous,
      password: "",
      recoveryCode: "",
    }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
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
              ? invitationKind === "friendship"
                ? "Your invitation stays with you. After signing in, review who invited you and choose whether to request a connection. This does not approve any match."
                : invitationKind === "player"
                  ? "Your private player invitation stays with you. After signing in, review the invited identity before claiming it. Claiming an identity does not approve a match."
                  : "Keep your invitation. After signing in, review the exact score before agreeing."
              : mode === "recover"
                ? "Use the private recovery code you saved when you joined."
                : "Turn confirmed matches into a playing estimate. Compare progress with the people you already play with."}
          </p>
          <div className="auth-tabs">
            <button
              className={mode === "register" ? "active" : ""}
              disabled={busy}
              onClick={() => changeMode("register")}
            >
              Join SHUTTL
            </button>
            <button
              className={mode === "login" ? "active" : ""}
              disabled={busy}
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
          </div>
          <form onSubmit={submit}>
            <fieldset
              disabled={busy}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
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
                    mode === "login"
                      ? "Your password"
                      : "At least 12 characters"
                  }
                />
              </div>
              {mode === "register" && (
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={credentials.adult}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        adult: e.target.checked,
                      })
                    }
                    required
                  />
                  <span>
                    I am 18 or older. I understand that rated play is optional
                    and each player decides whether a result counts.
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
            </fieldset>
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
              disabled={busy}
              onClick={() =>
                changeMode(mode === "recover" ? "login" : "recover")
              }
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
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    setSaved(false);
    setCopied(false);
    setCopyFailed(false);
  }, [code]);
  return (
    <Modal
      title="Keep a way back to your court"
      close={close}
      dismissible={saved}
    >
      <p className="form-help">
        Save this private code somewhere safe. It can recover your account if
        you forget your password. This is the only time the full code is shown.
      </p>
      <textarea
        className="recovery-code"
        aria-label="Private recovery code"
        readOnly
        rows={2}
        value={code}
        onFocus={(event) => event.currentTarget.select()}
        style={{ width: "100%", resize: "none" }}
      />
      <button
        className="button secondary block"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setCopyFailed(false);
          } catch {
            setCopied(false);
            setCopyFailed(true);
          }
        }}
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}Copy recovery code
      </button>
      {copyFailed && (
        <p className="form-help" role="status">
          Automatic copying is unavailable. Tap or focus the code above to
          select it, then use your device’s Copy command and save it privately.
        </p>
      )}
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
  choose: (player: Player) => void | Promise<void>;
  invite?: boolean;
  suggestions?: Player[];
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState(""),
    [searchResult, setSearchResult] = useState<{
      query: string;
      players: Player[];
    }>({ query: "", players: [] }),
    [searchBusy, setSearchBusy] = useState(false),
    [inviteBusy, setInviteBusy] = useState(false),
    [selectBusy, setSelectBusy] = useState(false),
    [error, setError] = useState(""),
    [guest, setGuest] = useState(""),
    [invitePath, setInvitePath] = useState(""),
    [newPlayer, setNewPlayer] = useState<Player | null>(null),
    [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Player[]>(suggestions || []);
  const currentQuery = useRef(query.trim());
  const selecting = useRef(false);
  const search = query.trim();
  const players = searchResult.query === search ? searchResult.players : [];
  const matchingFriends = friends.filter(
    (player) =>
      !search ||
      (player.name + " " + player.username)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const availablePlayers = [...matchingFriends, ...players].filter(
    (player, index, all) =>
      !excludeIds.includes(player.id) &&
      all.findIndex((other) => other.id === player.id) === index,
  );
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
      if (search.length < 2) {
        setSearchResult({ query: search, players: [] });
        setSearchBusy(false);
        return;
      }
      setSearchBusy(true);
      api("/players?q=" + encodeURIComponent(search))
        .then((data) => {
          if (active && currentQuery.current === search) {
            setSearchResult({ query: search, players: data.players });
          }
        })
        .catch((e) => {
          if (active && currentQuery.current === search && !selecting.current)
            setError(errorMessage(e));
        })
        .finally(() => {
          if (active && currentQuery.current === search) setSearchBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  const createGuest = async (e: FormEvent) => {
    e.preventDefault();
    if (inviteBusy || selecting.current) return;
    setInviteBusy(true);
    setError("");
    try {
      const response = await api("/guests", { name: guest });
      setNewPlayer(response.player);
      setInvitePath(location.origin + response.invitePath);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInviteBusy(false);
    }
  };
  async function selectPlayer(player: Player) {
    if (selecting.current || inviteBusy) return;
    selecting.current = true;
    setSelectBusy(true);
    setError("");
    try {
      await choose(player);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      selecting.current = false;
      setSelectBusy(false);
    }
  }
  return (
    <Modal
      title="Find a player"
      close={close}
      dismissible={!inviteBusy && !selectBusy}
    >
      <div className="field">
        <label htmlFor="player-search">Username or public display name</label>
        <input
          id="player-search"
          autoFocus
          type="search"
          autoCapitalize="none"
          placeholder="Try their username"
          value={query}
          disabled={inviteBusy || selectBusy}
          onChange={(e) => {
            const nextSearch = e.target.value.trim();
            setQuery(e.target.value);
            if (currentQuery.current !== nextSearch) {
              currentQuery.current = nextSearch;
              setSearchResult({ query: nextSearch, players: [] });
              setError("");
              setSearchBusy(nextSearch.length >= 2);
            }
          }}
        />
      </div>
      <InlineError message={error} />
      {!query.trim() &&
        friends.filter((p) => !excludeIds.includes(p.id)).length > 0 && (
          <p className="eyebrow">YOUR ACCEPTED FRIENDS</p>
        )}
      <div
        className="lookup-results"
        role="group"
        aria-label="Available players"
        aria-busy={searchBusy || selectBusy}
      >
        {availablePlayers.map((p) => (
          <button
            key={p.id}
            disabled={inviteBusy || selectBusy}
            onClick={() => selectPlayer(p)}
          >
            <Avatar player={p} />
            <span>
              <strong>{p.name}</strong>
              <small>@{p.username}</small>
            </span>
            <Plus size={17} className="result-action" />
          </button>
        ))}
      </div>
      {searchBusy && (
        <p className="form-help" role="status">
          Looking for players…
        </p>
      )}
      {selectBusy && (
        <p className="form-help" role="status">
          Updating this player choice…
        </p>
      )}
      {search.length >= 2 &&
        !availablePlayers.length &&
        !searchBusy &&
        !error && (
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
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={selectBusy}
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
                <button
                  className="button"
                  disabled={selectBusy}
                  onClick={() => selectPlayer(newPlayer)}
                >
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
                  disabled={inviteBusy || selectBusy}
                  onChange={(e) => setGuest(e.target.value)}
                  maxLength={60}
                  required
                />
              </div>
              <button
                className="button secondary block"
                disabled={inviteBusy || selectBusy}
              >
                <UserPlus size={16} />
                {inviteBusy
                  ? "Creating your invitation…"
                  : "Create a private invitation"}
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
  reviewReceived,
  results = [],
  friends = [],
}: {
  me: any;
  category: Category;
  scopes: any[];
  close: () => void;
  done: () => void;
  correction?: any;
  reviewReceived?: (id: string) => void;
  results?: any[];
  friends?: Player[];
}) {
  const storageKey = "shuttl:draft:" + me.id;
  const [saved, setSaved] = useState(() => {
    if (correction) return null;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null");
      return value?.owner === me.id && Date.now() - value.savedAt < 7 * 86400000
        ? value
        : null;
    } catch {
      return null;
    }
  });
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
    [scopeId, setScopeId] = useState<string>(
      correction?.scopeId || saved?.scopeId || "",
    ),
    [requestKey, setRequestKey] = useState(
      saved?.requestKey || crypto.randomUUID(),
    ),
    [unitId, setUnitId] = useState(saved?.unitId || crypto.randomUUID());
  const [pick, setPick] = useState<number | null>(null),
    [acknowledged, setAcknowledged] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submissionUncertain, setSubmissionUncertain] = useState(
      !!saved?.submissionUncertain,
    ),
    [received, setReceived] = useState<any>(null),
    [confirmDiscard, setConfirmDiscard] = useState(false),
    [confirmReceivedRemoval, setConfirmReceivedRemoval] = useState(false);
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
            submissionUncertain,
            savedAt: Date.now(),
          }),
        );
      } catch {
        setError(
          "This browser cannot save a draft. Keep this tab open until the result is sent.",
        );
      }
  }, [
    category,
    format,
    roster,
    scores,
    played,
    scopeId,
    requestKey,
    unitId,
    submissionUncertain,
  ]);
  function removeMatchingDraft() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        stored?.unitId === unitId &&
        JSON.stringify([
          stored.category,
          stored.format,
          stored.roster.map((player: Player | null) => player?.id),
          stored.scores,
          stored.played,
          stored.scopeId,
        ]) === exactDraft
      )
        localStorage.removeItem(storageKey);
    } catch {
      /* A draft changed in another tab is kept. */
    }
  }
  function discardDraft() {
    if (busy || submissionUncertain || received) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      setError(
        "This browser could not remove the saved draft. Keep it until browser storage is available again.",
      );
      return;
    }
    setSaved(null);
    setCategory(initialCategory);
    setFormat("ONE_21");
    setRoster([
      me,
      null,
      ...(initialCategory === "Singles" ? [] : [null, null]),
    ]);
    setScores([["", ""]]);
    setPlayed(localDate(new Date()));
    setScopeId("");
    setAcknowledged("");
    setRequestKey(crypto.randomUUID());
    setUnitId(crypto.randomUUID());
    setError("");
    setConfirmDiscard(false);
  }
  async function checkReceipt() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setReceived(await api("/results/" + unitId));
    } catch {
      setError(
        "The submission status is still unconfirmed. Keep this draft and its original identifier; reconnect and check again or resend it safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  function removeReceivedDraft() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored && stored.unitId !== unitId) {
        setError(
          "Another saved draft is now on this device. It has been kept; close this view without removing it.",
        );
        return;
      }
      localStorage.removeItem(storageKey);
      close();
    } catch {
      setError(
        "This browser could not remove the local draft. The recorded match remains safe in SHUTTL.",
      );
    }
  }
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
    if (busy || received) return;
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
      if (!navigator.onLine) {
        setError(
          submissionUncertain
            ? "You are offline. This retry was not sent; the earlier submission may already have reached SHUTTL. Keep this draft and reconnect to check it."
            : "You are offline. This attempt was not sent. Your local draft stays on this device; reconnect and send it when ready.",
        );
        return;
      }
      setBusy(true);
      if (!correction) setSubmissionUncertain(true);
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
      if (!correction) removeMatchingDraft();
      done();
    } catch (e) {
      if (!correction && e instanceof ApiError && [0, 409].includes(e.status)) {
        try {
          setReceived(await api("/results/" + unitId));
          setError("");
        } catch {
          setError(
            "This submission has not been confirmed. It may already have reached SHUTTL. Keep this draft and its original identifier; reconnect to check or resend safely.",
          );
        }
      } else {
        if (
          !correction &&
          !submissionUncertain &&
          e instanceof ApiError &&
          e.status >= 400 &&
          e.status < 500
        )
          setSubmissionUncertain(false);
        setError(errorMessage(e));
      }
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
        dismissible={!busy}
        wide
      >
        <p className="form-help">
          {correction
            ? "The previous rating stays visible until the correction has the required fresh approvals."
            : "One completed match. All players choose rated play, then the exact score is approved."}
        </p>
        {received && (
          <div className="notice neutral" role="status">
            <strong>This match already reached SHUTTL.</strong>
            <p>
              {received.players
                .slice(0, received.players.length / 2)
                .map((player: Player) => player.name)
                .join(" + ")}
              {" vs "}
              {received.players
                .slice(received.players.length / 2)
                .map((player: Player) => player.name)
                .join(" + ")}
              {" · "}
              {received.category}
              {" · "}
              {FORMATS[received.format as Format].label}
            </p>
            <ScoreGames games={received.games} />
            <p>
              {received.status === "rated"
                ? "Rating published."
                : received.status === "confirmed"
                  ? "Score confirmed; rating processing."
                  : received.status === "disputed"
                    ? "Under independent review."
                    : received.status === "void"
                      ? "This result is unrated."
                      : received.status === "correction_pending"
                        ? "A correction is waiting for fresh approval."
                        : "Waiting for exact-score approval."}{" "}
              These are the current recorded values. Your local draft is kept;
              review this result rather than sending another copy.
            </p>
            {reviewReceived && (
              <button
                type="button"
                className="button secondary"
                onClick={() => reviewReceived(received.id)}
              >
                Review received result
                <ArrowRight size={16} />
              </button>
            )}
            {confirmReceivedRemoval ? (
              <>
                <p>
                  Remove this local copy? The recorded match stays in SHUTTL.
                  Any changes in this local draft will be lost; they will not be
                  sent as another match.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setConfirmReceivedRemoval(false)}
                  >
                    Keep local draft
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={removeReceivedDraft}
                  >
                    Remove local draft and close
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmReceivedRemoval(true)}
              >
                Remove local draft only
              </button>
            )}
          </div>
        )}
        {!correction && submissionUncertain && !received && (
          <div className="notice neutral">
            <strong>Check this submission before starting another.</strong>
            <p>
              This draft may already have reached SHUTTL. Its original
              identifier is retained to prevent a duplicate when you retry.
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={checkReceipt}
            >
              Check submission status
            </button>
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset
            disabled={busy || !!received}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {!correction && !submissionUncertain && recent.length > 0 && (
              <details className="recent-rosters">
                <summary>Use a recent lineup</summary>
                <p className="form-help">
                  Use the same players and sides. This replaces the unsent
                  lineup and clears its scores. Enter a fresh score and start
                  time; every match still needs approval.
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
                {correction
                  ? "Corrections require fresh exact-score approval."
                  : scopeId
                    ? "Prior consent and score approval stay separate."
                    : "Every player approves this retrospective result."}
              </strong>
              <p>
                {correction
                  ? "The changed score or format needs fresh approval. An earlier agreement only applies if it still covers this match; otherwise every player must approve."
                  : scopeId
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
                : submissionUncertain
                  ? "This local copy stays on this device for seven days. Its presence does not tell you whether SHUTTL already received the match."
                  : "An unsent draft stays on this device for seven days. It never changes a rating."}
            </p>
            {!correction &&
              !submissionUncertain &&
              !received &&
              (saved ||
                roster.some((player, index) => index > 0 && player) ||
                scores.some((game) => game.some(Boolean))) &&
              (confirmDiscard ? (
                <div className="notice neutral">
                  <strong>Discard this local draft?</strong>
                  <p>
                    It has not been submitted. No rating or recorded result will
                    change.
                  </p>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setConfirmDiscard(false)}
                    >
                      Keep draft
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={discardDraft}
                    >
                      Discard draft and start fresh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setConfirmDiscard(true)}
                >
                  Discard local draft
                </button>
              ))}
          </fieldset>
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
    if (busy) return;
    setError("");
    try {
      if (roster.some((p) => !p)) throw new Error("Choose every player.");
      if (new Set(roster.map((player) => player!.id)).size !== roster.length)
        throw new Error("Each player can appear only once.");
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
      <Modal
        title="Agree before you play"
        close={close}
        dismissible={!busy}
        wide
      >
        <p className="form-help">
          Every player chooses for themselves. The same four may rotate teams
          within a covered doubles or mixed agreement.
        </p>
        <form onSubmit={submit}>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
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
                Each other player must choose separately. I can stop future
                rated play.
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
          </fieldset>
        </form>
      </Modal>
      {pick !== null && (
        <PlayerLookup
          excludeIds={roster.filter(Boolean).map((player) => player!.id)}
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
