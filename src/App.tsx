import { useEffect, useState, useRef, type FormEvent } from "react";
import { Bell, LogOut, ArrowRight } from "lucide-react";
import {
  api,
  ApiError,
  errorMessage,
  setCsrf,
  setDisplayTimezone,
  type Page,
} from "./api.ts";
import { type Category, type Player, FORMATS } from "./domain.ts";
import {
  Brand,
  Avatar,
  Navigation,
  Spinner,
  InlineError,
  ScoreGames,
} from "./components/UI.tsx";
import {
  Auth,
  RecoveryCode,
  PlayerLookup,
  RecordResult,
  ResultReview,
  AgreementForm,
} from "./components/Flows.tsx";
import {
  Home,
  HOME_CONCEPTS,
  mockDashboard,
  RatingCard,
} from "./pages/Home.tsx";
import { InvitationLanding, PlayerArrival } from "./components/Community.tsx";
import { recordResearch } from "./components/Preferences.tsx";
import {
  FriendsPage,
  RankingsPage,
  ProfilePage,
  AgreementsPage,
  InboxPage,
  SharePassport,
  ReviewerPage,
  ComparisonDialog,
} from "./pages/Pages.tsx";
const pageFromPath = (): Page => {
  const page = location.pathname.slice(1);
  return [
    "home",
    "friends",
    "rankings",
    "profile",
    "inbox",
    "agreements",
    "reviewer",
  ].includes(page)
    ? (page as Page)
    : "home";
};
function PublicView({
  claim,
  loggedIn,
  signIn,
  notify,
}: {
  claim: boolean;
  loggedIn: boolean;
  signIn: () => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requested, setRequested] = useState(false);
  const token = location.pathname.split("/")[2],
    path = (claim ? "/claims/" : "/shares/") + encodeURIComponent(token);
  useEffect(() => {
    let active = true;
    api(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <main className={claim ? "claim-public" : "share-public"}>
      <Brand />
      {!data && !error ? (
        <Spinner />
      ) : error ? (
        <>
          <h1>This link is unavailable.</h1>
          <InlineError message={error} />
          <a className="button secondary" href="/home">
            Return to your court
          </a>
        </>
      ) : claim ? (
        <>
          <span className="eyebrow">YOUR SCORE. YOUR CHOICE.</span>
          <h1>{data.author.name} invited you.</h1>
          <p>
            An invitation for <strong>{data.name}</strong>. Check that this is
            you before claiming it. The author verifies who joined; you still
            approve each exact score yourself.
          </p>
          {data.results.map((r: any, i: number) => (
            <section className="panel settings-panel" key={i}>
              <strong>
                {r.category} · {FORMATS[r.format as keyof typeof FORMATS].label}
              </strong>
              <ScoreGames games={r.games} />
            </section>
          ))}
          {requested || data.state === "requested" ? (
            <div className="notice">
              <strong>Waiting for the inviter’s identity check</strong>
              <p>
                Claiming an invitation does not approve a result. Review your
                inbox after the inviter verifies who joined.
              </p>
              <a className="text-button" href="/inbox">
                Go to my inbox
                <ArrowRight size={15} />
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
                  await api("/claims/" + token + "/request", {});
                  setRequested(true);
                  notify(
                    "Your identity claim is awaiting the inviter’s check.",
                  );
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {loggedIn
                ? "This invitation is for me"
                : "Sign in and keep this exact invitation"}
              <ArrowRight size={16} />
            </button>
          )}
          <a className="text-button" href="/home">
            This invitation is not for me
          </a>
        </>
      ) : (
        <>
          <span className="eyebrow">A DATED PLAYER SNAPSHOT</span>
          <h1>
            {data.name ? data.name + "’s progress." : "A number worth earning."}
          </h1>
          <RatingCard
            category={data.category}
            rating={{
              category: data.category,
              score: data.score,
              league: data.league,
              status: data.status,
              count: 5,
              peak: data.score,
              partnerCount: 0,
              comparisonClass: null,
              lastPlayed: data.asOf,
            }}
          />
          <div className="notice">
            <strong>
              {data.template === "reveal"
                ? "A historical starting point"
                : data.template === "best"
                  ? "A historical personal best"
                  : data.isCurrent
                    ? "This number matches the current rating"
                    : "This is a historical snapshot"}
            </strong>
            {data.title && (
              <div className="notice">
                <strong>
                  {data.title.label} · {data.title.pool}
                </strong>
                <p>
                  Among {data.title.eligible} eligible players as of the
                  snapshot date. A historical title is separate from the current
                  lead.
                </p>
              </div>
            )}
            <p>
              {data.template && data.template !== "passport"
                ? "Match played "
                : "Snapshot "}
              {new Date(data.asOf).toLocaleDateString("en-SG", {
                timeZone: "UTC",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              UTC · {data.status} estimate.{" "}
              {data.district ? data.district + " · Declared district. " : ""}
              This is not a whole-neighborhood ranking or a live title.
            </p>
            {data.template &&
              data.template !== "passport" &&
              data.createdAt && (
                <p>
                  Created from published history on{" "}
                  {new Date(data.createdAt).toLocaleDateString("en-SG", {
                    timeZone: "UTC",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  UTC. Later corrections may change the rating history.
                </p>
              )}
          </div>
          <a
            className="button block"
            href={"/home?fromShare=" + encodeURIComponent(token)}
          >
            Start your own badminton story
            <ArrowRight size={17} />
          </a>
        </>
      )}
    </main>
  );
}
function DesignReview() {
  const selected =
    new URLSearchParams(location.search).get("concept") || "passport";
  const [concept, setConcept] = useState(
      HOME_CONCEPTS.some((c) => c.id === selected) ? selected : "passport",
    ),
    [category, setCategory] = useState<Category>("Doubles"),
    [toast, setToast] = useState("");
  const score = Number(new URLSearchParams(location.search).get("score"));
  const data = mockDashboard(
    Number.isFinite(score) && score >= 600 && score <= 3000
      ? Math.round(score)
      : 1628,
  );
  const sample = () => {
    setToast("Design sample only. No live account or match is changed.");
    setTimeout(() => setToast(""), 3000);
  };
  return (
    <div className="design-layout">
      <div className="design-controls">
        <Brand />
        <div>
          {HOME_CONCEPTS.map((c) => (
            <button
              key={c.id}
              aria-pressed={concept === c.id}
              onClick={() => {
                setConcept(c.id);
                history.replaceState({}, "", "/design?concept=" + c.id);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="design-caption">
        HOME DESIGN REVIEW · Fictional players and sample results ·{" "}
        {HOME_CONCEPTS.find((c) => c.id === concept)?.description}
      </div>
      <div className="app-shell design-shell design-stage">
        <Navigation
          page="home"
          setPage={sample}
          unread={2}
          name="Simon"
          reviewer={false}
          logout={sample}
        />
        <main className="main-stage">
          <header className="topbar">
            <div className="topbar-brand">
              <Brand small />
            </div>
            <span className="topbar-caption">
              <span className="tiny-dot" />
              YOUR PLAYER PASSPORT
            </span>
            <div className="topbar-actions">
              <button
                className="icon-button"
                aria-label="Sample inbox"
                onClick={sample}
              >
                <Bell size={18} />
                <span className="unread-dot" />
              </button>
              <button
                className="icon-button"
                aria-label="Sample profile"
                onClick={sample}
              >
                <Avatar player={data.me} small />
              </button>
            </div>
          </header>
          <Home
            data={data}
            category={category}
            setCategory={setCategory}
            setPage={sample}
            record={sample}
            addFriend={sample}
            variant={concept}
            mock
          />
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
export function App() {
  const accountEpoch = useRef(0);
  const inboxGeneration = useRef(0);
  const design = location.pathname === "/design";
  const publicClaim = location.pathname.startsWith("/claim/"),
    publicShare = location.pathname.startsWith("/share/"),
    publicConnect = location.pathname.startsWith("/connect/");
  const [arrivalPlayer, setArrivalPlayer] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("player"),
  );
  const [sharedArrival, setSharedArrival] = useState<any>(null);
  const [data, setData] = useState<any>(null),
    [inbox, setInbox] = useState<any>(null),
    [loading, setLoading] = useState(!design),
    [initialError, setInitialError] = useState(""),
    [initialAttempt, setInitialAttempt] = useState(0),
    [inboxError, setInboxError] = useState(""),
    [page, setCurrentPage] = useState<Page>(pageFromPath),
    [category, setCategoryState] = useState<Category>("Doubles");
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  useEffect(() => {
    if (data && page === "home") recordResearch("home-view", data.me.id);
  }, [page, data?.me.id]);
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("fromShare");
    if (!token) return;
    let active = true;
    api("/shares/" + encodeURIComponent(token))
      .then((v) => {
        if (active) setSharedArrival(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  function setCategory(value: Category) {
    setCategoryState(value);
    if (data)
      try {
        localStorage.setItem("shuttl:category:" + data.me.id, value);
      } catch {}
  }
  useEffect(() => {
    if (!data) return;
    setDisplayTimezone(data.me.timezone);
    try {
      const value = localStorage.getItem("shuttl:category:" + data.me.id);
      setCategoryState(
        ["Singles", "Doubles", "Mixed"].includes(value || "")
          ? (value as Category)
          : "Doubles",
      );
    } catch {
      setCategoryState("Doubles");
    }
    const linked = new URLSearchParams(location.search).get("result");
    if (linked) open(linked);
  }, [data?.me.id]);
  const [scopes, setScopes] = useState<any[]>([]),
    [modal, setModal] = useState<
      "record" | "friend" | "scope" | "share" | null
    >(null),
    [resultId, setResultId] = useState<string | null>(null),
    [correction, setCorrection] = useState<any>(null),
    [recovery, setRecovery] = useState(""),
    [toast, setToast] = useState(""),
    [forceAuth, setForceAuth] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  function notify(message: string) {
    setToast(message);
  }
  function forgetSession() {
    accountEpoch.current += 1;
    inboxGeneration.current += 1;
    setData(null);
    setInbox(null);
    setScopes([]);
    setCsrf("");
    setModal(null);
    setCorrection(null);
    setResultId(null);
    setComparisonId(null);
    setRecovery("");
    setToast("");
    setInitialError("");
    setInboxError("");
  }
  async function loadInbox() {
    const epoch = accountEpoch.current;
    const generation = ++inboxGeneration.current;
    setInboxError("");
    try {
      const value = await api("/inbox");
      if (
        epoch === accountEpoch.current &&
        generation === inboxGeneration.current
      )
        setInbox(value);
    } catch (e) {
      if (
        epoch !== accountEpoch.current ||
        generation !== inboxGeneration.current
      )
        return;
      if (e instanceof ApiError && e.status === 401) forgetSession();
      else setInboxError(errorMessage(e));
    }
  }
  async function refresh(reportFailure = false) {
    const epoch = accountEpoch.current;
    try {
      const dashboard = await api("/dashboard");
      if (epoch !== accountEpoch.current) return;
      if (
        resultId &&
        dashboard.me.id === data?.me.id &&
        !dashboard.results.some((r: any) => r.id === resultId)
      )
        dashboard.results.unshift(await api("/results/" + resultId));
      if (epoch !== accountEpoch.current) return;
      setDisplayTimezone(dashboard.me.timezone);
      setData(dashboard);
      if (["inbox", "agreements"].includes(page)) {
        await loadInbox();
      }
    } catch (e) {
      if (epoch !== accountEpoch.current) return;
      if (e instanceof ApiError && e.status === 401) {
        forgetSession();
      } else {
        if (reportFailure) throw e;
        notify(errorMessage(e));
      }
    }
  }
  useEffect(() => {
    if (design) return;
    setLoading(true);
    setInitialError("");
    let active = true;
    const epoch = accountEpoch.current;
    (async () => {
      try {
        const me = await api("/me");
        if (!active || epoch !== accountEpoch.current) return;
        setCsrf(me.csrf);
        await refresh(true);
      } catch (e) {
        if (epoch !== accountEpoch.current) return;
        if (active && !(e instanceof ApiError && e.status === 401))
          setInitialError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialAttempt]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        if (data) refresh();
      },
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [data?.me.id]);
  useEffect(() => {
    if (!data || design) return;
    if (["inbox", "agreements"].includes(page)) void loadInbox();
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") refresh();
      },
      data.results.some((r: any) => r.status === "confirmed") ? 2000 : 20000,
    );
    const returned = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (page === "home" && data?.me.id)
          recordResearch("home-view", data.me.id);
      }
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [
    page,
    data?.me.id,
    data?.results.some((r: any) => r.status === "confirmed"),
    resultId,
  ]);
  useEffect(() => {
    const back = () => {
      setCurrentPage(pageFromPath());
      setModal(null);
      setComparisonId(null);
      const linked = new URLSearchParams(location.search).get("result");
      if (linked) open(linked);
      else setResultId(null);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  function setPage(next: Page, profileTab?: "history" | "settings") {
    setCurrentPage(next);
    setResultId(null);
    setModal(null);
    setComparisonId(null);
    history.pushState(
      {},
      "",
      "/" +
        next +
        (next === "profile" && profileTab ? "?tab=" + profileTab : ""),
    );
    window.scrollTo({ top: 0 });
    if (data) refresh();
  }
  async function logout() {
    try {
      let endpoint: string | undefined;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        endpoint = (await registration?.pushManager.getSubscription())
          ?.endpoint;
      } catch {}
      await api("/logout", endpoint ? { endpoint } : {});
      forgetSession();
      setCurrentPage("home");
      history.replaceState({}, "", "/");
    } catch (e) {
      notify(errorMessage(e));
    }
  }
  async function authenticated(response: any) {
    forgetSession();
    setCsrf(response.csrf);
    setForceAuth(false);
    if (response.recoveryCode) setRecovery(response.recoveryCode);
    try {
      await refresh(true);
    } catch (e) {
      setInitialError(errorMessage(e));
    }
  }
  function completed(message: string) {
    setModal(null);
    setCorrection(null);
    setResultId(null);
    notify(message);
    refresh();
  }
  useEffect(() => {
    let active = true;
    const epoch = accountEpoch.current;
    if (data && modal === "record")
      api("/scopes")
        .then((value) => {
          if (active && epoch === accountEpoch.current) setScopes(value.scopes);
        })
        .catch((e) => {
          if (active && epoch === accountEpoch.current) notify(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [modal, data?.me.id]);
  const result = resultId
    ? data?.results.find((r: any) => r.id === resultId)
    : null;
  const open = async (id: string) => {
    const epoch = accountEpoch.current;
    try {
      const live = await api("/results/" + id);
      if (epoch !== accountEpoch.current) return;
      setData((d: any) => ({
        ...d,
        results: [live, ...d.results.filter((r: any) => r.id !== id)],
      }));
      setResultId(id);
      const url = new URL(location.href);
      url.searchParams.set("result", id);
      history.replaceState({}, "", url.pathname + url.search);
    } catch (e) {
      if (epoch !== accountEpoch.current) return;
      if (e instanceof ApiError && e.status === 401) forgetSession();
      else notify(errorMessage(e));
    }
  };
  let content;
  if (design) return <DesignReview />;
  if (loading)
    content = (
      <div className="auth-shell" style={{ display: "block" }}>
        <Spinner />
      </div>
    );
  else if (forceAuth)
    content = (
      <Auth
        done={authenticated}
        invited={publicClaim || publicConnect}
        invitationKind={
          publicConnect ? "friendship" : publicClaim ? "player" : undefined
        }
      />
    );
  else if (initialError && !data)
    content = (
      <main className="claim-public">
        <Brand />
        <h1>We couldn’t load your court.</h1>
        <p>Your account has not been reset. Reconnect and try again.</p>
        <InlineError message={initialError} />
        <button
          className="button"
          onClick={() => setInitialAttempt((v) => v + 1)}
        >
          Retry loading my court
        </button>
      </main>
    );
  else if (publicConnect)
    content = (
      <InvitationLanding
        loggedIn={!!data}
        signIn={() => setForceAuth(true)}
        notify={notify}
      />
    );
  else if (publicClaim || publicShare)
    content = (
      <PublicView
        claim={publicClaim}
        loggedIn={!!data}
        signIn={() => setForceAuth(true)}
        notify={notify}
      />
    );
  else if (!data) content = <Auth done={authenticated} />;
  else
    content = (
      <>
        {data.demo && (
          <div className="design-caption">
            DEMO COURT · Fictional players and sample results
          </div>
        )}
        <a className="skip-link" href="#main">
          Skip to your court
        </a>
        <div className="app-shell">
          <Navigation
            page={page}
            setPage={setPage}
            unread={data.unread}
            name={data.me.name}
            reviewer={data.me.role === "reviewer"}
            logout={logout}
          />
          <main className="main-stage" id="main">
            <header className="topbar">
              <div className="topbar-brand">
                <Brand small />
              </div>
              <span className="topbar-caption">
                <span className="tiny-dot" />
                YOUR PLAYER PASSPORT
              </span>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  aria-label="Open your inbox"
                  onClick={() => setPage("inbox")}
                >
                  <Bell size={18} />
                  {data.unread > 0 && <span className="unread-dot" />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Open your profile"
                  onClick={() => setPage("profile")}
                >
                  <Avatar player={data.me} small />
                </button>
              </div>
            </header>
            {page === "home" && (
              <>
                {sharedArrival && (
                  <section className="notice">
                    <strong>
                      A {sharedArrival.category.toLowerCase()} story brought you
                      here.
                    </strong>
                    <p>
                      Your own starting point comes from your real matches, with
                      each player’s agreement.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setCategory(sharedArrival.category);
                        setModal("record");
                        setSharedArrival(null);
                      }}
                    >
                      Start my {sharedArrival.category.toLowerCase()} story
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setSharedArrival(null)}
                    >
                      Dismiss
                    </button>
                  </section>
                )}
                <Home
                  data={data}
                  category={category}
                  setCategory={setCategory}
                  setPage={setPage}
                  record={() => setModal("record")}
                  addFriend={() => setModal("friend")}
                  open={open}
                  compare={(id) => {
                    setComparisonId(id);
                    recordResearch("comparison-view", data.me.id);
                  }}
                />
              </>
            )}
            {page === "friends" && (
              <FriendsPage
                key={data.me.id}
                data={data}
                refresh={refresh}
                add={() => setModal("friend")}
                notify={notify}
                compare={(id) => {
                  setComparisonId(id);
                  recordResearch("comparison-view", data.me.id);
                }}
                category={category}
                setCategory={setCategory}
                open={open}
              />
            )}
            {page === "rankings" && (
              <RankingsPage
                data={data}
                category={category}
                setCategory={setCategory}
              />
            )}
            {page === "profile" && (
              <ProfilePage
                key={data.me.id}
                data={data}
                refresh={refresh}
                open={open}
                share={() => setModal("share")}
                notify={notify}
                signOut={logout}
                preferredCategory={category}
                setPreferredCategory={setCategory}
                deleted={() => {
                  forgetSession();
                  history.replaceState({}, "", "/");
                }}
              />
            )}
            {["inbox", "agreements"].includes(page) && inboxError && (
              <section className="notice" role="alert">
                <strong>We couldn’t refresh your requests.</strong>
                <p>{inboxError}</p>
                <button
                  className="button secondary"
                  onClick={() => loadInbox()}
                >
                  Retry loading requests
                </button>
              </section>
            )}
            {page === "inbox" && (inbox || !inboxError) && (
              <InboxPage
                inbox={inbox}
                refresh={refresh}
                open={open}
                notify={notify}
              />
            )}
            {page === "agreements" && (inbox || !inboxError) && (
              <AgreementsPage
                inbox={inbox}
                create={() => setModal("scope")}
                refresh={refresh}
                notify={notify}
              />
            )}
            {page === "reviewer" && (
              <ReviewerPage refresh={refresh} notify={notify} />
            )}
          </main>
        </div>
      </>
    );
  return (
    <>
      {!online && (
        <div className="offline-banner" role="status">
          Connection interrupted. Unsent results stay local and never change a
          rating.
        </div>
      )}
      {content}
      {data && arrivalPlayer && (
        <PlayerArrival
          username={arrivalPlayer}
          close={() => {
            setArrivalPlayer(null);
            const url = new URL(location.href);
            url.searchParams.delete("player");
            history.replaceState({}, "", url.pathname + url.search);
          }}
          notify={notify}
          refresh={refresh}
        />
      )}
      {recovery && (
        <RecoveryCode code={recovery} close={() => setRecovery("")} />
      )}
      {data && modal === "friend" && (
        <PlayerLookup
          invite={false}
          excludeIds={[data.me.id, ...data.friends.map((p: Player) => p.id)]}
          close={() => setModal(null)}
          choose={async (p: Player) => {
            await api("/friends", { playerId: p.id });
            completed("Friend invitation sent to their SHUTTL inbox.");
          }}
        />
      )}
      {data && (modal === "record" || correction) && (
        <RecordResult
          me={data.me}
          category={category}
          scopes={scopes}
          correction={correction}
          results={data.results}
          friends={data.friends}
          reviewReceived={(id) => {
            setModal(null);
            setCorrection(null);
            void open(id);
          }}
          close={() => {
            setModal(null);
            setCorrection(null);
          }}
          done={() =>
            completed(
              correction
                ? "Correction proposed. Fresh approvals are required."
                : "Exact result submitted. Your rating stays unchanged until valid approvals.",
            )
          }
        />
      )}
      {data && modal === "scope" && (
        <AgreementForm
          me={data.me}
          close={() => setModal(null)}
          done={() =>
            completed(
              "Your own consent is recorded. Every other player must choose separately.",
            )
          }
        />
      )}
      {result && !correction && (
        <ResultReview
          result={result}
          close={() => {
            setResultId(null);
            const url = new URL(location.href);
            url.searchParams.delete("result");
            history.replaceState({}, "", url.pathname + url.search);
          }}
          refresh={refresh}
          correct={(r) => {
            setCorrection(r);
            setResultId(null);
          }}
          share={() => {
            setResultId(null);
            setCategory(result.category);
            setModal("share");
          }}
        />
      )}
      {data && modal === "share" && (
        <SharePassport
          me={data.me}
          initialCategory={category}
          close={() => setModal(null)}
          notify={notify}
        />
      )}
      {data && comparisonId && (
        <ComparisonDialog
          data={data}
          playerId={comparisonId}
          category={category}
          close={() => setComparisonId(null)}
          open={(id) => {
            setComparisonId(null);
            open(id);
          }}
          notify={notify}
          refresh={refresh}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
