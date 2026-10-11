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

## Mobile, reward and comparison improvements

Home has a compact record/draft action, a robust responsive number/seal grid, the closest supported friend (or an honest absence of comparable evidence), a private comparison pin and a dated real activity preview. Direct gaps require matching category and non-null comparison class. Physical-match feed rows are deduplicated while retaining each friend's own visible change. First reveal never displays a delta against the private placement prior.

Result review binds acknowledgement to the exact current revision. A live correction immediately makes individual approval ineligible and clears batch selections/acknowledgement; fresh review is required. The earlier published score remains explicitly separate from an unapproved correction. First reveal, real promotion, real peak and ordinary win/loss recaps use published ledger data. Milestone share templates are derived on the server and dated; historical milestones do not borrow today's local title or evidence status.

Account changes invalidate pending dashboard, inbox, scope and result loads. A delayed response from an older account cannot restore its private content after sign out, recovery into a new session or deletion. CSRF state is set by the guarded account initialization/authentication flow. Public snapshot responses carry the authorized dated value and no separate newer rating number. Historical stories label the match date; hosted views also label when the snapshot was created from published history.

Profile separates Passport, Insights, History and Settings. Goals/history links open the relevant section; mobile sign out calls the real account endpoint. Preferred category persists per account on that device. Archive uses owner-authorized cursors rather than a 100-result presentation ceiling. Period insights show actual published results, visible change, team outcomes by partner/opponent and scoring format, with small-sample and bounded-coverage disclosures. These are outcome context, not individual-contribution estimates or stroke coaching.

Signup uses the detected device timezone, with server validation and a neutral UTC fallback. Settings offers browser-supported timezones. This improves international dates; it does not expand the Singapore district taxonomy or create localization.

Player selection offers accepted friends/recent players before searching. Up to three genuine recent rosters can be reused, preserving sides and format while requiring new score, time and acknowledgement. Account-scoped local drafts keep stable retry identity. Error wording no longer implies unsaved preferences are an offline draft.

Optional Web Push includes encrypted VAPID requests, a durable bounded-retry queue, trusted provider endpoints, preferences, quiet hours, generic lock-screen content, obsolete-action cancellation and device revocation on logout/recovery/deletion. It is not configured on the local preview. Tests inject a stub sender and send no real messages. Actual delivery, provider acceptance and player engagement are distinct measures.

## Limits that remain material

- This is a single-instance pilot architecture using SQLite. The worker rebuilds categories synchronously and caps the pilot ledger at 50,000 results. Load testing and a queued multi-process architecture are required before a large creator-led rollout.
- Exact comparison evidence fails closed beyond 128 players per connected component or 2,048 evidence rows. Rational-arithmetic bounds also fail closed. Large pools do not receive unsupported crowns.
- Real badminton calibration, league boundaries, account-collusion detection and useful prediction confidence require a measured pilot. Outcome confirmation is player-attested, not independent proof that a physical match happened.
- Five games reveal a developing estimate, not certified skill. Doubles partnership ambiguity remains visible. Separate categories never borrow hidden points.
- Response history is private and factual. It does not reduce playing ratings. No response becomes automatic score acceptance.
- Account deletion removes account access and personal presentation, while pseudonymous references required for other players' valid result ledgers remain. This is not a claim that all retained records are anonymous.
- Public sharing is voluntary. Existing downloaded images cannot be remotely revoked; hosted links can.
- Email/SMS recovery, tournaments, hosting, bookings, direct messaging and cosmetics are outside this V1. Recovery uses a player-held recovery code. Optional device push is implemented but requires a configured host and actual-device verification.
- Hosting, domain configuration, operational incident staffing and device-specific installation still require setup. The Docker configuration is provided but has not been executed in this environment.
- Appearance, comprehensibility, day-7/day-30 retention and network growth need external user evidence. They are not reported as completed 9.5 metrics.
- International location/localization, substantive creator guidance, optional portraits, group identity/recap ritual, contextual invitation continuation and mature collusion review still have gaps. They remain explicit in the [150-criterion register](acceptance/README.md), not silently classified as finished.

## Verification scope

Automated checks exercise the rating algorithm against 400 independent reference cases, score formats, exact evidence classes, authorization, consent, revisions, replay, recovery and sharing. Browser journeys exercise onboarding, offline retries, opponent confirmation, privacy, drafts and the five designs at phone and desktop widths. These checks establish implemented behavior, not adoption or retention.

The [pilot protocol](pilot-protocol.md) defines the missing independent evidence. The read-only aggregate pilot report uses submission/approval timestamps and fully observed Day-7/Day-30 windows. It cannot measure voluntary checking, recognized value or real purchases. Payment integration is excluded, and no premium launch is certified.
