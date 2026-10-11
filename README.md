# SHUTTL

A badminton player passport: separate Singles, Doubles and Mixed ratings, exact-result confirmation, friends and existing comparison circles. V1 focuses on the games players already play.

## Run locally

Use Node.js 24 and npm. The default database starts empty.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Create an account and save the one-time recovery code. No email provider or external service credentials are required for the local app.

For a production build:

```sh
npm run build
npm start
```

The server serves the built application at http://127.0.0.1:3000. Copy `.env.example` to `.env` to configure the origin, port and persistent database. Follow [operations](docs/operations.md) before public hosting.

## Included

- Three independent uncertainty-aware team rating ledgers; five confirmed results reveal a developing estimate in each category.
- Affirmative consent for rated sessions, opposite-side confirmation, all-player approval for retrospective results, corrections and independent dispute review.
- Durable rating publication and chronological replay, idempotent retries, private drafts and offline recovery.
- Accepted friends, existing-group comparison circles, activity and supported lead-change updates.
- Optional private portraits, player QR codes, revocable invitation links, group crests/mottos/period recaps and private post-match encouragement.
- Closest supported rival, optional private comparison pin, real shared-match context and a dated activity preview.
- First-rating reveal, league-promotion and personal-best recaps; current/reveal/best sharing from published history.
- Readable mobile passports, separate profile sections, full paginated history and period/partner/opponent/format insights.
- Optional device alerts with explicit permission, channel preferences, quiet hours and sign-out revocation. Hosting credentials and real-device delivery still need setup.
- Private response records, account recovery, blocking, export, deletion, privacy controls and revocable dated sharing.
- Five responsive home designs, accessible dialogs, reduced motion, local fonts and original league assets.
- Light/dark/device appearance, 200% text, optional user-verified passkeys on supported origins and explicit opt-in research with withdrawal/export.

[View the five home designs](docs/home-designs.md). The `/design` preview uses clearly labeled fictional data. Normal accounts show actual activity and honest empty states.

## Verification

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

The suite includes 400 independently generated numerical rating reference cases, authorization/consent/replay tests, history and comparison boundaries, conservative first-reveal arithmetic, private device notification queues and right-censored pilot-report calculations. Browser journeys cover all five designs, all eight league seals at narrow widths, account onboarding, offline retry, opponent approval, saved preferences/drafts, a verified share export and live correction invalidation of individual and batch acknowledgement. A GitHub workflow is configured to repeat these checks; local passing checks do not establish that a particular remote run passed.

## Product acceptance

The implementation is testable V1 software. A 9.5/10 retention, visual appeal or market-success score cannot be established from code or self-scoring. Player research and a measured pilot are still required. Rating parameters and league thresholds are candidates, not a calibrated badminton standard. Individual local titles stay disabled by default until the evidence policy is validated.

The [acceptance register](docs/acceptance/README.md) preserves all 150 original criteria and all 40 outcome measures, with current behavior and remaining work. New scores remain unmeasured. Follow the [player evidence protocol](docs/pilot-protocol.md) for independent review, usability, calibration, retention, device delivery and launch readiness. Payment integration is excluded by the current instruction; that exclusion does not prove a $20 monthly value proposition.

`npm run pilot:report` reads an existing database read-only and reports aggregate submission/approval return proxies. It does not track comparison views or prove user value. `npm run push:keys -- <real-operator-contact>` creates a private ignored VAPID configuration for a real host; see operations before using it.

Read the [implementation and limitations](docs/implementation.md), [rating method](docs/rating-system.md), [operations guide](docs/operations.md) and [asset licenses](docs/licenses.md).
