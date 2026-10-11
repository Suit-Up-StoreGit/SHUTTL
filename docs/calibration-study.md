# Offline badminton calibration

This tooling prepares the analysis; no consented badminton dataset has been supplied or validated. The shipped model remains an uncertainty-aware Gaussian team model with three separate category ledgers. Its numerical reference tests do not establish that it is the best badminton model. See [rating-system.md](rating-system.md) and the [player evidence protocol](pilot-protocol.md).

Run `npm run calibrate -- <private-dataset.json>` on a private, pseudonymous, consented dataset with a frozen analysis plan. The command never substitutes demo data. It outputs aggregates and an input SHA-256; raw player/match references and per-match forecasts are omitted. Keep raw files and identity keys outside Git. Inspect the strict input schema in `server/calibration.ts`.

Required fields:

| Field                                                            | Meaning                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance.source`                                              | `consented-real-play` or explicitly `synthetic-fixture`; a declaration is not independent verification                                                                          |
| `provenance.consentReference`                                    | Restricted study record establishing informed consent and permitted data use                                                                                                    |
| `provenance.frozenProtocolReference`                             | Dated plan fixed before held-out results are inspected                                                                                                                          |
| `plan.cutoff`                                                    | ISO timestamp separating earlier history from forecast evaluation                                                                                                               |
| `plan.heldoutNetworks`                                           | Independent network labels whose pre-cutoff history is excluded from training                                                                                                   |
| `plan.minimumHeldout`                                            | Predeclared minimum evaluation count; immature target results remain null                                                                                                       |
| `plan.maximumBrier`, `maximumLogLoss`, `eloNonInferiorityMargin` | Numerically justified study targets, not automatic translations into 9.5                                                                                                        |
| `matches`                                                        | At most 10,000 unique physical matches, each with ID, network, category, format, ordered roster, games, played/confirmed timestamps, revision 1 and `correctedOrDisputed:false` |

The command rejects duplicate matches, invalid scores/rosters, confirmation before play and players shared across supposedly independent networks. All timestamps normalize to UTC. The limited revision-one/undisputed selection policy must be frozen before outcomes are observed and assessed for selection bias; it does not evaluate correction/dispute populations.

For each held-out match, the forecast uses only results played and confirmed strictly before that match was played. Available history is replayed chronologically, so late confirmations cannot leak future knowledge into an earlier forecast. Categories remain independent. The comparator uses Elo with prior 1500, scale 400, K=32 per participant and mean team strength. That is a declared baseline, not a claim that every Elo variant was optimized.

The report includes Brier score, log loss, ten probability bins, category and held-out-network summaries and cold-start counts. Bin Wilson intervals are descriptive and assume independent observations; repeated-player dependence requires a network-aware uncertainty analysis. Numerical target success always remains separate from product acceptance, and `eligibleForAcceptance` remains false.

Work still needed: independently verified real-play provenance, a sufficiently sized sample for each category, network-cluster uncertainty analysis, sensitivity to result selection, partner rotation/individual identifiability, cold-start convergence and reveal-rule comparison, relative group-level utility, league boundaries and local-title eligibility. The local-title flag must remain disabled until that evidence and policy are reviewed. The model's research foundation is [Microsoft TrueSkill](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/); the implemented variant and its badminton parameters require their own evidence.
