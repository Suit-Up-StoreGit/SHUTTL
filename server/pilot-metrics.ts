export type PilotParticipant = {
  id: string;
  joined: string;
  actions: string[];
  firstPublished: string | null;
};
export function pilotMetrics(participants: PilotParticipant[], asOf: string) {
  const timestamp = Date.parse(asOf);
  if (!Number.isFinite(timestamp))
    throw new Error("Choose a valid analysis date.");
  const day = 86400000;
  const matured = (start: number, end: number) => {
    const eligible = participants.filter(
      (p) => Date.parse(p.joined) + end * day <= timestamp,
    );
    const retained = eligible.filter((p) =>
      p.actions.some(
        (t) =>
          Date.parse(t) >= Date.parse(p.joined) + start * day &&
          Date.parse(t) < Date.parse(p.joined) + end * day,
      ),
    ).length;
    return {
      eligible: eligible.length,
      returned: retained,
      rate: eligible.length ? retained / eligible.length : null,
      window: `days ${start} through ${end - 1} after signup`,
    };
  };
  const elapsed = participants
    .flatMap((p) =>
      p.firstPublished &&
      Date.parse(p.firstPublished) >= Date.parse(p.joined) &&
      Date.parse(p.firstPublished) <= timestamp
        ? [(Date.parse(p.firstPublished) - Date.parse(p.joined)) / 3600000]
        : [],
    )
    .sort((a, b) => a - b);
  return {
    accounts: participants.length,
    firstPublication: {
      accounts: elapsed.length,
      medianHours: elapsed.length
        ? (elapsed[Math.floor((elapsed.length - 1) / 2)] +
            elapsed[Math.ceil((elapsed.length - 1) / 2)]) /
          2
        : null,
    },
    D7LedgerReturn: matured(7, 14),
    D30LedgerReturn: matured(30, 37),
  };
}

export function researchMetrics(
  participants: { enrolled: string; events: { kind: string; at: string }[] }[],
  asOf: string,
) {
  const time = Date.parse(asOf),
    day = 86400000;
  if (!Number.isFinite(time)) throw new Error("Choose a valid analysis date.");
  const cohort = participants.filter(
    (p) =>
      Date.parse(p.enrolled) <= time &&
      Date.parse(p.enrolled) >= time - 90 * day,
  );
  const observed = (p: (typeof cohort)[number]) =>
    p.events.filter(
      (e) =>
        Date.parse(e.at) >= Date.parse(p.enrolled) && Date.parse(e.at) <= time,
    );
  const window = (start: number, end: number) => {
    const eligible = cohort.filter(
      (p) => Date.parse(p.enrolled) + end * day <= time,
    );
    const returned = eligible.filter((p) =>
      observed(p).some(
        (e) =>
          Date.parse(e.at) >= Date.parse(p.enrolled) + start * day &&
          Date.parse(e.at) < Date.parse(p.enrolled) + end * day,
      ),
    ).length;
    return {
      eligible: eligible.length,
      returned,
      rate: eligible.length ? returned / eligible.length : null,
      window: `days ${start} through ${end - 1} after current research consent`,
    };
  };
  const kinds = [
    ...new Set(cohort.flatMap((p) => observed(p).map((e) => e.kind))),
  ].sort();
  return {
    currentConsentingAccounts: cohort.length,
    outsideRetentionWindow: participants.length - cohort.length,
    D7ConsentedViewReturn: window(7, 14),
    D30ConsentedViewReturn: window(30, 37),
    events: kinds.map((kind) => ({
      kind,
      observations: cohort.reduce(
        (sum, p) => sum + observed(p).filter((e) => e.kind === kind).length,
        0,
      ),
      accounts: cohort.filter((p) => observed(p).some((e) => e.kind === kind))
        .length,
    })),
    scope:
      "Opt-in, browser-observed actions only, one per kind per 15 minutes. Consent-epoch cohort, not all signups. Withdrawal erases observations and removes participants, so estimates have selection and withdrawal bias. No daily wake-up motive, comprehension or causal retention inference.",
  };
}
