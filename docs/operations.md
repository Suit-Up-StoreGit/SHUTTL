# Running SHUTTL

## Local and hosted configuration

Use Node.js 24. `npm run dev` runs the API and browser development server. `npm run build` creates the production browser assets; `npm start` serves them and the API together. Server startup never creates fictional players.

Set `APP_ORIGIN` to the exact browser origin, including scheme and port. The supplied example targets the production server at `http://127.0.0.1:3000`; development also permits the local Vite origin. Public hosting needs HTTPS, a persistent private `DATABASE_PATH`, `NODE_ENV=production` and an exact trusted reverse-proxy IP/CIDR in `TRUST_PROXY` when applicable. Do not trust arbitrary forwarded IP headers.

Keep `VALIDATED_EVIDENCE_POLICY=false` until an approved calibration and individual-evidence policy exists. Keep `ALLOW_DEMO_SEED=false` on production. Do not commit `.env`, databases, backups or player exports.

The Dockerfile uses a non-root Node process and a persistent data directory. Build and run it with a mounted private data volume and the origin/environment above. The configuration has not been executed in this environment; verify it in the target hosting environment before relying on it.

## Optional fictional demo

The demo command requires a development environment, an explicitly enabled `ALLOW_DEMO_SEED=true` and an empty database. Use a separate `DATABASE_PATH` such as `./data/demo.sqlite`, never a player database.

```sh
npm run demo
```

The command prints the demo account details. The app shows a fictional-data banner. This is a local demonstration account, not a credential for public hosting.

## Reviewer access

An operator with database access can grant access to a registered player:

```sh
npm run admin -- registered_username
```

Grants are audited. A reviewer cannot adjudicate their own result, including a claimed guest identity. Decisions need a recorded explanation. Reviewers uphold valid approval evidence or void a result; they cannot manufacture missing participant approvals. Private reports and result bundles remain restricted to authorized reviewers.

Before inviting real players, appoint the reviewer, support owner and backup operator. Agree a response target that actual staffing can meet, a recusal/escalation process, appeal handling and player communications. No operational response deadline has been configured or promised by the code. Measure actual response/resolution time and review false-positive abuse flags rather than penalizing legitimate corrections or non-response after undelivered requests.

## Optional device alerts

The default installation has no push credentials. The inbox works without them. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` on the trusted host. The subject must be the real operator's contact URI (`mailto:` or HTTPS). `npm run push:keys -- <real-contact-URI>` generates a key pair into ignored `data/vapid.env`, refuses overwrite and does not print keys. Load that private file through your host's secret manager or an additional Node `--env-file=data/vapid.env` argument. `npm start` only automatically reads `.env`; it does not silently load the generated file. Keep a stable key pair for subscribed devices. On Windows, restrict the file with the host's filesystem ACL; the POSIX file-mode argument alone is not a Windows access policy.

Only an explicit player click asks for browser permission. Actions default on after opt-in; progress and supported comparison changes require their own choices. Quiet hours use the player's profile timezone (21:00–08:00); comparison break mode suppresses comparison deliveries. Lock-screen content is generic and contains no player names, rating numbers or private dispute reasons. The browser opens a same-origin authorized inbox/result or friends context.

Push requests use encrypted Web Push/VAPID, a trusted HTTPS provider-host allowlist, no redirects and a ten-second timeout. The durable queue rechecks current preferences, obsolete approvals, deleted accounts and expired events, retries transient failures at most three times, and removes 404/410 subscriptions. Interrupted final attempts remain failed with an explicit code instead of stranded as queued. The notification tag collapses duplicate presentation, but provider delivery is not an exactly-once guarantee. Signing out revokes the current session/browser endpoint; recovery and deletion revoke the account's devices. Previously displayed notifications/copies cannot be recalled.

Provider acceptance is stored as `accepted`, not `delivered`. Monitor queued/failed work, subscription expiry and real-device receipt/click behavior separately. This single-instance worker and provider allowlist must be exercised in the intended geography/browser fleet. The automated tests use injected stub senders and contact no push services. This repository change has not configured a public host, generated production keys, requested anyone's notification permission or delivered real device messages.

Use actual iOS/Android/desktop devices and consenting testers for enable/deny, background delivery, quiet hours, logout/account switch, recovery, revoked subscriptions and click continuation. Apple documents Web Push for Home Screen web apps on iOS/iPadOS 16.4+ and Safari on supported macOS; device permissions and settings still apply. See [Apple Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers?language=objc). The implementation follows the [Web Push library](https://github.com/web-push-libs/web-push) request/encryption interface and the explicit permission/click lifecycle described in [Microsoft's notification guidance](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/notifications-badges).

## Aggregate pilot report

Set `DATABASE_PATH` to an existing pilot database, then run `npm run pilot:report`. An optional ISO timestamp after `--` fixes the observation cutoff. The tool opens SQLite read-only, prints aggregates and does not create a database or print identities. Demo data is flagged. Submission/approval ledger returns and optional consent-epoch view returns have separate denominators. Fully observed days 7–13 and 30–36 are required; immature cohorts remain null. Research is off by default, erased on withdrawal and retained for 90 days; selection/withdrawal bias and expired coverage are explicit. No checking motive, recognized benefit, causal retention, pressure, actual delivery or purchase inference is supported. Confirm cohort membership/provenance separately and follow [the pilot protocol](pilot-protocol.md).

## Passkeys and declared locations

Optional passkeys use an exact HTTPS domain/origin, or localhost for development. Numerical IP origins cannot register them. Changing the relying-party domain can invalidate existing credentials, so settle the production domain before real use. Registration/removal requires the current password; challenges are single-use, account/session-bound and expire after two minutes. Sign-in requires user verification and a valid credential signature. Emergency recovery revokes all passkeys and device sessions. Local browser checks use a virtual authenticator; actual iOS/Android/password-manager and phone-loss testing is outstanding. See the [SimpleWebAuthn server documentation](https://simplewebauthn.dev/docs/packages/server) and [passkey guide](https://simplewebauthn.dev/docs/advanced/passkeys).

Country/territory data comes from [Countries](https://github.com/annexare/Countries). City and playing-area fields are player declarations normalized for case/spacing, not residence verification. Earlier Singapore profiles migrate once. Do not claim globally verified neighbourhood ranks or enable local titles from declarations alone. Local titles retain the disabled evidence-policy gate.

## Backups and replay

```sh
npm run backup
npm run replay
```

Backup creates a consistent timestamped SQLite snapshot under `data/backups` using SQLite's backup API. Move copies to encrypted, access-controlled storage with a defined retention policy. A restore requires stopping the server, selecting the exact verified backup, restoring it to `DATABASE_PATH` and ensuring no stale WAL/SHM companion files from the old database are reused. Keep the original before replacement. Test restoration in a separate directory first.

Replay reconstructs category ratings and history from approved ledger revisions and current identity links. It is deterministic for a fixed ledger and model version. Back up before operator changes. It can change history if the underlying approvals, identities or model have changed.

## Incidents and scale

The file-backed publisher checks durable work every 250 ms on a background thread with its own SQLite connection; the HTTP process handles periodic maintenance separately. In-memory test databases use an in-process fallback. Publication is atomic and a changed ledger/identity rejects stale computations; the job requeues without consuming a failure attempt. Constant ledger changes can defer publication repeatedly. Worker exits have a bounded restart policy; health and authenticated reviewer operations expose worker/job readiness, not rating validity or a delivery guarantee. Failed or disputed work does not silently award points.

This V1 supports a single application instance. SQLite, whole-category replay, bounded exact evidence and in-memory request limiting are pilot constraints. Before a large audience launch, measure hosted read/write/signup bursts and continuous-ledger retry behavior, add distributed limits, define incident/reviewer staffing and validate hosted restoration. `npm run benchmark -- 1000` creates a new, explicitly synthetic database and measures 100 dashboard reads at concurrency 20 during background replay; it never opens a player database. It is a narrow local workload, not a creator-scale certificate. A hosting account, public domain, email service, VAPID identity and legal operational policies have not been provisioned by this repository push.
