// ============================================================
// NHVR Role Manager — centralised role-based UI control
// Singleton: loaded once at app start, applied across all views
// v2: adds featureEnabled, field-level control, Inspector/Operator
// ============================================================
sap.ui.define([
    "nhvr/bridgemanagement/config/RoleFallback"
], function (RoleFallback) {
    "use strict";

    const STORAGE_KEY = "nhvr_active_role";
    const ROLES = ["ADMIN","BRIDGE_MANAGER","INSPECTOR","OPERATOR","TECH_ADMIN","READ_ONLY"];
    const ROLE_LABELS = {
        ADMIN         : "Administrator",
        BRIDGE_MANAGER: "Bridge Manager",
        INSPECTOR     : "Inspector",
        OPERATOR      : "Operator",
        TECH_ADMIN    : "Tech Admin",
        READ_ONLY     : "Read Only"
    };

    // Map XSUAA scope names → internal role keys
    const XSUAA_ROLE_MAP = {
        "Admin"          : "ADMIN",
        "NHVR_Admin"     : "ADMIN",
        "BridgeManager"  : "BRIDGE_MANAGER",
        "NHVR_BridgeManager": "BRIDGE_MANAGER",
        "Inspector"      : "INSPECTOR",
        "NHVR_Inspector" : "INSPECTOR",
        "Operator"       : "OPERATOR",
        "NHVR_Operator"  : "OPERATOR",
        "TechAdmin"      : "TECH_ADMIN",
        "NHVR_TechAdmin" : "TECH_ADMIN",
        "Executive"      : "READ_ONLY",
        "NHVR_Executive" : "READ_ONLY",
        "Viewer"         : "READ_ONLY",
        "NHVR_Viewer"    : "READ_ONLY"
    };

    let _config    = {};    // { featureKey: { visible, editable, featureEnabled, fieldName, fieldVisible, fieldEditable } }
    let _role      = null;
    let _listeners = [];

    // ── Private helpers ──────────────────────────────────────────

    /**
     * Build a fallback config for when server is unavailable.
     * Delegates to the declarative matrix in config/RoleFallback.js so
     * admins can tweak feature access without touching this file.
     */
    function _buildFallback(role) {
        return RoleFallback.buildFallback(role);
    }

    // ── Public API ───────────────────────────────────────────────

    return {
        ROLES,
        ROLE_LABELS,

        /**
         * Called once at app start — detects XSUAA role from /me() then
         * loads feature config from RoleConfigs entity.
         * Falls back to a hardcoded config if server unreachable.
         */
        loadConfig: function (role) {
            // If role explicitly provided, use it; otherwise detect from XSUAA
            if (role) {
                _role = role;
                sessionStorage.setItem(STORAGE_KEY, _role);
                return this._fetchConfig();
            }

            // Try to detect role from XSUAA /me() endpoint
            return fetch(`/bridge-management/me()`, { headers: { Accept: "application/json" } })
                .then(r => r.ok ? r.json() : { roles: [] })
                .then(info => {
                    const xsuaaRoles = info.roles || [];
                    // Map highest-privilege XSUAA scope to internal role
                    let detected = sessionStorage.getItem(STORAGE_KEY) || "READ_ONLY";
                    if (xsuaaRoles.some(r => XSUAA_ROLE_MAP[r] === "ADMIN"))          detected = "ADMIN";
                    else if (xsuaaRoles.some(r => XSUAA_ROLE_MAP[r] === "BRIDGE_MANAGER")) detected = "BRIDGE_MANAGER";
                    else if (xsuaaRoles.some(r => XSUAA_ROLE_MAP[r] === "INSPECTOR"))  detected = "INSPECTOR";
                    else if (xsuaaRoles.some(r => XSUAA_ROLE_MAP[r] === "OPERATOR"))   detected = "OPERATOR";
                    _role = detected;
                    sessionStorage.setItem(STORAGE_KEY, _role);
                    return this._fetchConfig();
                })
                .catch(() => {
                    // RK-09: Fail-closed — if /me() unreachable, default to READ_ONLY (least privilege)
                    // Do NOT use sessionStorage cached role — network failure could mean spoofed context
                    _role = "READ_ONLY";
                    _config = _buildFallback(_role);
                    _listeners.forEach(fn => fn(_role, _config));
                    return _config;
                });
        },

        /** Fetch RoleConfigs from server for the current role */
        _fetchConfig: function () {
            return fetch(
                `/bridge-management/RoleConfigs?$filter=role eq '${_role}'&$select=featureKey,featureType,visible,editable,featureEnabled,fieldName,fieldVisible,fieldEditable,fieldRequired`,
                { headers: { Accept: "application/json" } }
            )
            .then(r => r.ok ? r.json() : { value: [] })
            .then(j => {
                _config = _buildFallback(_role);  // start from sensible defaults
                (j.value || []).forEach(c => {
                    // Server config overrides fallback defaults
                    _config[c.featureKey] = {
                        visible        : c.visible        !== undefined ? c.visible        : true,
                        editable       : c.editable       !== undefined ? c.editable       : true,
                        featureEnabled : c.featureEnabled !== undefined ? c.featureEnabled : true,
                        type           : c.featureType,
                        fieldName      : c.fieldName,
                        fieldVisible   : c.fieldVisible   !== undefined ? c.fieldVisible   : true,
                        fieldEditable  : c.fieldEditable  !== undefined ? c.fieldEditable  : true,
                        fieldRequired  : c.fieldRequired  !== undefined ? c.fieldRequired  : false
                    };
                });
                _listeners.forEach(fn => fn(_role, _config));
                return _config;
            })
            .catch(() => {
                _config = _buildFallback(_role);
                _listeners.forEach(fn => fn(_role, _config));
                return _config;
            });
        },

        getRole:  function () { return _role || "READ_ONLY"; }, // RK-09: fail-closed default
        getLabel: function () { return ROLE_LABELS[_role] || _role; },

        /** Is feature visible for current role? Default: false (fail-closed, RK-09) */
        isVisible: function (featureKey) {
            const c = _config[featureKey];
            if (!c) return false; // RK-09: unknown features default to hidden
            // featureEnabled defaults to true when not explicitly set (CSV backfill-safe)
            const enabled = (c.featureEnabled === false || c.featureEnabled === "false") ? false : true;
            return !!c.visible && enabled;
        },

        /** Is feature editable for current role? Default: false (fail-closed, RK-09) */
        isEditable: function (featureKey) {
            const c = _config[featureKey];
            if (!c) return false; // RK-09: unknown features default to read-only
            return !!c.editable && !!c.featureEnabled;
        },

        /** Is the entire feature enabled (admin toggle)? Default: false (fail-closed, RK-09) */
        isEnabled: function (featureKey) {
            const c = _config[featureKey];
            if (!c) return false; // RK-09: unknown features default to disabled
            // featureEnabled defaults to true when not explicitly set
            return (c.featureEnabled === false || c.featureEnabled === "false") ? false : true;
        },

        /**
         * Field-level: is this field visible for current role?
         * Fail-OPEN default — if no RoleConfig row declares a restriction
         * for `fieldName`, the field is visible. The feature-level check
         * already gates the whole screen; once a user has access to the
         * feature, all fields render unless an admin has specifically
         * restricted them via the AdminConfig UI. (Prior fail-closed
         * default was silently hiding every mapped field across
         * Permits/Defects/BridgeForm/InspectionCreate/Restrictions
         * because no seed RoleConfig rows populate fieldName.)
         */
        isFieldVisible: function (fieldName) {
            const entry = Object.values(_config).find(c => c.fieldName === fieldName);
            if (!entry) return true;
            return entry.fieldVisible !== false;
        },

        /** Field-level: is this field editable for current role? Fail-open (see isFieldVisible). */
        isFieldEditable: function (fieldName) {
            const entry = Object.values(_config).find(c => c.fieldName === fieldName);
            if (!entry) return true;
            return entry.fieldEditable !== false;
        },

        /** Field-level: is this field required for current role? Fail-closed (required = explicit opt-in). */
        isFieldRequired: function (fieldName) {
            const entry = Object.values(_config).find(c => c.fieldName === fieldName);
            if (!entry) return false;
            return !!entry.fieldRequired;
        },

        /** Get all features for current role */
        getConfig: function () { return _config; },

        /** Switch role and reload config */
        switchRole: function (newRole) {
            return this.loadConfig(newRole);
        },

        /** Register a callback fired when role/config changes */
        onChange: function (fn) { _listeners.push(fn); },

        /**
         * Apply role config to a SAP UI5 view.
         * - Hides/shows IconTabBar tabs by featureKey
         * - Hides/shows controls via applyControls mappings
         * - Sets editable state on InputBase/Select controls via fieldName
         */
        applyToView: function (view) {
            if (!view) return;
            // Apply to BridgeDetail IconTabBar tabs
            const tabBar = view.byId("detailTabs");
            if (tabBar) {
                tabBar.getItems().forEach(tab => {
                    const key  = tab.getKey();
                    // Map IconTabFilter key → featureKey in _config
                    const fKey = key + "-tab";
                    if (_config[fKey] !== undefined) {
                        tab.setVisible(this.isVisible(fKey));
                    }
                });
            }
        },

        /**
         * Apply role-driven visibility to a flat list of {id, key} pairs.
         * Also disables controls where editable=false.
         */
        applyControls: function (view, mappings) {
            if (!view || !mappings) return;
            mappings.forEach(m => {
                const ctrl = view.byId(m.id);
                if (!ctrl) return;
                const visible  = this.isVisible(m.key);
                const editable = this.isEditable(m.key);
                if (ctrl.setVisible)  ctrl.setVisible(visible);
                if (!editable) {
                    if (ctrl.setEnabled)  ctrl.setEnabled(false);
                    if (ctrl.setEditable) ctrl.setEditable(false);
                }
            });
        },

        /**
         * Apply field-level visibility/editability to form fields.
         * mappings: [{ id: 'ctrlId', field: 'fieldName' }]
         */
        applyFields: function (view, mappings) {
            if (!view || !mappings) return;
            mappings.forEach(m => {
                const ctrl = view.byId(m.id);
                if (!ctrl) return;
                if (ctrl.setVisible)  ctrl.setVisible(this.isFieldVisible(m.field));
                const editable = this.isFieldEditable(m.field);
                if (!editable) {
                    if (ctrl.setEnabled)  ctrl.setEnabled(false);
                    if (ctrl.setEditable) ctrl.setEditable(false);
                }
            });
        },

        /**
         * Return a high-level navigation profile string for the current role.
         * Used to configure which quick-access items and dashboard sections are shown.
         * @returns {"INSPECTOR"|"COMPLIANCE_OFFICER"|"ASSET_MANAGER"|"ADMIN"|"VIEWER"}
         */
        getNavProfile: function () {
            switch (_role) {
                case "ADMIN":          return "ADMIN";
                case "BRIDGE_MANAGER": return "ASSET_MANAGER";
                case "INSPECTOR":      return "INSPECTOR";
                case "OPERATOR":       return "COMPLIANCE_OFFICER";
                case "READ_ONLY":
                default:               return "VIEWER";
            }
        },

        /**
         * Return role-specific quick-access navigation items for the Home screen rail.
         * Each item: { label, icon, route, params, primary }
         * @returns {Array<{label:string, icon:string, route:string, params:Object, primary:boolean}>}
         */
        getQuickAccessItems: function () {
            const profile = this.getNavProfile();
            switch (profile) {
                case "INSPECTOR":
                    return [
                        { label: "My Inspections Today",    icon: "sap-icon://inspect",        route: "InspectionDashboard", params: { filter: "today" },    primary: true  },
                        { label: "Raise Defect",            icon: "sap-icon://alert",           route: "DefectRegister",             params: { mode: "create" },     primary: true  },
                        { label: "Overdue Inspections",     icon: "sap-icon://warning",         route: "InspectionDashboard", params: { filter: "overdue" },  primary: false },
                        { label: "Open Defects",            icon: "sap-icon://work-history",    route: "DefectRegister",             params: { filter: "open" },     primary: false }
                    ];
                case "COMPLIANCE_OFFICER":
                    return [
                        { label: "Expiring This Week",      icon: "sap-icon://time-entry-request", route: "RestrictionsList", params: { filter: "expiring" },  primary: true  },
                        { label: "Overdue Inspections",     icon: "sap-icon://warning",            route: "InspectionDashboard", params: { filter: "overdue" }, primary: true },
                        { label: "Active Restrictions",     icon: "sap-icon://permission",         route: "RestrictionsList", params: { filter: "active" },   primary: false },
                        { label: "Permit Register",         icon: "sap-icon://document-text",      route: "Permits",      params: {},                      primary: false }
                    ];
                case "ASSET_MANAGER":
                    return [
                        { label: "Priority Bridges",        icon: "sap-icon://notification-2",  route: "BridgesList",   params: { filter: "priority" }, primary: true  },
                        { label: "Network Health",          icon: "sap-icon://da-2",             route: "Dashboard", params: {},            primary: true  },
                        { label: "Recent Defects",          icon: "sap-icon://alert",            route: "DefectRegister",   params: { filter: "recent" },   primary: false },
                        { label: "Add Bridge",              icon: "sap-icon://add",              route: "BridgeNew",params: { mode: "create" },     primary: false }
                    ];
                case "ADMIN":
                    return [
                        { label: "All Bridges",             icon: "sap-icon://map-2",            route: "BridgesList",     params: {},                   primary: false },
                        { label: "Admin Config",            icon: "sap-icon://settings",         route: "AdminConfig", params: {},                   primary: false },
                        { label: "Mass Upload",             icon: "sap-icon://upload",           route: "MassUpload",  params: {},                   primary: false },
                        { label: "Mass Edit",               icon: "sap-icon://edit",             route: "MassEdit",    params: {},                   primary: false }
                    ];
                case "VIEWER":
                default:
                    return [
                        { label: "Browse Bridges",          icon: "sap-icon://map-2",            route: "BridgesList",             params: {}, primary: true  },
                        { label: "View Map",                icon: "sap-icon://map",              route: "MapView",             params: {}, primary: false },
                        { label: "Dashboard",               icon: "sap-icon://da",               route: "Dashboard",  params: {}, primary: false }
                    ];
            }
        },

        /**
         * Return a flat list of searchable command palette actions for the current role.
         * Each item: { id, label, category, icon, route, params, action }
         * 'action' is optional — a string key for the controller to handle (e.g. "openMassEdit")
         * @returns {Array<{id:string, label:string, category:string, icon:string, route:string, params:Object}>}
         */
        getCommandPaletteActions: function () {
            const isMgr   = (_role === "ADMIN" || _role === "BRIDGE_MANAGER");
            const isInsp  = isMgr || _role === "INSPECTOR";
            const isOp    = isMgr || _role === "OPERATOR";
            const actions = [
                // Navigation — always visible
                { id: "nav-bridges",        label: "Go to Bridges",              category: "Navigation", icon: "sap-icon://map-2",           route: "BridgesList",            params: {} },
                { id: "nav-restrictions",   label: "Go to Restrictions",         category: "Navigation", icon: "sap-icon://permission",       route: "RestrictionsList",       params: {} },
                { id: "nav-map",            label: "Open Map View",              category: "Navigation", icon: "sap-icon://map",              route: "MapView",            params: {} },
                { id: "nav-reports",        label: "Reports",                    category: "Navigation", icon: "sap-icon://bar-chart",        route: "Reports",            params: {} },
                { id: "nav-exec-dash",      label: "Dashboard",                  category: "Navigation", icon: "sap-icon://da",               route: "Dashboard", params: {} }
            ];
            if (isInsp) {
                actions.push(
                    { id: "nav-inspections",    label: "Inspection Dashboard",       category: "Navigation", icon: "sap-icon://inspect",          route: "InspectionDashboard", params: {} },
                    { id: "nav-defects",        label: "Defect Register",            category: "Navigation", icon: "sap-icon://alert",            route: "DefectRegister",            params: {} },
                    { id: "act-raise-defect",   label: "Raise New Defect",           category: "Actions",    icon: "sap-icon://add",              route: "DefectRegister",            params: { mode: "create" } }
                );
            }
            if (isOp) {
                actions.push(
                    { id: "nav-permits",        label: "Permit Register",            category: "Navigation", icon: "sap-icon://document-text",    route: "Permits",            params: {} }
                );
            }
            if (isMgr) {
                actions.push(
                    { id: "act-add-bridge",     label: "Add New Bridge",             category: "Actions",    icon: "sap-icon://add",              route: "BridgeNew",         params: { mode: "create" } },
                    { id: "act-mass-edit",      label: "Mass Edit Bridges",          category: "Actions",    icon: "sap-icon://edit",             route: "MassEdit",           params: {} },
                    { id: "act-mass-upload",    label: "Bulk Upload CSV",            category: "Actions",    icon: "sap-icon://upload",           route: "MassUpload",         params: {} },
                    { id: "nav-admin",          label: "Admin Config",               category: "Navigation", icon: "sap-icon://settings",         route: "AdminConfig",        params: {} }
                );
            }
            // Filter presets
            actions.push(
                { id: "filter-critical",    label: "Show Critical Condition Bridges", category: "Filters", icon: "sap-icon://sys-cancel",  route: "BridgesList", params: { filter: "critical" } },
                { id: "filter-restricted",  label: "Show Restricted Bridges",         category: "Filters", icon: "sap-icon://locked",      route: "BridgesList", params: { filter: "restricted" } },
                { id: "filter-expiring",    label: "Expiring Restrictions This Week", category: "Filters", icon: "sap-icon://time-entry-request", route: "RestrictionsList", params: { filter: "expiring" } }
            );
            return actions;
        },

        // ── P11: Jurisdiction Access helpers ────────────────────────
        // _jurisdiction is set by server-side data only (loadConfig / XSUAA custom attribute)
        _jurisdictionFromServer: "ALL",

        /**
         * Set jurisdiction from server-side source (XSUAA custom attribute).
         * Called during loadConfig when /me() returns jurisdiction info.
         */
        setJurisdictionFromServer: function (jurisdiction) {
            this._jurisdictionFromServer = jurisdiction || "ALL";
        },

        getJurisdiction: function () {
            // Jurisdiction must come from server-side data only — no localStorage override
            return this._jurisdictionFromServer || "ALL";
        },

        canAccessJurisdiction: function (bridgeState) {
            var j = this.getJurisdiction();
            if (j === "ALL") return true;
            var stateMap = {
                NSW: "NSW", VIC: "VIC", QLD: "QLD", WA: "WA",
                SA: "SA", TAS: "TAS", ACT: "ACT", NT: "NT"
            };
            return stateMap[bridgeState] === j;
        },

        getJurisdictionOptions: function () {
            return [
                { key: "ALL", text: "All Jurisdictions" },
                { key: "NSW", text: "New South Wales (NSW)" },
                { key: "VIC", text: "Victoria (VIC)" },
                { key: "QLD", text: "Queensland (QLD)" },
                { key: "WA",  text: "Western Australia (WA)" },
                { key: "SA",  text: "South Australia (SA)" },
                { key: "TAS", text: "Tasmania (TAS)" },
                { key: "ACT", text: "Australian Capital Territory (ACT)" },
                { key: "NT",  text: "Northern Territory (NT)" }
            ];
        }
    };
});
