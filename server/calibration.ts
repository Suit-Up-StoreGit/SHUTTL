import { z } from "zod";
import {
  CATEGORIES,
  FORMATS,
  PARAMETERS,
  initialRating,
  normalCdf,
  uncertaintyAt,
  updateRatings,
  validateGames,
  type Category,
  type Rating,
  type Format,
} from "../src/domain.ts";
const date = z.iso.datetime({ offset: true }),
  key = z.string().min(1).max(100);
export const calibrationInput = z
  .object({
    provenance: z
      .object({
        source: z.enum(["synthetic-fixture", "consented-real-play"]),
        consentReference: z.string().min(1),
        frozenProtocolReference: z.string().min(1),
      })
      .strict(),
    plan: z
      .object({
        cutoff: date,
        heldoutNetworks: z.array(key),
        minimumHeldout: z.number().int().min(1),
        maximumBrier: z.number().min(0).max(1),
        maximumLogLoss: z.number().positive(),
        eloNonInferiorityMargin: z.number().min(0).max(1),
      })
      .strict(),
    matches: z
      .array(
        z
          .object({
            id: key,
            network: key,
            category: z.enum(CATEGORIES),
            format: z.enum(Object.keys(FORMATS) as [Format, ...Format[]]),
            roster: z.array(key).min(2).max(4),
            games: z
              .array(
                z.tuple([
                  z.number().int().min(0).max(30),
                  z.number().int().min(0).max(30),
                ]),
              )
              .min(1)
              .max(3),
            playedAt: date,
            confirmedAt: date,
            revision: z.literal(1),
            correctedOrDisputed: z.literal(false),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
type Match = z.infer<typeof calibrationInput>["matches"][number];
function learn(history: Match[], category: Category) {
  const gaussian = new Map<string, Rating>(),
    elo = new Map<string, number>();
  for (const match of history
    .filter((m) => m.category === category)
    .sort(
      (a, b) =>
        a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id),
    )) {
    const before = match.roster.map((p) => gaussian.get(p) || initialRating()),
      winner = validateGames(match.format, match.games),
      after = updateRatings(before, category, winner, match.playedAt);
    match.roster.forEach((p, i) => gaussian.set(p, after[i]));
    const size = match.roster.length / 2,
      values = match.roster.map((p) => elo.get(p) || 1500),
      difference =
        (values.slice(0, size).reduce((a, b) => a + b, 0) -
          values.slice(size).reduce((a, b) => a + b, 0)) /
        size;
    const probability = 1 / (1 + 10 ** (-difference / 400)),
      delta = 32 * ((winner === 0 ? 1 : 0) - probability);
    match.roster.forEach((p, i) =>
      elo.set(p, values[i] + (i < size ? delta : -delta)),
    );
  }
  return { gaussian, elo };
}
export function calibrationStudy(raw: unknown) {
  const input = calibrationInput.parse(raw),
    seen = new Set<string>(),
    networks = new Map<string, string>();
  input.plan.cutoff = new Date(input.plan.cutoff).toISOString();
  input.matches = input.matches.map((m) => ({
    ...m,
    playedAt: new Date(m.playedAt).toISOString(),
    confirmedAt: new Date(m.confirmedAt).toISOString(),
  }));
  for (const m of input.matches) {
    if (seen.has(m.id)) throw new Error("Duplicate physical-match reference.");
    seen.add(m.id);
    if (
      m.roster.length !== (m.category === "Singles" ? 2 : 4) ||
      new Set(m.roster).size !== m.roster.length
    )
      throw new Error("Invalid category roster.");
    if (Date.parse(m.confirmedAt) < Date.parse(m.playedAt))
      throw new Error("Confirmation cannot precede play.");
    validateGames(m.format, m.games);
    for (const p of m.roster) {
      if (networks.has(p) && networks.get(p) !== m.network)
        throw new Error(
          "Independent-network labels share a player. Merge those networks.",
        );
      networks.set(p, m.network);
    }
  }
  const heldout = new Set(input.plan.heldoutNetworks),
    predictions: any[] = [];
  const targets = input.matches
    .filter((m) => m.playedAt >= input.plan.cutoff)
    .sort(
      (a, b) =>
        a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id),
    );
  for (const match of targets) {
    // A result that became known later is never allowed into an earlier forecast.
    // Replaying known history also handles late confirmation without future leakage.
    const history = input.matches.filter(
      (m) =>
        m.id !== match.id &&
        m.playedAt < match.playedAt &&
        m.confirmedAt < match.playedAt &&
        !(m.playedAt < input.plan.cutoff && heldout.has(m.network)),
    );
    const state = learn(history, match.category),
      before = match.roster.map(
        (p) => state.gaussian.get(p) || initialRating(),
      ),
      size = before.length / 2;
    const difference = before.reduce(
        (sum, r, i) => sum + (i < size ? 1 : -1) * r.mu,
        0,
      ),
      variance =
        before.reduce(
          (sum, r) => sum + uncertaintyAt(r, match.category, match.playedAt),
          0,
        ) +
        before.length * PARAMETERS[match.category].beta ** 2;
    const gaussian = Math.max(
      1e-12,
      Math.min(1 - 1e-12, normalCdf(difference / Math.sqrt(variance))),
    );
    const eloDifference =
        match.roster.reduce(
          (sum, p, i) => sum + (i < size ? 1 : -1) * (state.elo.get(p) || 1500),
          0,
        ) / size,
      elo = Math.max(
        1e-12,
        Math.min(1 - 1e-12, 1 / (1 + 10 ** (-eloDifference / 400))),
      );
    predictions.push({
      category: match.category,
      network: match.network,
      p: gaussian,
      elo,
      y: validateGames(match.format, match.games) === 0 ? 1 : 0,
      coldStart: Math.min(...before.map((r) => r.count)) < 5,
      knownMatches: history.filter((m) => m.category === match.category).length,
    });
  }
  function summarize(rows: typeof predictions) {
    const mean = (f: (r: any) => number) =>
      rows.length ? rows.reduce((sum, r) => sum + f(r), 0) / rows.length : null;
    const brier = mean((r) => (r.p - r.y) ** 2),
      eloBrier = mean((r) => (r.elo - r.y) ** 2),
      logLoss = mean(
        (r) => -(r.y * Math.log(r.p) + (1 - r.y) * Math.log(1 - r.p)),
      );
    const calibration = Array.from({ length: 10 }, (_, bin) => {
      const group = rows.filter(
          (r) => Math.min(9, Math.floor(r.p * 10)) === bin,
        ),
        n = group.length,
        wins = group.reduce((s, r) => s + r.y, 0),
        observed = n ? wins / n : null;
      let interval: null | number[] = null;
      if (n) {
        const z = 1.96,
          d = 1 + (z * z) / n,
          c = (observed! + (z * z) / (2 * n)) / d,
          h =
            (z *
              Math.sqrt(
                (observed! * (1 - observed!)) / n + (z * z) / (4 * n * n),
              )) /
            d;
        interval = [c - h, c + h];
      }
      return {
        probabilityRange: [bin / 10, (bin + 1) / 10],
        matches: n,
        meanPrediction: n ? group.reduce((s, r) => s + r.p, 0) / n : null,
        observedWinRate: observed,
        descriptiveWilson95: interval,
      };
    });
    const enough = rows.length >= input.plan.minimumHeldout;
    return {
      matches: rows.length,
      independentNetworks: new Set(rows.map((r) => r.network)).size,
      brier,
      eloBrier,
      logLoss,
      calibration,
      coldStartMatches: rows.filter((r) => r.coldStart).length,
      predeclaredNumericalTargets: !enough
        ? null
        : brier! <= input.plan.maximumBrier &&
          logLoss! <= input.plan.maximumLogLoss &&
          brier! - eloBrier! <= input.plan.eloNonInferiorityMargin,
    };
  }
  return {
    method:
      "Forecast at played time using only results confirmed strictly before that time; chronological replay of available history. Elo baseline: 1500 prior, mean team strength, scale 400 and K=32 per participant. No tuning on heldout outcomes.",
    provenance: input.provenance,
    provenanceIndependentlyVerified: false,
    eligibleForAcceptance: false,
    plan: input.plan,
    overall: summarize(predictions),
    categories: CATEGORIES.map((c) => ({
      category: c,
      ...summarize(predictions.filter((r) => r.category === c)),
    })),
    heldoutNetworks: summarize(
      predictions.filter((r) => heldout.has(r.network)),
    ),
    limitations:
      "Revision-one, undisputed matches only. Selection policy must be frozen before observing outcomes. Wilson intervals describe bins and do not account for repeated-player dependence. Independent network bootstrap, group utility, cold-start convergence, league/title calibration and independent provenance review still required. Numerical target success is not a 9.5 product score.",
    predictions,
  };
}
