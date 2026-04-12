# Next Session — Forward Plan

Picked up during session ending 2026-04-12 (early hours), after PR #1 and PR #2
landed on `virinchy48/bridge-working-copy`.

---

## v0.7.0 — Notification Engine

The next release after the lookup-hardening + xlsx mass upload work is the
Notification Engine.

### Parallel worktree strategy (A + B + C)

Three independent worktrees should run in parallel so the branches don't
block each other:

| Worktree | Scope |
|---|---|
| **A** | Backend notification service: event triggers (CREATE/UPDATE audit-log-driven), template store, delivery adapters |
| **B** | UI: notification bell, inbox panel, per-user settings screen, toast integration |
| **C** | Infrastructure: delivery channels (email via SMTP, in-app, webhook), retry queue, dead-letter handling |

Use `git worktree add` on this project folder:
```bash
git worktree add ../bis-v0.7.0-A claude/v0.7.0-notify-backend
git worktree add ../bis-v0.7.0-B claude/v0.7.0-notify-ui
git worktree add ../bis-v0.7.0-C claude/v0.7.0-notify-infra
```

Each worktree gets its own `claude-code` session. They merge back to `main`
independently as they finish.

### Scoped Stryker mutation testing — overnight

Run Stryker mutation testing scoped to just the notification-engine files,
overnight, so the next morning you wake up to a mutation-score report for
the critical event-handling code.

```bash
npx stryker run --mutate "srv/handlers/notifications/**/*.js" \
                --mutate "app/bridge-management/webapp/util/NotificationService.js" \
                --timeout 45000
```

Stryker is already installed (`@stryker-mutator/core` + `@stryker-mutator/jest-runner`
in devDependencies).

---

## Path to v1.0 production

**10 releases, 3-4 months of focused work.** Production go-live is gated by
4 external dependencies that can't be unblocked from inside this repo:

| Gate | What | Owner | Status |
|---|---|---|---|
| 🔒 Password rotation | Rotate all secrets in `xs-security.json` + `.cdsrc-private.json`, move to BTP Credential Store | Admin | Not started |
| ⚖️ Legal review | PII handling, audit retention, data residency in HANA Cloud | Legal | Not started |
| 🔐 Penetration test | Third-party pen test against the staging environment — OWASP Top 10, SAP-specific (authz bypass, XSS, CSRF, rate limiting) | Security vendor | Not started |
| 🏗 Production infra provisioning | HANA Cloud instance, CF production space, domain mapping, backup cadence, monitoring | DevOps | Not started |

**Release cadence:**
- v0.7.0 — Notification Engine (next)
- v0.8.0 — Reporting Engine v2 (dynamic columns, saved views, scheduled delivery)
- v0.9.0 — Mobile inspector PWA (offline-first, GPS capture)
- v0.10.0 — Integration hub v2 (scheduled sync, delta payloads, conflict resolution)
- v0.11.0 — RBAC v2 (per-field permissions, jurisdiction-scoped access)
- v0.12.0 — Analytics & ML (condition prediction, risk scoring)
- v0.13.0 — i18n pass (en-AU canonical + at least en-GB/de-DE)
- v0.14.0 — Hardening (perf, a11y WCAG 2.1 AA, audit)
- v0.15.0 — Pen-test remediation
- **v1.0.0** — Production GA

---

## Open items carried over from this session

### From `test/UAT_BIS_Fix_List_2026-04-11.md`

- **P2-004** — `Bridges.view.xml` filterNhvr / filterFreight still use `key="ALL"`. Works today (explicit `=== "YES"` checks). Polish only. Skip unless touching the view for another reason.
- **P2-006** — Express `body_size: '10mb'` fires before the handler's `MAX_CSV_ROWS=10000` check. Both layers work, observation only. Tighten to `1mb` if you want them aligned.

### From the session's parallel user edits (not committed by me)

3 files were left in the working tree as user/linter edits that I didn't
touch per instruction:
- `app/bridge-management/webapp/config/RoleFallback.js`
- `app/bridge-management/webapp/controller/BridgeDetail.controller.js` (−196 lines — dead code from WorkOrder cleanup?)
- `app/bridge-management/webapp/controller/Defects.controller.js` (−73 lines)

Plus a stash entry:
- `stash@{0}: user-parallel-edits-before-p2p3` — 12 additional files from earlier in the session

Decide at the start of the next session whether these go into v0.7.0 or are
committed on their own cleanup branch first.

---

## Environment reminders for next session

- **Node version:** Node 20 via nvm — `export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:$PATH"` before any `npx` / `npm` call. System Node is 16.
- **Dev server:** port 4044, `.claude/launch.json` is pre-configured with `cap-backend` and `cap-watch` both pointing at this project (never conflicts with other projects).
- **Credentials:** admin / admin for mocked xsuaa (local only).
- **xlsx template regen:** `python3 scripts/generate-lookups-template.py` (uses openpyxl, reads live DB).
- **Unit tests:** `npm run test:unit` — 97 tests across 6 suites, all passing at session end.
- **Git remote:** `origin` is `https://github.com/virinchy48/bridge-working-copy.git`, push access via `meetsiddhu` GitHub account.

---

## Current state at session end

- **Main branch:** `a9bdc69 Lookup-driven hardening + xlsx mass upload + UAT pass (#1)` — merged squash of PR #1 (5 commits consolidated)
- **Open PR:** #2 `claude/p2-p3-uat-cleanup` — P2-005 AdminConfig pagination fix + P3-009 test data cleanup
- **Uncommitted in working tree:** 3 files (user's parallel cleanup pass) + 1 stash entry
- **Preview server:** `cap-backend` running on port 4044, PID varies per restart

---

*Written 2026-04-12 at session close. Next Claude session, read me first.*
