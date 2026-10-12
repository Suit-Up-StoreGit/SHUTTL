import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import { recentRosters, canReviewResult } from "../experience.ts";
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
  const [uncertainAccount, setUncertainAccount] = useState(false);
  const [usingPasskey, setUsingPasskey] = useState(false);
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
    setUncertainAccount(false);
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
    setUncertainAccount(false);
    if (!navigator.onLine) {
      setError(
        "You are offline. This attempt was not sent. Reconnect, then try again.",
      );
      return;
    }
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
      const uncertain =
        error instanceof ApiError && error.status === 0 && mode !== "login";
      setUncertainAccount(uncertain);
      setError(
        uncertain
          ? mode === "recover"
            ? "The recovery response was interrupted. Your new password may already be active, and the previous recovery code may have been used. Sign in with the new password you just chose, then generate and save a fresh recovery code in your account settings."
            : "The registration response was interrupted. Your account may already exist. Sign in with the username and password you just chose before creating another identity. Once signed in, generate and save a recovery code in your account settings."
          : errorMessage(error),
      );
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
              {uncertainAccount && (
                <button
                  type="button"
                  className="button secondary block"
                  onClick={() => changeMode("login")}
                >
                  Sign in to check this account
                </button>
              )}
              <button className="button block" disabled={busy}>
                {busy
                  ? usingPasskey
                    ? "Checking your passkey…"
                    : mode === "login"
                      ? "Signing you in…"
                      : mode === "recover"
                        ? "Recovering your account…"
                        : "Creating your player identity…"
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
                setUsingPasskey(true);
                setError("");
                setUncertainAccount(false);
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
                  setUsingPasskey(false);
                }
              }}
            >
              {usingPasskey
                ? "Checking your passkey…"
                : "Sign in with a passkey"}
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
  ownerId,
  title = "Find a player",
  intro,
}: {
  close: () => void;
  choose: (player: Player) => void | Promise<void>;
  invite?: boolean;
  suggestions?: Player[];
  excludeIds?: string[];
  ownerId?: string;
  title?: string;
  intro?: string;
}) {
  type GuestAttempt = {
    owner: string;
    name: string;
    key: string;
    received?: { player: Player; invitePath: string };
  };
  const [guestAttempt, setGuestAttempt] = useState<GuestAttempt | null>(() => {
    if (!invite || !ownerId) return null;
    try {
      const value = JSON.parse(
        sessionStorage.getItem("shuttl:guest-attempt:" + ownerId) || "null",
      );
      return value?.owner === ownerId ? value : null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState(""),
    [searchResult, setSearchResult] = useState<{
      query: string;
      players: Player[];
    }>({ query: "", players: [] }),
    [searchBusy, setSearchBusy] = useState(false),
    [inviteBusy, setInviteBusy] = useState(false),
    [selectBusy, setSelectBusy] = useState(false),
    [error, setError] = useState(""),
    [guest, setGuest] = useState(guestAttempt?.name || ""),
    [invitePath, setInvitePath] = useState(
      guestAttempt?.received
        ? location.origin + guestAttempt.received.invitePath
        : "",
    ),
    [newPlayer, setNewPlayer] = useState<Player | null>(
      guestAttempt?.received?.player || null,
    ),
    [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Player[]>(suggestions || []);
  const currentQuery = useRef(query.trim());
  const selecting = useRef(false);
  const guestCreating = useRef(false);
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
    if (guestCreating.current || inviteBusy || selecting.current) return;
    if (!navigator.onLine) {
      setError(
        guestAttempt
          ? "You are offline. The earlier invitation may already exist. Reconnect and retry this same invitation; its original nickname and identifier are kept."
          : "You are offline. This invitation was not sent. Reconnect and try again.",
      );
      return;
    }
    guestCreating.current = true;
    setInviteBusy(true);
    setError("");
    let exactAttempt = guestAttempt;
    try {
      const owner = ownerId || (await api("/me")).id;
      const storageKey = "shuttl:guest-attempt:" + owner;
      if (!exactAttempt && !ownerId) {
        const existing = JSON.parse(
          sessionStorage.getItem(storageKey) || "null",
        );
        if (existing?.owner === owner) {
          setGuestAttempt(existing);
          setGuest(existing.name);
          if (existing.received) {
            setNewPlayer(existing.received.player);
            setInvitePath(location.origin + existing.received.invitePath);
          }
          return;
        }
      }
      exactAttempt ||= { owner, name: guest.trim(), key: crypto.randomUUID() };
      sessionStorage.setItem(storageKey, JSON.stringify(exactAttempt));
      setGuestAttempt(exactAttempt);
      setGuest(exactAttempt.name);
      const response = await api(
        "/guests",
        { name: exactAttempt.name },
        "POST",
        exactAttempt.key,
      );
      setNewPlayer(response.player);
      setInvitePath(location.origin + response.invitePath);
      const receivedAttempt = { ...exactAttempt, received: response };
      setGuestAttempt(receivedAttempt);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(receivedAttempt));
      } catch {
        setError(
          "Your invitation was created, but this browser could not keep its link. Copy the selected link before closing this view.",
        );
      }
    } catch (e) {
      if (
        exactAttempt &&
        e instanceof ApiError &&
        [400, 403, 404, 422].includes(e.status)
      ) {
        try {
          sessionStorage.removeItem(
            "shuttl:guest-attempt:" + exactAttempt.owner,
          );
        } catch {}
        setGuestAttempt(null);
      }
      setError(
        e instanceof ApiError && e.status === 0
          ? "This invitation response is unconfirmed. It may already exist. Keep the original nickname and retry this same invitation; reopening this lookup in the same tab keeps its identifier."
          : errorMessage(e),
      );
    } finally {
      guestCreating.current = false;
      setInviteBusy(false);
    }
  };
  function startAnotherGuest() {
    if (inviteBusy || selectBusy || !guestAttempt?.received) return;
    try {
      sessionStorage.removeItem("shuttl:guest-attempt:" + guestAttempt.owner);
    } catch {
      setError(
        "This browser could not clear the saved invitation view. Keep its link and try again when browser storage is available.",
      );
      return;
    }
    setGuestAttempt(null);
    setGuest("");
    setNewPlayer(null);
    setInvitePath("");
    setCopied(false);
    setError("");
  }
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
    <Modal title={title} close={close} dismissible={!inviteBusy && !selectBusy}>
      {intro && <p className="form-help">{intro}</p>}
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
                    setError("");
                    setCopied(false);
                    try {
                      await navigator.clipboard.writeText(invitePath);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                      setError("Copy the selected invitation link manually.");
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                  <Copy size={15} />
                </button>
                <button
                  className="button"
                  disabled={selectBusy || excludeIds.includes(newPlayer.id)}
                  onClick={() => selectPlayer(newPlayer)}
                >
                  Use this player
                  <Check size={16} />
                </button>
              </div>
              {excludeIds.includes(newPlayer.id) && (
                <p className="form-help">
                  This invited player is already selected in this lineup.
                </p>
              )}
              <p className="form-help">
                This link stays available when this lookup is reopened in the
                same tab. Creating another invitation keeps the earlier link
                valid.
              </p>
              <button
                className="text-button"
                disabled={selectBusy || inviteBusy}
                onClick={startAnotherGuest}
              >
                Create another invitation
              </button>
            </>
          ) : (
            <form onSubmit={createGuest}>
              {guestAttempt && (
                <div className="notice neutral" role="status">
                  <strong>
                    Keep this exact invitation while its response is
                    unconfirmed.
                  </strong>
                  <p>
                    Retry uses the original nickname and identifier. Reopening
                    this lookup in the same tab keeps it. Closing the browser
                    tab may clear it.
                  </p>
                </div>
              )}
              <div className="field">
                <label htmlFor="guest-name">Invited player’s nickname</label>
                <input
                  id="guest-name"
                  value={guest}
                  disabled={inviteBusy || selectBusy || !!guestAttempt}
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
                  : guestAttempt
                    ? "Retry this same invitation"
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
  const rosterLabelId = useId();
  const labels =
    category === "Singles"
      ? ["Your player", "Opponent"]
      : ["Your player", "Your partner", "Opponent", "Opponent’s partner"];
  return (
    <div className="player-picker">
      {roster.map((p, i) => (
        <div
          key={i}
          className={i === 0 ? "roster-slot roster-self" : "roster-slot"}
        >
          {i === 0 ? (
            <span className="roster-self-label" id={rosterLabelId + "-" + i}>
              You · Side A
            </span>
          ) : (
            <label id={rosterLabelId + "-" + i}>{labels[i]}</label>
          )}
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
              aria-describedby={rosterLabelId + "-" + i}
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
const fullLocalDateTime = (date: string) =>
  new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
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
  const [initialStorage] = useState(() => {
    if (correction) return { raw: null, value: null };
    try {
      const raw = localStorage.getItem(storageKey);
      const value = JSON.parse(raw || "null");
      return {
        raw,
        value:
          value?.owner === me.id &&
          (value.submissionUncertain ||
            Date.now() - value.savedAt < 7 * 86400000)
            ? value
            : null,
      };
    } catch {
      return { raw: null, value: null };
    }
  });
  const [saved, setSaved] = useState(initialStorage.value);
  const draftVersion = useRef<string | null>(initialStorage.raw);
  const writeSequence = useRef(0);
  const conflictVersion = useRef<{ raw: string | null } | null>(null);
  const [draftConflict, setDraftConflict] = useState<{
    raw: string | null;
  } | null>(null);
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
    [closingDraft, setClosingDraft] = useState(false),
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
  function draftValue(uncertain = submissionUncertain) {
    return {
      owner: me.id,
      category,
      format,
      roster,
      scores,
      played,
      scopeId,
      requestKey,
      unitId,
      submissionUncertain: uncertain,
      savedAt: Date.now(),
    };
  }
  function noteConflict(raw: string | null) {
    conflictVersion.current = { raw };
    setDraftConflict({ raw });
    setPick(null);
    setConfirmDiscard(false);
    setConfirmReceivedRemoval(false);
  }
  async function withDraftLock<T>(operation: () => T): Promise<T> {
    if (navigator.locks) return navigator.locks.request(storageKey, operation);
    // A read/write transaction serializes fallback browsers across tabs.
    // The lock store keeps no player data; the draft stays in localStorage.
    return new Promise<T>((resolve, reject) => {
      const request = indexedDB.open("shuttl:draft-coordination", 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("locks"))
          request.result.createObjectStore("locks");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("Draft storage is blocked."));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) {
          database.close();
          return;
        }
        const transaction = database.transaction("locks", "readwrite");
        const store = transaction.objectStore("locks");
        let value: T;
        const read = store.get(storageKey);
        read.onsuccess = () => {
          try {
            value = operation();
            store.delete(storageKey);
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => {
          database.close();
          resolve(value!);
        };
        transaction.onabort = transaction.onerror = () => {
          database.close();
          reject(
            transaction.error || new Error("Draft storage is unavailable."),
          );
        };
      };
    });
  }
  function saveDraft(value: ReturnType<typeof draftValue> | null) {
    const current = localStorage.getItem(storageKey);
    if (conflictVersion.current || current !== draftVersion.current) {
      noteConflict(current);
      return false;
    }
    if (value && current) {
      const previous = JSON.parse(current);
      const { savedAt: _previousTime, ...previousValues } = previous;
      const { savedAt: _nextTime, ...nextValues } = value;
      if (JSON.stringify(previousValues) === JSON.stringify(nextValues))
        return true;
    }
    const next = value ? JSON.stringify(value) : null;
    if (next === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, next);
    draftVersion.current = next;
    return true;
  }
  useEffect(() => {
    if (correction) return;
    const changed = (event: StorageEvent) => {
      if (
        (event.key === storageKey || event.key === null) &&
        event.newValue !== draftVersion.current
      )
        noteConflict(localStorage.getItem(storageKey));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [storageKey, correction]);
  useEffect(() => {
    if (correction) return;
    const sequence = ++writeSequence.current;
    const empty =
      !roster.some((player, index) => index > 0 && player) &&
      !scores.some((game) => game.some((score) => score !== ""));
    const value = draftValue();
    void withDraftLock(() => {
      if (sequence !== writeSequence.current) return;
      saveDraft(empty ? null : value);
    }).catch(() => {
      setError(
        "This browser cannot save a draft. Keep this tab open until the result is sent.",
      );
    });
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
  async function removeMatchingDraft() {
    ++writeSequence.current;
    await withDraftLock(() => {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        !conflictVersion.current &&
        localStorage.getItem(storageKey) === draftVersion.current &&
        stored?.unitId === unitId &&
        JSON.stringify([
          stored.category,
          stored.format,
          stored.roster.map((player: Player | null) => player?.id),
          stored.scores,
          stored.played,
          stored.scopeId,
        ]) === exactDraft
      ) {
        localStorage.removeItem(storageKey);
        draftVersion.current = null;
      }
    });
  }
  async function closeWithDraft() {
    if (busy) return;
    if (correction || conflictVersion.current) {
      close();
      return;
    }
    setBusy(true);
    setClosingDraft(true);
    setError("");
    try {
      ++writeSequence.current;
      const empty =
        !roster.some((player, index) => index > 0 && player) &&
        !scores.some((game) => game.some((score) => score !== ""));
      if (await withDraftLock(() => saveDraft(empty ? null : draftValue())))
        close();
    } catch {
      setError(
        "This browser could not save your latest edits. Keep this view open and try again when browser storage is available.",
      );
    } finally {
      setBusy(false);
      setClosingDraft(false);
    }
  }
  async function discardDraft() {
    if (busy || submissionUncertain || received || conflictVersion.current)
      return;
    setBusy(true);
    try {
      ++writeSequence.current;
      if (!(await withDraftLock(() => saveDraft(null)))) return;
    } catch {
      setError(
        "This browser could not remove the saved draft. Keep it until browser storage is available again.",
      );
      return;
    } finally {
      setBusy(false);
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
  async function useOtherDraft() {
    if (busy || !conflictVersion.current) return;
    setBusy(true);
    setError("");
    try {
      await withDraftLock(() => {
        const raw = localStorage.getItem(storageKey);
        if (raw !== conflictVersion.current?.raw) {
          noteConflict(raw);
          setError(
            "The other tab changed again. Review its latest saved values before continuing.",
          );
          return;
        }
        const value = JSON.parse(raw || "null");
        if (!value || value.owner !== me.id) return;
        if (submissionUncertain && !received && value.unitId !== unitId) {
          setError(
            "Check this tab’s original submission before replacing it with another draft.",
          );
          return;
        }
        ++writeSequence.current;
        draftVersion.current = raw;
        conflictVersion.current = null;
        setDraftConflict(null);
        setSaved(value);
        setCategory(value.category);
        setFormat(value.format);
        setRoster(value.roster);
        setScores(value.scores);
        setPlayed(value.played);
        setScopeId(value.scopeId);
        setRequestKey(value.requestKey);
        setUnitId(value.unitId);
        setSubmissionUncertain(!!value.submissionUncertain);
        setReceived(null);
        setAcknowledged("");
      });
    } catch {
      setError(
        "This browser cannot load the saved draft. Keep both tabs open and retry when storage is available.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeReceivedDraft() {
    if (busy || conflictVersion.current) return;
    setBusy(true);
    try {
      ++writeSequence.current;
      const removed = await withDraftLock(() => saveDraft(null));
      if (removed) close();
    } catch {
      setError(
        "This browser could not remove the local draft. The recorded match remains safe in SHUTTL.",
      );
    } finally {
      setBusy(false);
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
    if (busy || received || conflictVersion.current) return;
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
      if (!correction) {
        ++writeSequence.current;
        // Persist the immutable retry payload before the request can reach SHUTTL.
        // A second tab must review this exact version before it can send anything.
        if (!(await withDraftLock(() => saveDraft(draftValue(true))))) return;
        setSubmissionUncertain(true);
      }
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
      if (!correction) await removeMatchingDraft();
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
  const otherDraft = (() => {
    try {
      return JSON.parse(draftConflict?.raw || "null");
    } catch {
      return null;
    }
  })();
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
  const selectedScope = applicable.find((scope) => scope.id === scopeId);
  const finalCheck = (() => {
    if (
      roster.some((player) => !player) ||
      new Set(roster.map((player) => player!.id)).size !== roster.length ||
      scores.some((game) => game.some((score) => !/^\d{1,2}$/.test(score))) ||
      !Number.isFinite(new Date(played).getTime())
    )
      return null;
    const games = scores.map((game) => game.map(Number)) as Game[];
    try {
      validateGames(format, games);
      return {
        games,
        playedAt: new Date(played).toISOString(),
      };
    } catch {
      return null;
    }
  })();
  const countedResult = correction?.publishedRevisionId
    ? correction.publishedResult || correction
    : null;
  return (
    <>
      <Modal
        title={correction ? "Correct the exact score" : "Record a result"}
        close={closeWithDraft}
        dismissible={!busy}
        wide
      >
        <p className="form-help">
          {correction
            ? correction.publishedRevisionId
              ? "Edit the final score. The earlier published result counts until an approved replacement is published."
              : "Edit the final score. The changed result needs fresh approval."
            : "Choose the players and enter the final score."}
        </p>
        {!correction && draftConflict && (
          <div className="notice neutral" role="status">
            <strong>This draft changed in another tab.</strong>
            <p>
              This tab has paused. Its visible edits will not overwrite the
              other tab’s saved draft or be sent as another match.
            </p>
            {otherDraft?.owner === me.id ? (
              <>
                <p>
                  Latest saved draft: {otherDraft.category} ·{" "}
                  {FORMATS[otherDraft.format as Format].label}
                  {otherDraft.submissionUncertain
                    ? " · submission status needs checking"
                    : " · not submitted"}
                  . Using it replaces the values below and keeps its original
                  match identifier.
                </p>
                <p>
                  {otherDraft.roster
                    .slice(0, otherDraft.roster.length / 2)
                    .map(
                      (player: Player | null) =>
                        player?.name || "Player not chosen",
                    )
                    .join(" + ")}
                  {" vs "}
                  {otherDraft.roster
                    .slice(otherDraft.roster.length / 2)
                    .map(
                      (player: Player | null) =>
                        player?.name || "Player not chosen",
                    )
                    .join(" + ")}
                </p>
                {otherDraft.scores.every((game: string[]) =>
                  game.every((score) => /^\d{1,2}$/.test(score)),
                ) ? (
                  <ScoreGames
                    games={otherDraft.scores.map((game: string[]) =>
                      game.map(Number),
                    )}
                  />
                ) : (
                  <p>The saved score is still incomplete.</p>
                )}
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={useOtherDraft}
                >
                  Use saved draft from other tab
                </button>
              </>
            ) : (
              <p>
                The saved copy was removed in the other tab. Close this view and
                review your court before starting another match.
              </p>
            )}
            {(submissionUncertain || !otherDraft) && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={checkReceipt}
              >
                Check original submission
              </button>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={close}
            >
              Close this paused tab
            </button>
          </div>
        )}
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
                disabled={busy}
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
            className="result-entry-fields"
            disabled={
              busy || !!received || !!draftConflict || submissionUncertain
            }
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
            <section className="result-entry-section">
              <h3 className="form-section-heading">Match</h3>
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
                        {f.series ? "Best of 3" : "1 game"} · {f.target}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
            <section className="result-entry-section">
              <h3 className="form-section-heading">Players</h3>
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
            </section>
            <section className="result-entry-section">
              <h3 className="form-section-heading">Final score</h3>
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
            </section>
            {!correction && (
              <>
                <div className="field result-time-field">
                  <label htmlFor="result-time">Started at</label>
                  <input
                    type="datetime-local"
                    step="1"
                    id="result-time"
                    value={played}
                    aria-describedby="result-time-help"
                    onChange={(e) => setPlayed(e.target.value)}
                    required
                  />
                  <p className="form-help" id="result-time-help">
                    Local time ·{" "}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                  </p>
                </div>
                <details
                  className="result-agreement-details"
                  open={!!scopeId || applicable.length > 0}
                >
                  <summary>
                    Earlier rated agreement{scopeId ? " · selected" : " · none"}
                  </summary>
                  <div className="field">
                    <label htmlFor="result-scope">
                      Earlier rated agreement
                    </label>
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
                          {s.players.length} currently agreed
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedScope && (
                    <div className="agreement-window">
                      <dl>
                        <div>
                          <dt>Starts</dt>
                          <dd>
                            <time dateTime={selectedScope.starts}>
                              {fullLocalDateTime(selectedScope.starts)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>Ends</dt>
                          <dd>
                            <time dateTime={selectedScope.ends}>
                              {fullLocalDateTime(selectedScope.ends)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                      <p className="form-help">
                        SHUTTL checks whether every player agreed before this
                        match started and whether anyone had stopped future
                        rated play. Today’s approval count does not establish
                        earlier coverage.
                      </p>
                    </div>
                  )}
                </details>
              </>
            )}
            <div className="notice neutral result-consent-summary">
              <strong>
                {correction
                  ? "Fresh approval for this correction."
                  : scopeId
                    ? "The exact score still needs approval."
                    : "Every player approves this result."}
              </strong>
              <p>
                {correction
                  ? correction.publishedRevisionId
                    ? "The earlier published result keeps counting until an approved replacement is published."
                    : "Required players approve the changed score and format before it counts."
                  : scopeId
                    ? "When the earlier agreement covers this match, one eligible opponent confirms the exact score. Otherwise every player must approve."
                    : "Each player chooses its rated status and approves the score. Silence never changes a rating."}
              </p>
            </div>
          </fieldset>
          <fieldset
            disabled={busy || !!received || !!draftConflict}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {finalCheck && (
              <section
                className="result-check-summary"
                aria-label="Final result check"
              >
                <strong>
                  {correction ? "Proposed score" : "Check this result"}
                </strong>
                <p className="form-help">
                  {category} · {FORMATS[format].label}
                </p>
                <div className="result-check-lineup">
                  <span>
                    <b>Side A</b>{" "}
                    {roster
                      .slice(0, roster.length / 2)
                      .map((player) => player!.name)
                      .join(" + ")}
                  </span>
                  <span>
                    <b>Side B</b>{" "}
                    {roster
                      .slice(roster.length / 2)
                      .map((player) => player!.name)
                      .join(" + ")}
                  </span>
                </div>
                <p className="result-check-games">
                  {finalCheck.games.map((game) => game.join("–")).join(" / ")}
                </p>
                <p className="form-help">
                  Started{" "}
                  <time dateTime={finalCheck.playedAt}>
                    {fullLocalDateTime(finalCheck.playedAt)}
                  </time>
                </p>
                {countedResult && (
                  <p className="form-help currently-counted-score">
                    <b>Currently counted score:</b>{" "}
                    {countedResult.games
                      .map((game: number[]) => game.join("–"))
                      .join(" / ")}{" "}
                    · {FORMATS[countedResult.format as Format].label}. It keeps
                    counting until an approved replacement is published.
                  </p>
                )}
              </section>
            )}
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
                ? closingDraft
                  ? "Saving your draft…"
                  : "Saving your result…"
                : correction
                  ? "Propose correction"
                  : "Send for exact-score approval"}
              <ArrowRight size={16} />
            </button>
            <p className="form-help">
              {correction
                ? "Changed values require fresh approvals."
                : submissionUncertain
                  ? "This original retry stays on this device until removed or browser storage is cleared. Its presence does not tell you whether SHUTTL already received the match."
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
          ownerId={me.id}
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
  const attemptStorageKey = "shuttl:agreement-attempt:" + me.id;
  const [attempt, setAttempt] = useState<any>(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(attemptStorageKey) || "null",
      );
      return value?.owner === me.id ? value : null;
    } catch {
      return null;
    }
  });
  const [category, setCategory] = useState<Category>(
      attempt?.payload.category || "Doubles",
    ),
    [format, setFormat] = useState<Format>(attempt?.payload.format || "ONE_21"),
    [roster, setRoster] = useState<(Player | null)[]>(
      attempt?.players || [me, null, null, null],
    ),
    [pick, setPick] = useState<number | null>(null),
    [recurring, setRecurring] = useState(!!attempt?.recurring),
    [acknowledgedAgreement, setAcknowledgedAgreement] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [windowStarts] = useState(() => new Date().toISOString());
  const agreementStarts = attempt?.payload.starts || windowStarts;
  const agreementEnds =
    attempt?.payload.ends ||
    new Date(
      Date.parse(windowStarts) + (recurring ? 30 * 86400000 : 8 * 3600000),
    ).toISOString();
  const agreementKey = JSON.stringify([
    category,
    format,
    roster.map((p) => p?.id),
    recurring,
    agreementStarts,
    agreementEnds,
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
      if (!navigator.onLine) {
        setError(
          attempt
            ? "You are offline. The earlier agreement may already exist. Reconnect and retry this same agreement; its original identifier is kept."
            : "You are offline. This agreement was not sent. Reconnect and try again.",
        );
        return;
      }
      setBusy(true);
      const exactAttempt = attempt || {
        owner: me.id,
        key: crypto.randomUUID(),
        players: roster,
        recurring,
        payload: {
          category,
          format,
          roster: roster.map((p) => p!.id),
          starts: agreementStarts,
          ends: agreementEnds,
          agree: true,
        },
      };
      // Same-tab reopening and retries keep the original time window and key.
      sessionStorage.setItem(attemptStorageKey, JSON.stringify(exactAttempt));
      setAttempt(exactAttempt);
      await api("/scopes", exactAttempt.payload, "POST", exactAttempt.key);
      sessionStorage.removeItem(attemptStorageKey);
      done();
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404, 422].includes(e.status)) {
        sessionStorage.removeItem(attemptStorageKey);
        setAttempt(null);
      }
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
        <ol className="agreement-steps">
          <li>Every player agrees to rated play before the match starts.</li>
          <li>
            After a covered match, the player who records it and one opponent
            confirm the exact score.
          </li>
        </ol>
        {attempt && (
          <div className="notice neutral" role="status">
            <strong>
              Keep this exact agreement while its response is unconfirmed.
            </strong>
            <p>
              It may already exist. Retry uses the same players, time window and
              identifier, so it does not create another agreement. Closing and
              reopening this form in this tab keeps that retry. Closing the
              browser tab may clear it; check your agreements before starting
              another.
            </p>
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset
            disabled={busy || !!attempt}
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
                <option value="session">This session · 8 hours</option>
                <option value="recurring">
                  Same players and format · 30 days
                </option>
              </select>
            </div>
            <section className="agreement-window" aria-label="Agreement window">
              <strong>Agreement window</strong>
              <dl>
                <div>
                  <dt>Starts</dt>
                  <dd>
                    <time dateTime={agreementStarts}>
                      {fullLocalDateTime(agreementStarts)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Ends</dt>
                  <dd>
                    <time dateTime={agreementEnds}>
                      {fullLocalDateTime(agreementEnds)}
                    </time>
                  </dd>
                </div>
              </dl>
              <p className="form-help">
                Only matches started in this window after every player agreed
                can be covered. The same four may rotate sides in Doubles or
                Mixed.
              </p>
            </section>
          </fieldset>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
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
                : attempt
                  ? "Retry this same agreement"
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
          ownerId={me.id}
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
  const [busyAction, setBusyAction] = useState<"approve" | "dispute" | null>(
    null,
  );
  const lastRevision = useRef(result.revisionId);
  const actionInFlight = useRef(false);
  const actionKeys = useRef(new Map<string, string>());
  const [revisionChanged, setRevisionChanged] = useState(false);
  const agree = acknowledgedRevision === result.revisionId;
  useEffect(() => {
    if (lastRevision.current !== result.revisionId) {
      lastRevision.current = result.revisionId;
      setAcknowledgedRevision("");
      setRevisionChanged(true);
      setDisputing(false);
      setError("");
    }
  }, [result.revisionId]);
  const approved = result.approvals.includes(result.ownParticipant),
    size = result.players.length / 2;
  const ownIndex = result.players.findIndex(
    (p: Player) => p.id === result.ownParticipant,
  );
  const authorIndex = result.players.findIndex(
    (p: Player) => p.id === (result.authorParticipant || result.author.id),
  );
  const canApprove = canReviewResult(result);
  const awaiting = result.players.filter(
    (p: Player, i: number) =>
      !result.approvals.includes(p.id) &&
      (result.retrospective || i < size !== authorIndex < size),
  );
  async function action(type: "approve" | "dispute") {
    if (actionInFlight.current) return;
    if (type === "approve" && acknowledgedRevision !== result.revisionId)
      return;
    actionInFlight.current = true;
    setBusy(true);
    setBusyAction(type);
    setError("");
    try {
      const payload =
        type === "approve"
          ? { revisionId: result.revisionId, agree: true }
          : { revisionId: result.revisionId, reason };
      const fingerprint = JSON.stringify([type, result.id, payload]);
      const key = actionKeys.current.get(fingerprint) || crypto.randomUUID();
      actionKeys.current.set(fingerprint, key);
      await api("/results/" + result.id + "/" + type, payload, "POST", key);
      refresh();
      setDisputing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
      setBusyAction(null);
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
      dismissible={!busy}
      wide
    >
      <fieldset
        className="result-review-fields"
        aria-busy={busy}
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="result-review-scoreboard">
          <div className="result-top">
            <span>
              {result.category} · {FORMATS[result.format as Format].label}
            </span>
            <span>{dateTimeLabel(result.playedAt)}</span>
          </div>
          <div className="team-row">
            <div>
              <span className="review-side-label">
                Side A · {ownIndex < size ? "Your side" : "Other side"}
              </span>
              <strong>
                {result.players
                  .slice(0, size)
                  .map((p: Player) => p.name)
                  .join(" + ")}
              </strong>
            </div>
            <div>
              <span className="review-side-label">
                Side B · {ownIndex >= size ? "Your side" : "Other side"}
              </span>
              <strong>
                {result.players
                  .slice(size)
                  .map((p: Player) => p.name)
                  .join(" + ")}
              </strong>
            </div>
          </div>
          {(result.publishedResult ||
            result.status === "correction_pending") && (
            <strong className="proposed-score-caption">Proposed score</strong>
          )}
          <ScoreGames games={result.games} />
        </div>
        {revisionChanged && (
          <div className="notice revision-notice" role="alert">
            <strong>The score changed. Review it again.</strong>
            <p>
              Your earlier acknowledgement was cleared. Read these sides and
              scores again before approving.
            </p>
          </div>
        )}
        {result.publishedResult && (
          <div className="notice neutral">
            <strong>Currently counted score</strong>
            <p>
              {result.publishedResult.games
                .map((g: number[]) => g.join("–"))
                .join(" / ")}{" "}
              · {FORMATS[result.publishedResult.format as Format].label}. This
              proposed correction needs fresh approval before ratings change.
            </p>
          </div>
        )}
        <div
          className="notice result-review-status"
          data-status={result.status}
          role="status"
        >
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
                      ? "Waiting for every player’s approval"
                      : "Waiting for one opponent’s confirmation"}
          </strong>
          <p>
            {result.status === "rated"
              ? `This ${result.category} result is in your confirmed history.`
              : result.status === "confirmed"
                ? "All required approvals are recorded. Your estimate updates after processing."
                : result.status === "disputed"
                  ? "An independent reviewer will decide. The decision appears here. Any earlier published result keeps counting until a decision."
                  : result.status === "void"
                    ? "This match is excluded from rated history."
                    : result.retrospective
                      ? `${result.approvals.length} of ${result.players.length} players approved. Every player must also agree to rated status.`
                      : "The author’s approval is recorded. One eligible opponent confirms this exact score; rated play was agreed earlier."}
          </p>
        </div>
        <ResultReward result={result} share={share} />
        <Encouragement result={result} />
        {["pending", "correction_pending"].includes(result.status) &&
          awaiting.length > 0 && (
            <p className="form-help review-waiting">
              <strong>
                {result.retrospective
                  ? "Waiting for "
                  : "An eligible opponent can confirm: "}
                {awaiting.map((p: Player) => p.name).join(", ")}.
              </strong>
            </p>
          )}
        <InlineError message={error} />
        {error && (
          <button
            className="button secondary"
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            Refresh this result
          </button>
        )}
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
                These are the correct sides and scores. I agree that this result
                counts toward my rating.
              </span>
            </label>
            <button
              className="button block"
              disabled={!agree || busy}
              onClick={() => action("approve")}
            >
              {busyAction === "approve"
                ? "Recording your approval…"
                : "Confirm this exact score"}
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
          <>
            <p className="form-help review-action-guide">
              {result.status === "void"
                ? "Disagree with the decision? Appeal it for independent review."
                : "Score-entry mistake? Correct the score. Different players or disagreement about rated play? Ask for review."}
            </p>
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
          </>
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
              {busyAction === "dispute"
                ? "Sending your review request…"
                : "Submit private review request"}
            </button>
          </form>
        )}
        <details className="review-record-details">
          <summary>Result details</summary>
          <p className="form-help">
            Players who approved this revision:{" "}
            {result.players
              .filter((player: Player) => result.approvals.includes(player.id))
              .map((player: Player) => player.name)
              .join(", ") || "None yet"}
            .
          </p>
          <p className="form-help">
            Submitted by {result.author.name}. Revision {result.revisionNumber}.
            Correcting or asking for review of an incorrect score does not hurt
            your response record.
          </p>
          <p className="form-help">
            {result.retrospective
              ? "Every player chooses rated play and approves this exact revision. An identity invitation or a group invitation does not approve the score."
              : "Every player agreed to covered rated play earlier. The author and an eligible opponent approve this exact score. A correction needs fresh approval."}
          </p>
        </details>
      </fieldset>
    </Modal>
  );
}
