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

## Backups and replay

```sh
npm run backup
npm run replay
```

Backup creates a consistent timestamped SQLite snapshot under `data/backups` using SQLite's backup API. Move copies to encrypted, access-controlled storage with a defined retention policy. A restore requires stopping the server, selecting the exact verified backup, restoring it to `DATABASE_PATH` and ensuring no stale WAL/SHM companion files from the old database are reused. Keep the original before replacement. Test restoration in a separate directory first.

Replay reconstructs category ratings and history from approved ledger revisions and current identity links. It is deterministic for a fixed ledger and model version. Back up before operator changes. It can change history if the underlying approvals, identities or model have changed.

## Incidents and scale

The worker checks durable jobs every 500 ms. Publication happens atomically; errors leave a visible delayed job. A reviewer can retry processing after the underlying error is addressed. Failed or disputed work does not silently award points. The health endpoint checks server/database availability, not player-rating validity.

This V1 supports a single application instance. SQLite, synchronous category replay, bounded exact evidence and in-memory request limiting are pilot constraints. Before a large audience launch, measure replay latency and resource use, add distributed rate limiting, move durable work to isolated workers, define incident/reviewer staffing and validate backup restore procedures. A hosting account, public domain, email/push provider and legal operational policies have not been provisioned by this repository push.
