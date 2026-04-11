using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── Tenant CRUD (Admin only) ──────────────────────────────
@restrict: [
    { grant: 'READ',                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity Tenants as projection on nhvr.Tenant {
    *
};
}
