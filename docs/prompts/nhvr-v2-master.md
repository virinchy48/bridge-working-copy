# NHVR Bridge Management Application — v2.0
## Autonomous Build Master File
### All 15 Prompts + Execution Intelligence · Self-Directing · No Human Intervention Required

**Application:** NHVR Bridge Management Application  
**Target version:** v2.0 (from current v1.x baseline)  
**Total estimated time:** 85–105 engineering hours across 15 sequential prompts  
**Delivery model:** Fully autonomous — Claude Code reads this file, executes each prompt,  
commits after every part, and advances to the next prompt without waiting for input.

---

## ONE-LINE ACTIVATION

Commit this file to your project repo, open Claude Code on the `develop` branch, and send:

```
Read docs/prompts/nhvr-v2-master.md and execute the full autonomous build sequence.
Start at the AUTONOMOUS CONTROLLER. Follow every instruction exactly.
Do not wait for human approval between prompts — advance automatically when each
DONE CHECKLIST is fully ticked and npm test passes 100%.
```

That is the only human input required. Claude Code does the rest.

---

## VERSION TAGGING

Before starting, the human must run these 5 commands once:

```bash
git add -A && git commit -m "chore: v1.x final snapshot before v2.0 build"
git tag -a v1.0-stable -m "Production baseline — v1.x before v2.0 enhancements"
git checkout -b develop
git push origin main develop --tags
echo '{"schemaVersion":"1.0","appVersion":"2.0-building","lastSession":"none","currentPromptRef":"00","currentPromptPart":"START","partsCompleted":[],"promptsCompleted":[],"promptsRemaining":["00","01","02","03","04","05","06","07","08","09","10","11","12","13","14"],"testCoverage":{},"newEntities":[],"keyDecisions":[],"openIssues":[]}' > .nhvr-state.json
```

Rollback at any time: `git checkout v1.0-stable`

---

## AUTONOMOUS CONTROLLER
### Claude Code reads and follows this exactly — no human steps between prompts

```
AUTONOMOUS BUILD PROTOCOL — NHVR v2.0

You are executing a fully autonomous multi-session build sequence.
You will complete all 15 prompts (P00–P14) in order without human intervention.
Between prompts, you advance automatically when the DONE CHECKLIST passes.

BETWEEN-PROMPT ADVANCEMENT RULE:
  After each prompt's DONE CHECKLIST is ticked and npm test passes 100%:
    1. Run: git tag p{ref}-complete
    2. Update .nhvr-state.json: move currentPromptRef to next prompt
    3. Print: "PROMPT {ref} COMPLETE. Advancing to PROMPT {ref+1} automatically."
    4. Begin the next prompt immediately — do NOT wait for human input.
  Exception: if npm test fails after DONE CHECKLIST — fix the failures first,
    then re-tick the checklist item. Do not advance with broken tests.

SESSION TIMEOUT RECOVERY:
  If a session times out, the next session opens with:
    "Read docs/prompts/nhvr-v2-master.md and .nhvr-state.json.
     Resume the autonomous build. Continue from where state file shows."
  Claude Code reads the state file, picks up exactly where it left off,
  and continues autonomously — no human re-briefing needed.

VERSION MILESTONE TAGS:
  After P05 completes: git tag v2.0-phase1-complete
  After P11 completes: git tag v2.0-phase2-complete
  After P14 completes: git tag v2.0-complete && git checkout main &&
    git merge --no-ff develop -m "release: v2.0 — 15 enhancements complete"
```

---

## EXECUTION INTELLIGENCE
### The rules Claude Code must follow in EVERY session, EVERY prompt

```
╔══════════════════════════════════════════════════════════════════╗
║  FIVE FAILURE MODES — DESIGN EVERY SESSION TO AVOID THESE       ║
╠══════════════════════════════════════════════════════════════════╣
║ FM-1: CONTEXT COLLAPSE — context window fills mid-task.          ║
║   Fix: 300-line max per PART. Stop at 60% context. Commit.       ║
║ FM-2: READING SPIRAL — reads every file before writing anything. ║
║   Fix: grep/awk ONLY. Never cat a whole file. Read targeted.     ║
║ FM-3: TEST PARALYSIS — runs full npm test after every change.    ║
║   Fix: PATTERN={prompt} npm run test:prompt ONLY mid-session.   ║
║ FM-4: RESUMPTION AMNESIA — new session forgets prior state.      ║
║   Fix: Read .nhvr-state.json FIRST in every session. Always.     ║
║ FM-5: OVER-GENERATION — writes boilerplate, repeats the spec.    ║
║   Fix: Announce completion, not intention. No restatement.       ║
╚══════════════════════════════════════════════════════════════════╝

SESSION OPEN — runs before anything else, every session:
  1. cat .nhvr-state.json → print 5-line state summary
  2. grep -E '^(entity|  key )' db/schema.cds | head -80
  3. git status --short
  4. PATTERN={currentPrompt} npm run test:prompt
  5. ANNOUNCE: 'Ready. P{ref}. Coverage: {N}%. Starting {task}.'

SESSION CLOSE — runs after every completed PART:
  1. PATTERN={prompt} npm run test:prompt — must show >=80% branch
  2. npx eslint {new-files-only} --max-warnings=0
  3. Write .nhvr-state.json (partsCompleted, newFiles, keyDecisions)
  4. git add -A && git commit -m "feat(p{ref}): {PART} — {8-word summary}"
  5. Print 5-line summary: built / coverage / next / open issues

TOKEN EFFICIENCY — non-negotiable:
  READ:  grep/awk before cat. Read only the function being changed.
  EDIT:  str_replace for all edits — never regenerate a whole file.
  TEST:  PATTERN= npm run test:prompt mid-session. npm test ONCE at end.
  STOP:  At 60% context — commit, update state, continue next session.
  MAX:   300 lines new/changed code per PART.
  PARALLEL: entity + seed CSV + helpContent entries simultaneously.
             Schema → service → UI always sequential.
  NEVER: Re-read a file already read this session.
  NEVER: Write stubs — implement fully or defer the whole PART.
  NEVER: Full npm test more than once per prompt (end only).

TARGETED READS — file priority by task type:
  New CDS entity:   db/schema.cds (entity names only, first 5 lines each)
                    srv/bridge-service.cds (projections section only)
                    One existing entity as pattern reference
  New CAP handler:  srv/bridge-service.js (specific action being extended)
  New UI component: src/components/ui/ (2 most similar existing components)
  Writing tests:    tests/integration/ (ONE existing test as pattern)
  Schema scan:      grep -E '^(entity|  key )' db/schema.cds | head -80
  Action list:      grep -E '(action|function)' srv/bridge-service.cds
  Handler list:     grep -E "(on|before|after)\\('" srv/bridge-service.js | head -40

PART SIZING RULES:
  CDS schema extension:    30–60 lines
  CAP service handler:     60–100 lines
  Integration test file:   40–80 lines
  Unit test file:          20–40 lines
  Frontend component:      60–120 lines (split if >120)
  Seed data CSV:           20–50 lines
  State file update:       5–10 lines (always last, always mandatory)

PARALLEL EXECUTION — write simultaneously:
  Entity extension + seed CSV + helpContent entries
  Mock server + client class
  Multiple unit test files (independent modules)
  ADR document + state file update
  NEVER parallel: schema → handler → UI (strict sequence)

RESUMPTION DECISION TREE:
  State exists + git clean + tests pass → confirm 2 lines, begin PART
  State exists + uncommitted changes → check diff, complete, test, commit
  State exists + tests failing → fix regression first, then continue
  State missing + git log has commits → reconstruct from commits, write state
  State missing + no commits → start from P00 (fresh baseline)

ANTI-PATTERNS — violation = restart the PART:
  NEVER run `npm test` (full) mid-session
  NEVER re-read a file already read this session
  NEVER regenerate a file — use str_replace
  NEVER write placeholder code (TODO, stubs, empty functions)
  NEVER describe what you are about to do — just do it
  NEVER install a package without checking package.json first
  NEVER commit with message "update" or "fix" — use structured format
  NEVER proceed past 60% context without committing and updating state

ADD TO package.json in PART 0 (required for all subsequent test commands):
  "test:prompt": "jest --testPathPattern=$PATTERN --coverage --silent"
```

---

## PRODUCT DESIGN PRINCIPLES
### Non-negotiable. Apply to every line of code in every prompt.

```
◈ INTUITIVE FIRST
  Every screen usable by a bridge inspector on a muddy riverbank, rain gloves,
  5-inch phone, without reading a manual. If it needs a manual, redesign it.

◈ CONTEXT-AWARE HELP
  Every form field: placeholder (real example) + helperText (why it matters)
  + infoTooltip (standard reference). No field is naked. Driven from helpContent.ts.
  Every page: PageHeader subtitle describing what the page is for.
  Every empty state: an invitation with a CTA, not a blank wall.

◈ PROGRESSIVE DISCLOSURE
  Show what the user needs NOW. Complexity available but never mandatory.
  The bridge list shows condition and status. Load rating data is one tap away.

◈ ZERO DEAD ENDS
  Empty states are invitations. Errors are guided recoveries.
  Loading states explain what is happening. 403 = who to contact, not "Forbidden".
  Every button has a real handler. No toasts saying "use the API".

◈ PERFORMANCE IS A FEATURE
  FCP < 1.5s. TTI < 3s on 4G. Virtual scrolling for 10,000+ records.
  Skeleton screens (not spinners). Optimistic UI for all mutations.
  Lighthouse CI in GitHub Actions — fails PR if Performance < 85.

◈ SECURE BY DESIGN
  Server-side validation in CAP before() hooks always.
  Rate-limit all mutation endpoints. Never expose stack traces to users.
  Log all state changes. OWASP Top 10 compliance.

◈ ACCESSIBLE BY DEFAULT
  WCAG 2.2 AA. Screen reader compatible. Keyboard navigable.
  High contrast for field use in sunlight. axe-core violations = CI failures.

◈ EXTENSIBLE ARCHITECTURE
  Every module is a plugin. Feature flags for everything.
  Configuration over code. i18n-ready from day one.
  Standards profiles (AU/NZ/EU) prove the architecture adapts without rewrites.
```

---

## UX DESIGN SYSTEM
### Apply consistently in every prompt that touches UI

```
DESIGN TOKENS — define in src/styles/tokens.css:
  --color-surface-base: #F5F2EB;
  --color-surface-card: #FFFFFF;
  --color-ink: #0A0E1A;
  --color-ink-secondary: #4A5568;
  --color-ink-muted: #718096;
  --color-accent: #C8390F;
  --color-success: #065F46;
  --color-warning: #B45309;
  --color-info: #1D4ED8;
  --color-danger: #991B1B;
  --color-border: #D1CFC8;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --shadow-sm: 0 1px 3px rgba(10,14,26,.08);
  --shadow-md: 0 4px 6px rgba(10,14,26,.07);
  --font-body: 'Inter var', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --transition: all 150ms cubic-bezier(0.4,0,0.2,1);

COMPONENT LIBRARY — build in src/components/ui/:
  Button        — primary/secondary/ghost/danger/icon-only + loading + disabled + tooltip
  FormField     — label + input/select/textarea + helper text + error text + icon
  StatusBadge   — semantic colour badges for condition/status/severity
  InfoTooltip   — ? icon showing contextual help on hover/tap (mobile-safe)
  EmptyState    — illustration + heading + description + primary CTA
  LoadingState  — skeleton screens (not spinners) for data-heavy views
  ConfirmDialog — title + description + consequences + cancel/confirm
  Toast         — success/warning/error/info with auto-dismiss + undo
  PageHeader    — breadcrumb + title + subtitle + actions row
  DataTable     — sortable, sticky header, row actions, pagination, export,
                  empty state, loading skeleton, column visibility toggle
  StatCard      — large number + label + trend indicator + sparkline
  SectionCard   — titled card container with optional collapse + info tooltip

CONTEXTUAL HELP — required on every form field:
  placeholder:  real example value (e.g. 'e.g. BRG-NSWM1-001')
  helperText:   explains purpose and why it matters
  infoTooltip:  standard reference (e.g. 'Per AustRoads BIMM §4.3')
  All driven from src/utils/helpContent.ts registry — never hardcoded in components

RESPONSIVE BREAKPOINTS:
  xs: 320px (phone portrait — inspector in field)
  sm: 480px (phone landscape)
  md: 768px (tablet — on-site inspector)
  lg: 1024px (laptop — office planner)
  xl: 1280px (desktop — analyst)
  Use CSS Grid with minmax() and auto-fill. Tables → card layout on mobile.

PERFORMANCE:
  Bundle: code-split by route (React.lazy / dynamic import)
  Lists > 50 items: virtual scrolling (@tanstack/virtual)
  API calls: React Query with staleTime:5min, gcTime:10min
  FCP < 1.5s · LCP < 2.5s · CLS < 0.1

MICRO-INTERACTIONS (elevate perceived quality):
  Form save: optimistic update → success toast
  Condition rating slider: live label as user drags
  Restriction expiry: 'Expires in 3 days' countdown → amber → red
  Loading: shimmer skeleton, not blank white or spinners
  Error: shake animation on invalid submit + focus on first error field
```

---

## UNIVERSAL PROMPT HEADER
### Claude Code prepends this block at the start of EVERY session

```
## ◈ SESSION INITIALISATION — run before any code

1. READ .nhvr-state.json → print 5-line current state summary.
   If missing: Prompt 00 has not started. Begin PART 0 setup first.

2. SCHEMA SCAN (50 tokens max):
   grep -E '^(entity|  key )' db/schema.cds | head -80

3. GIT STATUS:
   git status --short → confirm clean or detect partial work

4. TEST BASELINE:
   PATTERN={CURRENT_PROMPT_TEST_PATTERN} npm run test:prompt
   (Patterns listed in each prompt below)

5. ANNOUNCE:
   'Ready. P{ref}. Last: {lastAction}. Next: {task}. Coverage: {N}% branch.'

## ◈ TEAM IDENTITY

World-class senior cross-functional product engineering team with 20+ years
experience from Google, Meta, Anthropic, SAP, Microsoft, Accenture, and
leading Australian government digital practices. Roles:
  Principal Product Engineer    — SAP CAP/Node.js, API design, systems thinking
  Senior UX/Product Designer    — Google Material 3, Apple HIG, WCAG 2.2 AA
  Accessibility Lead            — screen reader, keyboard nav, cognitive load
  Performance Engineer          — Core Web Vitals, Time-to-Interactive, PWA
  Security Architect            — OWASP Top 10, IRAP, zero-trust, rate limiting
  SAP EAM/BTP Architect         — HANA Cloud, OData V4, XSUAA, CAP patterns
  QA Lead                       — TDD, Jest, integration, regression, e2e

## ◈ TOKEN EFFICIENCY (non-negotiable)

  READ surgically: grep before cat, cat before full read.
  EDIT via str_replace: never regenerate a whole file.
  TEST targeted: PATTERN= npm run test:prompt — never full suite mid-session.
  STOP at 60% context: commit, update state, next session continues.
  MAX 300 lines new/changed code per PART.
  PARALLEL: schema + CSV + helpContent entries simultaneously.
             Sequential: schema → service → UI always.
  NEVER re-read a file already read this session.
  NEVER write stubs or placeholder code.
  NEVER describe intention — just execute and announce completion.

## ◈ SESSION CLOSE (after every completed PART)

  1. PATTERN={prompt} npm run test:prompt → must show >=80% branch
  2. npx eslint {new-files-only} --max-warnings=0
  3. Write .nhvr-state.json (partsCompleted, newFiles, keyDecisions)
  4. git add -A && git commit -m "feat(p{ref}): {PART} — {summary}"
  5. Print 5-line completion summary
  6. If autonomous mode: advance to next prompt automatically
```

---

## STATE FILE SCHEMA
### .nhvr-state.json at project root — written after every PART

```json
{
  "schemaVersion": "1.0",
  "appVersion": "2.0-building",
  "lastUpdated": "ISO-datetime",
  "lastSession": "Prompt 03 — Freight Route Corridor",
  "currentPromptRef": "03",
  "currentPromptPart": "PART 3",
  "partsCompleted": ["PART 1", "PART 2"],
  "partsRemaining": ["PART 3", "PART 4", "TESTS"],
  "promptsCompleted": ["00", "01", "02"],
  "promptsRemaining": ["03","04","05","06","07","08","09","10","11","12","13","14"],
  "testCoverage": { "branch": 78, "lines": 82, "functions": 85 },
  "newFilesCreated": ["db/schema-extensions/FreightRoute.cds"],
  "newEntities": ["FreightRoute", "FreightRouteBridge"],
  "newActions": ["assessCorridor", "getRoutesByVehicleClass"],
  "keyDecisions": [
    "assessCorridor stores corridor metrics on FreightRoute entity (not computed on-the-fly)",
    "corridorPbsMaxClass uses MIN across all bridges (most restrictive wins)"
  ],
  "openIssues": [],
  "envVarsAdded": [],
  "targetedTestCommand": "npm test -- --testPathPattern='freightRoute|corridor' --coverage --silent"
}
```

---

## PROMPT SEQUENCE MAP

| Ref | Title | Gap | Phase | Test Pattern | Est. |
|-----|-------|-----|-------|-------------|------|
| 00 | Foundation — Design System, Nav & UX Architecture | Pre-work | Pre-P2 | `ui/` | 4–6 hrs |
| 01 | AS 5100.7 Load Rating — Evidence-Based Restrictions | G-02 | P1 | `loadRating` | 5–7 hrs |
| 02 | NHVR BAMS Integration — Live Sync & Transparency | G-01 | P1 | `bams` | 6–8 hrs |
| 03 | Freight Route Corridor — PBS/HML Assessment | G-04 | P1 | `freightRoute\|corridor` | 6–8 hrs |
| 04 | SAP PM/EAM Integration — Defect-to-Work-Order | G-11 | P1 | `sappm\|workOrder` | 8–10 hrs |
| 05 | Offline PWA — Field Inspector Works Anywhere | G-05 | P1 | `offline\|sync` | 8–10 hrs |
| 06 | Esri GIS Integration — Spatial Intelligence | G-03 | P1 | `gis\|spatial` | 8–10 hrs |
| 07 | Scour Risk — Multi-Parameter AustRoads BIMM §7 | G-06 | P2 | `scour` | 4–5 hrs |
| 08 | Gazette Validation — Real-Time Compliance | G-08 | P2 | `gazette` | 3–4 hrs |
| 09 | Deterioration Model — Predict Bridge Future | G-07 | P2 | `deteriorat\|priority` | 6–8 hrs |
| 10 | Executive Dashboard — Network Health at a Glance | Phase 2 | P2 | `dashboard` | 5–6 hrs |
| 11 | Multi-Jurisdiction RBAC — Right Data, Right People | G-12 | P2 | `jurisdict\|rbac` | 5–6 hrs |
| 12 | International Standards — One Platform, Any Country | G-10 | P3 | `standards\|adapter` | 5–6 hrs |
| 13 | IoT Sensors — Infrastructure Speaks, Platform Listens | G-09 | P3 | `sensor\|iot\|alert` | 6–8 hrs |
| 14 | AI Defect Classification — Inspector's Second Opinion | R-14 | P3 | `defectClass\|photo\|ai` | 6–8 hrs |

**Total: 85–105 hrs · Milestones: P05=Phase1 · P11=Phase2 · P14=v2.0-complete**

---

## PROMPT 00 — FOUNDATION
### Design System, Navigation & UX Architecture
**Gap:** Pre-work · **Phase:** Pre-Phase 2 · **Est:** 4–6 hrs  
**Test:** `npm test -- --testPathPattern='ui/' --coverage --silent`  
**Split:** 00a (npm install + tokens + 5 core components) · 00b (9 more components + helpContent) · 00c (nav + routing + axe + Lighthouse CI)  
**Context risk:** Highest token session — scan directory structure only, build components alphabetically  
**Parallelise:** All npm installs in one bash call · helpContent.ts + errorMessages.ts + tokens.css simultaneously  
**Token traps:** axe-core output verbose — pipe through grep · helpContent: write 5 entries as template, batch-add the rest in one str_replace  

**User story:** A bridge inspector opens the app on their phone at a culvert. It looks like every other enterprise tool — dense, grey, unlabelled. They give up and use paper. This prompt builds the foundation that makes every subsequent screen feel designed for them specifically.

```
## TASK: PROJECT FOUNDATION — Design System, Component Library, Navigation

PART 1 — NPM INSTALL + DESIGN TOKENS
  Install: npm i @tanstack/react-query @tanstack/react-virtual
             react-hook-form @hookform/resolvers zod
             framer-motion sonner lucide-react
             workbox-webpack-plugin (or vite-plugin-pwa)

  Create src/styles/tokens.css (all CSS custom properties from UX DESIGN SYSTEM above)
  Create src/styles/global.css (base resets, typography scale, focus rings)
    CRITICAL: :focus-visible ring = 3px solid var(--color-accent) with 2px offset

  Add to package.json scripts:
    "test:prompt": "jest --testPathPattern=$PATTERN --coverage --silent"
    "analyse": "source-map-explorer 'build/static/js/*.js'"

  Run: npm run build → confirm zero errors before proceeding

PART 2 — COMPONENT LIBRARY (src/components/ui/)
  Build ALL 14 components from UX DESIGN SYSTEM above.
  Each component must have:
    - TypeScript-typed props interface
    - JSDoc comment on the component
    - axe-core accessibility test in tests/a11y/components.test.ts
    - storybook story (if Storybook is configured)

  Build in alphabetical order to manage context:
    Button, ConfirmDialog, DataTable, EmptyState, FieldWithHelp,
    FormField, InfoTooltip, LoadingState, PageHeader, SectionCard,
    StatCard, StatusBadge, Toast (via Sonner), VirtualList

  Button variants: primary / secondary / ghost / danger / icon-only
    All variants: loading state (spinner), disabled state, tooltip prop

  DataTable: sortable columns, sticky header, row checkboxes for bulk action,
    column visibility panel (grouped by section, drag to reorder, persist to localStorage),
    virtual scrolling via @tanstack/react-virtual for rows > 50,
    empty state with explanation + CTA, skeleton loading rows

PART 3 — HELP CONTENT REGISTRY
  Create src/utils/helpContent.ts — typed registry of ALL field help:
    interface AttributeHelp {
      label: string; placeholder?: string; helperText: string;
      tooltip?: string; learnMoreUrl?: string;
    }
    export const HELP: Record<string, AttributeHelp> = { ... }
  
  Create src/utils/errorMessages.ts — maps HTTP codes + CAP error types
    to plain English user messages with suggested actions:
    interface ErrorMessage { userMessage: string; action: string; }
    export const ERRORS: Record<string, ErrorMessage> = { ... }

  Create <FieldWithHelp> wrapper component:
    Auto-injects help from helpContent.ts based on fieldId prop.
    Renders: label + input + helperText below + InfoTooltip on label.
    Used in ALL forms going forward — no help text hardcoded in form components.

  Create <ScreenGuide> component:
    First visit: expanded panel 'What is this page?' (dismissible)
    Subsequent: collapsed chip 'ⓘ What can I do here?' (expands on click)
    Persists dismissed state to localStorage per screen.

PART 4 — NAVIGATION & ROUTING
  Implement role-based navigation with 3 user profiles:

  INSPECTOR (mobile-first):
    Quick-access: 'My Inspections Today' — assigned inspections, one tap
    Quick-access: 'Scan Bridge' — QR code → bridge record
    Quick-access FAB: 'Raise Defect' — always visible, bottom-right

  COMPLIANCE OFFICER (office, desktop):
    Quick-access: 'Compliance Dashboard'
    Quick-access: 'Restrictions Expiring' (proactive alert list)
    Quick-access: 'Overdue Inspections'

  ASSET MANAGER (strategic):
    Quick-access: 'Priority List'
    Quick-access: 'Network Map'
    Quick-access: 'Reports'

  Global command palette: Cmd+K / Ctrl+K
    Search by: bridge name, ID, route number, suburb, postcode
    Results: bridge name + condition badge + state + quick actions
    Debounced 200ms, skeleton loading, keyboard navigable

  Recent bridges: last 5 visited, persisted to localStorage
  Route-based code splitting: React.lazy for every top-level page

PART 5 — PERFORMANCE & ACCESSIBILITY BASELINE
  Add Lighthouse CI to GitHub Actions (.github/workflows/ci.yml):
    - Run lighthouse on main routes
    - Fail PR if Performance < 85
  Add axe-core to Jest setup (tests/setup.ts):
    - accessibility violations = test failures
  All interactive elements: aria-label where no visible text
  All status changes: announce via aria-live region
  All modals: trap focus, close on Escape, return focus on close

  Document baseline in docs/ADR/ADR-001-v2-foundation-baseline.md

DONE CHECKLIST:
  [ ] npm install all packages, npm run build passes
  [ ] tokens.css with all CSS variables
  [ ] global.css with focus rings
  [ ] test:prompt script in package.json
  [ ] All 14 UI components built, TypeScript-typed, accessible
  [ ] FieldWithHelp wrapper component
  [ ] ScreenGuide component
  [ ] helpContent.ts registry (initial entries for all existing fields)
  [ ] errorMessages.ts registry
  [ ] Role-based nav (3 profiles)
  [ ] Global command palette (Cmd+K)
  [ ] Route-based code splitting
  [ ] Lighthouse CI in GitHub Actions (fails < 85)
  [ ] axe-core in Jest (violations = failures)
  [ ] ADR-001 written
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 01 — AS 5100.7 LOAD RATING
### Intuitive Evidence-Based Restrictions
**Gap:** G-02 · **Phase:** P1 · **Est:** 5–7 hrs  
**Test:** `npm test -- --testPathPattern=loadRating --coverage --silent`  
**Split:** 01a (entity + denorm + restriction linkage) · 01b (service + seed data) · 01c (4-step form UI + tests)  
**Context risk:** Write form LAST — it depends on stable entity and service  
**Parallelise:** BridgeLoadRating entity + Bridge denorm fields + seed CSV simultaneously  
**Token traps:** Multi-step form wizard = 4 separate section components, not one 200-line component  

**User story:** A compliance officer must justify why a 68-tonne PBS Class 3 vehicle cannot cross the Murrumbidgee River Bridge. Today, the restriction exists but has no structural evidence behind it. After this prompt, the answer is one click away — the load rating that drove the restriction, the engineer who calculated it, and the AS 5100.7 report reference.

```
## TASK: AS 5100.7 STRUCTURAL LOAD RATING — Evidence-Based Restrictions

PART 1 — SCHEMA EXTENSION
  Add to db/schema.cds (or db/extensions/ if using extend pattern):

  entity BridgeLoadRating : managed {
    key ratingId          : UUID;
    bridge                : Association to Bridge;
    ratingDate            : Date;
    ratingEngineer        : String(150);
    ratingFirm            : String(150);
    standard              : String(50) default 'AS5100.7-2017';
    computationMethod     : String(50);   // LRFR | LFR | ASD
    t44Rating             : Decimal(6,2); // SM1600 T-component (t)
    t44Restricted         : Decimal(6,2);
    sm1600UdlRating       : Decimal(6,2); // kN/m
    hlp400Rating          : Boolean default false;
    hlp320Rating          : Boolean default false;
    w80AxleRating         : Decimal(6,2); // kN
    a160AxleRating        : Decimal(6,2);
    grossMassRating       : Decimal(6,2); // t
    tandemAxleRating      : Decimal(6,2);
    triAxleRating         : Decimal(6,2);
    pbsClass1Rating       : Boolean default false;
    pbsClass2Rating       : Boolean default false;
    pbsClass3Rating       : Boolean default false;
    pbsClass4Rating       : Boolean default false;
    bdoubleRating         : Boolean default false;
    bTripleRating         : Boolean default false;
    bdoubleGML            : Decimal(6,2);
    hmlApproved           : Boolean default false;
    hmlConditions         : LargeString;
    structuralAdequacy    : String(20);   // ADEQUATE|RESTRICTED|SUBSTANDARD
    governingElement      : String(200);
    nextRatingDue         : Date;
    ratingReport          : String(500);
    notes                 : LargeString;
  }

  Extend Bridge entity with:
    loadRatings           : Composition of many BridgeLoadRating on loadRatings.bridge = $self;
    currentGrossRating    : Decimal(6,2);
    currentT44Rating      : Decimal(6,2);
    hmlApproved           : Boolean;
    pbsMaxClass           : Integer;
    bdoubleApproved       : Boolean;

  Extend BridgeRestriction with:
    derivedFromRating     : Association to BridgeLoadRating;
    ratingJustification   : String(500);

PART 2 — SERVICE LAYER
  In srv/bridge-service.cds: expose BridgeLoadRatings as entity in service.

  In srv/bridge-service.js:
    After BridgeLoadRating CREATE/UPDATE:
      → Update Bridge denorm fields from latest rating record
      → Write BridgeHistory: LOAD_RATING_RECORDED
    Validation: ratingDate not future · nextRatingDue > ratingDate · grossMassRating > 0
    Custom function: getRatingSummary(bridgeId) → latest rating + all denorm fields

  Restriction CREATE/UPDATE: if type GROSS_MASS or AXLE_LOAD and no derivedFromRating:
    → Add warning to response (not error — do not block save)

PART 3 — SEED DATA
  db/data/BridgeLoadRating.csv — realistic ratings for all 13 seed bridges:
    Mix: ADEQUATE + RESTRICTED + SUBSTANDARD
    At least 2 HML-approved (national freight corridors)
    At least 3 PBS Class 3 approved
    At least 2 overdue for review (nextRatingDue in past)

PART 4 — LOAD RATINGS TAB (UI)
  Add 'Load Ratings' tab to Bridge Detail page.

  SUMMARY CARD (3-column grid on desktop, stacked on mobile):
    Card 1 — Gross Mass: rating value + ADEQUATE/RESTRICTED/SUBSTANDARD badge
      Green if current (< 5yr) · Amber if due for review (5-10yr) · Red if overdue (10+yr)
      Tooltip: 'Maximum permissible gross vehicle mass per AS 5100.7 §4.2'
    Card 2 — Vehicle Class Access: tick/cross for HML, PBS-2, PBS-3, PBS-4, B-double
      Tooltip per item explains vehicle type
    Card 3 — Next Action:
      If current: '✓ Rating current' (green)
      If 5-10yr: '⚠ Rating due for review in N months' (amber)
      If 10+yr: '✗ Rating overdue — schedule AS 5100.7 assessment' (red)
      CTA: 'Add New Rating' button

  ADD RATING FORM — 4-step progressive disclosure:
    Step 1: Rating Identity
      ratingDate, ratingEngineer (placeholder: 'e.g. Jane Smith (RPEQ-00412)'),
      ratingFirm, computationMethod (select: LRFR/LFR/ASD with explanations), ratingReport
      All fields: placeholder + helperText + tooltip via FieldWithHelp

    Step 2: Mass & Axle Ratings
      InfoBanner: 'All values in tonnes (t) or kilonewtons (kN) as marked.'
      grossMassRating, t44Rating, tandemAxleRating, triAxleRating, w80AxleRating

    Step 3: Vehicle Class Approvals
      InfoBanner: 'Only approve classes that structural assessment supports.'
      Toggle switches per class: HML, PBS-1, PBS-2, PBS-3, PBS-4, B-double, B-triple
      Each toggle ON: reveals GML input for that class

    Step 4: Structural Assessment
      structuralAdequacy (select with descriptions):
        ADEQUATE: 'Bridge meets all design loads without restriction'
        RESTRICTED: 'Requires vehicle restrictions to remain safe'
        SUBSTANDARD: 'Requires immediate attention and posting'
      governingElement, nextRatingDue, notes
      Form footer: step progress + 'Save Draft' (localStorage) + 'Submit'

  RATING HISTORY TABLE: sortable by date desc
    Columns: Date | Engineer | Gross Mass | T44 | PBS Class | HML | Adequacy | Overdue?
    Row click: expands to show all fields

  RESTRICTION LINKAGE:
    When creating GROSS_MASS or AXLE_LOAD restriction:
      Show callout: 'Link to a load rating for NHVR compliance evidence'
      Dropdown: select from existing ratings or 'Manual override (requires justification)'

DONE CHECKLIST:
  [ ] BridgeLoadRating entity in schema (all fields)
  [ ] Bridge denorm fields (currentGrossRating, hmlApproved, pbsMaxClass, bdoubleApproved)
  [ ] BridgeRestriction.derivedFromRating association
  [ ] Service: denorm auto-update, history entry, getRatingSummary
  [ ] Restriction warning when no rating linked (GROSS_MASS/AXLE_LOAD)
  [ ] Seed CSV for all 13 bridges
  [ ] Summary cards (3-col, age indicator, next action CTA)
  [ ] 4-step add rating form with all fields + FieldWithHelp
  [ ] Rating history table
  [ ] Restriction linkage dropdown
  [ ] Unit tests: validation, rating age, BHI computation
  [ ] Integration tests: POST/GET, denorm update, restriction warning
  [ ] axe-core passes on Load Ratings tab
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 02 — NHVR BAMS INTEGRATION
### Live Sync with Visual Status Transparency
**Gap:** G-01 · **Phase:** P1 · **Est:** 6–8 hrs  
**Test:** `npm test -- --testPathPattern=bams --coverage --silent`  
**Split:** 02a (mock server + BAMSClient + env config) · 02b (outbound push + retry job + inbound sync) · 02c (sync UI)  
**Context risk:** Build mock FIRST — every subsequent test depends on it  
**Parallelise:** Mock BAMS endpoints + BAMSClient class skeleton simultaneously  
**Token traps:** Circuit breaker = fresh client instance per test (no state bleed) · Retry backoff: use jest.useFakeTimers()  

**User story:** A TfNSW compliance officer updates a restriction at 9am. At 10am, an NHVR inspector queries BAMS and sees the old value. The discrepancy creates a regulatory incident. After this prompt, the sync status is unmistakable — the user never wonders whether what they see matches what NHVR sees.

```
## TASK: NHVR BAMS API BIDIRECTIONAL INTEGRATION

PART 1 — MOCK BAMS SERVER + CLIENT
  Create srv/integrations/bams-mock.js — Express sub-app at /mock-bams:
    GET  /mock-bams/bridges/{bamsId}
    GET  /mock-bams/bridges/{bamsId}/restrictions
    POST /mock-bams/bridges/{bamsId}/restrictions
    PUT  /mock-bams/restrictions/{id}
    GET  /mock-bams/health
    Seed 13 bridge BAMS IDs from existing seed data
    Realistic response delays: 100–500ms random

  Create srv/integrations/bams-client.js — BAMSClient class:
    constructor(baseUrl, apiKey)  // reads BAMS_API_URL, BAMS_API_KEY from env
    async getBridge(bamsId)
    async getRestrictions(bamsId)
    async pushRestriction(payload)
    async healthCheck()
    Retry: exponential backoff, max 3 retries, configurable timeout
    Circuit breaker: 3 consecutive failures → disable push, log alert

  Add to Bridge entity: bamsId (String 50), bamsLastSync (DateTime)
  Add to BridgeRestriction: bamsRestrictionId (String 50), bamsSync (SYNCED|PENDING|FAILED)

  In dev/test: BAMSClient points to /mock-bams
  In production: BAMSClient points to BAMS_API_URL env var

PART 2 — OUTBOUND PUSH + RETRY JOB + INBOUND SYNC
  After BridgeRestriction CREATE/UPDATE (if BAMS_PUSH_ENABLED=true):
    Map restriction type: GROSS_MASS→GML, AXLE_LOAD→AXLE, etc.
    Call bamsClient.pushRestriction(payload)
    Store BAMS response ID in bamsRestrictionId
    Write history: BAMS_PUSH_SUCCESS or BAMS_PUSH_FAILED
    On failure: do NOT rollback local save · set bamsSync=PENDING

  srv/jobs/bams-retry.js:
    setInterval on cds.on('served'), interval from BAMS_RETRY_INTERVAL_MS (default 300000)
    Query BridgeRestriction where bamsSync=PENDING
    Retry push for each · Update bamsSync on success/failure
    Log all attempts

  Custom CAP action: syncFromBAMS(bridgeId, bamsId):
    Fetch bridge + restrictions from BAMS
    Compare by bamsRestrictionId
    New in BAMS: create locally with source=BAMS
    Changed in BAMS: update local, write history BAMS_SYNC_UPDATE
    Local not in BAMS: flag discrepancy (do not delete)
    Return { added, updated, discrepancies }

PART 3 — SYNC STATUS UI
  App header: persistent cloud sync indicator
    SYNCED:  invisible (no clutter when everything works)
    SYNCING: blue 'Syncing...' with spinner (non-blocking)
    PENDING: amber 'N restrictions pending sync' → click opens drawer
    FAILED:  red 'BAMS error — N items queued' → click to retry

  BAMS Sync Status drawer (slide-in panel):
    'Recently Synced': last 10 successful syncs
    'Pending Sync': queue with retry per item + 'Retry All' button
    'Sync Failures': error message in plain English + suggested fix + retry
    'BAMS Configuration': base URL, health check status

  Per-restriction sync status icon in restriction list:
    ✓ cloud = synced · ↑ upload = pending · ! warning = failed
    Hover: 'Last sync: {datetime}, BAMS ID: {id}'

  Sync from BAMS confirmation dialog (before applying any inbound changes):
    'New from BAMS (N)' | 'Changed in BAMS (N)' | 'Discrepancies (N)'
    Side-by-side: current value vs BAMS value
    Per item: 'Accept BAMS' | 'Keep Ours' | 'Review Later'
    User must explicitly confirm — no silent overwrites

DONE CHECKLIST:
  [ ] Mock BAMS server at /mock-bams with 5 endpoints + seed data
  [ ] BAMSClient with retry + circuit breaker
  [ ] Bridge.bamsId and BridgeRestriction.bamsSync fields
  [ ] Outbound push on restriction save
  [ ] BAMS retry job on server startup
  [ ] syncFromBAMS action with discrepancy detection
  [ ] App header sync health indicator (4 states)
  [ ] Per-restriction sync icons with tooltips
  [ ] BAMS Sync Status drawer (4 sections)
  [ ] Sync preview confirmation dialog (no silent overwrites)
  [ ] Unit tests: type mapping, circuit breaker, retry backoff
  [ ] Integration tests: push on save, failure→PENDING, syncFromBAMS
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 03 — FREIGHT ROUTE CORRIDOR
### PBS/HML Route Assessment for Operators
**Gap:** G-04 · **Phase:** P1 · **Est:** 6–8 hrs  
**Test:** `npm test -- --testPathPattern='freightRoute|corridor' --coverage --silent`  
**Split:** 03a (entities + seed) · 03b (assessCorridor + getRoutesByVehicleClass + auto-reassess) · 03c (Route List + Vehicle Finder + Route Detail UI)  
**Context risk:** assessCorridor is the computational core — write and test it in isolation BEFORE any UI  
**Parallelise:** FreightRoute entity + FreightRouteBridge entity + 5 seed CSVs simultaneously  
**Token traps:** MIN across bridges must handle null restrictions (no restriction ≠ zero restriction)  

**User story:** A Toll Logistics PBS Class 3 fleet manager needs to know: 'Can my 63.5-tonne B-triple run from Port Botany to Moorebank via the M5?' Today they call RMS. After this prompt, they open the app, enter their vehicle class and gross mass, and the answer is instant, visual, and cited.

```
## TASK: FREIGHT ROUTE CORRIDOR — PBS/HML ROUTE ASSESSMENT

PART 1 — SCHEMA + SEED DATA
  New entities in db/schema.cds:

  entity FreightRoute : managed {
    key routeId         : String(30);  // FR-NSW-001
    routeName           : String(200);
    state               : State;
    routeType           : String(20);  // NHVR_HML|PBS_CLASS2|PBS_CLASS3|PBS_CLASS4|B_DOUBLE|B_TRIPLE|GENERAL
    description         : String(500);
    startPoint, endPoint: String(200);
    totalLengthKm       : Decimal(8,2);
    nhvrRouteRef        : String(100);
    gazetteRef          : String(100);
    status              : String(20) default 'ACTIVE'; // ACTIVE|UNDER_REVIEW|SUSPENDED
    lastAssessedDate    : Date;
    nextReviewDate      : Date;
    bridges             : Composition of many FreightRouteBridge on bridges.route = $self;
    corridorGrossLimit  : Decimal(6,2);
    corridorAxleLimit   : Decimal(6,2);
    corridorHeightLimit : Decimal(4,2);
    corridorHmlApproved : Boolean;
    corridorPbsMaxClass : Integer;
    corridorBdouble     : Boolean;
    restrictingBridgeId : String(50);
    assessmentNotes     : LargeString;
  }

  entity FreightRouteBridge {
    key route           : Association to FreightRoute;
    key bridge          : Association to Bridge;
    sequenceNumber      : Integer;
    chainage            : Decimal(8,3);
    notes               : String(500);
  }

  Seed data — 5 Australian freight corridors:
    FR-NSW-001: Sydney Basin → Orange — HML route
    FR-NSW-002: Port Botany → Moorebank — B-double
    FR-QLD-001: Brisbane Gateway → Toowoomba — PBS Class 3
    FR-VIC-001: Melbourne Port → Dandenong — B-double
    FR-WA-001:  Perth → Fremantle Port — HML
  FreightRouteBridge: 2–4 seed bridges per route using existing 13 bridge IDs

PART 2 — SERVICE LAYER
  Custom CAP action: assessCorridor(routeId):
    Fetch FreightRouteBridge ordered by sequence
    For each bridge: get ACTIVE restrictions
    Compute:
      corridorGrossLimit  = MIN(active GROSS_MASS values, or grossMassRating if no restriction)
      corridorAxleLimit   = MIN(active AXLE_LOAD values)
      corridorHeightLimit = MIN(active HEIGHT values)
      corridorHmlApproved = ALL bridges have hmlApproved=true
      corridorPbsMaxClass = MIN(pbsMaxClass) across all bridges
      corridorBdouble     = ALL bridges have bdoubleApproved=true
      restrictingBridgeId = bridge with tightest gross restriction
    Update FreightRoute fields
    Write history on each bridge: CORRIDOR_ASSESSMENT_INCLUDED
    Return assessment report with per-bridge audit trail

  Custom CAP function: getRoutesByVehicleClass(pbsClass, grossMass, state):
    Returns eligible routes + ineligibility reason per non-eligible route

  Trigger: After BridgeRestriction CREATE/UPDATE/DELETE on a bridge in any FreightRoute:
    → Auto-run assessCorridor() for all affected routes
    → Set route status=UNDER_REVIEW

PART 3 — FREIGHT ROUTES UI
  New top-level nav page: 'Freight Routes'
  ScreenGuide: explains what freight routes are and how to use Vehicle Finder

  VEHICLE FINDER PANEL (prominent, above route list):
    Styled as a search tool, not a form
    Vehicle Class: pill selector (General|B-Double|PBS-2|PBS-3|PBS-4|HML)
    Gross Mass: number input with 't' suffix, placeholder 'e.g. 63.5'
    State: dropdown
    'Find Eligible Routes' button
    Results: matching routes highlighted · non-matching greyed out with reason
      e.g. 'Restricting bridge: Murrumbidgee River — 45t limit'

  ROUTE LIST TABLE:
    Columns: Route Name | Type | State | Corridor Limit | HML | PBS Class | Status
    Row colour: green=unrestricted, amber=partial, red=closed
    Click row: expands inline accordion with bridge sequence
    'View Full Detail' → Route Detail page

  ROUTE DETAIL PAGE:
    PageHeader: route name + NHVR reference
    ScreenGuide: explains the corridor summary panel
    CORRIDOR SUMMARY (traffic-light panel):
      Gross Mass | Height | HML | PBS Class | B-Double
      Each as large traffic-light indicator (green/amber/red)
      Restricting bridge callout: '⚠ Tightest restriction: {bridge name} — {type} {value}'
      Click: scrolls to that bridge in sequence below
    BRIDGE SEQUENCE: ordered cards with restrictions highlighted
      Amber left border = has restrictions · Red border = corridor's restricting bridge
      Mobile: horizontal scrollable card strip
    'Run Assessment' button → calls assessCorridor → updates display

  On Bridge Detail: 'Freight Routes' chip showing routes this bridge belongs to

DONE CHECKLIST:
  [ ] FreightRoute + FreightRouteBridge entities
  [ ] 5 seed routes with bridge linkages
  [ ] assessCorridor action (all 7 corridor metrics + per-bridge audit)
  [ ] getRoutesByVehicleClass with ineligibility reasons
  [ ] Auto-reassessment on restriction change
  [ ] Vehicle Finder panel with animated results
  [ ] Route list with inline accordion
  [ ] Route detail with corridor traffic-light summary
  [ ] Restricting bridge highlighted in sequence
  [ ] Bridge Detail shows linked routes chip
  [ ] Unit tests: aggregation logic, null handling, MIN correctness
  [ ] Integration tests: assessCorridor, getRoutesByVehicleClass, auto-reassess
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 04 — SAP PM/EAM INTEGRATION
### Defect-to-Work-Order with Zero Re-keying
**Gap:** G-11 · **Phase:** P1 · **Est:** 8–10 hrs  
**Test:** `npm test -- --testPathPattern='sappm|workOrder' --coverage --silent`  
**Split:** 04a (mock + client + mapping constants) · 04b (FLOC sync + defect→WO flow + webhook) · 04c (defect card status chips + SAP PM tab)  
**Context risk:** SAP PM OData V2 uses d.results wrapper — different from V4. Read mock carefully before writing client.  
**Parallelise:** Mock SAP PM server + SAPPMClient skeleton + status code constants simultaneously  
**Token traps:** 2-click WO creation = confirm dialog (pre-filled, read-only) + create button ONLY. No editable fields in confirmation except 'additional notes'.  

**User story:** A maintenance inspector raises a CRITICAL concrete spalling defect on the M1 bridge deck. The foreman has SAP PM open. Currently someone copies defect details into SAP manually. The work order comes back with a different description. After this prompt: zero re-keying, automatic WO creation for CRITICAL defects, and the loop closes when the WO is technically complete.

```
## TASK: SAP PM/EAM BIDIRECTIONAL WORK ORDER INTEGRATION

PART 1 — MOCK SAP PM + CLIENT + CONSTANTS
  Create srv/integrations/sappm-mock.js at /mock-sappm:
    SAP PM OData V2 endpoints (d.results response format):
    GET  /mock-sappm/MaintenanceNotification(NotifNo='...')
    POST /mock-sappm/MaintenanceNotification
    GET  /mock-sappm/MaintenanceOrder(OrderId='...')
    POST /mock-sappm/MaintenanceOrder
    PATCH /mock-sappm/MaintenanceOrder(OrderId='...')
    GET  /mock-sappm/FunctionalLocation(FuncLocInternalId='...')
    POST /mock-sappm/FunctionalLocation
    GET  /mock-sappm/$metadata — minimal EDMX

  SAP status code → display label constants file:
    srv/integrations/sappm-constants.js:
      NOTIF_STATUS: { OSNO: 'Outstanding', NOCO: 'Completed', NORE: 'In Processing' }
      ORDER_STATUS: { CRTD:'Created', REL:'Released', TECO:'Technically Complete',
                      CLSD:'Closed', INPR:'In Progress', FINI:'Finished' }

  Create srv/integrations/sappm-client.js — SAPPMClient class:
    Reads: SAPPM_BASE_URL, SAPPM_CLIENT, SAPPM_USER, SAPPM_PASSWORD from env
    async getFunctionalLocation(floc)
    async createFunctionalLocation(payload)  // bridge → SAP FLOC: STR-{STATE}-{bridgeId}
    async createNotification(payload)        // defect → PM Notification
    async createWorkOrder(notifNo, payload)
    async getWorkOrder(orderId)
    async updateWorkOrder(orderId, payload)

  Mapping constants (defect severity → PM priority):
    CRITICAL→Priority 1 · SEVERE→Priority 2 · MODERATE→Priority 3 · MINOR→Priority 4

  Add to Bridge: sapFlocId (String 50), sapFlocSync (String 20)
  Add to BridgeDefect: sapNotifNo (String 12), sapWorkOrderId (String 12),
    sapSync (SYNCED|PENDING|FAILED), sapLastSync (DateTime)

PART 2 — FLOC SYNC + DEFECT→WO FLOW + WEBHOOK
  Custom CAP action: syncBridgeToSAPPM(bridgeId):
    If no sapFlocId: createFunctionalLocation → store sapFlocId
    If exists: update FLOC description + condition indicator
    Write history: SAP_FLOC_CREATED or SAP_FLOC_UPDATED

  After BridgeDefect CREATE (if SAP_PM_ENABLED=true):
    Auto-sync bridge FLOC if missing
    createNotification → store sapNotifNo
    If CRITICAL or SEVERE: auto-createWorkOrder → store sapWorkOrderId
    If MODERATE or MINOR: create WO only via explicit createPMWorkOrder(defectId) action
    Write history: PM_NOTIFICATION_CREATED, PM_WO_CREATED

  Custom CAP action: syncDefectFromSAPPM(defectId):
    getWorkOrder(sapWorkOrderId)
    If TECO or CLSD: set defect status=PENDING_VERIFICATION, write history SAP_WO_COMPLETED
    If WO has actual date: store as defect.actualRepairDate

  Webhook endpoint POST /api/sappm-webhook:
    Validates HMAC signature (SAP_PM_WEBHOOK_SECRET)
    Calls syncDefectFromSAPPM for matching defect

PART 3 — DEFECT CARD UI + SAP PM TAB
  Every defect card/row shows a 'Maintenance' section:
    No SAP link:   Grey chip 'No Work Order — Create WO'
    Notification:  Blue chip 'SAP Notif #{no}' + 'Create WO' button
    Work order:    Amber chip 'WO #{id} — {friendlyStatus}' + 'Sync Status' button
    WO complete:   Green chip 'Repaired {date} — Verify Closure'
    Status labels: use ORDER_STATUS map — NEVER raw SAP codes

  2-click WO creation flow (must be exactly 2 clicks):
    Step 1: Confirm dialog — pre-filled summary (read-only):
      Bridge name, defect description, severity, location, priority (auto from severity)
      Only editable field: 'Additional notes for maintenance team' (optional)
    Step 2: 'Create Work Order' button → success toast with WO number

  SAP PM Tab on Bridge Detail:
    FLOC Status: if synced: '{sapFlocId}' + green badge + sync timestamp
                 if not: amber banner 'Register in SAP' button
    Work Orders table: WO Number | Defect | Priority | Status | Assigned | Due Date
      Status badges use friendly labels from NOTIF_STATUS/ORDER_STATUS constants
      'Sync All' button: pulls latest status for all open WOs
      Empty state: 'No WOs yet. Created automatically for CRITICAL/SEVERE defects.'

DONE CHECKLIST:
  [ ] Mock SAP PM OData V2 server (8 endpoints)
  [ ] SAP status code mapping constants
  [ ] SAPPMClient with all methods
  [ ] Bridge.sapFlocId and BridgeDefect.sapNotifNo/sapWorkOrderId fields
  [ ] syncBridgeToSAPPM action
  [ ] CRITICAL/SEVERE defect → auto WO creation
  [ ] createPMWorkOrder action (MODERATE/MINOR on demand)
  [ ] syncDefectFromSAPPM action
  [ ] Webhook endpoint with HMAC validation
  [ ] Defect card status chips (4 states, friendly labels)
  [ ] 2-click WO creation dialog (exactly 2 clicks)
  [ ] SAP PM tab with FLOC status + WO table
  [ ] Unit tests: severity→priority mapping, HMAC validation, status labels
  [ ] Integration tests: CRITICAL defect→auto WO, webhook sync, FLOC creation
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 05 — OFFLINE PWA
### Field Inspector Works in Any Condition, Any Location
**Gap:** G-05 · **Phase:** P1 · **Est:** 8–10 hrs  
**Test:** `npm test -- --testPathPattern='offline|sync' --coverage --silent`  
**Split:** 05a (manifest + service worker + Workbox) · 05b (IndexedDB + offline apiFetch + syncManager) · 05c (connectivity banner + pre-flight cache + settings)  
**Context risk:** Service worker: register AFTER app shell loads. IndexedDB: start at version 1, plan schema upfront.  
**Parallelise:** PWA manifest + service worker skeleton + IndexedDB store definitions simultaneously  
**Token traps:** Conflict resolution UI is rarely triggered but must be bulletproof — test with explicit synthetic conflict  

**User story:** Jake is inspecting a box culvert 40m below the M7 motorway. Zero signal. He has 47 measurements to record. Currently everything he types is lost when he closes the app. After this prompt, Jake works offline, all measurements queue automatically, and sync when he surfaces — no phone calls, no paper forms, no re-keying.

```
## TASK: PROGRESSIVE WEB APP — OFFLINE FIELD INSPECTION MODE

PART 1 — PWA MANIFEST + SERVICE WORKER
  public/manifest.json:
    name: 'NHVR Bridge Management', short_name: 'BridgeMgmt'
    theme_color: '#0A0E1A', display: 'standalone', orientation: 'any'
    icons: SVG icon set (16, 32, 192, 512px)

  src/service-worker.js (Workbox-based):
    CacheFirst for static assets
    NetworkFirst for /BridgeService/Bridges OData
    StaleWhileRevalidate for app shell
    Background sync: queue failed mutations in 'bridge-mutations' sync queue
  Register in app entry point with install prompt 'Add to Home Screen' handler

PART 2 — INDEXEDDB + OFFLINE APIFETCH + SYNCMANAGER
  src/offline/offlineStore.js (idb library):
    Stores: bridges, restrictions, inspectionOrders, measurementDocs, defects, pendingMutations
    saveBridgesLocally(bridges) · getBridgeLocally(bridgeId)
    queueMutation(type, payload) · getPendingMutations() · clearMutation(id)

  Extend src/utils/api.js with offline detection:
    If navigator.onLine === false:
      GET requests: serve from IndexedDB cache
      POST/PATCH/DELETE: queueMutation, return synthetic 202, show 'Saved offline' toast
    On window 'online' event: call syncPendingMutations()

  src/offline/syncManager.js:
    syncPendingMutations():
      1. getPendingMutations from IndexedDB
      2. Replay each against live API in insertion order
      3. Success: clearMutation, update local store
      4. 409 Conflict: surface conflict resolution UI (do not crash)
      5. Show sync progress indicator in app header

  src/offline/conflictResolver.js:
    On 409: show modal with side-by-side comparison
      [Your offline version] vs [Current server version]
      Buttons: 'Keep mine' | 'Use server version' | 'Merge manually'
      Log choice in history via API on reconnect

PART 3 — CONNECTIVITY UI + PRE-FLIGHT CACHE + SETTINGS
  Connectivity indicator (persistent, never hidden):
    ONLINE:   invisible — no clutter when working
    OFFLINE:  amber banner '● Offline — work saving locally. N items queued.'
    SYNCING:  blue banner '↑ Syncing N items...' with progress bar
    COMPLETE: green flash '✓ All changes synced' (auto-dismiss 3s)
    ERROR:    red banner with expand showing failed items + retry button

  Pre-flight cache screen ('Prepare for Offline Work'):
    Step 1: 'Which bridge are you inspecting today?' → search/select
    Step 2: Shows what will be cached (bridge details, restrictions, inspection orders)
    'Cache Now' button → progress → 'Ready for offline use'
    Shows storage used / remaining (quota API)
    Cache auto-expires after 48 hours

  Offline inspection workflow: visually identical to online
    Only difference: subtle 'Saved locally' indicator instead of 'Saved'
    Clock icon on queued items until synced
    Photos: compressed to 800px max before IndexedDB storage

  Settings page 'Offline Data' section:
    Bridges cached: count + timestamp
    Pending mutations: count with detail list
    'Cache my bridges' button (fetches all assigned bridges)
    'Clear offline data' button (with confirmation + unsynced data warning)

  Restriction management: READ-ONLY offline (safety — no offline restriction changes)

DONE CHECKLIST:
  [ ] PWA manifest + service worker registered
  [ ] Workbox caching (CacheFirst/NetworkFirst/StaleWhileRevalidate)
  [ ] IndexedDB (idb) with 6 stores
  [ ] Offline-aware apiFetch (GET→cache, POST→queue, 202 response)
  [ ] syncManager with conflict detection
  [ ] conflictResolver UI (side-by-side, 3 options)
  [ ] Connectivity banner (all 4 states, invisible when online)
  [ ] Pre-flight cache screen with storage info
  [ ] Inspection workflow: visually identical offline
  [ ] 'Saved locally' clock icon on queued items
  [ ] Photo compression (800px max) before IndexedDB
  [ ] Settings 'Offline Data' section with storage management
  [ ] Unit tests: queueMutation, syncManager, conflict detection
  [ ] Integration tests: offline GET, POST queue, sync replay
  [ ] All tests pass, npm test 100%
```

---

## PROMPT 06 — ESRI GIS INTEGRATION
### Spatial Intelligence, Not Just a Pin Map
**Gap:** G-03 · **Phase:** P1 · **Est:** 8–10 hrs  
**Test:** `npm test -- --testPathPattern='gis|spatial' --coverage --silent`  
**Split:** 06a (GISClient + mock + endpoints + BridgeSpatialView) · 06b (MapView: layers + markers + clustering) · 06c (overlays: corridors + zones) · 06d (controls: bbox + radius + export)  
**Context risk:** Map component is ~200 lines — split into MapView (base) + MapOverlays + MapControls  
**Parallelise:** GISClient + mock GIS server + BridgeSpatialView CDS entity  
**Token traps:** Clustering: test with exactly 200 AND 201 markers (boundary bugs) · HANA vs SQLite: check cds.env.requires.db.kind  

**User story:** A Network Manager in TfNSW Strategic Assets needs to answer in 30 seconds: 'Show me all POOR condition bridges on the Pacific Highway corridor that have an active restriction and are within 2km of a flood zone.' This is a map question, not a filter question. After this prompt, the answer is spatial.

```
## TASK: ESRI ARCGIS + SAP MAP FULL SPATIAL INTEGRATION

PART 1 — GISCLIENT + MOCK + SPATIAL ENDPOINTS + SPATIALVIEW
  Install: @esri/arcgis-rest-request leaflet leaflet-esri

  Create srv/integrations/gis-client.js — GISClient class:
    Reads: ESRI_PORTAL_URL, ESRI_API_KEY from env
    async queryBridgesInBbox(xmin, ymin, xmax, ymax)
    async queryBridgesNearPoint(lat, lng, radiusKm)
    async getFreightCorridors(state)
    async getRiskZones(riskType)
    async publishBridgeFeature(bridge)
    async updateBridgeFeature(bridgeId, updates)

  Create srv/integrations/gis-mock.js at /mock-gis:
    Returns realistic GeoJSON FeatureCollections for all queries
    Uses existing db/bridges_geojson.json as source

  Add spatial query OData functions to BridgeService:
    GET /BridgeService/bridgesInBbox(xmin,ymin,xmax,ymax)
    GET /BridgeService/bridgesNearPoint(lat,lng,radiusKm)
    GET /BridgeService/freightCorridors(state)
    GET /BridgeService/riskZones(riskType)

  CDS: BridgeSpatialView — read-only projection for map layer:
    bridgeId, name, postingStatus, condition, latitude, longitude only
    No heavy fields — optimised for map queries

  HANA Cloud production: ST_Within + ST_Distance queries via cds.run(SELECT...)
  SQLite fallback: Haversine formula in JavaScript (check cds.env.requires.db.kind)

PART 2 — MAPVIEW: BASE LAYERS + MARKERS + CLUSTERING
  src/components/map/BridgeMapView.jsx (or .js):
    Full-bleed layout — map fills the screen, floating panels overlay it
    Mobile: map + bottom sheet for filters/results
    Desktop: map + collapsible left panel + right results panel

  Base layers (toggleable):
    OpenStreetMap (default) · Esri World Imagery · Esri World Transportation

  Bridge markers — semantic, information-dense:
    Circle with colour (condition band):
      8-10: green · 5-7: amber · 3-4: orange · 1-2: red
    Border (posting status):
      UNRESTRICTED: no border · RESTRICTED: thick red · CLOSED: black
    Size (traffic volume): 3 sizes — major/arterial/local
  Clustering at zoom < 10: cluster bubble with worst-condition colour + count
  Bridge popup: name + condition badge + postingStatus + active restriction badges
    'Open Detail' button + mobile: slides up from bottom as sheet

PART 3 — MAP OVERLAYS: FREIGHT CORRIDORS + RISK ZONES
  Freight corridor polyline layer (toggleable):
    Polylines from /freightCorridors, coloured by routeType
    Click: shows route name, PBS class, corridor limits

  Risk zone polygon layer (toggleable):
    Polygons from /riskZones, coloured by risk type (flood/scour/seismic)
    Opacity slider per layer
    Click: shows risk zone name, type, last assessment date

  Layer control panel (top-right floating):
    Base maps toggle · Bridge layer options · Freight corridors · Risk zones
    Each layer: toggle + opacity slider + info tooltip

PART 4 — MAP CONTROLS: SEARCH + BBOX + RADIUS + EXPORT
  Bbox drawing tool: user draws rectangle → filters bridge list
    Shows count: 'N bridges in selected area' + Clear button

  Radius search: click point on map → circle + radius slider (1–100km)
    Shows count: 'N bridges within Xkm' sorted by distance

  Route corridor selector: select a FreightRoute → highlights all its bridges
    Zooms + pans to fit · Shows corridor restriction summary in panel

  Results list (right panel, synced with map filters):
    Sort by: distance | condition | name | last inspection
    Each row: name + condition badge + status + restriction count
    Click: flies to bridge + opens popup
    Export: 'Export visible as CSV' + 'Export as GeoJSON'

  After BridgeRestriction CREATE/UPDATE (if GIS_SYNC_ENABLED=true):
    Call gisClient.updateBridgeFeature(bridgeId, {postingStatus, condition})
    Store gisSync status on Bridge

DONE CHECKLIST:
  [ ] GISClient with all spatial methods
  [ ] Mock GIS server at /mock-gis
  [ ] 4 spatial OData functions exposed
  [ ] BridgeSpatialView CDS projection
  [ ] HANA ST_Within / SQLite Haversine branching
  [ ] Full-bleed map layout with floating panels
  [ ] Semantic bridge markers (colour + border + size)
  [ ] Smart clustering with worst-condition colouring
  [ ] Bridge popup with bottom sheet on mobile
  [ ] Freight corridor polyline layer
  [ ] Risk zone polygon layer with opacity slider
  [ ] Layer control panel (base maps + 3 data layers)
  [ ] Bbox drawing + radius search + route selector tools
  [ ] Results list synced with map filters
  [ ] GeoJSON + CSV export
  [ ] Esri feature service sync on restriction change
  [ ] Unit tests: bbox query, proximity filter, cluster threshold
  [ ] Integration tests: spatial endpoints, GIS sync on restriction update
  [ ] All tests pass, npm test 100%
```

---

## PROMPTS 07–14 — CONCISE SPECIFICATIONS
### Phases 2 and 3 · Full UX-first delivery

---

## PROMPT 07 — SCOUR RISK
**Gap:** G-06 · **Est:** 4–5 hrs · **Test:** `scour`  
**Split:** 07a (entity + BIMM matrix + service + seed) · 07b (Scour Assessment tab UI)  
**Key rule:** Risk matrix = constant JS object (4×4 lookup), NOT nested if/else. Write all 16 test cases.  
**User story:** Flood season. State Engineer must rapidly assess 200 bridges. Risk rating instantly visible, evidence one click away, recommended action clear enough for a non-engineer.  

```
TASK: SCOUR RISK MULTI-PARAMETER MODEL — AustRoads BIMM §7

SCHEMA: entity BridgeScourAssessment : managed {
  key assessmentId · bridge · assessmentDate · assessedBy · assessmentFirm
  waterwayType: (RIVER|CREEK|TIDAL|INTERMITTENT|DRY)
  waterwayCategoryAR: String(10) · catchmentAreaKm2 · meanAnnualFloodM3s · designFloodAEP
  localScourType: (CLEAR_WATER|LIVE_BED|NONE)
  generalScourType: (CONTRACTION|DEGRADATION|NONE)
  lateralMigration: Boolean
  localScourDepthM · generalScourDepthM · totalScourDepthM (sum of local+general)
  pierFoundationType: (PILED|SPREAD|CAISSON|UNKNOWN)
  pierFoundationDepthM · foundationExposureM
  safetyMarginM = pierFoundationDepthM - totalScourDepthM (auto-computed)
  rockArmouring · concreteLining · grouting: Boolean
  protectionCondition: (GOOD|FAIR|POOR|ABSENT)
  consequenceRating · likelihoodRating: (LOW|MEDIUM|HIGH|EXTREME)
  overallRiskRating: (LOW|MEDIUM|HIGH|EXTREME) (computed from BIMM Table 7.4 matrix)
  immediateAction: Boolean
  recommendedAction: LargeString
  nextAssessmentDate: Date · lastSurveyDate · surveyMethod · surveyRef · notes
}
Keep scourRisk enum on Bridge as denorm (auto-updated from latest assessment)

SERVICE:
  computeScourRiskRating(likelihood, consequence): implement full BIMM Table 7.4 4×4 matrix
  If safetyMarginM < 0.5m: immediateAction=true regardless of matrix
  If EXTREME: immediateAction=true
  After save: update Bridge.scourRisk denorm
  Write history: SCOUR_ASSESSMENT_RECORDED
  Update getBridgeComplianceReport: add scour checks (EXTREME=CRITICAL, overdue, missing)

SEED: Realistic data for all 13 bridges — mix of risk levels, some overdue

UI: 'Scour Assessment' tab on Bridge Detail
  RISK INDICATOR on Bridge header: ⚠EXTREME(red pulsing) | !HIGH(orange) | ~MEDIUM(amber) | ✓LOW(green) | ?UNKNOWN(grey)
  Tooltip: 'Total scour depth: 1.8m, Safety margin: 0.3m'
  RISK SUMMARY PANEL: 4×4 risk matrix with current position highlighted
  Safety Margin Gauge: green>2m / amber 0.5-2m / red<0.5m
  If immediateAction: red alert banner + 'Raise Urgent Inspection Order' button
  5-SECTION GUIDED FORM: A=Waterway B=Scour C=Foundation D=Protection E=Risk Rating
  Live safety margin computation (debounce 200ms) in form
  Live risk rating preview from matrix inputs
  AustRoads BIMM Table 7.4 citation on form

DONE: entity+matrix+service+seed | risk badge+gauge | 5-section form | live preview | compliance report | all tests
```

---

## PROMPT 08 — GAZETTE VALIDATION
**Gap:** G-08 · **Est:** 3–4 hrs · **Test:** `gazette`  
**Split:** 08a (entity + seed + validator + hook + daily job) · 08b (inline validation UI + admin page)  
**Key rule:** Exactly 400ms debounce. Activate only after ≥8 characters typed. Empty field = no indicator (not an error).  
**User story:** A compliance officer types 'NTG-2024-0147' but the real notice is 'NTG-2024-0174'. A transposition error creates an undetectable compliance failure. After this prompt: impossible.  

```
TASK: NHVR GAZETTE REFERENCE VALIDATION ENGINE

SCHEMA: entity GazetteNotice {
  key noticeRef · gazetteType · publishDate · effectiveDate · expiryDate
  title · description · applicableStates · vehicleClasses · restrictionTypes
  nhvrSourceUrl · isActive · lastVerifiedDate
}
Add to BridgeRestriction: gazetteValidationStatus (VALID|INVALID|UNVERIFIED) · gazetteValidationDate
Seed: 30 realistic NHVR notices covering all restriction types, states, some expired

SERVICE:
  gazetteValidator.js validateGazetteRef(ref, restrictionType, state):
    1. Format check: /^NTG-\d{4}-\d{4}$/ or state-specific patterns
    2. Register lookup by noticeRef
    3. Not found → WARNING 'Not in NHVR register'
    4. Found + expired → WARNING 'Expired on {date}'
    5. Type mismatch → WARNING 'Covers {types}, not {this type}'
    6. Valid → { valid:true, notice:{...} }
    Always WARNING (never ERROR) — never block save
  In BridgeRestriction before() hook: call validator, set gazetteValidationStatus
  Daily scheduled job: re-validate all ACTIVE restrictions, flag newly invalid

UI INLINE VALIDATION (400ms debounce, activates at >=8 chars):
  Checking: spinner in input right side
  Not found: amber underline + tooltip 'Not in register — save still allowed'
  Found+expired: amber + chip '⚠ Expired on {date}'
  Type mismatch: amber + chip '⚠ Covers {other types}'
  Valid: green underline + chip '✓ {Notice Title} — effective {date}' (clickable → popover)
  Notice detail popover: all fields + 'View on NHVR website →' link

RESTRICTION LIST: Gazette Status column (✓VALID / ⚠WARNING / ?UNVERIFIED)
  Filter: 'Show restrictions needing gazette review'

GAZETTE REGISTER ADMIN PAGE (Admin only):
  ScreenGuide: explains purpose and how to keep current
  Table: reference | title | type | effective | expiry | status | last verified
  Quick-add form in slide-over panel (low friction)
  'Validate all restrictions' batch action with progress indicator

DONE: 30 seed notices | validator (format+register+expiry+type) | restriction hook | daily job | inline validation | notice popover | admin page | all tests
```

---

## PROMPT 09 — DETERIORATION MODEL
**Gap:** G-07 · **Est:** 6–8 hrs · **Test:** `deteriorat|priority`  
**Split:** 09a (TPM matrices + deteriorationModel.js + entity) · 09b (action + auto-trigger + priority list) · 09c (forecast tab chart + priority list page)  
**Key rule:** TPM matrices = typed constants (TypeScript arrays), not computed. Test: assert expected transitions for known material/age combos.  
**User story:** An asset manager presents to Treasury: 'We need $240M for bridge renewals over the next decade.' Treasury: 'Which bridges, when, and why?' After this prompt: one click, with chart, confidence bands, and exportable capital programme.  

```
TASK: BRIDGE CONDITION DETERIORATION MODELLING ENGINE

SCHEMA: entity BridgeDeteriorationProfile : managed {
  key profileId · bridge · computedDate · material · ageYears
  projectedRating5yr/10yr/15yr/20yr: Decimal(4,2)
  estimatedServiceLifeYrs · estimatedEndOfLifeYear · interventionThreshold default 5
  maintenancePriorityScore (0-100) · priorityBand (CRITICAL|HIGH|MEDIUM|LOW)
  projectionData: LargeString (JSON array of year projections)
  calibratedFromHistory: Boolean · tpmVersion: String(20)
}
Extend Bridge: priorityScore (Integer) · priorityBand (String) [denorm]

SERVICE — deteriorationModel.js:
  TPM matrices: typed constants per material (CONCRETE|STEEL|TIMBER|MASONRY|COMPOSITE)
    and age band (0-20yr|21-40yr|41-60yr|60+yr)
    Calibrated to AustRoads AP-R617-20 Table 5.2 approximate values
  buildTPM(material, ageYears) → select matrix
  projectCondition(currentRating, ageYears, yearsAhead, material) → [{year,expectedRating,probabilityDistribution}]
  estimateServiceLife(currentRating, ageYears, material, interventionThreshold) → years
  computeMaintenancePriorityScore(bridge, history):
    condition(40%) + deteriorationRate(30%) + trafficVolume(20%) + strategicImportance(10%)
  calibrateFromHistory(bridgeId, history): if >=3 certified inspections → fit actual rates

CAP action: computeDeteriorationProfile(bridgeId):
  Fetch bridge + all certified inspections
  calibrateFromHistory if enough data
  Project 5/10/15/20 years
  Compute priority score + band
  Save BridgeDeteriorationProfile, update Bridge denorm
  Write history: DETERIORATION_PROFILE_COMPUTED
  Auto-trigger after completeInspection action

CAP function: getMaintenancePriorityList(state, priorityBand) → bridges sorted by score desc

UI: 'Condition Forecast' tab on Bridge Detail
  PRIORITY INDICATOR: score gauge (0-100) + band badge + end-of-life year + confidence note
  PROJECTION CHART (the centrepiece):
    X: years · Y: condition 1-10 with band labels (Excellent/Good/Fair/Poor/Failed)
    Solid line: expected trajectory
    Shaded band: P25-P75 confidence
    Dashed horizontal: intervention threshold
    Vertical: today's date
    Highlighted dot + label: 'Intervention needed: {year}'
    Tooltip: '{year}: Expected {X}, range {Y}-{Z}'
    Chart controls: confidence band toggle | 10yr/20yr/25yr selector
  PROJECTION TABLE (collapsible): year | expected | band | probability | action
  'Recompute' button with last-computed timestamp

MAINTENANCE PRIORITY LIST PAGE:
  Summary strip: CRITICAL:N | HIGH:N | MEDIUM:N | LOW:N | 'Estimated cost: $XXM'
  Table sorted by priority score desc, filter by state/band/material
  Row click: expands inline mini forecast chart
  Export CSV + 'Export Capital Programme' (grouped by intervention year)

DONE: TPM matrices | deteriorationModel.js | entity | action | auto-trigger | chart | priority list | exports | all tests
```

---

## PROMPT 10 — EXECUTIVE DASHBOARD
**Gap:** Phase 2 · **Est:** 5–6 hrs · **Test:** `dashboard`  
**Split:** 10a (DashboardService functions + cache) · 10b (6 StatCards + 4 trend charts) · 10c (action queues + filters + PDF export)  
**Key rule:** Build cache layer FIRST. Background refresh: pause when tab hidden (Page Visibility API).  
**User story:** CEO opens Monday briefing on iPad, 45 seconds before the meeting. Three questions: is the network getting better or worse? Where are the highest risks? What needs my decision? All answered before they reach for coffee.  

```
TASK: EXECUTIVE DASHBOARD — THREE-TIER INFORMATION DENSITY

SERVICE: DashboardService in srv/dashboard-service.cds at /DashboardService
  5-minute in-memory cache (Map + TTL). configurable via DASHBOARD_CACHE_TTL_S.
  OData functions (all parallel — no dependencies between them):
    getNetworkKPIs(): totalBridges, byState, byConditionBand, byPostingStatus,
      nhvrAssessedPct, hmlApprovedPct, activeRestrictions, expiringSoon7d/30d,
      overdueInspections, openDefects by severity, avgConditionRating + trend
    getInspectionComplianceKPIs(): due/completed/overdue/rate/byType/byState
    getDefectKPIs(): openByPriority, avgDaysOpen, P1ResolutionDays, closedTrend 12m
    getRestrictionKPIs(): activeByType, temporary, expiringThisWeek, missingGazette
    getTrendData(metric, period): monthly time series 6M/12M/24M
  PowerBI: CORS headers allowing *.powerbi.com on DashboardService
  All functions filtered by user jurisdiction automatically

UI: Dashboard page (default landing for Reader role)
  TIER 1: 6 StatCards (30-second CEO scan):
    Network Condition avg | Active Restrictions (N expiring this week) |
    Inspection Compliance % | Critical Defects Open | Overdue Inspections | Bridges at Risk
    Each: large number + trend arrow vs last month + 7-day sparkline

  TIER 2: 4 trend chart sections (collapsible, 2-min manager review):
    A: Network Condition — stacked area by condition band, 24 months
    B: Inspection Compliance — dual line (due vs completed) + compliance rate, 12m
    C: Restriction Activity — bar (new vs expired) + active count line
    D: Defect Resolution — stacked bar by severity + P1 resolution time line

  TIER 3: Action Queues (tabbed, 10-min compliance officer work):
    Tab 1: Restrictions expiring 7 days — 'Renew/Close' quick action per row
    Tab 2: Overdue inspections — 'Create Order' quick action
    Tab 3: Gazette validation failures — 'Review' quick action
    Tab 4: Critical defects >48hrs — 'View Defect' quick action
    Export action list as CSV

  FILTERS: State multi-select chips | Date range presets | 'Save my defaults' → localStorage
  Role-based default: Inspector=their bridges · Manager=their state · National=all
  Auto-refresh every 30s (Page Visibility API: pause when tab hidden)
  'Export PDF Report' → professional A4 landscape PDF
  'Open in PowerBI' → connection string modal
  Skeleton loading for all cards and charts

DONE: DashboardService + 5 functions + cache | PowerBI CORS | 6 StatCards + sparklines | 4 trend charts | action queues | state filter + persistence | PDF export | background refresh + tab visibility | all tests
```

---

## PROMPT 11 — MULTI-JURISDICTION RBAC
**Gap:** G-12 · **Est:** 5–6 hrs · **Test:** `jurisdict|rbac`  
**Split:** 11a (jurisdictionGuard + service hooks + tests) · 11b (graceful 403 + header chip + first-login modal + admin page)  
**Key rule:** Write tests with 3 simulated users FIRST (national, NSW-only, multi-state) before any UI. Guard logic is security-critical.  
**User story:** A VicRoads bridge inspector sees data for all 8 states. An NHVR compliance officer needs to see everything. A NSW contractor sees only NSW. The UX makes jurisdiction clear without being a security lecture.  

```
TASK: MULTI-JURISDICTION ACCESS CONTROL & DATA TENANCY

XSUAA roles: bridge.national + bridge.{nsw|vic|qld|wa|sa|tas|act|nt} scopes
  Role templates: Bridge.National.Admin|Reader · Bridge.{STATE}.Admin|Inspector|Reader · Bridge.NHVR.Compliance

SERVICE — jurisdictionGuard.js:
  getJurisdictionScopes(req) → ['ALL'] or ['NSW','QLD'] from JWT scopes
  assertJurisdiction(req, bridgeState) → throws 403 with { jurisdiction, requiredScope, message }
  filterByJurisdiction(req, query) → adds .where({state:{in:allowedStates}})
  Dev/test: SIMULATED_JURISDICTION env var (e.g. 'NSW,QLD') bypasses XSUAA

CAP service hooks — jurisdiction checks on:
  Bridge: READ(filter) · CREATE(assert) · UPDATE/DELETE(assert)
  BridgeRestriction: assert via parent bridge
  InspectionOrder: assert via parent bridge
  BridgeDefect: assert via parent bridge
  All custom actions: assert on bridgeId
  Always visible regardless of jurisdiction: FreightRoute · GazetteNotice
  Dashboard + compliance report: filter KPIs by jurisdiction automatically

UI:
  App header jurisdiction chip: '📍 NSW' for single-state · '📍 NSW, QLD' for multi · nothing for national
  Hover: 'You have access to NSW bridge data. Contact admin to update.'
  First login welcome modal (not a warning):
    'Welcome, {name} — you have access to NSW bridge data.'
    'Got it' button. Stores dismissed in localStorage.
  Graceful out-of-jurisdiction page (NOT generic 403):
    'This bridge is in Victoria'
    'You currently have access to NSW only. Contact your administrator.'
    CTA: 'Back to my bridges'
  User Access admin page (Bridge.National.Admin only):
    Table: name | email | role | jurisdiction | last login
    'Assign Role' slide-over: user → role (with descriptions) → jurisdiction → review
    (Shows BTP cockpit instructions — actual assignment in BTP)

DONE: xs-security.json roles | jurisdictionGuard (3 functions) | all CRUD/action hooks | dev bypass | graceful 403 page | header chip | first-login modal | admin page | all rejection tests pass
```

---

## PROMPT 12 — INTERNATIONAL STANDARDS
**Gap:** G-10 · **Est:** 5–6 hrs · **Test:** `standards|adapter|converter`  
**Split:** 12a (entity + 4 seed profiles + StandardsAdapter + UnitConverter + service) · 12b (standards-aware form controls + condition display + admin config page)  
**Key rule:** Write TypeScript interface contract first, then implement for each standard.  
**User story:** NZ Transport Agency wants to pilot the platform for 50 bridges on SH1. Their engineers use NZ Bridge Manual 3rd Edition — condition scale 1-5, different element names. The platform adapts to them. They don't adapt to the platform.  

```
TASK: CONFIGURABLE INSPECTION STANDARDS PROFILES

SCHEMA: entity InspectionStandardProfile {
  key profileId: (AUSTROADS_BIMM|EUROCODE|NZ_BRIDGE_MANUAL|AASHTO_LRFR)
  profileName · countryCode
  conditionScaleMin/Max: Integer
  conditionLabels: LargeString (JSON: {1:'Failed',...})
  inspectionTypes: LargeString (JSON: [{code,name,description}])
  elementHierarchy: LargeString (JSON: element groups and types)
  loadCodes: LargeString (JSON: {t44:'SM1600', hlp:'LM3',...})
  massMeasurement: (TONNES|KN|KIPS) · lengthMeasurement: (METRES|FEET)
  isDefault: Boolean · isActive: Boolean
}
Seed: 4 profiles (AU/EU/NZ/US) · Add to Bridge: inspectionStandard default 'AUSTROADS_BIMM'

SERVICE:
  StandardsAdapter (TypeScript interface first, then 4 implementations):
    interface: getConditionLabel(rating) · normaliseConditionRating(r, from, to)
              getInspectionTypes() · getElementHierarchy() · getLoadCodeLabel(code)
  UnitConverter:
    toMetric(value, unit) · fromMetric(value, unit) · displayValue(value, profile)
    All stored values: always metric. Display conversion only in UI.
  Dashboard normalisation: convert to 0-10 scale for cross-standard comparison
    Visual note on chart: 'Ratings normalised to 10-point scale'
  APP_DEFAULT_STANDARD env var

UI:
  Standards Configuration admin page:
    4 visual cards (not dropdown): country flag + standard name + condition scale + 'Active' badge
    Click card: shows what will change (labels, inspection types, element hierarchy)
    'Activate Standard' → confirmation explaining stored data unchanged
  Condition display throughout app: '{rating}/{scale} ({label})'
    AU: '7/10 (Good)' · NZ: '3/5 (Satisfactory)' · EU: '2/5 (Moderate)'
  Inspection form: condition slider adapts to active standard (scale + labels + colour zones)
  Element dropdowns: populated from active standard elementHierarchy
    Each option: code + name + standard reference (e.g. 'BIMM §4.3')
  Load codes: standard-appropriate label + hover tooltip showing AU equivalent

DONE: 4 seed profiles | StandardsAdapter + 4 implementations | UnitConverter | dashboard normalisation | 4-card admin UI | condition display everywhere | profile-aware form controls | all tests
```

---

## PROMPT 13 — IoT SENSORS
**Gap:** G-09 · **Est:** 6–8 hrs · **Test:** `sensor|iot|alert`  
**Split:** 13a (entities + ingest endpoint + batch + simulator) · 13b (threshold engine + 4 automated response handlers) · 13c (sensor health grid + detail chart + Alerts page + dashboard tab)  
**Key rule:** Sensor ingest = standalone Express route (not CAP action) for performance. Stateless, idempotent, fast.  
**User story:** A strain gauge on the M7 approach span detects unusual deflection at 2:17am. An automated inspection order is raised before any human is awake. The morning inspector opens 'My Inspections Today' and sees a new urgent order with context, location, sensor data, and a pre-filled form. One sensor. Zero phone calls.  

```
TASK: IoT SENSOR & WEIGH-IN-MOTION INTEGRATION

SCHEMA:
  entity BridgeSensor { key sensorId · bridge · sensorType(STRAIN_GAUGE|ACCELEROMETER|
    DISPLACEMENT|TILT|CRACK_GAUGE|WIM|FLOOD_GAUGE|TEMPERATURE) · manufacturer · model
    installDate · location · coordinates · alertThresholds(JSON:{warning:{},critical:{}})
    status(ACTIVE|FAULT|OFFLINE) · lastReadingAt · lastReadingValue · lastReadingUnit }
  entity SensorReading { key readingId · sensor · bridge · timestamp · value · unit
    quality(GOOD|SUSPECT|FAULT) · alertLevel(NONE|WARNING|CRITICAL) }
  entity SensorAlert { key alertId · sensor · bridge
    alertType(THRESHOLD_EXCEEDED|SENSOR_FAULT|WIM_OVERLOAD|FLOOD_LEVEL|UNUSUAL_VIBRATION)
    severity(WARNING|CRITICAL) · timestamp · value · threshold · description
    status(OPEN|ACKNOWLEDGED|RESOLVED) · acknowledgedBy · acknowledgedAt
    triggeredInspection · triggeredDefect }

INGEST: POST /api/sensor-data (API key auth from SENSOR_INGEST_API_KEY env)
  POST /api/sensor-data/batch (array, max 100 readings)
  Standalone Express route (not CAP) · Stateless · Idempotent · <100ms response
  Handler: validate sensor exists+ACTIVE → store reading → check thresholds → alert if exceeded
  If CRITICAL threshold: call handleCriticalAlert() → automated response

AUTOMATED RESPONSE ENGINE (4 handlers):
  WIM_OVERLOAD (vehicle exceeded gross mass):
    Write BridgeHistory: WIM_OVERLOAD_DETECTED
    If active GROSS_MASS restriction exists: escalate alert
    If no restriction: flag bridge for restriction review
  UNUSUAL_VIBRATION (strain/accelerometer):
    Create InspectionOrder type=SPECIAL, urgency=URGENT
    Write history: SENSOR_TRIGGERED_INSPECTION
    Link alert.triggeredInspection
  FLOOD_LEVEL (flood gauge above threshold):
    Create temporary FLOOD_CLOSURE restriction (30-day default)
    Write history: SENSOR_TRIGGERED_RESTRICTION
    Trigger BAMS push if enabled
  STRUCTURAL_DISPLACEMENT (excessive deflection):
    Create BridgeDefect severity=CRITICAL
    Link alert.triggeredDefect
    If SAP_PM_ENABLED: auto-create PM notification

SENSOR SIMULATOR (dev/test):
  If SENSOR_SIMULATION_ENABLED=true: emit realistic data every 30s for all seed sensors
  Configurable random alert injection for testing automated responses

UI: 'Sensors & IoT' tab on Bridge Detail
  SENSOR HEALTH GRID: N×cards, adaptive columns (2/4/6 cols at xs/md/xl)
    Per card: sensor type icon + status dot (green=active/amber=fault/grey=offline)
             + last reading value+unit + time ago + open alert count badge
  SENSOR DETAIL (click card → expand):
    Live chart: last 24h readings, auto-refresh every 30s (React Query refetchInterval)
    Warning threshold line (amber dashed) + critical threshold line (red dashed)
    Range selector: 1hr | 6hr | 24hr | 7days
    Alert history: severity | value | threshold | status | Acknowledge button
    Link to triggered inspection/defect if automated action was taken

ACTIVE ALERTS PAGE (top-level nav):
  ScreenGuide: explains sensor monitoring and automated actions
  Alert feed (real-time, most recent first):
    CRITICAL: red left border + pulsing badge
    Automated action shown: 'Inspection INS-NSW-2025-0089 created automatically'
    Per alert: Acknowledge | View Bridge | View Triggered Action
  Filters: severity | bridge | sensor type | status
  Bulk: 'Acknowledge all low-severity' button
  Dashboard Tier 3: 'Active Sensor Alerts' tab + count badge in nav for unacknowledged CRITICAL

DONE: 3 entities | ingest endpoint + batch | threshold engine | 4 automated response handlers | simulator | sensor health grid | live chart (refetchInterval) | threshold lines | alert history | Active Alerts page | nav badge | dashboard tab | all tests
```

---

## PROMPT 14 — AI DEFECT CLASSIFICATION
**Gap:** R-14 · **Est:** 6–8 hrs · **Test:** `defectClass|photo|ai`  
**Split:** 14a (entities + fileStorage + upload endpoint + validation) · 14b (defectClassifier + Claude Vision + queue + rate limiting) · 14c (photo grid UI + review modal + bulk accept + governance admin)  
**Key rule:** Classification prompt returns ONLY JSON. max_tokens: 300. Test against 5 real photos before writing the pipeline.  
**User story:** Sarah photographs 60 elements on a principal inspection. Back at the desk: 3 hours of manual defect classification. After this prompt: the AI classifies while she's still on site. She reviews 60 suggestions in 20 minutes, overrides 8, accepts 52. AI augments — never replaces. Inspector is always in control.  

```
TASK: AI-ASSISTED DEFECT CLASSIFICATION — Claude Vision Integration

SCHEMA:
  Add to MeasurementDocument: photos : Composition of many MeasurementPhoto on photos.measurementDoc = $self
  entity MeasurementPhoto {
    key photoId · measurementDoc · bridge · filename · mimeType · fileSizeBytes
    storagePath · uploadedBy · uploadedAt
    aiClassified: Boolean default false
    aiDefectType · aiDefectSeverity(MINOR|MODERATE|SEVERE|CRITICAL)
    aiConfidence: Decimal(4,3) · aiDescription: String(500) · aiClassifiedAt · aiModelVersion
    humanVerified: Boolean default false · humanOverride: String(100)
  }
  entity AIClassificationLog {
    key logId · photo · aiDefectType · aiSeverity · aiConfidence
    humanDecision(ACCEPTED|OVERRIDDEN|REJECTED) · humanDefectType · humanSeverity
    classifiedAt · modelVersion
  }

FILE STORAGE: src/utils/fileStorage.ts
  Interface: store(file) → path | retrieve(path) → buffer | delete(path)
  Dev/test: local /uploads/ folder
  Production: SAP BTP Object Store Service (or S3-compatible)

UPLOAD ENDPOINT: POST /api/measurement-photos/upload
  multipart/form-data: measurementDocId, bridgeId, files[]
  Validate: mimeType in [image/jpeg, image/png, image/heic] · maxSize 20MB
  Compress to 800px max before storage (canvas-based)
  If AI_CLASSIFICATION_ENABLED=true: queue for async classification
  Return: { photoId, filename, aiQueued: true/false }

AI CLASSIFICATION ENGINE: srv/ai/defectClassifier.js
  CLASSIFICATION_PROMPT (JSON-only, max_tokens:300):
    'You are a senior bridge inspector with 20+ years experience.
     Analyse this bridge inspection photo and return ONLY valid JSON:
     {defectType, severity, confidence, description, recommendedAction}
     defectType: CRACKING|SPALLING|CORROSION|DELAMINATION|SETTLEMENT|SCOUR|
       JOINT_FAILURE|BEARING_FAILURE|DRAINAGE_BLOCKAGE|IMPACT_DAMAGE|FATIGUE|NONE_OBSERVED
     severity: MINOR|MODERATE|SEVERE|CRITICAL
     confidence: 0.0-1.0
     No preamble. No explanation. JSON only.'
  
  async classifyDefectPhoto(photoId):
    Load image → base64 → call claude-opus-4-5 with prompt + image
    Parse JSON response
    If confidence < 0.75: flag for human review, set aiDefectSeverity=null
    Update MeasurementPhoto with AI results
    If defectType != NONE_OBSERVED and severity in [SEVERE, CRITICAL]:
      Auto-create BridgeDefect draft with aiAssisted=true, status=OPEN (pending confirm)
    Log to AIClassificationLog

  CLASSIFICATION QUEUE: srv/jobs/ai-classification-queue.js
    setInterval on cds.on('served'), interval 10s
    Max 3 concurrent AI calls (semaphore)
    1s delay between calls (rate limiting)
    Retry failed up to 3× with backoff
    Mark failed photos as needing manual classification

UI: Photo upload in MeasurementDocument form
  Drop zone: 'Drop photos here or tap to select' · HEIC support
  Per-photo card classification states:
    ANALYSING: shimmer animation + '🔍 Analysing...'
    CLASSIFIED (>=0.75): overlay badge (defect type + severity colour) + green border + '🤖 AI suggestion — tap to review'
    UNCERTAIN (<0.75): amber border + 'POSSIBLE CRACKING? — tap to review' + '🤖 Low confidence — your expertise needed'
    NO DEFECT: grey border + 'No defect observed' + '🤖 AI found none — confirm or add one'

  PHOTO REVIEW MODAL (tap any card):
    Full-screen on mobile, large modal on desktop
    Left 60%: photo with pinch-to-zoom
    Right 40%: AI Analysis panel:
      'AI Second Opinion' heading (not 'AI Result' — frames as assistance)
      Defect type: chip selector (AI selection pre-highlighted, inspector can change)
      Severity: visual scale 1-4 dots, colour coded, AI suggestion highlighted
      Confidence bar: '87% confident — High confidence result'
      AI description + recommended action
    Inspector actions:
      ✓ 'Accept This Suggestion' (green, primary)
      ✎ 'Modify Suggestion' (editable mode)
      ✗ 'No Defect Here'
      '+ Raise Defect from This Photo' (if SEVERE/CRITICAL)
    Navigation: ← → keyboard + buttons · Progress: 'Reviewing 12 of 23 (8 accepted, 3 modified)'

  BULK REVIEW:
    'AI has classified 21 of 23 photos' above grid
    'Quick Review' mode: sequential modal flow
    'Accept All High-Confidence' button: accepts all >=0.75 in one click
    'Please review N uncertain photos' highlights remaining

  DEFECT FROM AI:
    Pre-filled form with AI values
    'AI-Assisted' badge on defect card (transparent about AI origin)
    Mandatory confirm step: 'Confirm and raise defect' — AI never raises autonomously

  AI MODEL GOVERNANCE admin page (National.Admin only):
    'Last 30 days: N photos analysed, N% accepted by inspectors'
    'Most overridden: {defect type} → {correction}' (N cases)
    Acceptance rate by defect type (bar chart)
    Alert if acceptance rate < 70%: 'Consider retraining or reviewing prompt'

DONE: MeasurementPhoto + AIClassificationLog entities | fileStorage.ts | upload endpoint | Claude Vision classifier | classification queue + rate limiting | 4 photo card states | review modal with zoom + keyboard nav | bulk accept | mandatory confirm step | AI governance admin page | all tests
```

---

## ENVIRONMENT VARIABLES — MASTER REFERENCE
### Populate .env.example in Prompt 00

| Variable | Example | Required |
|----------|---------|----------|
| `NODE_ENV` | `development` | REQUIRED |
| `PORT` | `4004` | OPTIONAL |
| `LIGHTHOUSE_PERF_THRESHOLD` | `85` | OPTIONAL |
| `BAMS_API_URL` | `https://api.nhvr.gov.au/bams/v1` | PROD |
| `BAMS_API_KEY` | `<nhvr-issued-api-key>` | PROD |
| `BAMS_PUSH_ENABLED` | `true` | OPTIONAL |
| `BAMS_RETRY_INTERVAL_MS` | `300000` | OPTIONAL |
| `BAMS_TIMEOUT_MS` | `10000` | OPTIONAL |
| `SAPPM_BASE_URL` | `https://s4hana.example.com:44300` | PROD |
| `SAPPM_CLIENT` | `100` | PROD |
| `SAPPM_USER` | `<technical-user>` | PROD |
| `SAPPM_PASSWORD` | `<use BTP secret binding>` | PROD |
| `SAP_PM_ENABLED` | `true` | OPTIONAL |
| `SAP_PM_WEBHOOK_SECRET` | `<hmac-secret>` | PROD if webhook |
| `ESRI_PORTAL_URL` | `https://www.arcgis.com` | OPTIONAL |
| `ESRI_API_KEY` | `<arcgis-developer-api-key>` | OPTIONAL |
| `GIS_SYNC_ENABLED` | `true` | OPTIONAL |
| `MAP_CLUSTER_THRESHOLD` | `200` | OPTIONAL |
| `GAZETTE_SCRAPE_ENABLED` | `false` | OPTIONAL |
| `DASHBOARD_CACHE_TTL_S` | `300` | OPTIONAL |
| `CAPITAL_UNIT_COST_CRITICAL` | `250000` | OPTIONAL |
| `SIMULATED_JURISDICTION` | `NSW,QLD` | DEV ONLY |
| `APP_DEFAULT_STANDARD` | `AUSTROADS_BIMM` | OPTIONAL |
| `SENSOR_INGEST_API_KEY` | `<api-key-for-iot-devices>` | PROD if IoT |
| `SENSOR_SIMULATION_ENABLED` | `false` | DEV ONLY |
| `AI_CLASSIFICATION_ENABLED` | `false` | OPTIONAL |
| `ANTHROPIC_API_KEY` | `<claude-api-key>` | PROD if AI |
| `AI_CONFIDENCE_THRESHOLD` | `0.75` | OPTIONAL |
| `AI_MAX_CONCURRENT` | `3` | OPTIONAL |

---

## v2.0 COMPLETION CRITERIA

The build is complete and v2.0 is ready to tag when ALL of the following are true:

```
TECHNICAL:
  [ ] All 15 prompts (P00–P14) DONE CHECKLIST fully ticked
  [ ] npm test -- --coverage --silent passes 100% across entire codebase
  [ ] Branch coverage >= 80% on all new files
  [ ] Lighthouse Performance >= 85 on all main routes (CI enforced)
  [ ] axe-core zero violations on all new UI components
  [ ] Zero HIGH/CRITICAL npm vulnerabilities (npm audit)
  [ ] All 15 git tags p{ref}-complete exist
  [ ] Git tag v2.0-complete exists on main branch

FUNCTIONAL:
  [ ] AS 5100.7 load rating form with evidence → restriction linkage
  [ ] NHVR BAMS live sync with visual status transparency
  [ ] Freight route corridor PBS/HML assessment with Vehicle Finder
  [ ] SAP PM defect→WO in 2 clicks with automatic CRITICAL/SEVERE WO creation
  [ ] Offline PWA — inspector works underground, syncs on return
  [ ] Esri GIS spatial search (bbox, radius, corridor) with semantic markers
  [ ] Scour risk 5-section AustRoads BIMM §7 assessment with live safety margin
  [ ] Gazette validation real-time with register lookup and admin page
  [ ] Deterioration model with projection chart and capital programme export
  [ ] Executive dashboard (3 tiers) with PDF export and PowerBI endpoint
  [ ] Multi-jurisdiction RBAC with graceful 403 and first-login welcome
  [ ] International standards (AU/EU/NZ/US) with condition scale adaptation
  [ ] IoT sensor ingest with 4 automated response handlers
  [ ] AI defect classification with human-in-the-loop review modal

UX:
  [ ] Every form field: placeholder + helperText + tooltip (from helpContent.ts)
  [ ] Every page: ScreenGuide component
  [ ] Every empty state: invitation + CTA (no blank walls)
  [ ] Fully responsive at 320px/768px/1024px/1440px
  [ ] Virtual scrolling on all lists > 50 items
  [ ] Skeleton screens on all data-heavy views (no spinners)
  [ ] Optimistic UI on all mutations
  [ ] Command palette (Cmd+K) with bridge search
  [ ] Role-based navigation (Inspector/Compliance/Manager profiles)
```

---

*NHVR Bridge Management Application v2.0*  
*Hastha Solutions Pty Ltd · ABN 11 159 623 739 · NSW SCM0020 Approved Vendor*  
*March 2026 · SENSITIVE — Internal and Authorised Client Use Only*
