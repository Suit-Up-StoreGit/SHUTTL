import { useEffect, useId, useRef, useState } from "react";
import { api, dateTimeLabel, errorMessage } from "../api.ts";
import type { Category } from "../domain.ts";
import { InlineError } from "./UI.tsx";
import "../podiums.css";

export function PodiumBadge({ place }: { place: number }) {
  const id = useId().replaceAll(":", ""),
    colors =
      place === 1
        ? ["#fff0b8", "#b28638", "#71501b"]
        : place === 2
          ? ["#f0f6f8", "#8ca9b4", "#426371"]
          : ["#ffd3b3", "#be835b", "#754624"];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="podium-badge"
      width="96"
      height="110"
      viewBox="0 0 96 110"
      role="img"
      aria-label={`Podium place ${place}`}
    >
      <defs>
        <linearGradient id={id} x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset=".5" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[0]} />
        </linearGradient>
      </defs>
      <path d="M29 70 16 107l25-8 7 8 7-8 25 8-13-37" fill={colors[2]} />
      <path
        d="M48 3 85 17v40Q83 79 48 92 13 79 11 57V17z"
        fill={`url(#${id})`}
        stroke={colors[2]}
        strokeWidth="2"
      />
      <path d="M48 11 77 23v33Q74 72 48 82 22 72 19 56V23z" fill="#153e31" />
      <path d="m30 32 9 6 9-13 9 13 9-6-5 14H35z" fill={colors[0]} />
      <text
        x="48"
        y="71"
        textAnchor="middle"
        fontFamily="Arial,sans-serif"
        fontWeight="bold"
        fontSize="28"
        fill={colors[0]}
      >
        {place}
      </text>
      <path
        d="m14 20 5-1m58 46 5-7"
        stroke="#fff"
        strokeOpacity=".6"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function Podiums({
  me,
  category,
  compact = false,
}: {
  me: any;
  category: Category;
  compact?: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [area, setArea] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const root = useRef<HTMLElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const count = me.ratings.find((r: any) => r.category === category)?.count;
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/podiums?category=${category}`)
      .then((v) => {
        if (active && v.owner === me.id && v.category === category) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [me.id, category, count, attempt]);
  useEffect(() => {
    if (compact) return;
    let active = true;
    api("/arena-place")
      .then((v) => {
        if (active && v.owner === me.id) setArea(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [me.id, compact]);
  const download = async (board: any) => {
    setBusy(true);
    setError("");
    try {
      const svg = root.current?.querySelector(
        `[data-pool="${board.id}"] svg`,
      ) as SVGElement;
      const image = new Image(),
        url = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(svg)], {
            type: "image/svg+xml",
          }),
        );
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Badge image could not be prepared."));
          image.src = url;
        });
        if (!alive.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f3f2e9";
        ctx.fillRect(0, 0, 1080, 1350);
        ctx.fillStyle = "#14372c";
        ctx.fillRect(60, 60, 960, 1230);
        ctx.drawImage(image, 350, 195, 380, 435);
        ctx.fillStyle = "#e8f0dc";
        ctx.textAlign = "center";
        ctx.font = "bold 42px Arial";
        ctx.fillText("SHUTTL. / ON THE PODIUM", 540, 125);
        ctx.font = "bold 54px Arial";
        ctx.fillText(
          `${board.shared ? "Joint " : ""}#${board.position} · ${category}`,
          540,
          730,
        );
        ctx.font = "32px Arial";
        const label = board.label;
        const words = label.split(" ");
        let line = "",
          y = 800;
        for (const word of words) {
          const next = line ? line + " " + word : word;
          if (ctx.measureText(next).width > 800 && line) {
            ctx.fillText(line, 540, y);
            y += 42;
            line = word;
          } else line = next;
        }
        ctx.fillText(line, 540, y);
        ctx.font = "26px Arial";
        ctx.fillText(
          `Among ${board.comparable} comparable participating players`,
          540,
          980,
        );
        ctx.fillText("SHUTTL estimates · standings can change", 540, 1030);
        ctx.font = "22px Arial";
        ctx.fillText(dateTimeLabel(data.asOf, me.timezone), 540, 1110);
        ctx.fillText(
          data.demo
            ? "FICTIONAL DEMO PLAYERS"
            : "A snapshot of a participating SHUTTL pool",
          540,
          1180,
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Badge export failed."))),
            "image/png",
          ),
        );
        if (!alive.current) return;
        const downloadUrl = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `shuttl-${category.toLowerCase()}-${board.id}-podium.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
        setNotice(
          "Your podium card is downloaded. It stays private until you share the file.",
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (compact && me.breakMode) return null;
  const boards = compact
    ? data?.boards
        .filter((b: any) => b.podium || b.id === "friends")
        .slice(0, 1)
    : data?.boards;
  return (
    <section
      ref={root}
      className={`podiums-panel ${compact ? "podiums-compact" : ""}`}
      aria-label="Your competitive podiums"
    >
      <span className="eyebrow">YOUR CIRCLE / YOUR PLACE</span>
      <h3>
        {data?.boards.some((b: any) => b.podium)
          ? "A place worth defending."
          : "The next spot is yours to chase."}
      </h3>
      <InlineError message={error} />
      {boards?.map((board: any) => (
        <div className="podium-entry" data-pool={board.id} key={board.id}>
          {board.podium ? (
            <PodiumBadge place={board.position} />
          ) : (
            <span className="podium-placeholder">
              {board.position ? `#${board.position}` : "—"}
            </span>
          )}
          <div>
            <strong>{board.label}</strong>
            <p>
              {board.ready
                ? `${board.shared ? "Joint " : ""}#${board.position} of ${board.comparable} comparable players · ${category}`
                : board.geographic
                  ? "Pool forming · requires validated comparable estimates and 20 eligible players"
                  : "Circle forming · three comparable revealed ratings unlock standings"}
            </p>
            {board.pointsToPass && (
              <p>
                {board.pointsToPass} points to pass the next estimate.
                {!compact && " Every confirmed result can move either way."}
              </p>
            )}
            {board.podium && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => download(board)}
              >
                Download my podium card
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="podium-context">
        {compact
          ? "A SHUTTL pool snapshot. Places can change; ties share a place."
          : "Snapshot standings. Badges move with the leaderboard. Ties share a place. Geographic pools use declared areas and opted-in players; they do not rank every player in a location."}
      </p>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => setAttempt((n) => n + 1)}
      >
        Refresh my standings
      </button>
      {!compact && area && (
        <details className="podium-area">
          <summary>My neighbourhood & region</summary>
          <p>
            Country, city, district and local opt-in are managed in your profile
            settings. Add these optional declared areas for more specific pools.
          </p>
          <label htmlFor="arena-region">Region / state</label>
          <input
            id="arena-region"
            disabled={busy}
            maxLength={80}
            value={area.region}
            onChange={(e) => setArea({ ...area, region: e.target.value })}
          />
          <label htmlFor="arena-neighborhood">Neighbourhood</label>
          <input
            id="arena-neighborhood"
            disabled={busy}
            maxLength={80}
            value={area.neighborhood}
            onChange={(e) => setArea({ ...area, neighborhood: e.target.value })}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  "/arena-place",
                  { region: area.region, neighborhood: area.neighborhood },
                  "PUT",
                );
                setAttempt((n) => n + 1);
                setNotice("Your declared competition areas are saved.");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save my competition areas
          </button>
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
