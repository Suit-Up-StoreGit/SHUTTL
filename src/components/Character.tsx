import { useId, useState, useEffect, useRef } from "react";
import { api, errorMessage } from "../api.ts";
import {
  CHARACTER_ITEMS,
  DEFAULT_CHARACTER,
  characterUnlocked,
  type CharacterLook,
} from "../character.ts";
import { InlineError, Spinner } from "./UI.tsx";
import "../character.css";

export function CourtCharacter({
  look = DEFAULT_CHARACTER,
  size = 100,
  mood = "ready",
}: {
  look?: CharacterLook;
  size?: number;
  mood?: "ready" | "win" | "loss";
}) {
  const uid = useId().replaceAll(":", ""),
    dark = look.body === "night",
    solar = look.body === "solar";
  return (
    <svg
      className={`court-character mood-${mood} dance-${look.dance}`}
      width={size}
      height={size}
      viewBox="0 0 160 160"
      data-body={look.body}
      data-accessory={look.accessory}
      data-dance={look.dance}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}shell`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={dark ? "#61737d" : solar ? "#ffd6a4" : "#fffef5"} />
          <stop
            offset="1"
            stopColor={dark ? "#132b31" : solar ? "#c87a49" : "#c1d3c9"}
          />
        </linearGradient>
        <linearGradient id={`${uid}face`} x2="0" y2="1">
          <stop stopColor="#2b6250" />
          <stop offset="1" stopColor="#14372c" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="144" rx="35" ry="5" fill="#14372c" opacity=".12" />
      <g className="character-whole">
        <g className="character-feet" fill="#183d32">
          <path d="M58 126q-8 12-4 14h19v-15z" />
          <path d="M84 125v15h21q3-4-7-14z" />
        </g>
        <path
          d="M56 107q-22 6-24-5"
          stroke="#c4d6ca"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
        <g className="character-racket">
          <path
            d="M108 107l22-30"
            stroke="#bba373"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <ellipse
            cx="139"
            cy="61"
            rx="13"
            ry="19"
            transform="rotate(25 139 61)"
            fill="#ffffff"
            fillOpacity=".35"
            stroke="#244e40"
            strokeWidth="3"
          />
          <path
            d="M129 50l17 16m-20-7 18 16m-7-30-5 32m13-28-6 29"
            stroke="#577c68"
            strokeWidth="1"
          />
        </g>
        <path
          d="M48 67L34 32q11-11 23 3L65 18q15-7 21 4l9-3q13 1 15 17 13-14 22-3l-18 36 1 45q-1 18-35 21-34-2-36-21z"
          fill={`url(#${uid}shell)`}
          stroke={dark ? "#19342f" : "#8ba89c"}
          strokeWidth="2"
        />
        <path
          d="M55 68L47 36m23 30-1-38m21 38 10-31m-45 83q24 14 51-1"
          stroke={dark ? "#91bcac" : "#fffef5"}
          strokeWidth="3"
          fill="none"
          opacity=".75"
        />
        <g className="character-face">
          <rect
            x="47"
            y="65"
            width="66"
            height="45"
            rx="20"
            fill={`url(#${uid}face)`}
          />
          {mood === "loss" ? (
            <path
              d="M60 85l10 3m20 0 10-3m-25 16q5-5 10 0"
              fill="none"
              stroke="#dcf1bb"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse
                cx="65"
                cy="86"
                rx="4"
                ry={mood === "win" ? 3 : 6}
                fill="#e8f4d7"
              />
              <ellipse
                cx="95"
                cy="86"
                rx="4"
                ry={mood === "win" ? 3 : 6}
                fill="#e8f4d7"
              />
              <path
                d="M74 99q6 6 12 0"
                fill="none"
                stroke="#e8f4d7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          )}
          {look.accessory === "visor" && (
            <>
              <path
                d="M48 72q31-15 64 0"
                stroke="#c8f17c"
                strokeWidth="8"
                fill="none"
              />
              <path d="M78 68h42q3 8-5 10H78z" fill="#95c94e" />
            </>
          )}
          {look.accessory === "band" && (
            <path
              d="M46 73q33-13 68 0"
              stroke="#f08e7d"
              strokeWidth="8"
              fill="none"
            />
          )}
        </g>
        {look.accessory === "halo" && (
          <ellipse
            cx="80"
            cy="14"
            rx="29"
            ry="7"
            fill="none"
            stroke="#e1be72"
            strokeWidth="4"
          />
        )}
        <path d="M76 117l4-5 4 5-4 7z" fill={dark ? "#c8f17c" : "#376753"} />
      </g>
      {mood === "win" && (
        <g className="character-sparkles" fill="#b2944c">
          <path d="M22 43l3-7 3 7-3 6zm99 70 3-7 3 7-3 6z" />
          <circle cx="22" cy="117" r="2" />
          <circle cx="115" cy="24" r="2" />
        </g>
      )}
    </svg>
  );
}

export function CharacterWardrobe({
  owner,
  refresh,
}: {
  owner: string;
  refresh: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [look, setLook] = useState<CharacterLook>(DEFAULT_CHARACTER),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [slot, setSlot] = useState("accessory"),
    [replay, setReplay] = useState(0),
    [attempt, setAttempt] = useState(0);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  useEffect(() => {
    let active = true;
    setData(null);
    setLook(DEFAULT_CHARACTER);
    setError("");
    setNotice("");
    setBusy(false);
    api("/character")
      .then((v) => {
        if (active) {
          if (v.owner !== owner)
            throw new Error(
              "Your account changed. Reopen your character collection.",
            );
          setData(v);
          setLook(v.look);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [owner, attempt]);
  return (
    <section className="character-wardrobe" aria-label="Your court character">
      <div className="character-stage">
        <CourtCharacter key={replay} look={look} size={180} mood="win" />
        <span className="eyebrow">FEATHER ONE / YOUR COURT COMPANION</span>
        <h3>Your game. Your signature.</h3>
        <p>
          Everyone starts with the same character. Make yours your own through
          confirmed play.
        </p>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setReplay((n) => n + 1)}
        >
          Preview celebration
        </button>
      </div>
      <InlineError message={error} />
      {!data && error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry character collection
        </button>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div
            className="character-slots"
            role="group"
            aria-label="Character collection"
          >
            <span>
              {data.progress.matches} confirmed matches · {data.progress.wins}{" "}
              wins
            </span>
            {["body", "accessory", "dance"].map((s) => (
              <button
                key={s}
                aria-pressed={slot === s}
                onClick={() => setSlot(s)}
              >
                {s === "body"
                  ? "Characters"
                  : s === "accessory"
                    ? "Accessories"
                    : "Celebrations"}
              </button>
            ))}
          </div>
          <div className="character-items">
            {CHARACTER_ITEMS.filter((i) => i.slot === slot).map((item) => {
              const earned = characterUnlocked(item, data.progress);
              return (
                <button
                  key={item.id}
                  disabled={!earned || busy}
                  aria-pressed={look[item.slot] === item.id}
                  onClick={() => setLook({ ...look, [item.slot]: item.id })}
                >
                  <CourtCharacter
                    look={{ ...look, [item.slot]: item.id }}
                    size={78}
                  />
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                  <span>
                    {earned
                      ? look[item.slot] === item.id
                        ? "Selected"
                        : "Unlocked"
                      : item.matches
                        ? `${data.progress.matches}/${item.matches} confirmed matches`
                        : item.wins
                          ? `${data.progress.wins}/${item.wins} confirmed wins`
                          : `${data.progress.streak}/3 consecutive wins earned`}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            className="button"
            disabled={
              busy || JSON.stringify(look) === JSON.stringify(data.look)
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const v = await api("/character", look, "PUT");
                if (currentOwner.current !== owner || v.owner !== owner) return;
                setData(v);
                setLook(v.look);
                setNotice("Your court look is saved.");
                refresh();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save my court look
          </button>
          <p>
            Cosmetics never change your rating. Only published, player-confirmed
            matches count; corrections can revise unlocks. There are no daily
            check-in penalties.
          </p>
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}

export function CharacterResult({ result }: { result: any }) {
  if (result.status !== "rated" || !result.publishedRevisionId) return null;
  const won =
      result.ownProgress?.won ??
      Object.values(result.ratingChanges || {}).map((c: any) => c.won)[0],
    roster = result.players || [],
    own = roster.findIndex((p: any) => p.id === result.ownParticipant),
    size = roster.length / 2;
  if (own < 0 || typeof won !== "boolean") return null;
  const others = roster.slice(
    own < size ? size : 0,
    own < size ? size * 2 : size,
  );
  const change = Object.values(result.ratingChanges || {})[0] as any;
  return (
    <section
      className={`character-result ${won ? "is-win" : "is-loss"}`}
      aria-label="Confirmed match celebration"
    >
      <span className="eyebrow">CONFIRMED ON COURT</span>
      <h3>{won ? "That one’s yours." : "Next time. Your story continues."}</h3>
      <div className="character-result-cast">
        <div>
          <CourtCharacter
            look={roster[own].character}
            size={115}
            mood={won ? "win" : "loss"}
          />
          <strong>You</strong>
        </div>
        {others.map((p: any) => (
          <div key={p.id}>
            <CourtCharacter
              look={p.character}
              size={90}
              mood={won ? "loss" : "win"}
            />
            <strong>{p.name}</strong>
          </div>
        ))}
      </div>
      <div
        className="character-impact"
        role="group"
        aria-label="Published rating impact"
      >
        {change ? (
          <>
            <span>Your {result.category.toLowerCase()} estimate</span>
            <strong>
              {change.after.toLocaleString("en")}
              {change.count > 5 && (
                <small>
                  {" "}
                  {change.delta > 0 ? "+" : ""}
                  {change.delta} points
                </small>
              )}
            </strong>
          </>
        ) : (
          <>
            <span>Your rating is taking shape</span>
            <strong>
              {result.ownProgress?.count || 0} of 5 confirmed results
            </strong>
          </>
        )}
      </div>
      <p>
        {won
          ? "Enjoy the win. Your published rating recap is below."
          : "One match, not your whole game. Reset for the next one."}
      </p>
    </section>
  );
}
