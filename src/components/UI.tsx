import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Check,
  LoaderCircle,
  Home,
  UsersRound,
  Trophy,
  UserRound,
  Bell,
  ClipboardCheck,
  LogOut,
} from "lucide-react";
import {
  CATEGORIES,
  LEAGUES,
  type Category,
  type Player,
  type PublicRating,
} from "../domain.ts";
import type { Page } from "../api.ts";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={"brand " + (small ? "small" : "")}>
      <img src="/favicon.svg" alt="" />
      SHUTTL<span className="brand-dot">.</span>
    </span>
  );
}
export function CategoryTabs({
  value,
  onChange,
}: {
  value: Category;
  onChange: (value: Category) => void;
}) {
  return (
    <div className="category-tabs" role="group" aria-label="Rating category">
      {CATEGORIES.map((c) => (
        <button key={c} aria-pressed={c === value} onClick={() => onChange(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
export function Avatar({
  player,
  small = false,
}: {
  player: Partial<Player>;
  small?: boolean;
}) {
  const name = player.name || player.username || "Player";
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [player.portrait]);
  return (
    <span
      className={"avatar " + (small ? "avatar-small" : "")}
      aria-hidden="true"
    >
      {player.portrait && !failed ? (
        <img src={player.portrait} alt="" onError={() => setFailed(true)} />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((n) => Array.from(n)[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
export function Gem({
  league,
  size = 24,
}: {
  league?: string | null;
  size?: number;
}) {
  const l = LEAGUES.find((l) => l.name === league) || LEAGUES[0];
  return (
    <img
      className="gem"
      src={"/leagues/" + l.slug + ".svg"}
      width={size}
      height={size}
      alt=""
    />
  );
}
export function Evidence({ rating }: { rating: PublicRating }) {
  return (
    <span
      className={
        "evidence " + (rating.status === "Established" ? "established" : "")
      }
    >
      {rating.status === "Placement"
        ? `${rating.count} of 5 results`
        : rating.status}
    </span>
  );
}
export function Spinner() {
  return (
    <span className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      <span>Loading your court…</span>
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
  onClick,
}: {
  title: string;
  children: ReactNode;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Plus size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <button className="button secondary" onClick={onClick}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function SectionHeading({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) close();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={headingId}>{title}</h2>
        {dismissible && (
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
export function InlineError({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
export function ScoreGames({ games }: { games: number[][] }) {
  return (
    <div className="score-games">
      {games.map((g, i) => (
        <div key={i}>
          <strong>{g[0]}</strong>
          <span>Game {i + 1}</span>
          <strong>{g[1]}</strong>
        </div>
      ))}
    </div>
  );
}
export function Navigation({
  page,
  setPage,
  unread,
  name,
  reviewer,
  logout,
}: {
  page: Page;
  setPage: (p: Page) => void;
  unread: number;
  name: string;
  reviewer: boolean;
  logout: () => void;
}) {
  const links: [Page, string, typeof Home][] = [
    ["home", "Home", Home],
    ["friends", "Your circle", UsersRound],
    ["rankings", "Rankings", Trophy],
    ["profile", "Profile", UserRound],
  ];
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-label">YOUR COURT</p>
        <nav aria-label="Primary navigation">
          {links.map(([p, label, Icon]) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              <Icon size={20} />
              {label}
              {page === p && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className={"side-link " + (page === "inbox" ? "active" : "")}
          onClick={() => setPage("inbox")}
        >
          <Bell size={19} />
          Your inbox
          {unread > 0 && <span className="count-badge">{unread}</span>}
        </button>
        <button className="side-link" onClick={() => setPage("agreements")}>
          <ClipboardCheck size={19} />
          Rated agreements
        </button>
        {reviewer && (
          <button className="side-link" onClick={() => setPage("reviewer")}>
            <Check size={19} />
            Review desk
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            Better games.
            <br />
            Stronger circles.
          </div>
          <button className="account-chip" onClick={() => setPage("profile")}>
            <Avatar player={{ name }} small />
            <span>
              {name}
              <small>Your player passport</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="side-link signout" onClick={logout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Mobile primary navigation">
        {links.map(([p, label, Icon]) => (
          <button
            key={p}
            aria-current={page === p ? "page" : undefined}
            onClick={() => setPage(p)}
          >
            <Icon size={21} />
            <span>{label === "Your circle" ? "Circle" : label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
