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
