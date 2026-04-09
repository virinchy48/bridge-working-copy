// ============================================================
// LicenseConfig.controller.js
// Multi-tenant capability licensing configuration page.
// Admin-only: manage client organisations and their licensed
// feature capabilities + per-role access matrix.
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/HelpAssistantMixin",
    "nhvr/bridgemanagement/model/CapabilityManager"
], function (Controller, JSONModel, MessageToast, MessageBox, HelpAssistantMixin, CapabilityManager) {
    "use strict";

    const BASE = "/bridge-management";
    const H    = { Accept: "application/json", "Content-Type": "application/json" };

    // Role display labels (internal key → human label)
    const ROLE_LABELS = {
        ADMIN          : "Administrator",
        BRIDGE_MANAGER : "Bridge Manager",
        INSPECTOR      : "Inspector",
        OPERATOR       : "Operator",
        READ_ONLY      : "Read Only"
    };
    const ALL_ROLES = ["ADMIN", "BRIDGE_MANAGER", "INSPECTOR", "OPERATOR", "READ_ONLY"];

    return Controller.extend("nhvr.bridgemanagement.controller.LicenseConfig", Object.assign({

        onInit: function () {
            this._router = this.getOwnerComponent().getRouter();
            this._router.getRoute("LicenseConfig").attachPatternMatched(this._onRouteMatched, this);

            // Main model for the page
            this.getView().setModel(new JSONModel({
                tenants         : [],
                catalog         : [],
                selectedTenant  : null,
                capabilityItems : [],     // flat list for the capability grid (current tab)
                allCapabilities : [],     // full catalog merged with tenant feature state
                roleMatrix      : [],     // rows for the role matrix dialog
                currentCapCode  : null,   // capability being edited in role matrix
                busy            : false
            }), "licenseModel");

            this._initHelpAssistant("adminConfig");
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("ADMIN_CONFIG", self.getOwnerComponent().getRouter())) return;
                self._loadCatalog().then(() => self._loadTenants());
            });
        },

        // ── Data Loading ─────────────────────────────────────────

        _loadTenants: function () {
            return fetch(`${BASE}/Tenants?$orderby=displayName`, { headers: H })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    const m = this.getView().getModel("licenseModel");
                    m.setProperty("/tenants", j.value || []);
                    const list = this.byId("tenantList");
                    if (list) list.bindItems({
                        path: "licenseModel>/tenants",
                        template: list.getBindingInfo("items") && list.getBindingInfo("items").template
                            || this._buildTenantListItemTemplate()
                    });
                })
                .catch(err => MessageToast.show("Could not load clients: " + err.message));
        },

        _buildTenantListItemTemplate: function () {
            // Programmatic template so we don't depend on XML binding at runtime
            const { ObjectListItem, ObjectAttribute, ObjectStatus } = sap.m;
            const item = new ObjectListItem({
                title  : "{licenseModel>displayName}",
                intro  : "{licenseModel>tenantCode}",
                number : "{licenseModel>licenseStatus}",
                numberState: "{= ${licenseModel>licenseStatus} === 'ACTIVE' ? 'Success' : ${licenseModel>licenseStatus} === 'TRIAL' ? 'Warning' : 'Error'}",
                type   : "Active"
            });
            item.addAttribute(new ObjectAttribute({ title: "Jurisdiction", text: "{licenseModel>jurisdiction}" }));
            item.addFirstStatus(new ObjectStatus({
                text : "{= ${licenseModel>isActive} ? 'Active' : 'Inactive'}",
                state: "{= ${licenseModel>isActive} ? 'Success' : 'Error'}"
            }));
            return item;
        },

        _loadCatalog: function () {
            return fetch(`${BASE}/FeatureCatalog?$orderby=sortOrder`, { headers: H })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    this.getView().getModel("licenseModel").setProperty("/catalog", j.value || []);
                })
                .catch(err => MessageToast.show("Could not load feature catalog: " + err.message));
        },

        _loadTenantDetail: function (tenantCode) {
            const m = this.getView().getModel("licenseModel");
            m.setProperty("/busy", true);
            // Use tenantCode filter to avoid UUID key path validation issues with seed data
            return fetch(
                `${BASE}/Tenants?$filter=tenantCode eq '${encodeURIComponent(tenantCode)}'&$expand=features,roleCapabilities&$top=1`,
                { headers: H }
            )
            .then(r => r.ok ? r.json() : null)
            .then(result => {
                const tenant = result && result.value && result.value[0];
                if (!tenant) { MessageToast.show("Could not load client details."); return; }
                m.setProperty("/selectedTenant", tenant);
                this._buildCapabilityModel(tenant);
                this.byId("noTenantSelected").setVisible(false);
                this.byId("tenantDetailPanel").setVisible(true);
            })
            .catch(err => MessageToast.show("Error: " + err.message))
            .finally(() => m.setProperty("/busy", false));
        },

        // ── Build capability grid model from catalog + tenant data ─

        _buildCapabilityModel: function (tenant) {
            const catalog   = this.getView().getModel("licenseModel").getProperty("/catalog");
            const features  = (tenant.features         || []);
            const grants    = (tenant.roleCapabilities || []);

            // Map: capabilityCode → TenantFeature row
            const featMap = {};
            features.forEach(f => { featMap[f.capabilityCode] = f; });

            // Map: "capabilityCode::role" → TenantRoleCapability row
            const grantMap = {};
            grants.forEach(g => { grantMap[`${g.capabilityCode}::${g.role}`] = g; });

            const items = catalog.map(cat => {
                const tf = featMap[cat.capabilityCode] || {};
                const roleOverrides = ALL_ROLES.map(role => {
                    const g = grantMap[`${cat.capabilityCode}::${role}`] || {};
                    return {
                        role     : role,
                        roleLabel: ROLE_LABELS[role] || role,
                        canView  : g.canView  !== undefined ? g.canView  : (cat.isCoreFeature),
                        canEdit  : g.canEdit  !== undefined ? g.canEdit  : false,
                        canAdmin : g.canAdmin !== undefined ? g.canAdmin : false
                    };
                });
                return {
                    capabilityCode  : cat.capabilityCode,
                    displayName     : cat.displayName,
                    description     : cat.description || "",
                    category        : cat.category,
                    isCoreFeature   : !!cat.isCoreFeature,
                    iconUri         : cat.iconUri || "sap-icon://puzzle",
                    isEnabled       : cat.isCoreFeature ? true : (tf.isEnabled !== undefined ? !!tf.isEnabled : false),
                    validFrom       : tf.validFrom || "",
                    validTo         : tf.validTo   || "",
                    licenseNote     : tf.licenseNote || "",
                    existingFeatureId: tf.ID || null,
                    roleOverrides
                };
            });

            const m = this.getView().getModel("licenseModel");
            m.setProperty("/allCapabilities", items);
            this._filterCapabilityGrid("ALL");
        },

        _filterCapabilityGrid: function (category) {
            const all  = this.getView().getModel("licenseModel").getProperty("/allCapabilities") || [];
            const filtered = category === "ALL" ? all : all.filter(c => c.category === category);
            this.getView().getModel("licenseModel").setProperty("/capabilityItems", filtered);
            this._renderCapabilityGrid(filtered);
        },

        // ── Render capability cards dynamically ──────────────────

        _renderCapabilityGrid: function (items) {
            const grid = this.byId("capabilityGrid");
            if (!grid) return;
            grid.destroyItems();

            // Group by category
            const grouped = {};
            items.forEach(item => {
                if (!grouped[item.category]) grouped[item.category] = [];
                grouped[item.category].push(item);
            });

            Object.entries(grouped).forEach(([cat, capItems]) => {
                // Category header
                const hdr = new sap.m.Title({ text: cat, level: "H6" })
                    .addStyleClass("nhvrCapCategoryHdr sapUiSmallMarginTopBottom");
                grid.addItem(hdr);

                // Wrap cards in HBox
                const row = new sap.m.HBox({ wrap: "Wrap", alignItems: "Start" })
                    .addStyleClass("nhvrCapabilityRow sapUiSmallMarginBottom");

                capItems.forEach((cap, idx) => {
                    const card = this._buildCapabilityCard(cap, idx, items);
                    row.addItem(card);
                });
                grid.addItem(row);
            });
        },

        _buildCapabilityCard: function (cap) {
            const self = this;
            const isCore = cap.isCoreFeature;

            const card = new sap.m.VBox()
                .addStyleClass("nhvrCapCard")
                .addStyleClass(cap.isEnabled ? "nhvrCapCardEnabled" : "nhvrCapCardDisabled");

            // Header row: icon + name + switch
            const hdr = new sap.m.HBox({ alignItems: "Center", justifyContent: "SpaceBetween" })
                .addStyleClass("nhvrCapCardHeader");

            const iconName = new sap.m.HBox({ alignItems: "Center" });
            iconName.addItem(new sap.ui.core.Icon({ src: cap.iconUri || "sap-icon://puzzle", size: "1.2rem" })
                .addStyleClass("nhvrCapIcon" + (cap.isEnabled ? " nhvrCapIconEnabled" : " nhvrCapIconDisabled")));
            iconName.addItem(new sap.m.Text({ text: cap.displayName })
                .addStyleClass("nhvrCapName sapUiSmallMarginBegin"));
            hdr.addItem(iconName);

            const sw = new sap.m.Switch({
                state  : cap.isEnabled,
                enabled: !isCore,
                change : function (e) {
                    self._onCapabilityToggle(cap.capabilityCode, e.getParameter("state"), card);
                }
            });
            if (isCore) sw.setTooltip("Core feature — always included");
            hdr.addItem(sw);
            card.addItem(hdr);

            // Description
            if (cap.description) {
                card.addItem(new sap.m.Text({ text: cap.description, wrapping: true })
                    .addStyleClass("nhvrCapDesc nhvrSubText sapUiTinyMarginTop"));
            }

            // Badges: Core / category
            const badges = new sap.m.HBox({ wrap: "Wrap" }).addStyleClass("nhvrCapBadges sapUiTinyMarginTop");
            if (isCore) {
                badges.addItem(new sap.m.ObjectStatus({ text: "Core", state: "Success" })
                    .addStyleClass("nhvrCapBadge"));
            }
            badges.addItem(new sap.m.ObjectStatus({ text: cap.category })
                .addStyleClass("nhvrCapBadge"));
            card.addItem(badges);

            // Role matrix link
            const roleLnk = new sap.m.Button({
                text   : "Role Access",
                icon   : "sap-icon://role",
                type   : "Transparent",
                enabled: cap.isEnabled,
                press  : function () { self._openRoleMatrix(cap.capabilityCode); }
            }).addStyleClass("nhvrCapRoleBtn sapUiTinyMarginTop");
            card.addItem(roleLnk);

            return card;
        },

        _onCapabilityToggle: function (capabilityCode, enabled, card) {
            const m   = this.getView().getModel("licenseModel");
            const all = m.getProperty("/allCapabilities") || [];
            const idx = all.findIndex(c => c.capabilityCode === capabilityCode);
            if (idx >= 0) {
                all[idx].isEnabled = enabled;
                m.setProperty("/allCapabilities", all);
            }
            // Update card style
            if (card) {
                if (enabled) {
                    card.removeStyleClass("nhvrCapCardDisabled");
                    card.addStyleClass("nhvrCapCardEnabled");
                } else {
                    card.removeStyleClass("nhvrCapCardEnabled");
                    card.addStyleClass("nhvrCapCardDisabled");
                }
            }
        },

        // ── Tenant list selection ────────────────────────────────

        onTenantSelect: function (e) {
            const item    = e.getParameter("listItem");
            const tenants = this.getView().getModel("licenseModel").getProperty("/tenants");
            const idx     = this.byId("tenantList").indexOfItem(item);
            if (idx < 0 || idx >= tenants.length) return;
            const tenant  = tenants[idx];
            this._loadTenantDetail(tenant.tenantCode);
        },

        onRefreshTenants: function () {
            this._loadTenants();
        },

        // ── Save tenant details ──────────────────────────────────

        onSaveTenantDetails: function () {
            const m      = this.getView().getModel("licenseModel");
            const tenant = m.getProperty("/selectedTenant");
            if (!tenant) return;

            const payload = {
                displayName     : tenant.displayName,
                shortName       : tenant.shortName,
                jurisdiction    : tenant.jurisdiction,
                contactEmail    : tenant.contactEmail,
                contactName     : tenant.contactName,
                licenseStartDate: tenant.licenseStartDate || null,
                licenseEndDate  : tenant.licenseEndDate   || null,
                licenseStatus   : tenant.licenseStatus,
                maxUsers        : parseInt(tenant.maxUsers, 10) || null,
                notes           : tenant.notes
            };

            this._resolveUUID(tenant).then(uuid => {
                if (!uuid) {
                    MessageBox.error(
                        "This client record uses a non-UUID key from seed data. " +
                        "Re-deploy with updated seed data or create a new client to enable editing."
                    );
                    return;
                }
                return fetch(`${BASE}/Tenants(${uuid})`, {
                    method : "PATCH",
                    headers: H,
                    body   : JSON.stringify(payload)
                })
                .then(r => {
                    if (r.ok) {
                        MessageToast.show("Client details saved successfully.");
                        this._loadTenants();
                    } else {
                        return r.json().then(e => { throw new Error(e.error && e.error.message || "Save failed"); });
                    }
                });
            })
            .catch(err => MessageBox.error("Could not save: " + err.message));
        },

        onDeactivateTenant: function () {
            const tenant = this.getView().getModel("licenseModel").getProperty("/selectedTenant");
            if (!tenant) return;
            MessageBox.confirm(
                `Deactivate '${tenant.displayName}'? All users in this organisation will lose access.`,
                {
                    title: "Deactivate Client",
                    onClose: action => {
                        if (action !== "OK") return;
                        this._resolveUUID(tenant).then(uuid => {
                            if (!uuid) { MessageBox.error("Cannot resolve UUID for this client. Please re-deploy with updated seed data."); return; }
                            return fetch(`${BASE}/Tenants(${uuid})`, {
                                method : "PATCH",
                                headers: H,
                                body   : JSON.stringify({ isActive: false, licenseStatus: "SUSPENDED" })
                            })
                            .then(r => {
                                if (r.ok) {
                                    MessageToast.show("Client deactivated.");
                                    this._loadTenants();
                                    this.byId("noTenantSelected").setVisible(true);
                                    this.byId("tenantDetailPanel").setVisible(false);
                                }
                            });
                        })
                        .catch(err => MessageBox.error(err.message));
                    }
                }
            );
        },

        // ── Save all capability assignments ─────────────────────

        onSaveCapabilities: function () {
            const m      = this.getView().getModel("licenseModel");
            const tenant = m.getProperty("/selectedTenant");
            if (!tenant) return;
            const all = m.getProperty("/allCapabilities") || [];

            const capabilities = all.map(cap => ({
                capabilityCode: cap.capabilityCode,
                isEnabled     : cap.isEnabled,
                roleOverrides : cap.roleOverrides.map(ro => ({
                    role    : ro.role,
                    canView : ro.canView,
                    canEdit : ro.canEdit,
                    canAdmin: ro.canAdmin
                }))
            }));

            this._resolveUUID(tenant).then(uuid => {
                if (!uuid) {
                    MessageBox.error(
                        "Cannot save capabilities: the client record has a non-UUID key (seed data). " +
                        "Create this client via the '+ New Client' button to obtain a valid UUID."
                    );
                    return;
                }
                return fetch(`${BASE}/assignTenantCapabilities`, {
                    method : "POST",
                    headers: H,
                    body   : JSON.stringify({ tenantId: uuid, capabilities })
                })
                .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error && e.error.message || "Save failed"); }))
                .then(result => {
                    MessageToast.show(`Capabilities saved — ${result.count || 0} role grants updated.`);
                });
            })
            .catch(err => MessageBox.error("Could not save capabilities: " + err.message));
        },

        onEnableAllCapabilities: function () {
            const m   = this.getView().getModel("licenseModel");
            const all = (m.getProperty("/allCapabilities") || []).map(c => ({ ...c, isEnabled: true }));
            m.setProperty("/allCapabilities", all);
            const tab = this.byId("capabilityTabBar");
            const cat = tab ? tab.getSelectedKey() : "ALL";
            this._filterCapabilityGrid(cat);
            MessageToast.show("All capabilities enabled. Click 'Save Capabilities' to persist.");
        },

        // ── Capability category tab ──────────────────────────────

        onCapabilityTabChange: function (e) {
            const key = e.getParameter("selectedKey") || "ALL";
            this._filterCapabilityGrid(key);
        },

        // ── Role Matrix Dialog ───────────────────────────────────

        _openRoleMatrix: function (capabilityCode) {
            const m   = this.getView().getModel("licenseModel");
            const all = m.getProperty("/allCapabilities") || [];
            const cap = all.find(c => c.capabilityCode === capabilityCode);
            if (!cap) return;

            m.setProperty("/currentCapCode", capabilityCode);

            const roleRows = cap.roleOverrides.map(ro => ({
                role     : ro.role,
                roleLabel: ROLE_LABELS[ro.role] || ro.role,
                canView  : ro.canView,
                canEdit  : ro.canEdit,
                canAdmin : ro.canAdmin
            }));
            m.setProperty("/roleMatrix", roleRows);

            const dlg = this.byId("roleMatrixDialog");
            const titleCtrl = this.byId("roleMatrixTitle");
            const descCtrl  = this.byId("roleMatrixDesc");
            if (titleCtrl) titleCtrl.setText("Role Access — " + cap.displayName);
            if (descCtrl)  descCtrl.setText(cap.description || "");

            const tbl = this.byId("roleMatrixTable");
            if (tbl) {
                tbl.bindItems({
                    path    : "licenseModel>/roleMatrix",
                    template : new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Text({ text: "{licenseModel>roleLabel}" }),
                            new sap.m.CheckBox({ selected: "{licenseModel>canView}",  select: this.onRoleMatrixChange.bind(this) }),
                            new sap.m.CheckBox({ selected: "{licenseModel>canEdit}",  select: this.onRoleMatrixChange.bind(this) }),
                            new sap.m.CheckBox({ selected: "{licenseModel>canAdmin}", select: this.onRoleMatrixChange.bind(this) })
                        ]
                    })
                });
            }

            dlg.open();
        },

        onRoleMatrixChange: function () {
            // Model binding handles two-way sync automatically — no explicit handler needed
        },

        onSaveRoleMatrix: function () {
            const m        = this.getView().getModel("licenseModel");
            const capCode  = m.getProperty("/currentCapCode");
            const matrix   = m.getProperty("/roleMatrix") || [];
            const all      = m.getProperty("/allCapabilities") || [];
            const capIdx   = all.findIndex(c => c.capabilityCode === capCode);
            if (capIdx >= 0) {
                all[capIdx].roleOverrides = matrix.map(r => ({
                    role    : r.role,
                    roleLabel: r.roleLabel,
                    canView : r.canView,
                    canEdit : r.canEdit,
                    canAdmin: r.canAdmin
                }));
                m.setProperty("/allCapabilities", all);
            }
            this.byId("roleMatrixDialog").close();
            MessageToast.show("Role matrix updated. Click 'Save Capabilities' to persist.");
        },

        onCloseRoleMatrix: function () {
            this.byId("roleMatrixDialog").close();
        },

        // ── New Tenant Dialog ────────────────────────────────────

        onNewTenant: function () {
            this.byId("newTenantDialog").open();
        },

        onCancelNewTenant: function () {
            this.byId("newTenantDialog").close();
        },

        // ── UUID validation helper ───────────────────────────────

        _isValidUUID: function (str) {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || "");
        },

        // Re-resolve the HANA-assigned UUID for a tenant loaded from seed data with a non-UUID ID.
        // Returns a Promise<string|null> with the real UUID.
        _resolveUUID: function (tenant) {
            if (this._isValidUUID(tenant.ID)) return Promise.resolve(tenant.ID);
            // Seed data has non-UUID IDs — re-fetch by tenantCode to get the CAP-assigned UUID
            return fetch(`${BASE}/Tenants?$filter=tenantCode eq '${encodeURIComponent(tenant.tenantCode)}'&$select=ID&$top=1`, { headers: H })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    const row = j.value && j.value[0];
                    return row && this._isValidUUID(row.ID) ? row.ID : null;
                });
        },

        onConfirmNewTenant: function () {
            const code    = this.byId("newTenantCode").getValue().trim();
            const name    = this.byId("newTenantName").getValue().trim();
            const short   = this.byId("newTenantShort").getValue().trim();
            const juris   = this.byId("newTenantJurisdiction").getSelectedKey();
            const status  = this.byId("newTenantLicenseStatus").getSelectedKey() || "ACTIVE";
            const start   = this.byId("newTenantLicenseStart").getValue();
            const end     = this.byId("newTenantLicenseEnd").getValue();
            const email   = this.byId("newTenantEmail").getValue().trim();
            const contact = this.byId("newTenantContact").getValue().trim();
            const preset  = this.byId("newTenantPreset").getSelectedKey() || "STANDARD";

            if (!code || !name) {
                MessageToast.show("Client Code and Organisation Name are required.");
                return;
            }

            fetch(`${BASE}/Tenants`, {
                method : "POST",
                headers: H,
                body   : JSON.stringify({
                    tenantCode      : code,
                    displayName     : name,
                    shortName       : short,
                    jurisdiction    : juris,
                    licenseStatus   : status,
                    licenseStartDate: start || null,
                    licenseEndDate  : end   || null,
                    contactEmail    : email,
                    contactName     : contact,
                    isActive        : true
                })
            })
            .then(r => {
                if (!r.ok) return r.json().then(e => { throw new Error(e.error && e.error.message || "Create failed"); });
                return r.json();
            })
            .then(newTenant => {
                this.byId("newTenantDialog").close();
                MessageToast.show(`Client '${name}' created.`);
                // Apply preset capabilities — use the tenantCode (not ID) to load detail
                // because CAP may assign a new UUID that differs from any seed data IDs
                const tcForLoad = newTenant.tenantCode || code;
                return this._applyPreset(newTenant.ID, preset).then(() => {
                    this._loadTenants().then(() => this._loadTenantDetail(tcForLoad));
                });
            })
            .catch(err => MessageBox.error("Could not create client: " + err.message));
        },

        // ── Apply capability preset to a new tenant ──────────────

        _applyPreset: function (tenantId, preset) {
            const catalog = this.getView().getModel("licenseModel").getProperty("/catalog") || [];

            const presetSets = {
                FULL    : catalog.map(c => c.capabilityCode),
                STANDARD: ["BRIDGE_REGISTRY","RESTRICTIONS","MAP_VIEW","REPORTS",
                            "EXECUTIVE_DASHBOARD","INSPECTIONS","DEFECTS",
                            "MASS_UPLOAD","PERMITS","ROUTE_ASSESSMENT"],
                CORE    : ["BRIDGE_REGISTRY","RESTRICTIONS","MAP_VIEW","REPORTS","EXECUTIVE_DASHBOARD"],
                NONE    : []
            };
            const enabledSet = new Set(presetSets[preset] || []);

            // Default role grants per role
            const defaultGrants = {
                ADMIN         : { canView: true, canEdit: true,  canAdmin: true  },
                BRIDGE_MANAGER: { canView: true, canEdit: true,  canAdmin: false },
                INSPECTOR     : { canView: true, canEdit: false, canAdmin: false },
                OPERATOR      : { canView: true, canEdit: false, canAdmin: false },
                READ_ONLY     : { canView: true, canEdit: false, canAdmin: false }
            };

            const capabilities = catalog.map(cat => ({
                capabilityCode: cat.capabilityCode,
                isEnabled     : cat.isCoreFeature || enabledSet.has(cat.capabilityCode),
                roleOverrides : ALL_ROLES.map(role => ({
                    role    : role,
                    ...(defaultGrants[role] || { canView: false, canEdit: false, canAdmin: false })
                }))
            }));

            return fetch(`${BASE}/assignTenantCapabilities`, {
                method : "POST",
                headers: H,
                body   : JSON.stringify({ tenantId, capabilities })
            })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null);
        },

        // ── Navigation ───────────────────────────────────────────

        onNavBack: function () {
            this._router.navTo("Home");
        }

    }, HelpAssistantMixin));
});
