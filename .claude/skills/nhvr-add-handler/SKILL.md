---
name: nhvr-add-handler
description: Add a new backend domain handler to the NHVR CAP service. Use when the user asks to add business logic for an entity, wire a new CAP action, add BEFORE/AFTER hooks, or create a new file under srv/handlers/. Covers the template, service.js wiring, service.cds extend block, validation, and audit log pattern.
---

# Add a New Domain Handler

`srv/service.js` is a ~39-line loader. **Never put business logic there.** Each domain lives in its own file under `srv/handlers/`.

## Steps

1. **Copy the template**:
   ```bash
   cp srv/handlers/_template.js srv/handlers/<domain>.js
   ```

2. **Register in loader** — edit `srv/service.js` and add the require+call for your new handler alongside the existing 16.

3. **CDS declarations** — open `srv/service.cds` and find the correct `extend service` block. **There are 4 separate `extend service` blocks** — content outside any block is invisible to OData. Confirm with:
   ```bash
   grep -n "extend service" srv/service.cds
   ```
   Add entity exposure / actions **inside** a block. Every view/projection needs ≥1 `key` field (CDS v9 strict).

4. **Business logic in BEFORE hooks** — validate input and throw `req.error(400, "<message>")`:
   ```js
   srv.before("CREATE", "MyEntity", async (req) => {
     if (!req.data.requiredField) req.error(400, "requiredField missing");
   });
   ```

5. **Audit log in AFTER hooks** — every mutation writes to `AuditLog`:
   ```js
   srv.after(["CREATE", "UPDATE", "DELETE"], "MyEntity", async (data, req) => {
     await INSERT.into("AuditLog").entries({
       entityType: "MyEntity",
       entityId: data.ID,
       action: req.event,
       userId: req.user.id,
       timestamp: new Date().toISOString(),
       delta: JSON.stringify(req.data)
     });
   });
   ```

6. **Shared helpers** — import from `srv/handlers/common.js` (validation, audit helpers). Don't duplicate.

7. **Scope enforcement** — add `@requires: 'BridgeManager'` (or appropriate scope) in `service.cds` for the entity/action.

8. **Test** — create `test/unit/<domain>.unit.test.js` and at minimum cover the BEFORE hook validation path.

9. **Run**:
   ```bash
   npm run test:unit
   ```

## Namespace discipline

CDS namespaces are **fully qualified**: `nhvr.compliance.XYZ`, never bare `compliance.XYZ`. Bare namespace = compile error.

## Integration adapters are separate

If your handler talks to an external system (BANC, ESRI, S/4HANA), put the HTTP client in `srv/integration/<vendor>-client.js` and register the action in `srv/integration/handlers.js`. The directory is `srv/integration/`, **NOT** `srv/adapters/` (which doesn't exist).

## References
- Module map: `CLAUDE.md` §4.2, §4.4
- Directory index: `srv/handlers/README.md`
- Template: `srv/handlers/_template.js`
- NEVER/ALWAYS rules: `CLAUDE.md` §6.2, §6.3
