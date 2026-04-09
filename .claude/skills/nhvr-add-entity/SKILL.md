---
name: nhvr-add-entity
description: Add a new OData entity or field to the NHVR CAP service. Use when the user asks to add an entity, add a column/field to an existing entity, create a new view or projection, or extend the data model. Covers schema.cds, service.cds extend blocks, key requirement, seed CSV, and tests.
---

# Add OData Entity / Field

## Files you touch (in order)

1. **`db/schema.cds`** — declare the entity under the correct namespace (`nhvr.bridges`, `nhvr.compliance`, `nhvr.admin`, etc.). Namespaces are **fully qualified** — bare names fail to compile.

2. **`srv/service.cds`** — expose it via a projection inside **one of the 4 `extend service` blocks**. Content outside a block is invisible to OData:
   ```bash
   grep -n "extend service" srv/service.cds
   ```
   Every view/projection **must declare ≥1 `key` field** (CDS v9 strict; v8 was lenient).

3. **`db/data/nhvr-<entity>.csv`** *(optional)* — seed rows. Follow existing file naming.

4. **`srv/handlers/<domain>.js`** — add BEFORE hooks for validation and AFTER hooks for AuditLog entries (see `nhvr-add-handler` skill). Do **not** put logic in `srv/service.js`.

5. **`test/integration/<domain>.integration.test.js`** — OData CRUD smoke test.

## Adding a field to an existing entity

1. `db/schema.cds` — add the field with correct type/length.
2. `srv/service.cds` — if the entity is exposed via a projection (not `as select *`), add the field to the projection inside the right `extend service` block.
3. **UI form binding** — add the control to the relevant `webapp/view/<Name>Form.view.xml` and label in `webapp/i18n/i18n.properties` (key style: `<screen>.<element>.<purpose>`).
4. **CSV seed** — update `db/data/nhvr-<entity>.csv` if seeded.
5. **Mirror sync** is automatic (PostToolUse hook handles `app-router/resources/*`).

## Field-name gotchas (silent HTTP 400s)

- `BridgeDefect` fields are `detectedDate` (NOT `reportedDate`), `closedDate`, `severity`, `defectCode`. Wrong name → 400 with no useful message.
- `Bridge` navigation uses `bridgeId` (business code), NEVER UUID `ID`. Same for `Permit` via `permitId`.

## Dynamic attributes

If the "field" should be user-configurable (not hardcoded schema), use the `AttributeDefinition` + `AttributeValidValue` pattern — add it via the AdminConfig UI and `BridgeForm.controller.js` auto-renders section 9. No schema change needed.

## Validate

```bash
npx cds compile srv/ --to sql > /dev/null    # schema sanity
npm run test:integration                      # CRUD round-trip
```

## References
- Sources of truth: `CLAUDE.md` §4.6
- Decision table: `CLAUDE.md` §5
- Schema navigation headers: top of `db/schema.cds` and `srv/service.cds`
