import erfc from "@stdlib/math-base-special-erfc";
export const CATEGORIES = ["Singles", "Doubles", "Mixed"] as const;
export type Category = (typeof CATEGORIES)[number];
export const FORMATS = {
  ONE_21: { label: "One game to 21", target: 21, cap: 30, series: false },
  BO3_21: { label: "Best of three to 21", target: 21, cap: 30, series: true },
  ONE_15: { label: "One game to 15", target: 15, cap: 21, series: false },
  BO3_15: { label: "Best of three to 15", target: 15, cap: 21, series: true },
} as const;
export type Format = keyof typeof FORMATS;
export type Game = [number, number];
export const LEAGUES = [
  {
    name: "Crystal",
    floor: -Infinity,
    next: 1250,
    color: "#BCD9E2",
    slug: "crystal",
  },
  {
    name: "Emerald",
    floor: 1250,
    next: 1400,
    color: "#8BCDAB",
    slug: "emerald",
  },
  {
    name: "Sapphire",
    floor: 1400,
    next: 1550,
    color: "#A3BDFF",
    slug: "sapphire",
  },
  { name: "Ruby", floor: 1550, next: 1700, color: "#E296AA", slug: "ruby" },
  {
    name: "Obsidian",
    floor: 1700,
    next: 1800,
    color: "#B7A3D2",
    slug: "obsidian",
  },
  {
    name: "Diamond",
    floor: 1800,
    next: 1900,
    color: "#CDE7ED",
    slug: "diamond",
  },
  { name: "Master", floor: 1900, next: 2050, color: "#DEC17D", slug: "master" },
  {
    name: "Grandmaster",
    floor: 2050,
    next: Infinity,
    color: "#F1D5A0",
    slug: "grandmaster",
  },
];
export const publicRating = (mu: number) =>
  mu < 0 ? -Math.floor(-mu + 0.5) : Math.floor(mu + 0.5);
export const leagueFor = (score: number) =>
  LEAGUES.find((l) => score < l.next)!;
export function validateGames(format: Format, games: Game[]): number {
  const f = FORMATS[format];
  if (
    !f ||
    (games.length !== (f.series ? 2 : 1) && !(f.series && games.length === 3))
  )
    throw new Error(
      "Record one complete game, or a complete best-of-three match.",
    );
  const wins = [0, 0];
  for (const [a, b] of games) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
      throw new Error("Scores must be whole numbers.");
    if (wins.includes(2))
      throw new Error("The match ended after two wins. Remove the extra game.");
    const high = Math.max(a, b),
      low = Math.min(a, b);
    if (!(
      (high === f.target && low <= f.target - 2) ||
      (high > f.target && high < f.cap && low === high - 2) ||
      (high === f.cap && (low === f.cap - 1 || low === f.cap - 2))
    ))
      throw new Error(`Win by two after ${f.target}, stopping at ${f.cap}.`);
    wins[a > b ? 0 : 1]++;
  }
  if (f.series && !wins.includes(2))
    throw new Error("The series is tied. Record the deciding third game.");
  return wins[0] > wins[1] ? 0 : 1;
}
export interface Rating {
  mu: number;
  variance: number;
  count: number;
  peak: number;
  lastPlayed: string | null;
}
export const INITIAL_VARIANCE = 350 ** 2;
export const MODEL_VERSION = "gaussian-participant-0.1";
// Parameters remain pilot candidates, not a claim of badminton population accuracy.
export const PARAMETERS = {
  Singles: { beta: 155, drift: 8 },
  Doubles: { beta: 620, drift: 5 },
  Mixed: { beta: 620, drift: 5 },
};
export const initialRating = (): Rating => ({
  mu: 1500,
  variance: INITIAL_VARIANCE,
  count: 0,
  peak: 1500,
  lastPlayed: null,
});
export function uncertaintyAt(
  r: Rating,
  category: Category,
  time: string,
): number {
  const days = r.lastPlayed
    ? Math.max(0, (Date.parse(time) - Date.parse(r.lastPlayed)) / 86400000)
    : 0;
  return Math.min(
    INITIAL_VARIANCE,
    r.variance + PARAMETERS[category].drift ** 2 * days,
  );
}
// erfc approximation is stable for the ordinary range; asymptotic tail moments
// avoid subtracting nearly equal large numbers in very surprising results.
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}
export function outcomeMoments(z: number): [number, number] {
  if (z < -12) {
    const t = -z,
      inv = 1 / t,
      q = inv * inv;
    const v = t + inv * (1 + q * (-2 + q * (10 + q * (-74 + q * 706))));
    const w = 1 + q * (-1 + q * (6 + q * (-50 + q * (518 - q * 6354))));
    return [v, Math.max(0, Math.min(1, w))];
  }
  const v =
    Math.exp((-z * z) / 2) /
    Math.sqrt(2 * Math.PI) /
    Math.max(Number.MIN_VALUE, normalCdf(z));
  return [v, Math.max(0, Math.min(1, v * (v + z)))];
}
export function updateRatings(
  before: Rating[],
  category: Category,
  winner: number,
  playedAt: string,
): Rating[] {
  const size = before.length / 2;
  if (![2, 4].includes(before.length))
    throw new Error("A rated unit needs two or four distinct players.");
  const signs = before.map((_, i) => ((i < size ? 0 : 1) === winner ? 1 : -1));
  const variances = before.map((r) => uncertaintyAt(r, category, playedAt));
  const c2 =
    variances.reduce((a, b) => a + b, 0) +
    before.length * PARAMETERS[category].beta ** 2;
  const c = Math.sqrt(c2),
    z = before.reduce((sum, r, i) => sum + signs[i] * r.mu, 0) / c;
  const [v, w] = outcomeMoments(z);
  return before.map((r, i) => {
    const mu = r.mu + (signs[i] * variances[i] * v) / c;
    const variance = Math.max(
      1e-8,
      variances[i] - (variances[i] ** 2 * w) / c2,
    );
    return {
      mu,
      variance,
      count: r.count + 1,
      peak: r.count < 5 ? mu : Math.max(r.peak, mu),
      lastPlayed: playedAt,
    };
  });
}
export interface Player {
  id: string;
  username: string;
  name: string;
  district?: string;
  guest?: boolean;
  canonicalId?: string;
  portrait?: string;
}
export interface PublicRating {
  category: Category;
  score: number | null;
  count: number;
  peak: number | null;
  status:
    "Unrated" | "Placement" | "Developing" | "Pair-linked" | "Established";
  league: string | null;
  lastPlayed: string | null;
  partnerCount: number;
  comparisonClass: string | null;
}
