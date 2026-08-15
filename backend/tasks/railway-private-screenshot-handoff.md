# Handoff: Railway Private-Network Screenshots

## Objective

Enable terminal screenshots in the production `relay-automation` service while keeping
the unauthenticated Node service reachable only through Railway private networking.
The browser must continue retrieving thumbnails through the authenticated public
FastAPI artifact gateway; it must never contact `relay-automation` directly.

## Current production state

- `relay-automation` listens on `0.0.0.0:8080` with public networking disabled and one
  replica.
- `relay-api` reaches it through
  `http://${{relay-automation.RAILWAY_PRIVATE_DOMAIN}}:8080`.
- Production currently has `AUTOMATION_SCREENSHOTS=false`, so completed runs contain no
  `thumbnail` and the browser renders its placeholder image.
- Batch creation and polling are working through the authenticated public gateway.
- Do **not** set `AUTOMATION_SCREENSHOTS=true` on the currently deployed build. Its
  configuration guard rejects screenshots on every non-loopback listener, so the
  automation service would fail to start.

## Intended boundary

```text
Browser
  | HTTPS + Relay Basic authentication
  v
Public relay-api
  | Railway private network
  v
Private relay-automation (no public domain, no service authentication)
  | temporary opaque artifact lookup
  v
WebP screenshot file
```

Returning a screenshot URL is acceptable here. The browser receives a relative opaque
URL such as `/v1/artifacts/{artifactId}` and resolves it against the public Relay API.
FastAPI authenticates the browser request and proxies the image over Railway's private
network. The private automation endpoint itself must remain unreachable from the public
internet.

## Local implementation already started

Two uncommitted files have been changed:

- `packages/automation-service-browserbase/src/config.ts`
- `packages/automation-service-browserbase/tests/config.test.ts`

The implementation adds the exact opt-in `AUTOMATION_TRUST_PRIVATE_NETWORK=1` and permits
screenshots on a non-loopback listener only when that flag is present. Defaults remain
fail-closed:

- loopback + screenshots: allowed as before;
- non-loopback + screenshots without the opt-in: rejected;
- non-loopback + screenshots with `AUTOMATION_TRUST_PRIVATE_NETWORK=1`: allowed;
- non-loopback + Inngest: still rejected, even with the private-network opt-in;
- values such as `true` for the trust flag: rejected; the accepted value is exactly `1`.

The focused configuration test has passed:

```bash
cd packages/automation-service-browserbase
npm test -- --run tests/config.test.ts
```

Result: 19 tests passed.

## Remaining repository work

1. Review the two existing uncommitted changes and keep the exception narrowly scoped to
   screenshots. Do not relax the Inngest loopback rule.
2. Update `.env.example`, `DEPLOY.md`, the root `README.md`, and
   `packages/automation-service-browserbase/README.md` with both production variables:

   ```dotenv
   AUTOMATION_TRUST_PRIVATE_NETWORK=1
   AUTOMATION_SCREENSHOTS=true
   ```

3. Add `docs/decisions/0014-trusted-private-network-screenshots.md`. Record that this
   decision supersedes only the loopback-only screenshot restriction in ADR 0009 for an
   explicitly trusted private listener. ADR 0008's prohibition on public exposure and
   ADR 0013's authenticated FastAPI gateway remain in force.
4. Run the automation-service tests, typecheck, and build. Follow any additional checks
   required by the repository instructions.
5. Review the final diff for accidental public exposure, credential logging, artifact URL
   logging, or changes to the public wire contract. No public API schema change is needed.
6. Obtain explicit authorization before committing or pushing. The current working branch
   is `codex/remote-batch-gateway`, whose earlier gateway work has already been merged;
   choose the appropriate branch/update workflow without rewriting its history.

## Deployment order

The order matters because the old build cannot start with screenshots enabled:

1. Commit and push the code and documentation after authorization.
2. Deploy the updated commit to the production `relay-automation` service.
3. Confirm the deployment is healthy while screenshots are still disabled.
4. Set these production variables on `relay-automation`:

   ```dotenv
   AUTOMATION_TRUST_PRIVATE_NETWORK=1
   AUTOMATION_SCREENSHOTS=true
   ```

5. Redeploy/restart `relay-automation` and confirm `/health/ready` is ready through
   Railway's private health check.
6. Do not add a Railway public domain to `relay-automation`. Keep exactly one replica.

## Production acceptance check

1. Run a safe workflow through the browser and wait for the batch to complete.
2. Confirm the terminal polling response includes a `thumbnail` with a relative
   `/v1/artifacts/{artifactId}` URL.
3. Confirm the browser requests that path from the public `relay-api` origin with Relay
   Basic authentication and displays a WebP image.
4. Confirm an unauthenticated artifact request to `relay-api` returns `401`.
5. Confirm `relay-automation` has no public Railway domain and cannot be reached directly
   from the browser.
6. Confirm application logs contain no workflow documents, screenshot bytes, artifact
   IDs, artifact URLs, credentials, or private service URLs.

## Rollback

Set `AUTOMATION_SCREENSHOTS=false` and restart `relay-automation`. The service can retain
`AUTOMATION_TRUST_PRIVATE_NETWORK=1`; with screenshots disabled it does not expose an
artifact-return path. Existing artifact files may remain on disk until manually cleaned,
but their process-local temporary URL registrations disappear on restart.

## Out of scope

- Adding authentication to `relay-automation`.
- Giving `relay-automation` a public domain.
- Returning image bytes inside batch JSON.
- Persisting artifact metadata or URLs in PostgreSQL.
- Changing the browser's API origin or bypassing the FastAPI artifact gateway.
