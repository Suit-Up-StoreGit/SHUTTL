import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Heart, MapPin, Sparkles } from "lucide-react";
import { api, ApiError, dateLabel, errorMessage } from "../api.ts";
import { leagueFor, type Category } from "../domain.ts";
import { ownChange, publishedPlayedAt } from "../experience.ts";
import { Avatar, Gem } from "./UI.tsx";

export function ShuttleMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`shuttle-illustration ${className}`}
      viewBox="0 0 160 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M56 148 12 31Q26 15 40 26L75 145M67 146 42 18Q55 6 67 21L81 145M80 146 69 18Q80 5 91 18L93 148M91 147 94 20Q108 8 120 23L104 150M103 149 122 27Q140 21 148 38L115 155"
        stroke="currentColor"
        strokeWidth="2.8"
      />
      <path
        d="M28 69Q81 47 139 78M42 106Q82 89 128 112M53 137Q84 126 118 143"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M56 148Q84 136 115 155L111 176Q99 195 77 185L62 175Z"
        fill="currentColor"
        fillOpacity=".18"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M64 158Q85 149 110 161" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const seenMoments = new Set<string>();
export function HomeEarnedMoment({
  earned,
  moment,
  timezone,
  open,
}: {
  earned: any;
  moment: any;
  timezone: string;
  open: () => void;
}) {
  const identity = `${earned.ownParticipant}:${earned.id}:${earned.publishedRevisionId}:${moment.kind}`;
  const [arrival, setArrival] = useState(false);
  useEffect(() => {
    if (seenMoments.has(identity)) {
      setArrival(false);
      return;
    }
    seenMoments.add(identity);
    if (seenMoments.size > 256)
      seenMoments.delete(seenMoments.values().next().value!);
    setArrival(true);
  }, [identity]);
  return (
    <button
      className={`home-earned earned-${moment.kind}`}
      data-arrival={arrival || undefined}
      onClick={open}
    >
      <span className="home-earned-seal">
        <Gem league={leagueFor(moment.change.after).name} size={44} />
      </span>
      <span className="home-earned-copy">
        <small>ON COURT / EARNED</small>
        <strong>{moment.title}</strong>
        <span>
          {dateLabel(publishedPlayedAt(earned), timezone)} · View your confirmed
          result
        </span>
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}

export function CongratulateFriend({
  entry,
  mock = false,
  refresh,
}: {
  entry: any;
  mock?: boolean;
  refresh?: () => void;
}) {
  const [sent, setSent] = useState(entry.congratulated),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [needsRefresh, setNeedsRefresh] = useState(false);
  const sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (entry.congratulated) setSent(true);
  }, [entry.congratulated]);
  if (!entry.canCongratulate && !sent) return null;
  return (
    <div className="friend-congratulation">
      <button
        className="text-button"
        disabled={busy || sent}
        aria-label={
          sent
            ? `Congratulated ${entry.player.name}`
            : `Congratulate ${entry.player.name}`
        }
        onClick={async () => {
          if (sending.current) return;
          sending.current = true;
          setBusy(true);
          setError("");
          setNeedsRefresh(false);
          try {
            if (!mock)
              await api(`/activity/${entry.unitId}/congratulate`, {
                playerId: entry.player.id,
                revisionId: entry.revisionId,
              });
            if (alive.current) setSent(true);
          } catch (e) {
            if (alive.current) {
              setError(errorMessage(e));
              setNeedsRefresh(
                e instanceof ApiError && [403, 409].includes(e.status),
              );
            }
          } finally {
            sending.current = false;
            if (alive.current) setBusy(false);
          }
        }}
      >
        <Heart size={14} fill={sent ? "currentColor" : "none"} />
        {sent
          ? "Congratulated"
          : busy
            ? "Sending…"
            : error
              ? "Retry congratulations"
              : "Congratulate"}
        {sent && <Check size={13} />}
      </button>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
      {needsRefresh && refresh && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError("");
            setNeedsRefresh(false);
            refresh();
          }}
        >
          Refresh milestones <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}

export function ReceivedRespect({
  items,
  open,
}: {
  items: any[];
  open: (id: string) => void;
}) {
  if (!items?.length) return null;
  return (
    <section className="home-received-respect" aria-label="Private recognition">
      <div>
        <Heart size={16} />
        <span className="eyebrow">FROM YOUR PEOPLE</span>
        <small>Only you see this</small>
      </div>
      {items.map((r) => (
        <button key={r.id} onClick={() => open(r.unitId)}>
          <Avatar player={r.player} small />
          <span>
            <strong>{r.player.name}</strong>
            <span>
              {r.kind === "well-played"
                ? `Well played · ${r.category.toLowerCase()}`
                : `Celebrated your ${r.category.toLowerCase()} ${r.milestone === "reveal" ? "rating reveal" : r.milestone === "promotion" ? "new league" : "personal best"}`}
            </span>
          </span>
          <ArrowUpRight size={15} />
        </button>
      ))}
      <p>Private recognition. No rating points or public counters.</p>
    </section>
  );
}

export function LocalCourtLink({
  me,
  court,
  category,
  open,
  friends = [],
  compare,
}: {
  me: any;
  court: any;
  category: Category;
  open: () => void;
  friends?: any[];
  compare?: (id: string, category?: Category) => void;
}) {
  const label =
    "Local players" +
    (me.localOptIn && me.city
      ? ` · ${me.district || me.city}`
      : me.city
        ? " · explore"
        : " · choose your area");
  const localFriend =
    me.localOptIn && me.city && court && compare
      ? friends.find(
          (friend) =>
            friend.id !== me.id &&
            court.people?.some((person: any) => person.id === friend.id),
        )
      : null;
  const localAction = (
    <button
      className={`text-button ${court ? "home-local-court" : ""}`}
      aria-label={label}
      onClick={open}
    >
      <MapPin size={court ? 19 : 16} />
      <span className={court ? "home-local-copy" : undefined}>
        {court ? <strong className="home-local-title">{label}</strong> : label}
        {court && (
          <>
            <span className="home-local-presence">
              <span>
                <b>{court.count}</b> opted-in{" "}
                {court.count === 1 ? "player" : "players"}
                {court.sampled ? " in this sample" : ""}
              </span>
              {court.people?.length > 0 && (
                <span className="home-local-people" aria-hidden="true">
                  {court.people.map((p: any) => (
                    <Avatar key={p.id} player={p} small />
                  ))}
                </span>
              )}
            </span>
            <small className="home-local-estimates">
              {court.published[category]} published {category.toLowerCase()}{" "}
              {court.published[category] === 1 ? "estimate" : "estimates"}
            </small>
            <small className="home-local-recent">
              {court.active
                ? `${court.active} recorded play in the last seven days`
                : "A local circle starts with the people you play with"}
            </small>
            <small className="home-local-region">{court.label}</small>
          </>
        )}
      </span>
      {court && <ArrowUpRight size={17} aria-hidden="true" />}
    </button>
  );
  if (!localFriend) return localAction;
  const name = localFriend.name || localFriend.username || "Player";
  return (
    <div className="home-local-module">
      {localAction}
      <div className="home-local-connection">
        <Avatar player={localFriend} small />
        <span>
          <small>Accepted local connection</small>
          <strong>{name}</strong>
        </span>
        <button
          className="text-button home-local-connection-compare"
          aria-label={`Compare ${name} in ${category.toLowerCase()}`}
          onClick={() => compare?.(localFriend.id, category)}
        >
          Compare <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function HomeNextStep({
  results,
  rating,
  category,
  brief,
  open,
}: {
  results: any[];
  rating: any;
  category: Category;
  brief: () => void;
  open: (id: string) => void;
}) {
  const latest = [...results]
    .filter((r) => r.publishedRevisionId)
    .sort((a, b) =>
      publishedPlayedAt(b).localeCompare(publishedPlayedAt(a)),
    )[0];
  const change = latest && ownChange(latest);
  const recent =
    latest &&
    Date.parse(publishedPlayedAt(latest)) >= Date.now() - 7 * 86400000 &&
    Date.parse(publishedPlayedAt(latest)) <= Date.now();
  const loss =
    recent &&
    latest.status === "rated" &&
    (change || latest.ownProgress)?.won === false;
  if (!rating.count && !latest) return null;
  return (
    <section
      className={`home-next-step ${loss ? "after-loss" : ""}`}
      aria-label="Your next step"
    >
      <span className="home-next-mark">
        <ShuttleMark />
      </span>
      <div>
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <h3>
          {loss
            ? "One result. A bigger picture."
            : !recent
              ? "Your progress is still here."
              : "Make your progress yours."}
        </h3>
        <p>
          {loss
            ? `Your side lost the latest confirmed ${category.toLowerCase()} match. Put it in context with your playing connections and result turning points.`
            : !recent
              ? "Revisit your playing connections, result turning points and next marker. No streak to protect."
              : "Your playing connections, result turning points and a progress card to keep. Built from your confirmed matches."}
        </p>
        <div>
          <button className="text-button" onClick={brief}>
            <Sparkles size={15} />
            Your progress brief <ArrowUpRight size={15} />
          </button>
          {loss && (
            <button className="text-button" onClick={() => open(latest.id)}>
              Review that match <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
