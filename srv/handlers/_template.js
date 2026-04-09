// ============================================================
// srv/handlers/_template.js — copy this when adding a new domain handler
//
// USAGE:
//   1. cp _template.js <domain>.js
//   2. Replace <Domain>/<domain> placeholders.
//   3. Register in srv/service.js handler list.
//   4. Add row to srv/handlers/README.md.
//   5. Write test/unit/<domain>.unit.test.js.
//
// CONVENTIONS (enforced by CLAUDE.md §6.3):
//   - Validation in BEFORE hooks — throw req.error(400, "...")
//   - Audit in AFTER hooks — call writeAudit() from common.js
//   - Never put business logic in srv/service.js (it is a 39-line loader)
//   - @requires scopes belong in srv/service.cds, not here
// ============================================================

// Example: const { writeAudit } = require('./common');

module.exports = (srv) => {
    const { /* TODO: entities used by this handler, e.g. Bridges, Restrictions */ } = srv.entities;

    // ── BEFORE hooks — validation ──────────────────────────────
    // srv.before('CREATE', 'SomeEntity', async (req) => {
    //     const { someField } = req.data;
    //     if (!someField) return req.error(400, 'someField is required');
    //     // ... more validation
    // });

    // ── ON hooks — custom actions ──────────────────────────────
    // srv.on('someAction', 'SomeEntity', async (req) => {
    //     // Business logic for the action.
    //     // Return whatever the action declaration promises in service.cds.
    // });

    // ── AFTER hooks — audit + side effects ─────────────────────
    // srv.after(['CREATE','UPDATE','DELETE'], 'SomeEntity', async (data, req) => {
    //     await writeAudit(req, 'SomeEntity', req.event, data);
    // });
};
