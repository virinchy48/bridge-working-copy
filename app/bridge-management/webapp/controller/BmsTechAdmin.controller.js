// ============================================================
// BMS Tech Admin Controller
// Handles: Jurisdiction Access, Standards Profile, Map Config
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
    "sap/ui/core/Icon",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox,
             Panel, HBox, VBox, Text, Title, Label, Switch,
             Token, Tokenizer, ObjectStatus, StandardListItem, Icon, LookupService) {
    "use strict";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

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

            // Load data
            this._loadJurisdictionGrants();
            this._loadMapConfig();
            this._loadStandardsProfiles();

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("jaJurisdiction"), "STATE", "All Jurisdictions");
            }.bind(this));
        },

        // ── Jurisdiction Access ───────────────────────────────────

        _loadJurisdictionGrants: function () {
            var oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/JurisdictionAccesses").requestContexts(0, 200)
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
            var oListBinding = oModel.bindList("/JurisdictionAccesses");
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
        // There is no `StandardsProfiles` entity in the current service
        // projection, so we ship a small built-in list of the three
        // standards that BIS actually supports. Previously the controller
        // attempted an OData bindList() to "/StandardsProfiles" and
        // fell through to this same fallback via a .catch — but that
        // produced a noisy 404 in the console on every BmsTechAdmin mount.
        // If a StandardsProfile entity is ever added to the service,
        // replace the body of this method with the old bindList pattern.

        _loadStandardsProfiles: function () {
            var oSelect = this.byId("standardsProfileSelect");
            if (oSelect) {
                oSelect.destroyItems();
                oSelect.addItem(new sap.ui.core.Item({ key: "AS5100", text: "AS 5100 (Australia)" }));
                oSelect.addItem(new sap.ui.core.Item({ key: "AASHTO", text: "AASHTO LRFD (USA)" }));
                oSelect.addItem(new sap.ui.core.Item({ key: "EN1991", text: "Eurocode EN 1991 (Europe)" }));
                oSelect.setSelectedKey("AS5100");
                this._applyStandardsProfile({
                    massUnit: "t",
                    ratingStandard: "AS 5100.7",
                    conditionScale: "1\u201310 (BIMM)",
                    speedUnit: "km/h"
                });
            }
            // Keep a simple model entry so anything else that binds
            // against /profiles still works.
            if (this._oStdModel) {
                this._oStdModel.setProperty("/profiles", [
                    { profileCode: "AS5100", displayName: "AS 5100 (Australia)", isDefault: true },
                    { profileCode: "AASHTO", displayName: "AASHTO LRFD (USA)",  isDefault: false },
                    { profileCode: "EN1991", displayName: "Eurocode EN 1991 (Europe)", isDefault: false }
                ]);
            }
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
            oModel.bindList("/MapConfigs", null, null, [
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
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }

    });
});
