---
name: nhvr-deploy
description: Deploy the NHVR Bridge App to SAP BTP Cloud Foundry end-to-end. Use when the user asks to deploy, ship, release, push a new version to BTP, or when mta.yaml version bump is needed. Handles PATH fix, tests, cds build, mbt build, cf deploy, smoke test, mtar cleanup, and origin push.
---

# NHVR BTP Deploy

Verified recipe (last run: v4.7.8 on 2026-04-06). Follow step-by-step — each gotcha here has bitten past sessions.

## Pre-flight (always run first)

```bash
# cf and mbt live in Homebrew — not in default spawned-shell PATH
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

cf target         # expect org=592f5a7btrial, space=dev
cf mta-ops        # expect "No multi-target app operations found"
```

If `cf target` fails: `cf login -a https://api.cf.us10-001.hana.ondemand.com`
If stuck op found: `cf deploy -i <OP_ID> -a abort`

## Steps

1. **Run tests** — `npm test` (expect 31 suites / ~1523 tests passing, ~17s)
   - Do **NOT** run `npm run verify` — its lint step is broken (eslint v10, no flat config)
   - Manual equivalent: `npm run verify:mirror && npx cds compile srv/ --to sql > /dev/null && npm run test:unit`

2. **Bump version** — edit `mta.yaml` line 9 (`version: X.Y.Z`), commit:
   ```
   chore(vX.Y.Z): <one-line summary>
   ```

3. **Build (order matters)**:
   ```bash
   npx cds build --production    # REQUIRED — mbt does not run this
   mbt build -t ./               # produces nhvr-bridge-app_X.Y.Z.mtar in repo root
   ```

4. **Deploy**:
   ```bash
   cf deploy nhvr-bridge-app_X.Y.Z.mtar --version-rule ALL -f
   ```
   - ~3–5 min runtime. End marker: `Process finished.`

5. **Verify started**:
   ```bash
   cf apps
   # Expect:
   #   nhvr-bridge-app-router   started 1/1
   #   nhvr-bridge-db-deployer  stopped 0/1  ← normal
   #   nhvr-bridge-srv          started 1/1
   ```

6. **Smoke test** (302 = XSUAA redirect = healthy):
   ```bash
   curl -sI -o /dev/null -w "%{http_code}\n" \
     https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com/
   ```

7. **Cleanup + push**:
   ```bash
   ls -t nhvr-bridge-app_*.mtar | tail -n +3 | xargs rm -f   # keep 2 most recent
   git push origin main
   ```

8. **Update memory** — edit `~/.claude/projects/-Users-siddharthaampolu-21-NHVR-APP/memory/MEMORY.md` Current State: new version + commit SHA + date.

## Never

- `cf push` individual apps — always `cf deploy <mtar>`
- `mbt build` without first running `cds build --production`
- `cf delete-service nhvr-db` (destroys prod data)
- Skip the version bump — `--version-rule ALL -f` forces but MTA IDs must differ
- Re-enable csrfProtection in `xs-app.json` (CAP handles it)

## Unstick recipes

```bash
cf mta-ops                                                       # list ops
cf deploy -i <OP_ID> -a abort                                    # abort stuck
cf update-service Hanaclouddb -c '{"data":{"serviceStopped":false}}'   # wake HANA
```

## References
- Full checklist: `CLAUDE.md` §10
- Full memory: `~/.claude/projects/-Users-siddharthaampolu-21-NHVR-APP/memory/project_btp_deploy_flow.md`
