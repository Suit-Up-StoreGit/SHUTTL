import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Copy, Heart, UsersRound } from "lucide-react";
import { api, ApiError, dateLabel, errorMessage } from "../api.ts";
import type { Category, Player } from "../domain.ts";
import { Avatar, Brand, InlineError, Modal, Spinner } from "./UI.tsx";
import { recordResearch } from "./Preferences.tsx";

export function Crest({ kind = "shuttle" }: { kind?: string }) {
  return (
    <svg className="group-crest" viewBox="0 0 64 64" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="17"
        fill="currentColor"
        opacity=".12"
      />
      {kind === "court" ? (
        <>
          <rect x="16" y="13" width="32" height="38" rx="2" />
          <path d="M16 32h32M32 13v38M16 22h32M16 42h32" />
        </>
      ) : kind === "orbit" ? (
        <>
          <ellipse
            cx="32"
            cy="32"
            rx="22"
            ry="12"
            transform="rotate(-30 32 32)"
          />
          <circle cx="32" cy="32" r="7" />
        </>
      ) : kind === "rally" ? (
        <>
          <path d="M12 40 25 20l13 24 14-22M12 47h40" />
        </>
      ) : (
        <>
          <path d="m20 14 8 27h8l8-27M26 12l4 29m8-29-4 29M20 25h24" />
          <path d="M28 41h8v9h-8z" />
        </>
      )}
    </svg>
  );
}
export function PlayerCode({
  me,
  notify,
}: {
  me: any;
  notify: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [qr, setQr] = useState<{ link: string; image: string } | null>(null),
    [invitation, setInvitation] = useState<any>(null),
    [invitations, setInvitations] = useState<any[]>([]),
    [invitationRevision, setInvitationRevision] = useState(0),
    [pendingCreation, setPendingCreation] = useState<{
      token: string;
      requestId: string;
    } | null>(null),
    [pendingSaved, setPendingSaved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [busyAction, setBusyAction] = useState<"create" | "revoke" | null>(null);
  const mutationInFlight = useRef(false);
  const pendingInvitation = useRef<{
    token: string;
    requestId: string;
  } | null>(null);
  const storageKey = "shuttl:pending-player-invite:" + me.id;
  useEffect(() => {
    let value: { token: string; requestId: string } | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        saved &&
        /^[A-Za-z0-9_-]{32}$/.test(saved.token) &&
        /^[a-f0-9-]{36}$/.test(saved.requestId)
      )
        value = saved;
    } catch {
      // A blocked device store still permits an in-tab retry.
    }
    pendingInvitation.current = value;
    setPendingCreation(value);
    setPendingSaved(!!value);
    setInvitation(null);
    return () => {
      pendingInvitation.current = null;
    };
  }, [storageKey]);
  function clearPendingCreation() {
    pendingInvitation.current = null;
    setPendingCreation(null);
    setPendingSaved(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Successful confirmation remains usable in this tab.
    }
  }
  const link = invitation
    ? location.origin + invitation.path
    : location.origin + "/home?player=" + encodeURIComponent(me.username);
  useEffect(() => {
    let active = true;
    setQr(null);
    if (open)
      import("qrcode")
        .then(({ default: QRCode }) =>
          QRCode.toDataURL(link, {
            width: 300,
            margin: 4,
            errorCorrectionLevel: "M",
            color: { dark: "#14372cff", light: "#ffffffff" },
          }),
        )
        .then((value) => {
          if (active) setQr({ link, image: value });
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [link, open]);
  useEffect(() => {
    let active = true;
    if (open)
      api("/account/player-invites")
        .then((v) => {
          if (active) setInvitations(v.invitations);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [open, invitation, invitationRevision]);
  async function changeInvitation(id?: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setBusyAction(id ? "revoke" : "create");
    setError("");
    try {
      if (id) {
        await api("/player-invites/" + id, {}, "DELETE");
        setInvitations((old) => old.filter((p) => p.id !== id));
        if (invitation?.id === id) setInvitation(null);
        notify("Invitation revoked.");
      } else {
        const pending = pendingInvitation.current || {
          token: btoa(
            String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))),
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_"),
          requestId: crypto.randomUUID(),
        };
        pendingInvitation.current = pending;
        setPendingCreation(pending);
        try {
          localStorage.setItem(storageKey, JSON.stringify(pending));
          setPendingSaved(true);
        } catch {
          setPendingSaved(false);
          setError(
            "This browser cannot save the retry draft. Keep this tab open until the invitation is confirmed.",
          );
        }
        const response = await api(
          "/player-invites",
          { token: pending.token },
          "POST",
          pending.requestId,
        );
        setInvitation(response);
        clearPendingCreation();
      }
      setInvitationRevision((old) => old + 1);
      setError("");
    } catch (e) {
      if (!id && e instanceof ApiError && [400, 409, 429].includes(e.status))
        clearPendingCreation();
      setError(errorMessage(e));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
      setBusyAction(null);
    }
  }
  return (
    <>
      <button
        className="button secondary"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Show my player code
      </button>
      {open && (
        <Modal
          title="Meet on court. Connect here."
          close={() => setOpen(false)}
          dismissible={!busy}
        >
          <div className="player-code">
            {pendingCreation && !invitation ? (
              <p>Confirm your private invitation to show its player code.</p>
            ) : qr?.link === link ? (
              <img
                src={qr.image}
                width="260"
                height="260"
                alt="QR code for this player connection link"
              />
            ) : (
              <Spinner />
            )}
            <strong>@{me.username}</strong>
          </div>
          <p className="form-help">
            A camera can open this link. Your username is included; private
            contacts and match history stay private. Discovery links follow your
            username-visibility choice.
          </p>
          {!me.discoverable && !invitation && (
            <p className="notice">
              Username discovery is off. Create a private invitation to connect
              deliberately.
            </p>
          )}
          {invitation && (
            <p className="notice">
              Invitation expires {dateLabel(invitation.expires)}. Anyone with
              this link can request friendship; you choose whether to accept.
              Score consent stays separate.
            </p>
          )}
          {pendingCreation && !invitation && (
            <p className="notice">
              Your private invitation has not been confirmed. Retry returns the
              same invitation, even if the earlier request arrived.{" "}
              {pendingSaved
                ? "Its retry draft stays on this device until confirmation or sign-out."
                : "Keep this tab open: this browser could not save the retry draft."}
            </p>
          )}
          <InlineError message={error} />
          <div className="dialog-actions">
            <button
              className="button"
              disabled={busy || !!pendingCreation}
              onClick={async () => {
                setError("");
                try {
                  await navigator.clipboard.writeText(link);
                  notify("Connection link copied.");
                } catch {
                  setError(
                    "Copy was unavailable. Open Connection link and select the address below.",
                  );
                }
              }}
            >
              <Copy size={16} /> Copy link
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => changeInvitation(invitation?.id)}
            >
              {invitation
                ? busyAction === "revoke"
                  ? "Revoking invitation…"
                  : "Revoke invitation"
                : busyAction === "create"
                  ? "Creating private invitation…"
                  : pendingCreation
                    ? "Retry private invitation"
                    : "Create private invitation"}
            </button>
          </div>
          <details hidden={!!pendingCreation && !invitation}>
            <summary>Connection link</summary>
            <p className="wrap-anywhere">{link}</p>
            <label htmlFor="player-connection-link">
              Select connection link
            </label>
            <input
              id="player-connection-link"
              value={link}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
            />
          </details>
          {!!invitations.filter(
            (i) =>
              !i.revoked &&
              Date.parse(i.expires) > Date.now() &&
              i.id !== invitation?.id,
          ).length && (
            <details>
              <summary>Manage earlier invitations</summary>
              <p className="form-help">
                Earlier secret links cannot be recovered here. Revoke one to
                stop new friendship requests.
              </p>
              {invitations
                .filter(
                  (i) =>
                    !i.revoked &&
                    Date.parse(i.expires) > Date.now() &&
                    i.id !== invitation?.id,
                )
                .map((i, index) => (
                  <div className="dialog-actions" key={i.id}>
                    <span>
                      Invitation {index + 1} · expires {dateLabel(i.expires)}
                    </span>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => changeInvitation(i.id)}
                    >
                      Revoke earlier invitation {index + 1}
                    </button>
                  </div>
                ))}
            </details>
          )}
        </Modal>
      )}
    </>
  );
}
export function PlayerArrival({
  username,
  close,
  notify,
  refresh,
}: {
  username: string;
  close: () => void;
  notify: (s: string) => void;
  refresh: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  const connectionMutation = useRef(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api("/players/by-username/" + encodeURIComponent(username))
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [username, loadAttempt]);
  return (
    <Modal
      title="Your next playing connection"
      close={close}
      dismissible={!busy}
    >
      {!data && !error ? (
        <Spinner />
      ) : (
        data && (
          <>
            <div className="profile-identity">
              <Avatar player={data.player} />
              <div>
                <h3>{data.player.name}</h3>
                <p>@{data.player.username}</p>
              </div>
            </div>
            <p className="form-help">
              A friendship lets you follow shared progress. Each rated session
              and exact result still requires its own agreement.
            </p>
            {data.connection === "incoming" ? (
              <a className="button block" href="/inbox">
                Review friendship request
              </a>
            ) : (
              <button
                className="button block"
                disabled={
                  busy ||
                  data.friend ||
                  data.self ||
                  data.connection === "outgoing"
                }
                onClick={async () => {
                  if (connectionMutation.current) return;
                  connectionMutation.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    await api("/friends", { playerId: data.player.id });
                    notify(
                      "Friend request sent. They choose whether to accept.",
                    );
                    refresh();
                    close();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    connectionMutation.current = false;
                    setBusy(false);
                  }
                }}
              >
                {data.self
                  ? "This is your player code"
                  : data.friend
                    ? "Already connected"
                    : data.connection === "outgoing"
                      ? "Request pending"
                      : "Ask to connect"}
              </button>
            )}
            {data.connection === "outgoing" && (
              <>
                <p className="form-help">
                  This player has your request. They choose whether to accept.
                </p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (connectionMutation.current) return;
                    connectionMutation.current = true;
                    setBusy(true);
                    setError("");
                    try {
                      await api(
                        "/friends/" + data.player.id,
                        { pendingOnly: true },
                        "DELETE",
                      );
                      setData((old: any) => ({ ...old, connection: "none" }));
                      refresh();
                      notify("Friend request cancelled.");
                    } catch (e) {
                      setError(errorMessage(e));
                      if (e instanceof ApiError && e.status === 409) {
                        try {
                          const current = await api(
                            "/players/by-username/" +
                              encodeURIComponent(username),
                          );
                          setData(current);
                          refresh();
                        } catch (loadError) {
                          setError(errorMessage(loadError));
                        }
                      }
                    } finally {
                      connectionMutation.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  Cancel friend request
                </button>
              </>
            )}
          </>
        )
      )}
      <InlineError message={error} />
      {error && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          Retry loading connection
        </button>
      )}
    </Modal>
  );
}
export function InvitationLanding({
  loggedIn,
  signIn,
  notify,
}: {
  loggedIn: boolean;
  signIn: () => void;
  notify: (s: string) => void;
}) {
  const token = location.pathname.split("/")[2];
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  const requestInFlight = useRef(false);
  const currentInvitation = useRef({ token, loggedIn });
  currentInvitation.current = { token, loggedIn };
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(
      (loggedIn ? "/player-invites/" : "/auth/player-invite/") +
        encodeURIComponent(token),
    )
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [token, loggedIn, loadAttempt]);
  const status = data?.status || "available";
  return (
    <main className="claim-public">
      <Brand />
      {!data && !error ? (
        <Spinner />
      ) : data ? (
        <>
          <span className="eyebrow">YOUR PEOPLE. YOUR PROGRESS.</span>
          <h1>
            {status === "self"
              ? "This is your invitation."
              : `${data.name} invited you.`}
          </h1>
          <p>
            Connect to compare your badminton progress. {data.name} reviews your
            friendship request before you connect. This invitation adds no group
            membership and approves no rated play or scores.
          </p>
          <p className="form-help">Expires {dateLabel(data.expires)}.</p>
          {status !== "available" ? (
            <div className="notice">
              <strong>
                {status === "self"
                  ? "Share this invitation with another player."
                  : status === "accepted"
                    ? "You are already connected."
                    : status === "incoming"
                      ? "This player already requested your friendship."
                      : "Your request is with the inviter."}
              </strong>
              <p>
                {status === "pending"
                  ? "Start your own player passport while they review it."
                  : status === "incoming"
                    ? "Review their existing request in your inbox."
                    : "Your connection choices and score consent stay separate."}
              </p>
              <a
                className="button"
                href={status === "incoming" ? "/inbox" : "/home"}
              >
                {status === "incoming"
                  ? "Review friendship request"
                  : "Go to my court"}{" "}
                <ArrowRight size={16} />
              </a>
            </div>
          ) : (
            <button
              className="button block"
              disabled={busy}
              onClick={async () => {
                if (!loggedIn) {
                  signIn();
                  return;
                }
                if (requestInFlight.current) return;
                requestInFlight.current = true;
                setBusy(true);
                setError("");
                try {
                  const response = await api(
                    "/player-invites/" + token + "/accept",
                    {},
                  );
                  if (
                    currentInvitation.current.token === token &&
                    currentInvitation.current.loggedIn === loggedIn
                  ) {
                    setData(
                      (old: any) => old && { ...old, status: response.status },
                    );
                    if (response.status === "pending")
                      notify("Friendship request sent.");
                    setError("");
                  }
                } catch (e) {
                  if (
                    currentInvitation.current.token === token &&
                    currentInvitation.current.loggedIn === loggedIn
                  )
                    setError(errorMessage(e));
                } finally {
                  requestInFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              {loggedIn
                ? "Request this connection"
                : "Join and keep this invitation"}
            </button>
          )}
        </>
      ) : (
        <>
          <h1>We couldn’t open this invitation.</h1>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            Retry invitation
          </button>
        </>
      )}
      <InlineError message={error} />
      <a href="/home" className="text-button">
        Return to SHUTTL
      </a>
    </main>
  );
}
export function GroupRecap({
  circle,
  category,
  me,
  open,
  refresh,
  inNamedGroup = false,
}: {
  circle: any;
  category: Category;
  me: any;
  open: (id: string) => void;
  refresh: () => void;
  inNamedGroup?: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [period, setPeriod] = useState("week"),
    [error, setError] = useState(""),
    [editError, setEditError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [editing, setEditing] = useState(false),
    [identity, setIdentity] = useState({
      crest: "shuttle",
      tagline: "",
      recapDay: 0,
    });
  const saving = useRef(false);
  const currentCircle = useRef(circle.id);
  currentCircle.current = circle.id;
  useEffect(() => {
    setEditing(false);
    setEditError("");
  }, [circle.id]);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/circles/${circle.id}/recap?category=${category}&period=${period}`)
      .then((v) => {
        if (active) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [circle.id, category, period, retry]);
  useEffect(() => {
    recordResearch("group-recap-view", me.id);
  }, [circle.id, me.id]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setEditError("");
    const targetCircle = circle.id;
    const savedIdentity = { ...identity, tagline: identity.tagline.trim() };
    try {
      await api(`/circles/${targetCircle}/identity`, savedIdentity, "PATCH");
      if (currentCircle.current === targetCircle) {
        setEditing(false);
        setData((old: any) => old && { ...old, identity: savedIdentity });
        setEditError("");
        refresh();
      }
    } catch (e) {
      if (currentCircle.current === targetCircle) setEditError(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel group-passport">
      <div className="group-passport-header">
        <Crest kind={data?.identity.crest} />
        <div>
          <span className="eyebrow">
            {inNamedGroup
              ? category.toUpperCase() + " / SHARED PLAY"
              : "YOUR GROUP PASSPORT"}
          </span>
          <h2>{inNamedGroup ? "Group recap" : circle.name}</h2>
          {(data?.identity.tagline || !inNamedGroup) && (
            <p>
              {data?.identity.tagline ||
                "A shared picture, earned in your existing group."}
            </p>
          )}
        </div>
      </div>
      <div
        className="section-tabs"
        role="group"
        aria-label="Group recap period"
      >
        {[
          ["week", "7 days"],
          ["month", "30 days"],
          ["quarter", "90 days"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <InlineError message={error} />
      {error && (
        <button
          className="text-button"
          onClick={() => setRetry((old) => old + 1)}
        >
          Retry group recap
        </button>
      )}
      {!data && !error ? (
        <Spinner />
      ) : (
        data && (
          <>
            <div className="weekly-stats">
              <div>
                <strong>{data.results}</strong>
                <span>published matches</span>
              </div>
              <div>
                <strong>{data.activePlayers}</strong>
                <span>active players</span>
              </div>
              <div>
                <strong>{data.playingEdges}</strong>
                <span>playing connections</span>
              </div>
            </div>
            <p className="form-help">
              {data.scope}
              {data.bounded
                ? " This recap covers the latest 2,000 whole-group results."
                : ""}
            </p>
            <p className="form-help">
              Rating points compare the first and last group match in this
              period, including other rated play between them. A dash means
              those ratings were not visible yet.
            </p>
            <div className="notice">
              <strong>
                Your{" "}
                {
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][data.identity.recapDay]
                }{" "}
                check-in
              </strong>
              <p>
                Review what changed after your group’s normal games.
                Participation is voluntary; the recap sends no automatic alerts
                and awards no skill points for activity.
              </p>
            </div>
            {data.players.map((p: any) => (
              <div className="ranking-row" key={p.id}>
                <Avatar player={p} />
                <div className="ranking-person">
                  <strong>{p.name}</strong>
                  <small>
                    {p.results} results · {p.wins} recorded wins
                  </small>
                </div>
                <span
                  aria-label={
                    p.visibleChange === null
                      ? "Rating change unavailable for this period"
                      : `${p.visibleChange >= 0 ? "+" : ""}${p.visibleChange} rating points in this period`
                  }
                >
                  {p.visibleChange === null
                    ? "— rating change"
                    : `${p.visibleChange >= 0 ? "+" : ""}${p.visibleChange} rating pts`}
                </span>
              </div>
            ))}
            {!data.results && (
              <p className="empty-copy">
                No published whole-group matches in this window. Your next real
                result starts the recap.
              </p>
            )}
            {data.recent.map((r: any, i: number) =>
              r.id ? (
                <button
                  key={r.id}
                  className="group-result text-button"
                  onClick={() => open(r.id)}
                >
                  {dateLabel(r.playedAt)} ·{" "}
                  {r.players.map((p: Player) => p.name).join(" / ")}{" "}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <p className="group-result" key={i}>
                  {dateLabel(r.playedAt)} ·{" "}
                  {r.players.map((p: Player) => p.name).join(" / ")}
                </p>
              ),
            )}
          </>
        )
      )}
      {me.id === circle.owner && data && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setIdentity({ ...data.identity });
            setEditError("");
            setEditing(true);
          }}
        >
          Edit group identity
        </button>
      )}
      {editing && (
        <Modal
          title="Make this circle yours"
          close={() => {
            if (!saving.current) setEditing(false);
          }}
        >
          <form onSubmit={save}>
            <label htmlFor="group-tagline">Group motto · optional</label>
            <input
              id="group-tagline"
              disabled={busy}
              value={identity.tagline}
              maxLength={100}
              onChange={(e) =>
                setIdentity({ ...identity, tagline: e.target.value })
              }
            />
            <label htmlFor="group-crest">Group crest</label>
            <select
              id="group-crest"
              disabled={busy}
              value={identity.crest}
              onChange={(e) =>
                setIdentity({ ...identity, crest: e.target.value })
              }
            >
              {["shuttle", "court", "rally", "orbit"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <label htmlFor="recap-day">Your normal recap day</label>
            <select
              id="recap-day"
              disabled={busy}
              value={identity.recapDay}
              onChange={(e) =>
                setIdentity({ ...identity, recapDay: Number(e.target.value) })
              }
            >
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <InlineError message={editError} />
            <button className="button block" disabled={busy}>
              Save group identity
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function Encouragement({ result }: { result: any }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const currentResult = useRef(result.id);
  const loadSequence = useRef(0);
  currentResult.current = result.id;
  async function load() {
    const target = result.id;
    const sequence = ++loadSequence.current;
    setError("");
    try {
      const response = await api(`/results/${target}/encouragement`);
      if (currentResult.current === target && loadSequence.current === sequence)
        setData(response);
    } catch (e) {
      if (currentResult.current === target && loadSequence.current === sequence)
        setError(errorMessage(e));
    }
  }
  useEffect(() => {
    setData(null);
    setError("");
    load();
    return () => {
      loadSequence.current++;
    };
  }, [result.id]);
  if (!result.publishedRevisionId) return null;
  const sent = new Set(data?.sent.map((p: any) => p.recipient) || []);
  return (
    <section className="encouragement">
      <h3>A little respect goes a long way.</h3>
      <p className="form-help">
        Acknowledge another player in this match. Encouragement changes no
        rating and sends no device alert.
      </p>
      {result.players
        .filter(
          (p: any) =>
            (p.canonicalId || p.id) !==
              (result.ownParticipant
                ? result.players.find(
                    (q: any) => q.id === result.ownParticipant,
                  )?.canonicalId || result.ownParticipant
                : null) &&
            !p.guest &&
            p.username !== "former_player",
        )
        .map((p: any) => (
          <button
            className="button secondary"
            key={p.id}
            disabled={busy || sent.has(p.canonicalId || p.id)}
            onClick={async () => {
              if (sending.current) return;
              sending.current = true;
              setBusy(true);
              setError("");
              const target = result.id;
              const recipient = p.canonicalId || p.id;
              try {
                await api(`/results/${target}/encouragement`, {
                  recipient,
                  kind: "well-played",
                });
                if (currentResult.current === target) {
                  setData((old: any) => ({
                    ...(old || { received: [], sent: [] }),
                    sent: [
                      ...(old?.sent || []),
                      { recipient, kind: "well-played" },
                    ],
                  }));
                  await load();
                }
              } catch (e) {
                if (currentResult.current === target) setError(errorMessage(e));
              } finally {
                sending.current = false;
                setBusy(false);
              }
            }}
          >
            <Heart
              size={16}
              fill={sent.has(p.canonicalId || p.id) ? "currentColor" : "none"}
            />
            {sent.has(p.canonicalId || p.id)
              ? `Respect given · ${p.name}`
              : `Well played, ${p.name}`}
          </button>
        ))}
      {data?.received.map((r: any) => (
        <p key={r.kind}>
          {r.count}{" "}
          {r.kind === "respect"
            ? "respect acknowledgements"
            : "well-played acknowledgements"}{" "}
          received.
        </p>
      ))}
      <InlineError message={error} />
      {error && (
        <button className="text-button" disabled={busy} onClick={load}>
          Retry encouragement
        </button>
      )}
    </section>
  );
}
