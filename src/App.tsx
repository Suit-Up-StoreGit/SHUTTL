import { useEffect, useState, type FormEvent } from "react";
import { Bell, LogOut, ArrowRight } from "lucide-react";
import { api, ApiError, errorMessage, setCsrf, type Page } from "./api.ts";
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
import {
  FriendsPage,
  RankingsPage,
  ProfilePage,
  AgreementsPage,
  InboxPage,
  SharePassport,
  ReviewerPage,
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
              {data.isCurrent
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
              {new Date(data.asOf).toLocaleDateString("en-SG", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              · {data.status} estimate.{" "}
              {data.district ? data.district + " · Declared district. " : ""}
              This is not a whole-neighborhood ranking or a live title.
            </p>
          </div>
          <a className="button block" href="/home">
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
  const data = mockDashboard();
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
  const design = location.pathname === "/design";
  const publicClaim = location.pathname.startsWith("/claim/"),
    publicShare = location.pathname.startsWith("/share/");
  const [data, setData] = useState<any>(null),
    [inbox, setInbox] = useState<any>(null),
    [loading, setLoading] = useState(!design),
    [page, setCurrentPage] = useState<Page>(pageFromPath),
    [category, setCategory] = useState<Category>("Doubles");
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
  async function refresh() {
    try {
      const dashboard = await api("/dashboard");
      setData(dashboard);
      if (["inbox", "agreements"].includes(page)) setInbox(await api("/inbox"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setCsrf("");
      } else notify(errorMessage(e));
    }
  }
  useEffect(() => {
    if (design) return;
    let active = true;
    (async () => {
      try {
        const me = await api("/me");
        if (!active) return;
        setCsrf(me.csrf);
        await refresh();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401) && !publicShare)
          notify(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
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
    let active = true;
    if (["inbox", "agreements"].includes(page))
      api("/inbox")
        .then((value) => {
          if (active) setInbox(value);
        })
        .catch((e) => notify(errorMessage(e)));
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") refresh();
      },
      data.results.some((r: any) => r.status === "confirmed") ? 2000 : 20000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    page,
    data?.me.id,
    data?.results.some((r: any) => r.status === "confirmed"),
  ]);
  useEffect(() => {
    const back = () => setCurrentPage(pageFromPath());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  function setPage(next: Page) {
    setCurrentPage(next);
    setResultId(null);
    setModal(null);
    history.pushState({}, "", "/" + next);
    window.scrollTo({ top: 0 });
    if (data) refresh();
  }
  async function logout() {
    try {
      await api("/logout", {});
      setData(null);
      setInbox(null);
      setCsrf("");
      setModal(null);
      setResultId(null);
      setCurrentPage("home");
      history.replaceState({}, "", "/");
    } catch (e) {
      notify(errorMessage(e));
    }
  }
  async function authenticated(response: any) {
    setForceAuth(false);
    if (response.recoveryCode) setRecovery(response.recoveryCode);
    await refresh();
  }
  function completed(message: string) {
    setModal(null);
    setCorrection(null);
    setResultId(null);
    notify(message);
    refresh();
  }
  useEffect(() => {
    if (data && modal === "record")
      api("/scopes")
        .then((value) => setScopes(value.scopes))
        .catch((e) => notify(errorMessage(e)));
  }, [modal, data?.me.id]);
  const result = resultId
    ? data?.results.find((r: any) => r.id === resultId)
    : null;
  const open = async (id: string) => {
    try {
      const live = await api("/results/" + id);
      setData((d: any) => ({
        ...d,
        results: [live, ...d.results.filter((r: any) => r.id !== id)],
      }));
      setResultId(id);
    } catch (e) {
      notify(errorMessage(e));
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
    content = <Auth done={authenticated} invited={publicClaim} />;
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
              <Home
                data={data}
                category={category}
                setCategory={setCategory}
                setPage={setPage}
                record={() => setModal("record")}
                addFriend={() => setModal("friend")}
              />
            )}
            {page === "friends" && (
              <FriendsPage
                data={data}
                refresh={refresh}
                add={() => setModal("friend")}
                notify={notify}
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
                data={data}
                refresh={refresh}
                open={open}
                share={() => setModal("share")}
                notify={notify}
                logout={() => {
                  setData(null);
                  history.replaceState({}, "", "/");
                }}
              />
            )}
            {page === "inbox" && (
              <InboxPage
                inbox={inbox}
                refresh={refresh}
                open={open}
                notify={notify}
              />
            )}
            {page === "agreements" && (
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
      {recovery && (
        <RecoveryCode code={recovery} close={() => setRecovery("")} />
      )}
      {data && modal === "friend" && (
        <PlayerLookup
          invite={false}
          close={() => setModal(null)}
          choose={async (p: Player) => {
            try {
              await api("/friends", { playerId: p.id });
              completed("Friend invitation sent to their SHUTTL inbox.");
            } catch (e) {
              notify(errorMessage(e));
            }
          }}
        />
      )}
      {data && (modal === "record" || correction) && (
        <RecordResult
          me={data.me}
          category={category}
          scopes={scopes}
          correction={correction}
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
          close={() => setResultId(null)}
          refresh={refresh}
          correct={(r) => {
            setCorrection(r);
            setResultId(null);
          }}
        />
      )}
      {data && modal === "share" && (
        <SharePassport
          me={data.me}
          close={() => setModal(null)}
          notify={notify}
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
