sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/model/RoleManager"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager, RoleManager) {
    "use strict";
    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.AdminRestrictionTypes", {
        _editId: null,

        onInit: function () {
            this._model = new JSONModel({ items: [] });
            this.getView().setModel(this._model, "restTypes");
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("ADMIN_CONFIG", self.getOwnerComponent().getRouter())) return;
            });
            this.getOwnerComponent().getRouter()
                .getRoute("AdminRestrictionTypes")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._editId = null;
            this._load();
        },

        _load: function () {
            fetch(`${BASE}/RestrictionTypeConfigs?$orderby=sortOrder,code`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._model.setProperty("/items", j.value || []);
                    const t = this.byId("restTypeTableTitle");
                    if (t) t.setText(`Restriction Types (${(j.value||[]).length})`);
                })
                .catch(e => console.error(e));
        },

        onAddRestType: function () {
            this._editId = null;
            this.byId("rtCode").setValue(""); this.byId("rtLabel").setValue("");
            this.byId("rtUnit").setValue(""); this.byId("rtDesc").setValue("");
            this.byId("rtActive").setSelected(true);
            this.byId("rtCode").setEditable(true);
            this.byId("rtSaveBtn").setText("Create");
            this.byId("restTypeDlg").open();
            this._applyRestTypeFieldRBAC();
        },

        _applyRestTypeFieldRBAC: function () {
            try {
                RoleManager.applyFields(this.getView(), [
                    { id: "rtCode",   field: "restrictionType.code" },
                    { id: "rtLabel",  field: "restrictionType.displayLabel" },
                    { id: "rtUnit",   field: "restrictionType.defaultUnit" },
                    { id: "rtDesc",   field: "restrictionType.description" },
                    { id: "rtActive", field: "restrictionType.active" }
                ]);
            } catch (_) { /* RoleManager unavailable — leave defaults */ }
        },

        onEditRestType: function (e) {
            const ctx = e.getSource().getBindingContext("restTypes");
            const row = ctx ? ctx.getObject() : null;
            if (!row) return;
            this._editId = row.ID;
            this.byId("rtCode").setValue(row.code); this.byId("rtCode").setEditable(false);
            this.byId("rtLabel").setValue(row.displayLabel);
            this.byId("rtUnit").setValue(row.defaultUnit || "");
            this.byId("rtDesc").setValue(row.description || "");
            this.byId("rtActive").setSelected(!!row.active);
            this.byId("rtSaveBtn").setText("Save Changes");
            this.byId("restTypeDlg").open();
            this._applyRestTypeFieldRBAC();
        },

        onSaveRestType: function () {
            const code  = this.byId("rtCode").getValue().trim().toUpperCase();
            const label = this.byId("rtLabel").getValue().trim();
            if (!code || !label) { MessageToast.show("Code and Label are required"); return; }

            const body = {
                code, displayLabel: label,
                defaultUnit: this.byId("rtUnit").getValue().trim() || null,
                description: this.byId("rtDesc").getValue().trim() || null,
                active: this.byId("rtActive").getSelected()
            };
            const h = { Accept: "application/json", "Content-Type": "application/json" };

            const url = this._editId ? `${BASE}/RestrictionTypeConfigs(${this._editId})` : `${BASE}/RestrictionTypeConfigs`;
            const method = this._editId ? "PATCH" : "POST";

            fetch(url, { method, headers: h, body: JSON.stringify(body) })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                    MessageToast.show(this._editId ? "Restriction type updated" : "Restriction type created");
                    this.byId("restTypeDlg").close();
                    this._load();
                })
                .catch(err => MessageBox.error("Failed: " + err.message));
        },

        onCancelRestType: function () { this.byId("restTypeDlg").close(); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); }
    });
});
