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
- Private response records, account recovery, blocking, export, deletion, privacy controls and revocable dated sharing.
- Five responsive home designs, accessible dialogs, reduced motion, local fonts and original league assets.

[View the five home designs](docs/home-designs.md). The `/design` preview uses clearly labeled fictional data. Normal accounts show actual activity and honest empty states.

## Verification

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

The suite includes 400 independently generated numerical rating reference cases and browser journeys for all five designs, account onboarding, offline result retry, a second player's approval, privacy persistence and saved drafts. A GitHub workflow repeats these checks.

## Product acceptance

The implementation is testable V1 software. A 9.5/10 retention, visual appeal or market-success score cannot be established from code or self-scoring. Player research and a measured pilot are still required. Rating parameters and league thresholds are candidates, not a calibrated badminton standard. Individual local titles stay disabled by default until the evidence policy is validated.

Read the [implementation and limitations](docs/implementation.md), [rating method](docs/rating-system.md), [operations guide](docs/operations.md) and [asset licenses](docs/licenses.md).
