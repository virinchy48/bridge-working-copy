# NHVR Smoke-Tester — BTP Auth Setup

Credentials for the scheduled BTP smoke test (`.github/workflows/btp-smoke-test.yml`
and `scripts/btp-smoke-test.sh`).

Two paths exist. **Path B is active**; Path A is parked and documented for
future re-attempt once XSUAA plan allows it.

---

## Path A — Dedicated XSUAA client (BLOCKED on BTP trial plan)

Status: **does not work on the current trial plan.** Kept here for when the
account is upgraded.

- `create.sh` provisions an `xsuaa application` service `nhvr-smoke-tester`
  with `xs-security.json` in this dir.
- Intended to use `client_credentials` grant + a foreign-scope-reference to
  the main app's `Viewer` scope so the workflow never needs a human user.
- **What fails:** the issued JWT only contains
  `scope=[uaa.resource, nhvr-smoke-tester.SmokeTest]`. The foreign Viewer
  scope is never injected, regardless of `foreign-scope-references`,
  `authorities`, or `grant-as-authority-to-apps` on the provider side.
  Attempted again in v4.7.9 (2026-04-06) with a full main-app redeploy —
  still no injection. Almost certainly a BTP trial plan restriction.
- Full attempt log: see the header comment of `create.sh`.

If/when re-attempted:
1. Upgrade the XSUAA plan off trial.
2. Run `./create.sh` from a logged-in `cf` session.
3. `cf service-key nhvr-smoke-tester nhvr-smoke-tester-key` → store
   `clientid` / `clientsecret` / `url` as repo secrets
   `NHVR_SMOKE_CLIENT_ID`, `NHVR_SMOKE_CLIENT_SECRET`, `NHVR_SMOKE_TOKEN_URL`.
4. Switch `scripts/btp-smoke-test.sh` to use them instead of user/password.

---

## Path B — Dedicated technical user (ACTIVE)

A dedicated low-privilege BTP user in the `NHVR_Viewer` role collection,
used with XSUAA password grant.

### One-time cockpit setup

1. **Create the user**
   BTP cockpit → your subaccount → *Security* → *Users* → *Create*.
   - User ID: e.g. `nhvr-smoke-bot@<your-domain>` (must be a real email you
     control — BTP sends an activation mail).
   - Identity Provider: Default.
2. **Activate the mailbox** via the activation link, set a strong password,
   and confirm the user can log in to the BTP cockpit once.
3. **Assign the role collection**
   Cockpit → *Security* → *Role Collections* → `NHVR_Viewer` → *Edit* →
   add the new user under *Users*. (Viewer only — never Admin/Manager.)
4. **Store secrets in GitHub**
   Repo → *Settings* → *Secrets and variables* → *Actions*:
   - `CF_USERNAME` = the smoke-bot email
   - `CF_PASSWORD` = the password you set
   - (Optional) `XSUAA_CLIENT_ID` / `XSUAA_SECRET` — only needed if the
     default `cf` client fallback in `btp-smoke-test.sh` is policy-blocked.
     To get them: `cf service-key nhvr-xsuaa <key>` on the main XSUAA
     binding, then `clientid` / `clientsecret` from the output.
5. **Trigger the workflow once manually** (*Actions → BTP Smoke Test → Run
   workflow*) to confirm auth is wired before relying on the nightly run.

### Password rotation

BTP may expire passwords (typically every 6 months). When the nightly run
starts 401-ing:
- Log in as the smoke-bot in the cockpit, set a new password.
- Update `CF_PASSWORD` in repo secrets.
- Re-run the workflow.

### Never

- Never give the smoke-bot anything above `NHVR_Viewer`.
- Never reuse a developer's personal BTP account for `CF_USERNAME`.
- Never commit `.local/` (it's gitignored — see below).

---

## `.local/` — local credentials scratchpad

`infra/smoke-tester/.local/` is **gitignored** (see repo `.gitignore`). Use
it as a local-only place to stash:
- `service-key.json` — output of `cf service-key nhvr-smoke-tester …` if
  you re-attempt Path A
- `smoke-bot.env` — `CF_USERNAME=… / CF_PASSWORD=…` for manually running
  `scripts/btp-smoke-test.sh` from your laptop

Expected layout:

```
infra/smoke-tester/.local/        # gitignored
├── service-key.json              # optional, Path A output
└── smoke-bot.env                 # optional, Path B local testing
```

Nothing here is ever required for CI — CI reads GitHub secrets directly.
The directory exists only as a convenience for local repro.
