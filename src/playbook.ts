export const FOCUS_AREAS = [
  {
    id: "serve",
    name: "Serve & return",
    cue: "Choose one serve target and one return intention before play.",
    review: "What changed when you committed to that intention?",
  },
  {
    id: "recovery",
    name: "Recovery & positioning",
    cue: "Choose a recovery position to notice after each shot.",
    review: "When did you feel ready for the next shuttle?",
  },
  {
    id: "patience",
    name: "Rally decisions",
    cue: "Choose when to build the rally and when to attack.",
    review: "Which decision would you repeat, and which would you change?",
  },
  {
    id: "closing",
    name: "Closing a game",
    cue: "Choose a simple reset phrase for the next point, especially late in a game.",
    review: "Did your next-point routine help you stay with your plan?",
  },
  {
    id: "partnership",
    name: "Partner communication",
    cue: "Agree one short call and one positioning intention with your partner.",
    review: "Which agreement helped, and what needs clarifying?",
  },
  {
    id: "custom",
    name: "My own focus",
    cue: "Choose one thing you can observe in your next session.",
    review: "What did you notice, and what would you try next?",
  },
] as const;

export type ScoreMatch = {
  unitId: string;
  playedAt: string;
  format: string;
  games: number[][];
  ownSide: number;
  score: number | null;
  delta: number | null;
  won: boolean;
};
export function scorePatterns(matches: ScoreMatch[]) {
  const games = matches.flatMap((match) =>
    match.games.map((g) => ({
      own: g[match.ownSide],
      other: g[1 - match.ownSide],
      unitId: match.unitId,
    })),
  );
  const close = games.filter((g) => Math.abs(g.own - g.other) <= 3);
  // Deciders only exist in best-of-three formats. Single-game results are not deciders.
  const deciders = matches.filter(
    (m) => m.games.length === 3 && m.format.startsWith("BO3"),
  );
  return {
    games: games.length,
    pointsFor: games.reduce((n, g) => n + g.own, 0),
    pointsAgainst: games.reduce((n, g) => n + g.other, 0),
    close: {
      count: close.length,
      wins: close.filter((g) => g.own > g.other).length,
      units: [...new Set(close.map((g) => g.unitId))],
    },
    deciders: {
      count: deciders.length,
      wins: deciders.filter(
        (m) => m.games[2][m.ownSide] > m.games[2][1 - m.ownSide],
      ).length,
      units: deciders.map((m) => m.unitId),
    },
    formats: [...new Set(matches.map((m) => m.format))].map((format) => {
      const rows = matches.filter((m) => m.format === format);
      return {
        format,
        count: rows.length,
        wins: rows.filter((m) => m.won).length,
      };
    }),
  };
}

export function progressCsv(matches: ScoreMatch[]) {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      [
        "Match ID",
        "Played at (UTC)",
        "Format",
        "Your side's scores",
        "Outcome",
        "Published rating",
        "Visible rating change",
      ],
      ...matches.map((m) => [
        m.unitId,
        m.playedAt,
        m.format,
        m.games.map((g) => `${g[m.ownSide]}-${g[1 - m.ownSide]}`).join(" / "),
        m.won ? "Win" : "Loss",
        m.score,
        m.delta,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
