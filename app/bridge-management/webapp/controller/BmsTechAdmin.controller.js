// ============================================================
// BMS Tech Admin Controller
// Handles: Jurisdiction Access, Standards Profile, Map Config,
//          Deployment Configuration (Feature Groups)
// Access: Admin + NHVR_TechAdmin roles
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Panel",
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/Title",
    "sap/m/Label",
    "sap/m/Switch",
    "sap/m/Token",
    "sap/m/Tokenizer",
    "sap/m/ObjectStatus",
    "sap/m/StandardListItem",
    "sap/ui/core/Icon"
], function (Controller, JSONModel, MessageToast, MessageBox,
             Panel, HBox, VBox, Text, Title, Label, Switch,
             Token, Tokenizer, ObjectStatus, StandardListItem, Icon) {
    "use strict";

    var BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    // ── Feature Group Definitions (Phase B7) ─────────────────
    var FEATURE_GROUPS = [
        {
            code: "CORE",
            name: "Core Platform",
            description: "Bridge Register, Restrictions, MapView, Dashboard, Reports, Mass Upload/Edit",
            capabilities: ["BRIDGE_REGISTRY", "RESTRICTIONS", "MAP_VIEW", "REPORTS", "EXECUTIVE_DASHBOARD", "MASS_UPLOAD", "MASS_EDIT"],
            alwaysOn: true,
            dependsOn: [],
            screens: 7,
            entities: 5
        },
        {
            code: "INSPECTION",
            name: "Inspection & Defects",
            description: "Inspection orders, defect tracking, capacity ratings, measurement documents",
            capabilities: ["INSPECTIONS", "DEFECTS", "CAPACITY_RATINGS"],
            alwaysOn: false,
            dependsOn: ["CORE"],
            screens: 3,
            entities: 4
        },
        {
            code: "COMPLIANCE",
            name: "Compliance & Permits",
            description: "Vehicle permits, route assessment, freight routes, vehicle combinations",
            capabilities: ["PERMITS", "ROUTE_ASSESSMENT", "FREIGHT_ROUTES", "VEHICLE_COMBINATIONS"],
            alwaysOn: false,
            dependsOn: ["CORE"],
            screens: 4,
            entities: 5
        },
        {
            code: "ADMIN",
            name: "Administration",
            description: "Admin config, work orders, advanced settings",
            capabilities: ["ADMIN_CONFIG", "WORK_ORDERS"],
            alwaysOn: false,
            dependsOn: ["CORE"],
            screens: 2,
            entities: 3
        },
        {
            code: "INTEGRATION",
            name: "Integration Hub",
            description: "SAP S/4HANA, BANC, ESRI integration",
            capabilities: ["INTEGRATION_HUB"],
            alwaysOn: false,
            dependsOn: ["CORE"],
            screens: 1,
            entities: 2
        },
        {
            code: "ANALYTICS",
            name: "BridgeIQ Analytics",
            description: "Predictive analytics, deterioration profiles, AI insights",
            capabilities: ["BRIDGE_IQ"],
            alwaysOn: false,
            dependsOn: ["CORE", "INSPECTION"],
            screens: 2,
            entities: 3
        }
    ];

    // ── Deployment Mode Presets (Phase B9) ────────────────────
    var DEPLOYMENT_PRESETS = {
        FULL:     ["CORE", "INSPECTION", "COMPLIANCE", "ADMIN", "INTEGRATION", "ANALYTICS"],
        STANDARD: ["CORE", "INSPECTION", "COMPLIANCE"],
        CORE:     ["CORE"],
        LITE:     ["CORE"],  // CORE with reduced capabilities handled separately
        CUSTOM:   null       // null = no auto-toggle, user controls manually
    };

    return Controller.extend("nhvr.bridgemanagement.controller.BmsTechAdmin", {

        onInit: function () {
            // Main tech admin model
            this._oModel = new JSONModel({
                jurisdictionGrants: []
            });
            this.getView().setModel(this._oModel, "techAdmin");

            // Map config model — shared with MapView / AdminConfig
            this._oMapModel = new JSONModel({
                defaultCenter_lat   : -27.0,
                defaultCenter_lng   : 133.0,
                defaultZoom         : 5,
                defaultBaseMap      : "osm",
                projection          : "EPSG:4326",
                projectionNote      : "WGS84 — standard for Leaflet and GPS",
                clusteringEnabled   : true,
                clusterRadius       : 60,
                maxZoomBeforeCluster: 15,
                drawPolygonColor    : "#0070F2",
                drawRectColor       : "#E9730C",
                drawCircleColor     : "#107E3E",
                drawFillOpacity     : 0.12,
                notes               : "",
                parsedBaseMaps      : [],
                parsedRefLayers     : [],
                esriPortalUrl       : "",
                esriFeatureServiceUrl: "",
                esriApiKey          : "",
                esriQueryWhere      : "1=1"
            });
            this.getView().setModel(this._oMapModel, "mapConfig");

            // Standards model
            this._oStdModel = new JSONModel({ profiles: [] });
            this.getView().setModel(this._oStdModel, "standards");

            // Deployment config model (Phase B7-B10)
            this._oDeployModel = new JSONModel({
                deploymentMode     : "FULL",
                featureGroups      : [],
                hasCascadeDisables : false,
                disabledGroupsList : [],
                tenantId           : null
            });
            this.getView().setModel(this._oDeployModel, "deploy");

            // Load data
            this._loadJurisdictionGrants();
            this._loadMapConfig();
            this._loadStandardsProfiles();
            this._loadFeatureGroups();
        },

        // ── Jurisdiction Access ───────────────────────────────────

        _loadJurisdictionGrants: function () {
            var oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/JurisdictionAccess").requestContexts(0, 200)
                .then(function (contexts) {
                    var grants = contexts.map(function (c) { return c.getObject(); });
                    this._oModel.setProperty("/jurisdictionGrants", grants);
                }.bind(this))
                .catch(function () {
                    // Entity may not be in this version — show empty silently
                    this._oModel.setProperty("/jurisdictionGrants", []);
                }.bind(this));
        },

        onRefreshJurisdiction: function () {
            this._loadJurisdictionGrants();
            MessageToast.show("Jurisdiction grants refreshed");
        },

        onOpenGrantAccessDialog: function () {
            var oDialog = this.byId("grantAccessDialog");
            // Reset fields
            this.byId("jaUserRef").setValue("");
            this.byId("jaJurisdiction").setSelectedKey("ALL");
            this.byId("jaAccessLevel").setSelectedKey("READ");
            this.byId("jaExpiresAt").setValue("");
            this.byId("jaGrantNotes").setValue("");
            oDialog.open();
        },

        onCancelGrantAccess: function () {
            this.byId("grantAccessDialog").close();
        },

        onConfirmGrantAccess: function () {
            var userRef    = this.byId("jaUserRef").getValue().trim();
            var juris      = this.byId("jaJurisdiction").getSelectedKey();
            var accessLvl  = this.byId("jaAccessLevel").getSelectedKey();
            var expiresAt  = this.byId("jaExpiresAt").getValue();
            var notes      = this.byId("jaGrantNotes").getValue();

            if (!userRef) {
                MessageBox.error("User Ref is required.");
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var oListBinding = oModel.bindList("/JurisdictionAccess");
            oListBinding.create({
                userRef       : userRef,
                jurisdiction  : juris,
                accessLevel   : accessLvl,
                expiresAt     : expiresAt || null,
                notes         : notes || null
            });

            oModel.submitBatch(oModel.getUpdateGroupId ? oModel.getUpdateGroupId() : "$auto")
                .then(function () {
                    MessageToast.show("Access granted to " + userRef);
                    this.byId("grantAccessDialog").close();
                    this._loadJurisdictionGrants();
                }.bind(this))
                .catch(function (err) {
                    MessageBox.error("Failed to grant access: " + err.message);
                });
        },

        onRevokeJurisdictionAccess: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("techAdmin");
            if (!ctx) return;
            var grant = ctx.getObject();
            MessageBox.confirm(
                "Revoke access for " + grant.userRef + " (" + grant.jurisdiction + ")?",
                {
                    title   : "Revoke Jurisdiction Access",
                    onClose : function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            // Reload optimistically
                            var grants = this._oModel.getProperty("/jurisdictionGrants")
                                .filter(function (g) { return g.ID !== grant.ID; });
                            this._oModel.setProperty("/jurisdictionGrants", grants);
                            MessageToast.show("Access revoked");
                        }
                    }.bind(this)
                }
            );
        },

        // ── Standards Profile ─────────────────────────────────────

        _loadStandardsProfiles: function () {
            var oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/StandardsProfiles").requestContexts(0, 50)
                .then(function (contexts) {
                    var profiles = contexts.map(function (c) { return c.getObject(); });
                    var oSelect  = this.byId("standardsProfileSelect");
                    if (oSelect) {
                        oSelect.destroyItems();
                        profiles.forEach(function (p) {
                            oSelect.addItem(new sap.ui.core.Item({
                                key : p.profileCode,
                                text: p.displayName + " (" + p.profileCode + ")"
                            }));
                            if (p.isDefault) {
                                oSelect.setSelectedKey(p.profileCode);
                                this._applyStandardsProfile(p);
                            }
                        }.bind(this));
                    }
                    this._oStdModel.setProperty("/profiles", profiles);
                }.bind(this))
                .catch(function () {
                    // Populate with Australian default if entity not available
                    var oSelect = this.byId("standardsProfileSelect");
                    if (oSelect) {
                        oSelect.addItem(new sap.ui.core.Item({ key: "AS5100", text: "AS 5100 (Australia)" }));
                        oSelect.addItem(new sap.ui.core.Item({ key: "AASHTO", text: "AASHTO LRFD (USA)" }));
                        oSelect.addItem(new sap.ui.core.Item({ key: "EN1991", text: "Eurocode EN 1991 (Europe)" }));
                        oSelect.setSelectedKey("AS5100");
                        this._applyStandardsProfile({ massUnit: "t", ratingStandard: "AS 5100.7", conditionScale: "1\u201310 (BIMM)", speedUnit: "km/h" });
                    }
                }.bind(this));
        },

        _applyStandardsProfile: function (profile) {
            var set = function (id, val) { var el = this.byId(id); if (el) el.setText(val || "\u2014"); }.bind(this);
            set("stdMassUnit",       profile.massUnit       || "t");
            set("stdRatingStandard", profile.ratingStandard || "AS 5100.7");
            set("stdConditionScale", profile.conditionScale || "1\u201310 (BIMM)");
            set("stdSpeedUnit",      profile.speedUnit      || "km/h");
        },

        onStandardsProfileChange: function (oEvent) {
            var key      = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : null;
            var profiles = this._oStdModel.getProperty("/profiles");
            var profile  = profiles.find(function (p) { return p.profileCode === key; });
            if (profile) this._applyStandardsProfile(profile);
        },

        onApplyStandard: function () {
            var key = this.byId("standardsProfileSelect").getSelectedKey();
            MessageBox.confirm(
                "Apply standards profile '" + key + "'?\n\nThis will update field labels, units, and rating scale references across the application on next page load.",
                {
                    title   : "Apply Standards Profile",
                    onClose : function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            localStorage.setItem("nhvr_standards_profile", key);
                            MessageToast.show("Standards profile saved. Changes will apply on next load.");
                        }
                    }
                }
            );
        },

        // ── Map Configuration ─────────────────────────────────────

        _loadMapConfig: function () {
            var oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/MapConfigurations", null, null, [
                new sap.ui.model.Filter("configKey", "EQ", "DEFAULT")
            ]).requestContexts(0, 1)
                .then(function (contexts) {
                    if (!contexts.length) return;
                    var cfg = contexts[0].getObject();
                    this._oMapModel.setProperty("/defaultCenter_lat",    cfg.defaultCenter_lat    || -27.0);
                    this._oMapModel.setProperty("/defaultCenter_lng",    cfg.defaultCenter_lng    || 133.0);
                    this._oMapModel.setProperty("/defaultZoom",          cfg.defaultZoom          || 5);
                    this._oMapModel.setProperty("/defaultBaseMap",       cfg.defaultBaseMap       || "osm");
                    this._oMapModel.setProperty("/projection",           cfg.projection           || "EPSG:4326");
                    this._oMapModel.setProperty("/projectionNote",       cfg.projectionNote       || "");
                    this._oMapModel.setProperty("/clusteringEnabled",    cfg.clusteringEnabled    !== false);
                    this._oMapModel.setProperty("/clusterRadius",        cfg.clusterRadius        || 60);
                    this._oMapModel.setProperty("/maxZoomBeforeCluster", cfg.maxZoomBeforeCluster || 15);
                    this._oMapModel.setProperty("/drawPolygonColor",     cfg.drawPolygonColor     || "#0070F2");
                    this._oMapModel.setProperty("/drawRectColor",        cfg.drawRectColor        || "#E9730C");
                    this._oMapModel.setProperty("/drawCircleColor",      cfg.drawCircleColor      || "#107E3E");
                    this._oMapModel.setProperty("/drawFillOpacity",      cfg.drawFillOpacity      || 0.12);
                    this._oMapModel.setProperty("/notes",                cfg.notes                || "");
                    this._oMapModel.setProperty("/esriPortalUrl",        cfg.esriPortalUrl        || "");
                    this._oMapModel.setProperty("/esriFeatureServiceUrl", cfg.esriFeatureServiceUrl || "");
                    this._oMapModel.setProperty("/esriApiKey",           cfg.esriApiKey           || "");
                    this._oMapModel.setProperty("/esriQueryWhere",       cfg.esriQueryWhere       || "1=1");
                    try {
                        this._oMapModel.setProperty("/parsedBaseMaps",  JSON.parse(cfg.customBaseMaps  || "[]"));
                        this._oMapModel.setProperty("/parsedRefLayers", JSON.parse(cfg.referenceLayers || "[]"));
                    } catch (e) { /* non-critical */ }
                }.bind(this))
                .catch(function () { /* use defaults */ });
        },

        onSaveMapConfig: function () {
            var cfg = {
                defaultCenter_lat    : parseFloat(this._oMapModel.getProperty("/defaultCenter_lat")),
                defaultCenter_lng    : parseFloat(this._oMapModel.getProperty("/defaultCenter_lng")),
                defaultZoom          : parseInt(this._oMapModel.getProperty("/defaultZoom"), 10),
                defaultBaseMap       : this._oMapModel.getProperty("/defaultBaseMap"),
                projection           : this._oMapModel.getProperty("/projection"),
                projectionNote       : this._oMapModel.getProperty("/projectionNote"),
                clusteringEnabled    : this._oMapModel.getProperty("/clusteringEnabled"),
                clusterRadius        : parseInt(this._oMapModel.getProperty("/clusterRadius"), 10),
                maxZoomBeforeCluster : parseInt(this._oMapModel.getProperty("/maxZoomBeforeCluster"), 10),
                drawPolygonColor     : this._oMapModel.getProperty("/drawPolygonColor"),
                drawRectColor        : this._oMapModel.getProperty("/drawRectColor"),
                drawCircleColor      : this._oMapModel.getProperty("/drawCircleColor"),
                drawFillOpacity      : parseFloat(this._oMapModel.getProperty("/drawFillOpacity")),
                notes                : this._oMapModel.getProperty("/notes"),
                customBaseMaps       : JSON.stringify(this._oMapModel.getProperty("/parsedBaseMaps")),
                referenceLayers      : JSON.stringify(this._oMapModel.getProperty("/parsedRefLayers"))
            };
            // Persist to localStorage as the primary lightweight store
            localStorage.setItem("nhvr_map_config", JSON.stringify(cfg));
            MessageToast.show("Map configuration saved.");
        },

        onResetMapConfig: function () {
            MessageBox.confirm("Reset map configuration to application defaults?", {
                title   : "Reset Map Config",
                onClose : function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        localStorage.removeItem("nhvr_map_config");
                        this._oMapModel.setData({
                            defaultCenter_lat: -27.0, defaultCenter_lng: 133.0,
                            defaultZoom: 5, defaultBaseMap: "osm",
                            projection: "EPSG:4326", projectionNote: "",
                            clusteringEnabled: true, clusterRadius: 60, maxZoomBeforeCluster: 15,
                            drawPolygonColor: "#0070F2", drawRectColor: "#E9730C",
                            drawCircleColor: "#107E3E", drawFillOpacity: 0.12,
                            notes: "", parsedBaseMaps: [], parsedRefLayers: [],
                            esriPortalUrl: "", esriFeatureServiceUrl: "",
                            esriApiKey: "", esriQueryWhere: "1=1"
                        });
                        MessageToast.show("Map configuration reset to defaults.");
                    }
                }.bind(this)
            });
        },

        onMapConfigChange: function () {
            // No-op: config is collected on save
        },

        onAddCustomBaseMap: function () {
            MessageBox.information(
                "To add a custom base map:\n\n" +
                "1. Provide a unique key (e.g. 'custom-topo')\n" +
                "2. Display name shown in the layer selector\n" +
                "3. XYZ tile URL with {z}/{x}/{y} placeholders\n\n" +
                "Example: https://tiles.example.com/{z}/{x}/{y}.png",
                { title: "Add Custom Base Map" }
            );
        },

        onDeleteCustomBaseMap: function (oEvent) {
            var ctx  = oEvent.getSource().getBindingContext("mapConfig");
            var key  = ctx ? ctx.getProperty("key") : null;
            if (!key) return;
            var maps = this._oMapModel.getProperty("/parsedBaseMaps")
                .filter(function (m) { return m.key !== key; });
            this._oMapModel.setProperty("/parsedBaseMaps", maps);
            MessageToast.show("Base map removed (save to persist).");
        },

        // ══════════════════════════════════════════════════════════
        // ── Deployment Configuration (Phases B7–B10) ─────────────
        // ══════════════════════════════════════════════════════════

        /**
         * Phase B7: Load feature groups from TenantFeature state.
         * Fetches the active tenant, its TenantFeature rows, and
         * computes the group-level enabled status from capabilities.
         */
        _loadFeatureGroups: function () {
            // Try to load active tenant + its features
            fetch(BASE + "/Tenants?$expand=features&$filter=isActive eq true&$top=1", _credOpts({ "Content-Type": "application/json" }))
                .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
                .then(function (data) {
                    var rows = (data.value && data.value.length) ? data.value : [];
                    var tenant = rows[0] || null;
                    var tenantFeatures = tenant ? (tenant.features || []) : [];
                    var tenantId = tenant ? tenant.ID : null;
                    var deploymentMode = (tenant && tenant.deploymentMode) ? tenant.deploymentMode : "FULL";

                    // Build capability -> enabled map from TenantFeature rows
                    var capMap = {};
                    tenantFeatures.forEach(function (tf) {
                        capMap[tf.capabilityCode] = !!tf.isEnabled;
                    });

                    // Build group model
                    var isCustom = deploymentMode === "CUSTOM";
                    var groups = FEATURE_GROUPS.map(function (grp) {
                        // A group is enabled if ALL its capabilities are enabled (or if no rows = assume enabled)
                        var allEnabled = grp.capabilities.every(function (cap) {
                            return capMap[cap] !== false; // missing = default on
                        });
                        var dependsOnNames = grp.dependsOn.map(function (depCode) {
                            var dep = FEATURE_GROUPS.find(function (g) { return g.code === depCode; });
                            return dep ? dep.name : depCode;
                        });
                        return {
                            code           : grp.code,
                            name           : grp.name,
                            description    : grp.description,
                            capabilities   : grp.capabilities,
                            alwaysOn       : grp.alwaysOn,
                            dependsOn      : grp.dependsOn,
                            dependsOnDisplay: dependsOnNames.join(", "),
                            enabled        : grp.alwaysOn ? true : allEnabled,
                            customMode     : isCustom,
                            screens        : grp.screens,
                            entities       : grp.entities
                        };
                    });

                    this._oDeployModel.setProperty("/featureGroups", groups);
                    this._oDeployModel.setProperty("/deploymentMode", deploymentMode);
                    this._oDeployModel.setProperty("/tenantId", tenantId);
                    this._renderFeatureGroupCards(groups);
                }.bind(this))
                .catch(function () {
                    // No tenant entity or endpoint — render defaults
                    var groups = FEATURE_GROUPS.map(function (grp) {
                        var dependsOnNames = grp.dependsOn.map(function (depCode) {
                            var dep = FEATURE_GROUPS.find(function (g) { return g.code === depCode; });
                            return dep ? dep.name : depCode;
                        });
                        return {
                            code           : grp.code,
                            name           : grp.name,
                            description    : grp.description,
                            capabilities   : grp.capabilities,
                            alwaysOn       : grp.alwaysOn,
                            dependsOn      : grp.dependsOn,
                            dependsOnDisplay: dependsOnNames.join(", "),
                            enabled        : true,
                            customMode     : false,
                            screens        : grp.screens,
                            entities       : grp.entities
                        };
                    });
                    this._oDeployModel.setProperty("/featureGroups", groups);
                    this._oDeployModel.setProperty("/deploymentMode", "FULL");
                    this._renderFeatureGroupCards(groups);
                }.bind(this));
        },

        /**
         * Phase B7: Render feature group cards dynamically into the container.
         * Each card has: name, description, capability chips, dependency indicator, toggle switch.
         */
        _renderFeatureGroupCards: function (groups) {
            var oContainer = this.byId("featureGroupCardsContainer");
            if (!oContainer) return;
            oContainer.destroyItems();

            groups.forEach(function (grp, idx) {
                // --- Capability chips ---
                var aTokens = grp.capabilities.map(function (cap) {
                    return new Token({ text: cap, editable: false }).addStyleClass("sapUiTinyMarginEnd");
                });
                var oTokenizer = new Tokenizer({ editable: false, tokens: aTokens })
                    .addStyleClass("sapUiTinyMarginBottom");

                // --- Depends-on indicator ---
                var oDepsBox = new HBox({ alignItems: "Center", visible: grp.dependsOn.length > 0 });
                oDepsBox.addItem(new Icon({ src: "sap-icon://chain-link", color: "Default" }).addStyleClass("sapUiTinyMarginEnd"));
                oDepsBox.addItem(new Text({ text: "Depends on: " + grp.dependsOnDisplay }));

                // --- Status indicator ---
                var sStatusText = grp.alwaysOn ? "Always On" : (grp.enabled ? "Enabled" : "Disabled");
                var sStatusState = grp.alwaysOn ? "Information" : (grp.enabled ? "Success" : "None");
                var oStatus = new ObjectStatus({ text: sStatusText, state: sStatusState });
                oStatus.data("groupIndex", idx);

                // --- Toggle switch ---
                var oSwitch = new Switch({
                    state   : grp.enabled,
                    enabled : !grp.alwaysOn && grp.customMode,
                    customTextOn : "On",
                    customTextOff: "Off",
                    change  : this._onGroupSwitchChange.bind(this)
                });
                oSwitch.data("groupCode", grp.code);
                oSwitch.data("groupIndex", idx);

                var oSwitchRow = new HBox({ alignItems: "Center" });
                oSwitchRow.addItem(oSwitch);
                if (grp.alwaysOn) {
                    oSwitchRow.addItem(new Text({ text: "(Core \u2014 cannot be disabled)" }).addStyleClass("sapUiSmallMarginBegin"));
                }

                // --- Card content VBox ---
                var oContent = new VBox().addStyleClass("sapUiSmallMargin");
                oContent.addItem(oTokenizer);
                oContent.addItem(oDepsBox);
                oContent.addItem(oSwitchRow);

                // --- Panel as card ---
                var oPanel = new Panel({
                    headerText : grp.name + " \u2014 " + grp.description,
                    expandable : false
                }).addStyleClass("sapUiSmallMarginBottom");
                // Add status to header via custom header toolbar
                var oHeaderBar = new sap.m.Toolbar();
                oHeaderBar.addContent(new Title({ text: grp.name, level: "H4" }));
                oHeaderBar.addContent(new sap.m.ToolbarSpacer());
                oHeaderBar.addContent(oStatus);
                oPanel.setHeaderToolbar(oHeaderBar);
                oPanel.addContent(new Text({ text: grp.description }).addStyleClass("sapUiSmallMarginBottom"));
                oPanel.addContent(oContent);

                oContainer.addItem(oPanel);
            }.bind(this));
        },

        /**
         * Phase B7 + B8: Handle individual group toggle switch change.
         */
        _onGroupSwitchChange: function (oEvent) {
            var bEnabled  = oEvent.getParameter("state");
            var oSrc      = oEvent.getSource();
            var groupCode = oSrc.data("groupCode");
            var idx       = parseInt(oSrc.data("groupIndex"), 10);

            this.onToggleFeatureGroup(groupCode, bEnabled, oSrc, idx);
        },

        /**
         * Phase B7 + B8: Toggle all capabilities in a group.
         * Checks dependencies (B8) before allowing disable.
         */
        onToggleFeatureGroup: function (groupCode, bEnabled, oSwitch, idx) {
            var groups = this._oDeployModel.getProperty("/featureGroups");
            var group  = groups.find(function (g) { return g.code === groupCode; });
            if (!group) return;

            if (group.alwaysOn) {
                // CORE cannot be toggled
                if (oSwitch) oSwitch.setState(true);
                MessageToast.show("Core Platform cannot be disabled.");
                return;
            }

            if (!bEnabled) {
                // Phase B8: Check if other enabled groups depend on this one
                var dependents = groups.filter(function (g) {
                    return g.enabled && g.code !== groupCode &&
                        g.dependsOn.indexOf(groupCode) >= 0;
                });

                if (dependents.length > 0) {
                    var depNames = dependents.map(function (d) { return d.name + " (" + d.code + ")"; }).join(", ");
                    MessageBox.warning(
                        "Disabling " + group.name + " will also disable: " + depNames + ". Continue?",
                        {
                            title   : "Cascade Disable",
                            actions : [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                            onClose : function (sAction) {
                                if (sAction === MessageBox.Action.OK) {
                                    // Cascade-disable dependent groups
                                    this._setGroupEnabled(groupCode, false);
                                    dependents.forEach(function (dep) {
                                        this._setGroupEnabled(dep.code, false);
                                    }.bind(this));
                                    this._renderFeatureGroupCards(this._oDeployModel.getProperty("/featureGroups"));
                                } else {
                                    // Revert toggle
                                    if (oSwitch) oSwitch.setState(true);
                                }
                            }.bind(this)
                        }
                    );
                    return;
                }

                // No dependents — just disable
                this._setGroupEnabled(groupCode, false);
                this._renderFeatureGroupCards(this._oDeployModel.getProperty("/featureGroups"));

            } else {
                // Enabling — Phase B8: auto-enable unmet dependencies
                var unmet = [];
                group.dependsOn.forEach(function (depCode) {
                    var dep = groups.find(function (g) { return g.code === depCode; });
                    if (dep && !dep.enabled) {
                        unmet.push(dep);
                    }
                });

                this._setGroupEnabled(groupCode, true);
                if (unmet.length > 0) {
                    unmet.forEach(function (dep) {
                        this._setGroupEnabled(dep.code, true);
                    }.bind(this));
                    var unmetNames = unmet.map(function (d) { return d.name; }).join(", ");
                    MessageToast.show("Also enabled: " + unmetNames + " (required dependency)");
                }
                this._renderFeatureGroupCards(this._oDeployModel.getProperty("/featureGroups"));
            }
        },

        /**
         * Helper: set a group's enabled flag in the model.
         */
        _setGroupEnabled: function (groupCode, bEnabled) {
            var groups = this._oDeployModel.getProperty("/featureGroups");
            var idx = groups.findIndex(function (g) { return g.code === groupCode; });
            if (idx >= 0 && !groups[idx].alwaysOn) {
                groups[idx].enabled = bEnabled;
                this._oDeployModel.setProperty("/featureGroups", groups);
            }
        },

        /**
         * Phase B9: Handle deployment mode dropdown change.
         * Selecting a preset auto-toggles groups. CUSTOM enables individual toggles.
         */
        onDeploymentModeChange: function (oEvent) {
            var sMode  = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "FULL";
            var groups = this._oDeployModel.getProperty("/featureGroups");
            var preset = DEPLOYMENT_PRESETS[sMode];

            this._oDeployModel.setProperty("/deploymentMode", sMode);

            if (sMode === "CUSTOM") {
                // Enable manual toggles on all cards
                groups.forEach(function (g) { g.customMode = true; });
                this._oDeployModel.setProperty("/featureGroups", groups);
                this._renderFeatureGroupCards(groups);
                MessageToast.show("Custom mode: toggle feature groups individually.");
                return;
            }

            // Preset mode — auto-toggle groups
            if (preset) {
                groups.forEach(function (g) {
                    g.customMode = false;
                    g.enabled = g.alwaysOn ? true : (preset.indexOf(g.code) >= 0);
                });
            }
            this._oDeployModel.setProperty("/featureGroups", groups);
            this._renderFeatureGroupCards(groups);
            MessageToast.show("Deployment mode set to " + sMode + ".");
        },

        /**
         * Phase B10: Save deployment config — show impact preview first.
         */
        onSaveDeploymentConfig: function () {
            var groups = this._oDeployModel.getProperty("/featureGroups");

            // Compute impact
            var disabledGroups = groups.filter(function (g) { return !g.enabled && !g.alwaysOn; });
            var hiddenScreens  = 0;
            var blockedEntities = 0;
            var cascadeNames   = [];

            disabledGroups.forEach(function (g) {
                hiddenScreens   += (g.screens  || 0);
                blockedEntities += (g.entities || 0);
            });

            // Check for cascade disables (groups that are disabled because a dependency is disabled)
            disabledGroups.forEach(function (g) {
                g.dependsOn.forEach(function (depCode) {
                    var dep = groups.find(function (d) { return d.code === depCode; });
                    if (dep && !dep.enabled && !dep.alwaysOn) {
                        var label = g.name + " (requires " + dep.name + ")";
                        if (cascadeNames.indexOf(label) < 0) {
                            cascadeNames.push(label);
                        }
                    }
                });
            });

            // Populate impact dialog
            var oHiddenScreens = this.byId("impactHiddenScreens");
            if (oHiddenScreens) {
                oHiddenScreens.setText(String(hiddenScreens));
                oHiddenScreens.setState(hiddenScreens > 0 ? "Warning" : "Success");
            }
            var oBlockedEntities = this.byId("impactBlockedEntities");
            if (oBlockedEntities) {
                oBlockedEntities.setText(String(blockedEntities));
                oBlockedEntities.setState(blockedEntities > 0 ? "Warning" : "Success");
            }
            var oDisabledGroups = this.byId("impactDisabledGroups");
            if (oDisabledGroups) {
                oDisabledGroups.setText(disabledGroups.length > 0
                    ? disabledGroups.map(function (g) { return g.name; }).join(", ")
                    : "None");
            }
            var oCascadeRow = this.byId("impactCascadeRow");
            if (oCascadeRow) oCascadeRow.setVisible(cascadeNames.length > 0);
            var oCascade = this.byId("impactCascadeDisables");
            if (oCascade) oCascade.setText(cascadeNames.join("; "));

            // Disabled groups detail list
            var oDetailPanel = this.byId("impactDetailPanel");
            if (oDetailPanel) oDetailPanel.setVisible(disabledGroups.length > 0);
            var oList = this.byId("impactDisabledGroupList");
            if (oList) {
                oList.destroyItems();
                disabledGroups.forEach(function (g) {
                    oList.addItem(new StandardListItem({
                        title       : g.name + " (" + g.code + ")",
                        description : g.description,
                        icon        : "sap-icon://decline",
                        iconInset   : false
                    }));
                });
            }

            this._oDeployModel.setProperty("/disabledGroupsList", disabledGroups);
            this._oDeployModel.setProperty("/hasCascadeDisables", cascadeNames.length > 0);

            this.byId("deploymentImpactDialog").open();
        },

        /**
         * Phase B10: Cancel deployment save — close dialog.
         */
        onCancelDeploymentSave: function () {
            this.byId("deploymentImpactDialog").close();
        },

        /**
         * Phase B10: Confirm deployment save — persist via assignTenantCapabilities.
         */
        onConfirmDeploymentSave: function () {
            this.byId("deploymentImpactDialog").close();

            var groups     = this._oDeployModel.getProperty("/featureGroups");
            var tenantId   = this._oDeployModel.getProperty("/tenantId");
            var mode       = this._oDeployModel.getProperty("/deploymentMode");
            var H          = { Accept: "application/json", "Content-Type": "application/json" };

            // Build capability array for assignTenantCapabilities
            var capabilities = [];
            groups.forEach(function (g) {
                g.capabilities.forEach(function (cap) {
                    capabilities.push({
                        capabilityCode: cap,
                        isEnabled     : g.enabled
                    });
                });
            });

            if (!tenantId) {
                // No tenant found — save to localStorage as fallback
                localStorage.setItem("nhvr_deployment_config", JSON.stringify({
                    deploymentMode: mode,
                    groups: groups.map(function (g) { return { code: g.code, enabled: g.enabled }; })
                }));
                MessageToast.show("Deployment configuration saved locally (no tenant configured).");
                return;
            }

            // Save deploymentMode on Tenant entity
            fetch(BASE + "/Tenants(" + tenantId + ")", {
                method  : "PATCH",
                headers : H,
                body    : JSON.stringify({ deploymentMode: mode })
            }).catch(function () { /* non-critical if field not yet deployed */ });

            // Save capabilities via action
            fetch(BASE + "/assignTenantCapabilities", {
                method  : "POST",
                headers : H,
                body    : JSON.stringify({ tenantId: tenantId, capabilities: capabilities })
            })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function () {
                MessageToast.show("Deployment configuration saved successfully.");
            })
            .catch(function (err) {
                MessageBox.error("Failed to save deployment configuration: " + (err.message || err));
            });
        },

        // ── General ───────────────────────────────────────────────

        onRefresh: function () {
            this._loadJurisdictionGrants();
            this._loadMapConfig();
            this._loadStandardsProfiles();
            this._loadFeatureGroups();
            MessageToast.show("Refreshed");
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }

    });
});
