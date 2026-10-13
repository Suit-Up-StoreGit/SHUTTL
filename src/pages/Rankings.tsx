import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, Crown, MapPin, UsersRound } from "lucide-react";
import { api, dateLabel, errorMessage } from "../api.ts";
import { LEAGUES, type Category } from "../domain.ts";
import {
  Avatar,
  CategoryTabs,
  Gem,
  InlineError,
  PageHeading,
  SectionHeading,
  Spinner,
} from "../components/UI.tsx";

const scoreLabel = (score: number | null | undefined) =>
  typeof score === "number" ? score.toLocaleString("en-SG") : "—";

function playerMaterial(player: any): CSSProperties {
  return {
    "--league-accent":
      LEAGUES.find((league) => league.name === player.rating.league)?.color ||
      "#9eb198",
  } as CSSProperties;
}

function EstimateTable({
  players,
  me,
  category,
  qualified = false,
  player: playerSelect,
}: {
  players: any[];
  me: string;
  category: Category;
  qualified?: boolean;
  player?: (p: any) => void;
}) {
  const positions = new Map<number, number>();
  if (qualified)
    for (const player of players)
      positions.set(player.position, (positions.get(player.position) || 0) + 1);
  return (
    <div
      className={
        "rankings-table " + (qualified ? "is-qualified" : "is-unranked")
      }
      role="table"
      aria-label={
        qualified ? "Qualified standings" : "Unranked player estimates"
      }
    >
      <div className="rankings-table-head" role="row">
        {qualified && <span role="columnheader">Place</span>}
        <span role="columnheader">Player</span>
        <span role="columnheader">{qualified ? "Rating" : "Estimate"}</span>
      </div>
      {players.map((player) => {
        const own = player.id === me;
        const top = qualified && player.top;
        const tied = qualified && (positions.get(player.position) || 0) > 1;
        const detail = top
          ? tied
            ? "Joint top-rated in this named pool"
            : "Top-rated in this named pool"
          : player.rating.status;
        return (
          <div
            className={
              "ranking-row rankings-player-row" +
              (own ? " is-you" : "") +
              (top ? " is-top" : "")
            }
            role="row"
            key={player.id}
            style={playerMaterial(player)}
            data-player-id={player.id}
            data-current-player={own ? "true" : undefined}
          >
            {qualified && (
              <div className="rankings-place" role="cell">
                <strong>{player.position}</strong>
                {tied && <small>Shared</small>}
              </div>
            )}
            <div className="rankings-player" role="rowheader">
              <Avatar player={player} />
              <div className="ranking-person">
                <div className="rankings-name-line">
                  {playerSelect && player.canConnect !== false ? (
                    <button
                      className="ranking-player-link"
                      onClick={() => playerSelect(player)}
                      aria-label={`View ${player.name}`}
                    >
                      <strong>{player.name}</strong>
                      <ArrowUpRight size={13} />
                    </button>
                  ) : (
                    <strong>{player.name}</strong>
                  )}
                  {own && <span className="rankings-you-label">You</span>}
                </div>
                <small className="rankings-player-status">
                  {top && <Crown size={13} aria-hidden="true" />}
                  {detail}
                </small>
                {!qualified && (
                  <small className="rankings-player-evidence">
                    {category === "Singles"
                      ? Number.isFinite(player.rating.count)
                        ? `${player.rating.count} confirmed ${player.rating.count === 1 ? "result" : "results"}`
                        : "Published estimate"
                      : Number.isFinite(player.rating.partnerCount)
                        ? `${player.rating.partnerCount} recorded ${player.rating.partnerCount === 1 ? "partner" : "partners"}`
                        : "Published estimate"}
                  </small>
                )}
              </div>
            </div>
            <div className="rankings-rating" role="cell">
              <strong className="ranking-number">
                {scoreLabel(player.rating.score)}
              </strong>
              <span className="rankings-league">
                <Gem league={player.rating.league} size={21} />
                {player.rating.league || "Not revealed"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function RankingsPage({
  data,
  category,
  setCategory,
  player,
}: {
  data: any;
  category: Category;
  setCategory: (category: Category) => void;
  player?: (p: any) => void;
}) {
  const [circle, setCircle] = useState(""),
    [ranking, setRanking] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setRanking(null);
    setError("");
    api("/rankings?category=" + category + (circle ? "&circle=" + circle : ""))
      .then((r) => {
        if (active) setRanking(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [
    category,
    circle,
    data.me.country,
    data.me.city,
    data.me.district,
    data.me.localOptIn,
    attempt,
  ]);
  const issued = ranking?.crownAvailable ? ranking.players : [];
  const issuedIds = new Set(issued.map((player: any) => player.id));
  const developing = ranking
    ? ranking.developing.filter((player: any) => !issuedIds.has(player.id))
    : [];
  const ownPlace = issued.find((player: any) => player.id === data.me.id);
  const ownEstimate = ranking?.developing.find(
    (player: any) => player.id === data.me.id,
  );
  const ownTied =
    ownPlace &&
    issued.filter((player: any) => player.position === ownPlace.position)
      .length > 1;
  const prioritizeEstimates = !ranking?.crownAvailable && developing.length > 0;
  const estimatesBoard = ranking ? (
    <section className="panel rankings-board rankings-estimates">
      <div className="rankings-board-heading">
        <SectionHeading title="Developing player estimates" />
        <span className="rankings-table-tag">Unranked</span>
      </div>
      <p className="rankings-board-intro">
        These estimates are shown without individual rank. Separate playing
        networks and fixed partners can leave comparisons unresolved.
      </p>
      {developing.length ? (
        <EstimateTable
          players={developing}
          me={data.me.id}
          category={category}
          player={player}
        />
      ) : (
        <div className="rankings-estimates-empty">
          <Gem size={42} />
          <h3>
            {ranking.crownAvailable
              ? "No additional estimates"
              : "The first chapter is yours"}
          </h3>
          <p>
            {ranking.crownAvailable
              ? "The visible estimates are included in the supported table."
              : "Five confirmed results reveal an estimate in this category."}
          </p>
          {!ranking.crownAvailable && (
            <a className="text-button" href="/home">
              Go to your court <ArrowUpRight size={16} />
            </a>
          )}
        </div>
      )}
    </section>
  ) : null;
  return (
    <div className="rankings-view">
      <PageHeading eyebrow="A LEAD WORTH EARNING" title="Your local picture" />
      <p className="page-subtitle">
        Qualified tables compare players in a named SHUTTL pool. A title never
        claims to rank every resident or certify someone’s ability.
      </p>
      <div className="rankings-controls">
        <CategoryTabs value={category} onChange={setCategory} />
        <div className="field rankings-pool-control">
          <label htmlFor="comparison-pool">Comparison pool</label>
          <select
            id="comparison-pool"
            value={circle}
            onChange={(e) => setCircle(e.target.value)}
          >
            <option value="">
              {data.me.district || "Your district"} · declared district
            </option>
            {data.circles.map((c: any) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <InlineError message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((v) => v + 1)}
        >
          Retry comparison pool
        </button>
      )}
      {!ranking && !error ? (
        <Spinner />
      ) : ranking ? (
        <>
          <section
            className="rankings-pool-hero"
            aria-label="Comparison pool overview"
          >
            <div className="rankings-hero-priority">
              <span className="rankings-pool-type">
                {circle ? (
                  <UsersRound size={16} aria-hidden="true" />
                ) : (
                  <MapPin size={16} aria-hidden="true" />
                )}
                {circle ? "YOUR EXISTING GROUP" : "YOUR DECLARED LOCAL POOL"}
              </span>
              {(ownPlace || ownEstimate) && (
                <dl className="rankings-own-fact">
                  <dt>
                    {ownPlace
                      ? ownTied
                        ? "Your shared position"
                        : "Your position"
                      : "Your estimate"}
                  </dt>
                  <dd>
                    <strong>
                      {ownPlace
                        ? "#" + ownPlace.position
                        : scoreLabel(ownEstimate.rating.score)}
                    </strong>
                    {!ownPlace && <small>Unranked in this pool</small>}
                  </dd>
                </dl>
              )}
            </div>
            <div className="rankings-pool-identity">
              <h2>{ranking.name}</h2>
              <p>
                {category} · Updated {dateLabel(ranking.asOf)}
              </p>
              <span
                className={
                  "rankings-pool-state " +
                  (ranking.crownAvailable ? "is-issued" : "")
                }
              >
                {ranking.crownAvailable && (
                  <Crown size={15} aria-hidden="true" />
                )}
                {ranking.crownAvailable
                  ? "Qualified comparison table"
                  : "No individual positions issued"}
              </span>
            </div>
            <dl className="rankings-pool-facts">
              <div>
                <dt>{circle ? "Visible group players" : "Opted-in players"}</dt>
                <dd>{ranking.total}</dd>
              </div>
              <div>
                <dt>
                  {ranking.crownAvailable
                    ? "Eligible players"
                    : "Visible estimates"}
                </dt>
                <dd>
                  {ranking.crownAvailable
                    ? ranking.eligible
                    : ranking.developing.length}
                </dd>
              </div>
            </dl>
          </section>
          <div className="rankings-grid">
            {prioritizeEstimates && estimatesBoard}
            <section
              className={
                "panel rankings-board " +
                (!ranking.crownAvailable ? "rankings-forming" : "")
              }
            >
              {ranking.crownAvailable ? (
                <>
                  <div className="rankings-board-heading">
                    <SectionHeading title="The supported table" />
                    <span className="rankings-table-tag">{category}</span>
                  </div>
                  <p className="rankings-board-intro">
                    Ties share their position and any title. Only supported,
                    recent individual evidence qualifies.
                  </p>
                  <EstimateTable
                    players={issued}
                    me={data.me.id}
                    category={category}
                    qualified
                    player={player}
                  />
                </>
              ) : (
                <>
                  <div className="rankings-forming-mark" aria-hidden="true">
                    {ranking.needsDistrict ? (
                      <MapPin size={30} />
                    ) : (
                      <UsersRound size={30} />
                    )}
                    <span className="rankings-mark-ring" />
                  </div>
                  <span className="eyebrow">SHARED EVIDENCE COMES FIRST</span>
                  <h2>
                    {ranking.needsDistrict
                      ? "Choose your local context"
                      : "Your local table is forming"}
                  </h2>
                  <p>
                    {ranking.needsDistrict
                      ? "Choose your country, city and area, then decide whether to join your declared comparison pool."
                      : "These player estimates can start a useful level conversation while individual comparison evidence develops."}
                  </p>
                  <div className="rankings-forming-rule">
                    Individual titles need enough supported, recent playing
                    evidence and a validated comparison policy. No crown has
                    been issued for this pool.
                  </div>
                  <a
                    className="button secondary rankings-forming-action"
                    href={
                      ranking.needsDistrict
                        ? "/profile?tab=settings"
                        : "/friends"
                    }
                  >
                    {ranking.needsDistrict
                      ? "Set your local context"
                      : "Compare with your friends"}
                    <ArrowUpRight size={16} />
                  </a>
                </>
              )}
            </section>
            {!prioritizeEstimates && estimatesBoard}
          </div>
        </>
      ) : null}
    </div>
  );
}
