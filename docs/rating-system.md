# SHUTTL rating method

SHUTTL uses a Gaussian participant model adapted to two-sided badminton outcomes. The methodological basis is the uncertainty-aware team approach in [Herbrich, Minka and Graepel's TrueSkill paper](https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/). The shipped implementation is the explicit two-team, no-draw update below; it is not a claim of the full general factor-graph system or of badminton calibration.

## Three independent categories

Every player starts separately in Singles, Doubles and Mixed with mean skill 1,500 and variance 350². An unrated category does not inherit the player's other rating. A game or complete best-of-three series creates one outcome update, not one update per rally or set. Score margin does not grant bonus points.

Each participant contributes to the team mean. Both opponents' strength, the partner's strength and each person's uncertainty affect the update. Winners gain and losers lose; more uncertain players move more.

For each player, let `s` be +1 on the winning team and −1 on the losing team. Before updating, variance grows by `drift² × elapsed UTC days`, capped at 350². Negative elapsed time is clamped to zero. Absence does not subtract mean skill.

```text
c² = sum(participant variances) + participant count × beta²
z  = sum(s × participant means) / c
V  = normal density(z) / normal CDF(z)
W  = V × (V + z)
new mean     = mean + s × variance × V / c
new variance = variance − variance² × W / c²
```

Stable negative-tail moments prevent numerical overflow. A tiny positive variance floor and bounded `W` handle floating-point edge cases. Stored calculations retain precision; display, league boundaries and ties use the same integer rounding, with half points rounded away from zero.

| Category | Performance noise beta | Daily uncertainty drift |
| -------- | ---------------------: | ----------------------: |
| Singles  |                    155 |                       8 |
| Doubles  |                    620 |                       5 |
| Mixed    |                    620 |                       5 |

These are versioned **pilot candidates**. Numerical agreement with a reference implementation establishes arithmetic correctness; it does not establish badminton predictive accuracy. Beta and league thresholds require independent evaluation with real, consented play data.

## Placement and comparisons

Results 1–4 show placement progress without a number. The fifth published result reveals a developing mean estimate. Individual result deltas from placement are not exposed to other participants. A first visible peak comes from actual results, rather than the initial prior.

Doubles and Mixed with fewer than two distinct partners are labeled Pair-linked. Individual ranking also needs structural evidence: every result contributes a team contrast row, with +1 for one side and −1 for the other. Two players belong to the same comparison class only when their individual contrast lies in the exact rational row span. Shared fixed partners and disconnected networks cannot be assumed comparable. In Mixed, structural classes can remain separate without inferring or asking for gender.

Exact checks fail closed above 128 players, 2,048 rows or bounded rational complexity. This certificate concerns identifiability, not calibrated prediction confidence.

The Established candidate policy additionally requires 20 results, uncertainty at most 125, play within 90 days, at least two structurally supported peers and, for team categories, at least three partners. The entire policy remains disabled by default behind `VALIDATED_EVIDENCE_POLICY=false`.

Local titles require an opted-in declared district, Established evidence, a supported comparison class and at least 20 eligible players. Ties share the lead. The label describes the named SHUTTL pool, never every resident of a neighborhood.

## Publication and replay

Only an approved immutable revision enters the ledger. Results sort by played time and stable unit ID. Corrections, late results, guest identity merges and void decisions rebuild the affected category deterministically. New ratings, history events and snapshot versions publish atomically. A pending correction does not silently remove the previous approved result. Failed jobs remain visible and retryable.

The model version is `gaussian-participant-0.1`. Reference fixtures cover 200 Singles and 200 Doubles updates generated independently with Python TrueSkill 0.4.5, seed 81001. Mixed uses the same team arithmetic as Doubles but has its own ledger and evidence classes.
