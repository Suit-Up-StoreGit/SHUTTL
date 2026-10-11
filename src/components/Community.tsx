import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Copy, Heart, UsersRound } from "lucide-react";
import { api, dateLabel, errorMessage } from "../api.ts";
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
    [qr, setQr] = useState(""),
    [invitation, setInvitation] = useState<any>(null),
    [invitations, setInvitations] = useState<any[]>([]),
    [error, setError] = useState("");
  const link = invitation
    ? location.origin + invitation.path
    : location.origin + "/home?player=" + encodeURIComponent(me.username);
  useEffect(() => {
    let active = true;
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
          if (active) setQr(value);
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
  }, [open, invitation]);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        Show my player code
      </button>
      {open && (
        <Modal
          title="Meet on court. Connect here."
          close={() => setOpen(false)}
        >
          <div className="player-code">
            {qr && (
              <img
                src={qr}
                width="260"
                height="260"
                alt="QR code for this player connection link"
              />
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
          <InlineError message={error} />
          <div className="dialog-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  notify("Connection link copied.");
                } catch {
                  setError("Copy this link manually: " + link);
                }
              }}
            >
              <Copy size={16} /> Copy link
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  if (invitation) {
                    await api("/player-invites/" + invitation.id, {}, "DELETE");
                    setInvitation(null);
                    notify("Invitation revoked.");
                  } else setInvitation(await api("/player-invites", {}));
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              {invitation ? "Revoke invitation" : "Create private invitation"}
            </button>
          </div>
          <details>
            <summary>Connection link</summary>
            <p className="wrap-anywhere">{link}</p>
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
                      onClick={async () => {
                        try {
                          await api("/player-invites/" + i.id, {}, "DELETE");
                          setInvitations((old) =>
                            old.filter((p) => p.id !== i.id),
                          );
                          notify("Invitation revoked.");
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
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
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
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
  }, [username]);
  return (
    <Modal title="Your next playing connection" close={close}>
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
            <button
              className="button block"
              disabled={busy || data.friend || data.self}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/friends", { playerId: data.player.id });
                  notify("Friend request sent. They choose whether to accept.");
                  refresh();
                  close();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {data.self
                ? "This is your player code"
                : data.friend
                  ? "Already connected"
                  : "Ask to connect"}
            </button>
          </>
        )
      )}
      <InlineError message={error} />
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
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/auth/player-invite/" + encodeURIComponent(token))
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <main className="claim-public">
      <Brand />
      {!data && !error ? (
        <Spinner />
      ) : data ? (
        <>
          <span className="eyebrow">YOUR PEOPLE. YOUR PROGRESS.</span>
          <h1>{data.name} invited you.</h1>
          <p>
            Join their playing circle through a friendship request. The inviter
            reviews your identity. This invitation approves no scores and
            creates no rated-play agreement.
          </p>
          <p className="form-help">Expires {dateLabel(data.expires)}.</p>
          {done ? (
            <div className="notice">
              <strong>Your request is with the inviter.</strong>
              <p>Start your own player passport while they review it.</p>
              <a className="button" href="/home">
                Go to my court <ArrowRight size={16} />
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
                setBusy(true);
                try {
                  await api("/player-invites/" + token + "/accept", {});
                  setDone(true);
                  notify("Friendship request sent.");
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
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
        <h1>This invitation is unavailable.</h1>
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
}: {
  circle: any;
  category: Category;
  me: any;
  open: (id: string) => void;
  refresh: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [period, setPeriod] = useState("week"),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [identity, setIdentity] = useState({
      crest: "shuttle",
      tagline: "",
      recapDay: 0,
    });
  useEffect(() => {
    let active = true;
    setData(null);
    api(`/circles/${circle.id}/recap?category=${category}&period=${period}`)
      .then((v) => {
        if (active) {
          setData(v);
          setIdentity(v.identity);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [circle.id, category, period]);
  useEffect(() => {
    recordResearch("group-recap-view", me.id);
  }, [circle.id, me.id]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/circles/${circle.id}/identity`, identity, "PATCH");
      setEditing(false);
      setData({ ...data, identity });
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="panel group-passport">
      <div className="group-passport-header">
        <Crest kind={data?.identity.crest} />
        <div>
          <span className="eyebrow">YOUR GROUP PASSPORT</span>
          <h2>{circle.name}</h2>
          <p>
            {data?.identity.tagline ||
              "A shared picture, earned in your existing group."}
          </p>
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
                <span>
                  {p.visibleChange === null
                    ? "Placement"
                    : `${p.visibleChange >= 0 ? "+" : ""}${p.visibleChange} visible change`}
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
      {me.id === circle.owner && (
        <button className="text-button" onClick={() => setEditing(true)}>
          Edit group identity
        </button>
      )}
      {editing && (
        <Modal title="Make this circle yours" close={() => setEditing(false)}>
          <form onSubmit={save}>
            <label htmlFor="group-tagline">Group motto · optional</label>
            <input
              id="group-tagline"
              value={identity.tagline}
              maxLength={100}
              onChange={(e) =>
                setIdentity({ ...identity, tagline: e.target.value })
              }
            />
            <label htmlFor="group-crest">Group crest</label>
            <select
              id="group-crest"
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
            <InlineError message={error} />
            <button className="button block">Save group identity</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function Encouragement({ result }: { result: any }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    api(`/results/${result.id}/encouragement`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
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
            disabled={sent.has(p.canonicalId || p.id)}
            onClick={async () => {
              try {
                await api(`/results/${result.id}/encouragement`, {
                  recipient: p.canonicalId || p.id,
                  kind: "well-played",
                });
                await load();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <Heart size={16} />
            {sent.has(p.canonicalId || p.id)
              ? "Respect given"
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
    </section>
  );
}
