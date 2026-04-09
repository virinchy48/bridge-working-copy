// ============================================================
// NHVR Admin — Vehicle Type Register Controller
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/model/RoleManager"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager, RoleManager) {
    "use strict";

    var BASE = "/bridge-management/";

    var _IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    function authFetch(url, opts) {
        opts = Object.assign({}, opts);
        if (_IS_LOCAL) {
            opts.headers = Object.assign(
                { "Authorization": "Basic " + btoa("admin:admin"), "Content-Type": "application/json" },
                opts.headers || {}
            );
        } else {
            opts.credentials = "include";
            opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
        }
        return fetch(url, opts);
    }

    return Controller.extend("nhvr.bridgemanagement.controller.AdminVehicleTypes", {

        onInit: function () {
            this._allVT    = [];
            this._editMode = "CREATE";
            this._editRecord = null;

            // vtModel is an array at root — bound as {vtModel>/}
            this.getView().setModel(new JSONModel([]), "vtModel");
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("ADMIN_CONFIG", self.getOwnerComponent().getRouter())) return;
            });
            this.getOwnerComponent().getRouter()
                .getRoute("AdminVehicleTypes")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._allVT     = [];
            this._editMode  = "CREATE";
            this._editRecord = null;
            this._loadVehicleTypes();
        },

        // ── Load ──────────────────────────────────────────────────────────────

        _loadVehicleTypes: function () {
            authFetch(BASE + "VehicleTypes?$orderby=vehicleCategory,code")
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    this._allVT = data.value || [];
                    this._applyFilter();
                }.bind(this))
                .catch(function (err) {
                    MessageBox.error("Failed to load Vehicle Types: " + err.message);
                });
        },

        // ── Filtering ─────────────────────────────────────────────────────────

        onVTSearch: function () { this._applyFilter(); },
        onVTFilter: function () { this._applyFilter(); },

        onVTClearFilters: function () {
            var oView = this.getView();
            oView.byId("vtSearch").setValue("");
            oView.byId("vtCatFilter").setSelectedKey("");
            oView.byId("vtClassFilter").setSelectedKey("");
            oView.byId("vtPermitFilter").setSelected(false);
            oView.byId("vtActiveFilter").setSelected(false);
            this._applyFilter();
        },

        _applyFilter: function () {
            var oView   = this.getView();
            var sSearch = (oView.byId("vtSearch").getValue() || "").toLowerCase();
            var sCat    = oView.byId("vtCatFilter").getSelectedKey();
            var sCls    = oView.byId("vtClassFilter").getSelectedKey();
            var bPermit = oView.byId("vtPermitFilter").getSelected();
            var bActive = oView.byId("vtActiveFilter").getSelected();

            var filtered = this._allVT.filter(function (vt) {
                if (sSearch && !(
                    (vt.displayName    || "").toLowerCase().includes(sSearch) ||
                    (vt.code           || "").toLowerCase().includes(sSearch) ||
                    (vt.vehicleTypeId  || "").toLowerCase().includes(sSearch) ||
                    (vt.nhvrClass      || "").toLowerCase().includes(sSearch)
                )) { return false; }
                if (sCat    && vt.vehicleCategory !== sCat)  { return false; }
                if (sCls    && vt.nhvrClass !== sCls)        { return false; }
                if (bPermit && !vt.permitRequired)           { return false; }
                if (bActive && !vt.active)                   { return false; }
                return true;
            });

            this.getView().getModel("vtModel").setData(filtered);

            // Update title
            var oTitle = oView.byId("vtTableTitle");
            if (oTitle) { oTitle.setText("Vehicle Types (" + filtered.length + ")"); }
        },

        // ── Add / Edit Dialog ─────────────────────────────────────────────────

        onAddVehicleType: function () {
            this._editMode   = "CREATE";
            this._editRecord = null;
            this._populateDialog({
                vehicleTypeId: "", code: "", displayName: "",
                vehicleCategory: "GENERAL_ACCESS", nhvrClass: "",
                hvnlSection: "", active: true, permitClass: "",
                permitRequired: false, description: "", industryUseCase: "", nhvrRef: "",
                maxGVM_t: "", maxGCM_t: "", steerAxleMax_t: "", driveAxleGroupMax_t: "",
                trailerAxleGroupMax_t: "", axleGroupConfig: "", numberOfAxles: "",
                axleSpacingMin_m: "1.2", tyrePressureMax_kPa: "830",
                maxHeight_m: "4.3", maxWidth_m: "2.5", maxLength_m: "",
                maxOverhang_m: "3.7", turningRadiusMin_m: "", requiresEscort: false,
                escortConfig: "", suspensionType: "STEEL_LEAF",
                dynamicFactor: "", maxOperatingSpeed_kmh: "110"
            });
            this.getView().byId("vtDialog").setTitle("Add Vehicle Type").open();
            this._applyVehicleTypeFieldRBAC();
        },

        // Field-level RBAC for Vehicle Type Add/Edit dialog.
        _applyVehicleTypeFieldRBAC: function () {
            try {
                RoleManager.applyFields(this.getView(), [
                    { id: "vtfId",            field: "vehicleType.vehicleTypeId" },
                    { id: "vtfCode",          field: "vehicleType.code" },
                    { id: "vtfName",          field: "vehicleType.displayName" },
                    { id: "vtfCategory",      field: "vehicleType.category" },
                    { id: "vtfNhvrClass",     field: "vehicleType.nhvrClass" },
                    { id: "vtfPermitClass",   field: "vehicleType.permitClass" },
                    { id: "vtfPermitRequired",field: "vehicleType.permitRequired" },
                    { id: "vtfGVM",           field: "vehicleType.maxGVM_t" },
                    { id: "vtfGCM",           field: "vehicleType.maxGCM_t" },
                    { id: "vtfHeight",        field: "vehicleType.maxHeight_m" },
                    { id: "vtfWidth",         field: "vehicleType.maxWidth_m" },
                    { id: "vtfLength",        field: "vehicleType.maxLength_m" }
                ]);
            } catch (_) { /* RoleManager unavailable — leave defaults */ }
        },

        onEditVT: function (oEvent) {
            var oCtx  = oEvent.getSource().getBindingContext("vtModel");
            var oData = oCtx ? this.getView().getModel("vtModel").getProperty(oCtx.getPath()) : null;
            if (!oData) { MessageToast.show("Select a row to edit."); return; }
            this._editMode   = "EDIT";
            this._editRecord = oData;
            this._populateDialog(oData);
            this.getView().byId("vtDialog").setTitle("Edit — " + oData.displayName).open();
            this._applyVehicleTypeFieldRBAC();
        },

        onCloneVT: function (oEvent) {
            var oCtx  = oEvent.getSource().getBindingContext("vtModel");
            var oData = this.getView().getModel("vtModel").getProperty(oCtx.getPath());
            this._editMode   = "CREATE";
            this._editRecord = null;
            var oClone = Object.assign({}, oData);
            oClone.ID = undefined;
            oClone.vehicleTypeId = oData.vehicleTypeId + "-COPY";
            oClone.code = oData.code + "-COPY";
            oClone.displayName = "Copy of " + oData.displayName;
            oClone.isSystem = false;
            this._populateDialog(oClone);
            this.getView().byId("vtDialog").setTitle("Clone — " + oData.displayName).open();
            this._applyVehicleTypeFieldRBAC();
        },

        _populateDialog: function (d) {
            var v = this.getView();
            var s = function (id, val) { var c = v.byId(id); if (c) { if (c.setValue) c.setValue(val || ""); else if (c.setSelectedKey) c.setSelectedKey(val || ""); } };
            var cb = function (id, val) { var c = v.byId(id); if (c) c.setSelected(!!val); };

            s("vtfId",          d.vehicleTypeId);
            s("vtfCode",        d.code);
            s("vtfName",        d.displayName);
            s("vtfCategory",    d.vehicleCategory || "GENERAL_ACCESS");
            s("vtfNhvrClass",   d.nhvrClass || "");
            s("vtfHvnl",        d.hvnlSection);
            cb("vtfActive",     d.active !== false);
            s("vtfPermitClass", d.permitClass);
            cb("vtfPermitRequired", d.permitRequired);
            s("vtfDesc",        d.description);
            s("vtfUseCase",     d.industryUseCase);
            s("vtfNhvrRef",     d.nhvrRef);
            // Mass
            s("vtfGVM",         d.maxGVM_t !== null && d.maxGVM_t !== undefined ? String(d.maxGVM_t) : "");
            s("vtfGCM",         d.maxGCM_t !== null && d.maxGCM_t !== undefined ? String(d.maxGCM_t) : "");
            s("vtfSteer",       d.steerAxleMax_t !== null && d.steerAxleMax_t !== undefined ? String(d.steerAxleMax_t) : "");
            s("vtfDrive",       d.driveAxleGroupMax_t !== null && d.driveAxleGroupMax_t !== undefined ? String(d.driveAxleGroupMax_t) : "");
            s("vtfTrailer",     d.trailerAxleGroupMax_t !== null && d.trailerAxleGroupMax_t !== undefined ? String(d.trailerAxleGroupMax_t) : "");
            s("vtfAxleConfig",  d.axleGroupConfig);
            s("vtfAxleCount",   d.numberOfAxles !== null && d.numberOfAxles !== undefined ? String(d.numberOfAxles) : "");
            s("vtfAxleSpacing", d.axleSpacingMin_m !== null && d.axleSpacingMin_m !== undefined ? String(d.axleSpacingMin_m) : "");
            s("vtfTyrePressure",d.tyrePressureMax_kPa !== null && d.tyrePressureMax_kPa !== undefined ? String(d.tyrePressureMax_kPa) : "");
            // Dimensions
            s("vtfHeight",      d.maxHeight_m !== null && d.maxHeight_m !== undefined ? String(d.maxHeight_m) : "");
            s("vtfWidth",       d.maxWidth_m !== null && d.maxWidth_m !== undefined ? String(d.maxWidth_m) : "");
            s("vtfLength",      d.maxLength_m !== null && d.maxLength_m !== undefined ? String(d.maxLength_m) : "");
            s("vtfOverhang",    d.maxOverhang_m !== null && d.maxOverhang_m !== undefined ? String(d.maxOverhang_m) : "");
            s("vtfTurnRadius",  d.turningRadiusMin_m !== null && d.turningRadiusMin_m !== undefined ? String(d.turningRadiusMin_m) : "");
            cb("vtfEscort",     d.requiresEscort);
            s("vtfEscortConfig",d.escortConfig);
            // Dynamic
            s("vtfSuspension",  d.suspensionType || "STEEL_LEAF");
            s("vtfDynFactor",   d.dynamicFactor !== null && d.dynamicFactor !== undefined ? String(d.dynamicFactor) : "");
            s("vtfSpeed",       d.maxOperatingSpeed_kmh !== null && d.maxOperatingSpeed_kmh !== undefined ? String(d.maxOperatingSpeed_kmh) : "");
        },

        // ── Save ──────────────────────────────────────────────────────────────

        onSaveVT: function () {
            var v  = this.getView();
            var gv = function (id) { var c = v.byId(id); return c ? (c.getValue ? c.getValue() : c.getSelected ? c.getSelected() : "") : ""; };

            var sId   = gv("vtfId");
            var sCode = gv("vtfCode");
            var sName = gv("vtfName");

            if (!sId || !sCode || !sName) {
                MessageBox.warning("Vehicle Type ID, Code and Display Name are required.");
                return;
            }

            var n = function (val) { var f = parseFloat(val); return isNaN(f) ? null : f; };
            var ni = function (val) { var i = parseInt(val); return isNaN(i) ? null : i; };

            var oPayload = {
                vehicleTypeId:          sId,
                code:                   sCode,
                displayName:            sName,
                vehicleCategory:        v.byId("vtfCategory").getSelectedKey() || null,
                nhvrClass:              v.byId("vtfNhvrClass").getSelectedKey() || null,
                hvnlSection:            gv("vtfHvnl") || null,
                active:                 v.byId("vtfActive").getSelected(),
                permitClass:            gv("vtfPermitClass") || null,
                permitRequired:         v.byId("vtfPermitRequired").getSelected(),
                description:            gv("vtfDesc") || null,
                industryUseCase:        gv("vtfUseCase") || null,
                nhvrRef:                gv("vtfNhvrRef") || null,
                maxGVM_t:               n(gv("vtfGVM")),
                maxGCM_t:               n(gv("vtfGCM")),
                steerAxleMax_t:         n(gv("vtfSteer")),
                driveAxleGroupMax_t:    n(gv("vtfDrive")),
                trailerAxleGroupMax_t:  n(gv("vtfTrailer")),
                axleGroupConfig:        gv("vtfAxleConfig") || null,
                numberOfAxles:          ni(gv("vtfAxleCount")),
                axleSpacingMin_m:       n(gv("vtfAxleSpacing")),
                tyrePressureMax_kPa:    ni(gv("vtfTyrePressure")),
                maxHeight_m:            n(gv("vtfHeight")),
                maxWidth_m:             n(gv("vtfWidth")),
                maxLength_m:            n(gv("vtfLength")),
                maxOverhang_m:          n(gv("vtfOverhang")),
                turningRadiusMin_m:     n(gv("vtfTurnRadius")),
                requiresEscort:         v.byId("vtfEscort").getSelected(),
                escortConfig:           gv("vtfEscortConfig") || null,
                suspensionType:         v.byId("vtfSuspension").getSelectedKey() || null,
                dynamicFactor:          n(gv("vtfDynFactor")),
                maxOperatingSpeed_kmh:  ni(gv("vtfSpeed")),
                isSystem:               false
            };

            var sMethod = this._editMode === "CREATE" ? "POST" : "PATCH";
            var sUrl    = BASE + "VehicleTypes" + (this._editMode === "EDIT" ? "(" + this._editRecord.ID + ")" : "");

            authFetch(sUrl, { method: sMethod, body: JSON.stringify(oPayload) })
                .then(function (r) {
                    if (!r.ok) { return r.json().then(function (e) { throw new Error(e.error ? e.error.message : r.status); }); }
                    return r.status === 204 ? {} : r.json();
                })
                .then(function () {
                    MessageToast.show(this._editMode === "CREATE" ? "Vehicle Type created." : "Vehicle Type updated.");
                    this.getView().byId("vtDialog").close();
                    this._loadVehicleTypes();
                }.bind(this))
                .catch(function (err) { MessageBox.error("Save failed: " + err.message); });
        },

        onCancelVT: function () {
            this.getView().byId("vtDialog").close();
        },

        // ── Toggle Active ─────────────────────────────────────────────────────

        onToggleVTActive: function (oEvent) {
            var oCtx  = oEvent.getSource().getBindingContext("vtModel");
            var oData = this.getView().getModel("vtModel").getProperty(oCtx.getPath());
            if (oData.isSystem) { MessageBox.warning("System vehicle types cannot be changed."); return; }

            var bNew = !oData.active;
            MessageBox.confirm((bNew ? "Activate" : "Deactivate") + " '" + oData.displayName + "'?", {
                onClose: function (a) {
                    if (a !== MessageBox.Action.OK) { return; }
                    authFetch(BASE + "VehicleTypes(" + oData.ID + ")", {
                        method: "PATCH", body: JSON.stringify({ active: bNew })
                    }).then(function (r) {
                        if (!r.ok) { throw new Error(r.status); }
                        MessageToast.show(bNew ? "Activated." : "Deactivated.");
                        this._loadVehicleTypes();
                    }.bind(this)).catch(function (e) { MessageBox.error("Failed: " + e.message); });
                }.bind(this)
            });
        },

        // ── Export CSV ────────────────────────────────────────────────────────

        onExportCSV: function () {
            var aItems = this.getView().getModel("vtModel").getData() || [];
            if (!aItems.length) { MessageToast.show("No data to export."); return; }
            var cols = ["vehicleTypeId","code","displayName","nhvrClass","vehicleCategory",
                "maxGVM_t","maxGCM_t","maxHeight_m","maxWidth_m","maxLength_m",
                "numberOfAxles","axleGroupConfig","suspensionType","dynamicFactor",
                "permitRequired","permitClass","active"];
            var rows = [cols.join(",")];
            aItems.forEach(function (row) {
                rows.push(cols.map(function (c) {
                    var v = row[c];
                    if (v === null || v === undefined) { return ""; }
                    var s = String(v);
                    return s.includes(",") ? '"' + s.replace(/"/g, '""') + '"' : s;
                }).join(","));
            });
            var blob = new Blob([rows.join("\n")], { type: "text/csv" });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement("a");
            a.href   = url; a.download = "VehicleTypes_" + new Date().toISOString().slice(0,10) + ".csv";
            a.click(); URL.revokeObjectURL(url);
            MessageToast.show("Exported " + aItems.length + " vehicle types.");
        },

        // ── Navigation ────────────────────────────────────────────────────────

        onNavHome: function () {
            sap.ui.core.UIComponent.getRouterFor(this).navTo("Home");
        }
    });
});
