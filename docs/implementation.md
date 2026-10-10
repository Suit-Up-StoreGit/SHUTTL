# SHUTTL V1 implementation

The user's instruction to build and push authorizes this implementation. Earlier concept-stage build holds are superseded by that instruction; this does not turn unmeasured product outcomes into proven 9.5 scores.

| Area            | Delivered behavior                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ratings         | Independent Singles, Doubles and Mixed skill distributions; both partner and opponent strength affect updates. Five published results reveal the category estimate.         |
| Consent         | Exact roster, category and format scopes; each player opts in separately. Revocation stops future coverage. Silence never grants consent.                                   |
| Confirmation    | With prior coverage, the author plus an opponent confirms the exact revision. Without coverage, every player approves. Teammates cannot replace opposite-side confirmation. |
| Corrections     | Immutable score revisions, fresh approvals and atomic chronological replay. A disputed published loss remains in the ledger until an independent decision.                  |
| Guests          | Private invitations; authenticated claims require the inviter's identity check. Claiming an identity does not approve a score.                                              |
| Comparisons     | Accepted friends and accepted existing-circle members. Fixed partnerships and disconnected evidence do not produce certified individual ranks.                              |
| Motivation      | Actual progress, personal peak, category goals, real friend activity and supported lead-change updates. No invented activity, urgency or inactivity loss.                   |
| Sharing         | Dated PNG cards and revocable public links, explicit name/district choices and historical-snapshot labeling.                                                                |
| Local titles    | Named, opted-in supported pools, integer ties and at least 20 eligible players. Disabled by default while the evidence policy remains unvalidated.                          |
| Player controls | Recovery-code rotation, private response history, comparison-break mode, blocking, export and account deletion.                                                             |
| Operations      | Durable publication jobs, audit records, explicit reviewer grants, deterministic replay and consistent database backups.                                                    |
| UI              | Five responsive home directions, honest unrated states, local fonts, keyboard dialogs and reduced-motion support.                                                           |

## Limits that remain material

- This is a single-instance pilot architecture using SQLite. The worker rebuilds categories synchronously and caps the pilot ledger at 50,000 results. Load testing and a queued multi-process architecture are required before a large creator-led rollout.
- Exact comparison evidence fails closed beyond 128 players per connected component or 2,048 evidence rows. Rational-arithmetic bounds also fail closed. Large pools do not receive unsupported crowns.
- Real badminton calibration, league boundaries, account-collusion detection and useful prediction confidence require a measured pilot. Outcome confirmation is player-attested, not independent proof that a physical match happened.
- Five games reveal a developing estimate, not certified skill. Doubles partnership ambiguity remains visible. Separate categories never borrow hidden points.
- Response history is private and factual. It does not reduce playing ratings. No response becomes automatic score acceptance.
- Account deletion removes account access and personal presentation, while pseudonymous references required for other players' valid result ledgers remain. This is not a claim that all retained records are anonymous.
- Public sharing is voluntary. Existing downloaded images cannot be remotely revoked; hosted links can.
- Email/SMS, device push, tournaments, hosting, bookings, direct messaging and cosmetics are outside this V1. Recovery uses a player-held recovery code.
- Hosting, domain configuration, operational incident staffing and device-specific installation still require setup. The Docker configuration is provided but has not been executed in this environment.
- Appearance, comprehensibility, day-7/day-30 retention and network growth need external user evidence. They are not reported as completed 9.5 metrics.

## Verification scope

Automated checks exercise the rating algorithm against 400 independent reference cases, score formats, exact evidence classes, authorization, consent, revisions, replay, recovery and sharing. Browser journeys exercise onboarding, offline retries, opponent confirmation, privacy, drafts and the five designs at phone and desktop widths. These checks establish implemented behavior, not adoption or retention.
