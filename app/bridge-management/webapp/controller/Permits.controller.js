sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, ExcelExport, CapabilityManager, AlvToolbarMixin, AuthFetch, UserAnalytics, RoleManager, LookupService) {
    "use strict";

    var BASE = "/bridge-management/";

    return Controller.extend("nhvr.bridgemanagement.controller.Permits", Object.assign({

        onInit: function () {
            UserAnalytics.trackView("Permits");
            this._allPermits = [];

            var oPermitsModel = new JSONModel({
                items: [],
                count: 0,
                loading: false,
                totalCount: 0,
                approvedCount: 0,
                pendingCount: 0,
                deniedCount: 0
            });
            this.getView().setModel(oPermitsModel, "permits");

            var oPermitModel = new JSONModel({ assessmentDone: false });
            this.getView().setModel(oPermitModel, "permit");

            var oPermitDetailModel = new JSONModel({});
            this.getView().setModel(oPermitDetailModel, "permitDetail");

            // UI model for RBAC visibility bindings
            var oUiModel = new JSONModel({ canCreatePermit: true });
            this.getView().setModel(oUiModel, "ui");

            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("PERMITS", self.getOwnerComponent().getRouter())) return;
                self._loadBridgesForSelect();
                self._loadVehicleTypesForSelect();
            });
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Permits").attachPatternMatched(this._onRouteMatched, this);
            // v4.7.6: deep-link route #/Permits/{permitId}
            var oDetailRoute = oRouter.getRoute("PermitDetail");
            if (oDetailRoute) {
                oDetailRoute.attachPatternMatched(this._onDetailRouteMatched, this);
            }

            // admiring-lamarr: Load saved filter views and rebuild menu
            this._loadPermitViews();
            this._rebuildPermitViewsMenu();

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("permitStatusFilter"),     "PERMIT_STATUS",   "All Statuses");
                LookupService.populateSelect(this.byId("permitTypeFilter"),       "PERMIT_TYPE",     "All Types");
                LookupService.populateFormSelect(this.byId("permitTypeSelect"),   "PERMIT_TYPE");
                LookupService.populateFormSelect(this.byId("permitDecision"),     "PERMIT_DECISION");
            }.bind(this));
        },

        _onRouteMatched: function () {
            // Reset state and reload fresh data on every navigation
            this._pendingDeepLinkPermitId = null;
            this._allPermits = [];
            var oModel = this.getView().getModel("permits");
            oModel.setData({
                items: [], count: 0, loading: false,
                totalCount: 0, approvedCount: 0, pendingCount: 0, deniedCount: 0
            });
            // v4.7.13: Stash any pending NamedView handed off by the Home picker.
            // The actual apply happens after _loadPermits() resolves because
            // onApplyPermitView re-runs the filter against the loaded list.
            var self = this;
            sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                var pending = NamedViews.consumePending(NamedViews.MODULES.PERMITS);
                if (pending && pending.filters && pending.filters.criteria) {
                    self._pendingNamedView = { name: pending.name, criteria: pending.filters.criteria };
                }
            });
            this._loadPermits();
        },

        // v4.7.6: Deep-link handler — load list then open matching detail dialog.
        _onDetailRouteMatched: function (oEvent) {
            var permitId = (oEvent.getParameter("arguments") || {}).permitId;
            this._pendingDeepLinkPermitId = permitId || null;
            this._allPermits = [];
            var oModel = this.getView().getModel("permits");
            oModel.setData({
                items: [], count: 0, loading: false,
                totalCount: 0, approvedCount: 0, pendingCount: 0, deniedCount: 0
            });
            this._loadPermits();
        },

        _resolveDeepLink: function () {
            if (!this._pendingDeepLinkPermitId || !this._allPermits.length) { return; }
            var wanted = this._pendingDeepLinkPermitId;
            var hit = this._allPermits.filter(function (p) {
                return p.permitId === wanted || p.ID === wanted;
            })[0];
            this._pendingDeepLinkPermitId = null;
            if (hit) {
                this._openPermitDetail(hit);
            } else {
                MessageBox.warning("Permit '" + wanted + "' not found.");
            }
        },

        // ── Data Loading ──────────────────────────────────────────────────────

        _loadPermits: function () {
            var oModel = this.getView().getModel("permits");
            oModel.setProperty("/loading", true);

            AuthFetch.getJson(BASE + "VehiclePermits?$orderby=createdAt desc")
                .then(function (data) {
                    var items = data.value || [];
                    this._allPermits = items;
                    var approved = items.filter(function (i) { return i.permitStatus === "APPROVED" || i.permitStatus === "APPROVED_WITH_CONDITIONS"; }).length;
                    var pending  = items.filter(function (i) { return i.permitStatus === "PENDING" || i.permitStatus === "DRAFT"; }).length;
                    var denied   = items.filter(function (i) { return ["DENIED", "EXPIRED", "CANCELLED", "SUSPENDED"].includes(i.permitStatus); }).length;
                    oModel.setProperty("/items", items);
                    oModel.setProperty("/count", items.length);
                    oModel.setProperty("/totalCount", items.length);
                    oModel.setProperty("/approvedCount", approved);
                    oModel.setProperty("/pendingCount", pending);
                    oModel.setProperty("/deniedCount", denied);
                    oModel.setProperty("/loading", false);
                    if (typeof this._alvUpdateCount === "function") {
                        this._alvUpdateCount(items.length, items.length);
                    }
                    // v4.7.6: open detail dialog if we arrived via deep link
                    this._resolveDeepLink();
                    // v4.7.13: apply a pending NamedView handed off from Home.
                    if (this._pendingNamedView) {
                        var nv = this._pendingNamedView;
                        this._pendingNamedView = null;
                        this.onApplyPermitView(nv);
                    }
                }.bind(this))
                .catch(function (err) {
                    oModel.setProperty("/loading", false);
                    MessageBox.error("Failed to load permits: " + err.message);
                });
        },

        _loadBridgesForSelect: function () {
            AuthFetch.getJson(BASE + "Bridges?$select=ID,bridgeId,name,state&$orderby=name&$top=200")
                .then(function (data) {
                    this._bridges = data.value || [];
                    var oSelect = this.getView().byId("permitBridgeSelect");
                    oSelect.destroyItems();
                    oSelect.addItem(new sap.ui.core.Item({ key: "", text: "— Select a bridge —" }));
                    this._bridges.forEach(function (b) {
                        oSelect.addItem(new sap.ui.core.Item({
                            key: b.ID,
                            text: b.name + " (" + b.bridgeId + ")"
                        }));
                    });
                }.bind(this))
                .catch(function (err) {
                    console.warn("[Permits] Bridges lookup load failed:", err.message);
                });
        },

        _loadVehicleTypesForSelect: function () {
            AuthFetch.getJson(BASE + "VehicleTypes?$filter=active eq true&$orderby=vehicleCategory,code")
                .then(function (data) {
                    this._vehicleTypes = data.value || [];
                    var oSelect = this.getView().byId("permitVehicleTypeSelect");
                    oSelect.destroyItems();
                    oSelect.addItem(new sap.ui.core.Item({ key: "", text: "— Select vehicle type —" }));
                    this._vehicleTypes.forEach(function (vt) {
                        oSelect.addItem(new sap.ui.core.Item({
                            key: vt.vehicleTypeId,
                            text: vt.displayName + " [" + (vt.nhvrClass || "—") + "]"
                        }));
                    });
                }.bind(this))
                .catch(function (err) {
                    console.warn("[Permits] VehicleTypes lookup load failed:", err.message);
                });
        },

        // ── Filtering ─────────────────────────────────────────────────────────

        onPermitSearch: function () { this._applyFilter(); },
        onPermitFilter: function () { this._applyFilter(); },

        onClearPermitFilters: function () {
            this.getView().byId("permitSearchField").setValue("");
            this.getView().byId("permitStatusFilter").setSelectedKey("");
            this.getView().byId("permitTypeFilter").setSelectedKey("");
            this._applyFilter();
        },

        _applyFilter: function () {
            var oView = this.getView();
            var sSearch = (oView.byId("permitSearchField").getValue() || "").toLowerCase();
            var sStat   = oView.byId("permitStatusFilter").getSelectedKey();
            var sType   = oView.byId("permitTypeFilter").getSelectedKey();

            var filtered = this._allPermits.filter(function (p) {
                if (sSearch && !(
                    (p.permitId       || "").toLowerCase().includes(sSearch) ||
                    (p.bridgeName     || "").toLowerCase().includes(sSearch) ||
                    (p.vehicleTypeName|| "").toLowerCase().includes(sSearch) ||
                    (p.applicantName  || "").toLowerCase().includes(sSearch)
                )) { return false; }
                if (sStat && p.permitStatus !== sStat) { return false; }
                if (sType && p.permitType   !== sType) { return false; }
                return true;
            });

            var oModel = this.getView().getModel("permits");
            oModel.setProperty("/items", filtered);
            oModel.setProperty("/count", filtered.length);
        },

        // ── New Permit Dialog ─────────────────────────────────────────────────

        onNewPermit: function () {
            this._permitEditMode = "CREATE";
            this._editPermitRecord = null;

            var oPermitModel = this.getView().getModel("permit");
            oPermitModel.setData({ assessmentDone: false });

            // Reset wizard to step 1
            this.getView().byId("permitWizardTabs").setSelectedKey("step1");

            // Clear inputs
            var oView = this.getView();
            ["permitBridgeSelect", "permitVehicleTypeSelect"].forEach(function (id) {
                oView.byId(id).setSelectedKey("");
            });
            oView.byId("permitTypeSelect").setSelectedKey("SINGLE_TRIP");
            oView.byId("permitApplicantName").setValue("");
            oView.byId("permitApplicantABN").setValue("");
            oView.byId("permitGVM").setValue("");
            oView.byId("permitGCM").setValue("");
            oView.byId("permitHeight").setValue("");
            oView.byId("permitWidth").setValue("");
            oView.byId("permitLength").setValue("");
            oView.byId("permitSpeed").setValue("80");
            oView.byId("permitDecision").setSelectedKey("PENDING");
            oView.byId("permitAssessedBy").setValue("");
            oView.byId("permitEffectiveFrom").setValue("");
            oView.byId("permitExpiryDate").setValue("");
            oView.byId("permitConditions").setValue("");
            oView.byId("permitReference").setValue("");

            this.getView().byId("newPermitDialog").open();
            // v4.7.6: apply field-level RBAC from RoleConfig
            this._applyPermitFieldRBAC();
        },

        // v4.7.6: Field-level RBAC for the New Permit dialog.
        // Each entry maps a control ID → feature/field key read from RoleConfig.
        _applyPermitFieldRBAC: function () {
            try {
                RoleManager.applyFields(this.getView(), [
                    { id: "permitBridgeSelect",      field: "permit.bridge" },
                    { id: "permitVehicleTypeSelect", field: "permit.vehicleType" },
                    { id: "permitTypeSelect",        field: "permit.type" },
                    { id: "permitApplicantName",     field: "permit.applicantName" },
                    { id: "permitApplicantABN",      field: "permit.applicantABN" },
                    { id: "permitGVM",               field: "permit.gvm" },
                    { id: "permitGCM",               field: "permit.gcm" },
                    { id: "permitHeight",            field: "permit.height" },
                    { id: "permitWidth",             field: "permit.width" },
                    { id: "permitLength",            field: "permit.length" },
                    { id: "permitSpeed",             field: "permit.speed" },
                    { id: "permitDecision",          field: "permit.decision" },
                    { id: "permitAssessedBy",        field: "permit.assessedBy" },
                    { id: "permitEffectiveFrom",     field: "permit.effectiveFrom" },
                    { id: "permitExpiryDate",        field: "permit.expiryDate" },
                    { id: "permitConditions",        field: "permit.conditions" },
                    { id: "permitReference",         field: "permit.reference" }
                ]);
            } catch (_) { /* RoleManager unavailable — leave defaults */ }
        },

        onPermitBridgeChanged: function () { /* pre-populate capacity info if needed */ },
        onPermitVehicleTypeChanged: function () {
            // Pre-fill vehicle dimensions from VehicleType
            var oView = this.getView();
            var sVehicleTypeId = oView.byId("permitVehicleTypeSelect").getSelectedKey();
            if (!sVehicleTypeId) { return; }
            var vt = (this._vehicleTypes || []).find(function (v) { return v.vehicleTypeId === sVehicleTypeId; });
            if (!vt) { return; }
            if (vt.maxGVM_t)    { oView.byId("permitGVM").setValue(vt.maxGVM_t); }
            if (vt.maxGCM_t)    { oView.byId("permitGCM").setValue(vt.maxGCM_t); }
            if (vt.maxHeight_m) { oView.byId("permitHeight").setValue(vt.maxHeight_m); }
            if (vt.maxWidth_m)  { oView.byId("permitWidth").setValue(vt.maxWidth_m); }
            if (vt.maxLength_m) { oView.byId("permitLength").setValue(vt.maxLength_m); }
        },

        // ── Run Assessment ────────────────────────────────────────────────────

        onRunAssessment: function () {
            var oView = this.getView();
            var sBridgeID     = oView.byId("permitBridgeSelect").getSelectedKey();
            var sVehicleTypeId = oView.byId("permitVehicleTypeSelect").getSelectedKey();
            var sGVM          = oView.byId("permitGVM").getValue();
            var sHeight       = oView.byId("permitHeight").getValue();
            var sWidth        = oView.byId("permitWidth").getValue();

            if (!sBridgeID || !sVehicleTypeId || !sGVM || !sHeight || !sWidth) {
                MessageBox.warning("Please select a Bridge, Vehicle Type, and enter GVM, Height and Width before running assessment.");
                return;
            }

            // Find bridgeId from ID
            var oBridge = (this._bridges || []).find(function (b) { return b.ID === sBridgeID; });
            if (!oBridge) { MessageBox.error("Selected bridge not found."); return; }

            var oPayload = {
                bridgeId:       oBridge.bridgeId,
                vehicleTypeId:  sVehicleTypeId,
                assessedGVM_t:  parseFloat(sGVM),
                assessedGCM_t:  parseFloat(oView.byId("permitGCM").getValue() || "0"),
                assessedHeight_m: parseFloat(sHeight),
                assessedWidth_m:  parseFloat(sWidth),
                assessedLength_m: parseFloat(oView.byId("permitLength").getValue() || "0"),
                crossingSpeed_kmh: parseInt(oView.byId("permitSpeed").getValue() || "80")
            };

            // Show busy
            var oDialog = oView.byId("newPermitDialog");
            oDialog.setBusy(true);

            AuthFetch.post(BASE + "assessVehicleOnBridge", oPayload)
                .then(function (r) {
                    if (!r.ok) { return r.json().then(function (e) { throw new Error(e.error ? e.error.message : r.status); }); }
                    return r.json();
                })
                .then(function (result) {
                    oDialog.setBusy(false);
                    var oData = result.value || result;
                    oData.assessmentDone = true;

                    var oPermitModel = this.getView().getModel("permit");
                    oPermitModel.setData(oData);

                    // Pre-fill conditions
                    var sConditions = [oData.conditionsList, oData.warningsList].filter(Boolean).join("\n");
                    oView.byId("permitConditions").setValue(sConditions);

                    // Pre-fill decision
                    if (oData.eligible && !oData.permitRequired) {
                        oView.byId("permitDecision").setSelectedKey("APPROVED");
                    } else if (oData.eligible) {
                        oView.byId("permitDecision").setSelectedKey("APPROVED_WITH_CONDITIONS");
                    } else {
                        oView.byId("permitDecision").setSelectedKey("DENIED");
                    }

                    // Navigate to step 2
                    oView.byId("permitWizardTabs").setSelectedKey("step2");
                    MessageToast.show("Assessment complete.");
                }.bind(this))
                .catch(function (err) {
                    oDialog.setBusy(false);
                    MessageBox.error("Assessment failed: " + err.message);
                });
        },

        // ── Save Permit ───────────────────────────────────────────────────────

        onSavePermit: function () {
            var oView = this.getView();
            var oPermitData = this.getView().getModel("permit").getData();

            var sBridgeID      = oView.byId("permitBridgeSelect").getSelectedKey();
            var sVehicleTypeId = oView.byId("permitVehicleTypeSelect").getSelectedKey();
            var sDecision      = oView.byId("permitDecision").getSelectedKey();
            var sEffectiveFrom = oView.byId("permitEffectiveFrom").getValue();
            var sExpiryDate    = oView.byId("permitExpiryDate").getValue();

            if (!sBridgeID || !sVehicleTypeId) {
                MessageBox.warning("Bridge and Vehicle Type are required.");
                return;
            }
            if (sDecision === "APPROVED" || sDecision === "APPROVED_WITH_CONDITIONS") {
                if (!sEffectiveFrom || !sExpiryDate) {
                    MessageBox.warning("Effective From and Expiry Date are required for approval.");
                    return;
                }
            }
            if (sEffectiveFrom && sExpiryDate && new Date(sExpiryDate) <= new Date(sEffectiveFrom)) {
                MessageBox.error("Expiry date must be after the effective date.");
                return;
            }

            // Find vehicleType ID (UUID) from vehicleTypeId code
            var oVT = (this._vehicleTypes || []).find(function (v) { return v.vehicleTypeId === sVehicleTypeId; });

            var oPayload = {
                permitId: "PERM-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6),
                bridge_ID: sBridgeID,
                vehicleType_ID: oVT ? oVT.ID : undefined,
                permitStatus: sDecision || "PENDING",
                permitType: oView.byId("permitTypeSelect").getSelectedKey(),
                applicantName: oView.byId("permitApplicantName").getValue() || null,
                applicantABN:  oView.byId("permitApplicantABN").getValue() || null,
                assessedGVM_t: parseFloat(oView.byId("permitGVM").getValue() || "0"),
                assessedGCM_t: parseFloat(oView.byId("permitGCM").getValue() || "0") || null,
                assessedHeight_m: parseFloat(oView.byId("permitHeight").getValue() || "0"),
                assessedWidth_m:  parseFloat(oView.byId("permitWidth").getValue() || "0"),
                assessedLength_m: parseFloat(oView.byId("permitLength").getValue() || "0") || null,
                checkMassPassed: !!oPermitData.massCheckPassed,
                checkClearancePassed: !!oPermitData.clearanceCheckPassed,
                checkWidthPassed: !!oPermitData.widthCheckPassed,
                checkLengthPassed: !!oPermitData.lengthCheckPassed,
                checkFatiguePassed: !!oPermitData.fatigueCheckPassed,
                checkScourPassed: !!oPermitData.scourCheckPassed,
                allChecksPassed: !!oPermitData.eligible,
                assessedBy: oView.byId("permitAssessedBy").getValue() || null,
                effectiveFrom: sEffectiveFrom || null,
                expiryDate: sExpiryDate || null,
                additionalConditions: oView.byId("permitConditions").getValue() || null,
                nhvrPermitNumber: oView.byId("permitReference").getValue() || null
            };

            // ── EDIT mode: PATCH existing permit ──
            if (this._permitEditMode === "EDIT" && this._editPermitRecord) {
                var sPermitID = this._editPermitRecord.ID;
                var oPatchPayload = {
                    permitType: oPayload.permitType,
                    applicantName: oPayload.applicantName,
                    applicantABN: oPayload.applicantABN,
                    assessedGVM_t: oPayload.assessedGVM_t,
                    assessedGCM_t: oPayload.assessedGCM_t,
                    assessedHeight_m: oPayload.assessedHeight_m,
                    assessedWidth_m: oPayload.assessedWidth_m,
                    assessedLength_m: oPayload.assessedLength_m,
                    permitStatus: oPayload.permitStatus,
                    assessedBy: oPayload.assessedBy,
                    effectiveFrom: oPayload.effectiveFrom,
                    expiryDate: oPayload.expiryDate,
                    additionalConditions: oPayload.additionalConditions,
                    nhvrPermitNumber: oPayload.nhvrPermitNumber,
                    amendmentReason: "Permit amended via edit workflow"
                };

                // Optimistic locking: include version if present
                if (this._editPermitRecord.version != null) {
                    oPatchPayload.version = this._editPermitRecord.version;
                }

                AuthFetch.patch(BASE + "VehiclePermits(" + sPermitID + ")", oPatchPayload)
                    .then(function (r) {
                        if (r.status === 409) {
                            throw new Error("CONFLICT: This permit was modified by another user. Please reload and try again.");
                        }
                        if (!r.ok) { return r.json().then(function (e) { throw new Error(e.error ? e.error.message : r.status); }); }
                        return r.json();
                    })
                    .then(function () {
                        MessageToast.show("Permit updated successfully.");
                        oView.byId("newPermitDialog").close();
                        this._permitEditMode = "CREATE";
                        this._editPermitRecord = null;
                        this._loadPermits();
                    }.bind(this))
                    .catch(function (err) {
                        if (err.message.indexOf("CONFLICT") === 0) {
                            MessageBox.error(err.message);
                        } else {
                            MessageBox.error("Failed to update permit: " + err.message);
                        }
                    });
                return;
            }

            // ── CREATE mode: POST new permit ──
            AuthFetch.post(BASE + "VehiclePermits", oPayload)
                .then(function (r) {
                    if (!r.ok) { return r.json().then(function (e) { throw new Error(e.error ? e.error.message : r.status); }); }
                    return r.json();
                })
                .then(function () {
                    MessageToast.show("Permit saved successfully.");
                    oView.byId("newPermitDialog").close();
                    this._permitEditMode = "CREATE";
                    this._editPermitRecord = null;
                    this._loadPermits();
                }.bind(this))
                .catch(function (err) {
                    MessageBox.error("Failed to save permit: " + err.message);
                });
        },

        onCancelPermit: function () {
            this.getView().byId("newPermitDialog").close();
        },

        // ── Row Actions ───────────────────────────────────────────────────────

        onPermitRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("permits");
            var oData = this.getView().getModel("permits").getProperty(oCtx.getPath());
            this._openPermitDetail(oData);
        },

        // v4.7.6: Clicking the Permit ID navigates via deep-link URL so the
        // hash reflects the permit and can be copied/shared.
        onPermitIdLinkPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("permits");
            if (!oCtx) { return; }
            var oData = this.getView().getModel("permits").getProperty(oCtx.getPath());
            if (oData && oData.permitId) {
                this.getOwnerComponent().getRouter().navTo("PermitDetail", { permitId: oData.permitId });
            }
        },

        onViewPermit: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("permits");
            var oData = this.getView().getModel("permits").getProperty(oCtx.getPath());
            this._openPermitDetail(oData);
        },

        _openPermitDetail: function (oData) {
            this.getView().getModel("permitDetail").setData(oData);
            this.getView().byId("permitDetailDialog").open();
        },

        onClosePermitDetail: function () {
            this.getView().byId("permitDetailDialog").close();
        },

        onEditPermit: function (oEvent) {
            UserAnalytics.trackAction("edit_permit", "Permits");
            var oCtx = oEvent.getSource().getBindingContext("permits");
            var oData = this.getView().getModel("permits").getProperty(oCtx.getPath());

            // Only DRAFT or PENDING permits may be edited
            if (oData.permitStatus !== "DRAFT" && oData.permitStatus !== "PENDING") {
                MessageBox.warning("Only permits in Draft or Pending status can be edited.");
                return;
            }

            this._permitEditMode = "EDIT";
            this._editPermitRecord = oData;

            // Pre-populate permit model (assessment data)
            var oPermitModel = this.getView().getModel("permit");
            oPermitModel.setData({
                assessmentDone: true,
                massCheckPassed: !!oData.checkMassPassed,
                clearanceCheckPassed: !!oData.checkClearancePassed,
                widthCheckPassed: !!oData.checkWidthPassed,
                lengthCheckPassed: !!oData.checkLengthPassed,
                fatigueCheckPassed: !!oData.checkFatiguePassed,
                scourCheckPassed: !!oData.checkScourPassed,
                eligible: !!oData.allChecksPassed
            });

            // Pre-fill form inputs
            var oView = this.getView();
            oView.byId("permitBridgeSelect").setSelectedKey(oData.bridge_ID || "");
            oView.byId("permitVehicleTypeSelect").setSelectedKey(oData.vehicleType_ID ? (
                (this._vehicleTypes || []).find(function (v) { return v.ID === oData.vehicleType_ID; }) || {}
            ).vehicleTypeId || "" : "");
            oView.byId("permitTypeSelect").setSelectedKey(oData.permitType || "SINGLE_TRIP");
            oView.byId("permitApplicantName").setValue(oData.applicantName || "");
            oView.byId("permitApplicantABN").setValue(oData.applicantABN || "");
            oView.byId("permitGVM").setValue(oData.assessedGVM_t != null ? oData.assessedGVM_t : "");
            oView.byId("permitGCM").setValue(oData.assessedGCM_t != null ? oData.assessedGCM_t : "");
            oView.byId("permitHeight").setValue(oData.assessedHeight_m != null ? oData.assessedHeight_m : "");
            oView.byId("permitWidth").setValue(oData.assessedWidth_m != null ? oData.assessedWidth_m : "");
            oView.byId("permitLength").setValue(oData.assessedLength_m != null ? oData.assessedLength_m : "");
            oView.byId("permitSpeed").setValue(oData.crossingSpeed_kmh || "80");
            oView.byId("permitDecision").setSelectedKey(oData.permitStatus || "PENDING");
            oView.byId("permitAssessedBy").setValue(oData.assessedBy || "");
            oView.byId("permitEffectiveFrom").setValue(oData.effectiveFrom ? oData.effectiveFrom.substring(0, 10) : "");
            oView.byId("permitExpiryDate").setValue(oData.expiryDate ? oData.expiryDate.substring(0, 10) : "");
            oView.byId("permitConditions").setValue(oData.additionalConditions || "");
            oView.byId("permitReference").setValue(oData.nhvrPermitNumber || "");

            // Open wizard at step 2 (assessment already done for existing permits)
            oView.byId("permitWizardTabs").setSelectedKey("step2");
            oView.byId("newPermitDialog").open();
        },

        // ── Export ────────────────────────────────────────────────────────────

        onExportCSV: function () {
            var aItems = this._allPermits;
            if (!aItems || !aItems.length) { MessageToast.show("No data to export."); return; }
            ExcelExport.export({
                fileName: "NHVR_VehiclePermits_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.PermitColumns,
                data    : aItems
            });
        },

        // ── Formatters ────────────────────────────────────────────────────────

        formatDecimal: function (v) {
            if (v === null || v === undefined || v === "") { return "—"; }
            return parseFloat(v).toFixed(2);
        },

        formatDate: function (v) {
            if (!v) { return "—"; }
            try { return new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
            catch (e) { return v; }
        },

        formatStatus: function (s) {
            var map = {
                "DRAFT": "Draft", "PENDING": "Pending", "APPROVED": "Approved",
                "APPROVED_WITH_CONDITIONS": "Approved w/ Conditions",
                "DENIED": "Denied", "EXPIRED": "Expired",
                "CANCELLED": "Cancelled", "SUSPENDED": "Suspended"
            };
            return map[s] || s || "—";
        },

        formatStatusState: function (s) {
            if (s === "APPROVED") { return "Success"; }
            if (s === "APPROVED_WITH_CONDITIONS") { return "Warning"; }
            if (s === "DENIED" || s === "EXPIRED" || s === "CANCELLED" || s === "SUSPENDED") { return "Error"; }
            if (s === "PENDING" || s === "DRAFT") { return "Information"; }
            return "None";
        },

        formatPermitType: function (s) {
            var map = {
                "SINGLE_TRIP": "Single Trip", "MULTI_TRIP": "Multi-Trip",
                "ANNUAL": "Annual", "NETWORK": "Network", "EMERGENCY": "Emergency"
            };
            return map[s] || s || "—";
        },

        formatChecks: function (b) { return b ? "All Passed" : "Checks Failed"; },
        formatChecksState: function (b) { return b ? "Success" : "Error"; },

        formatCheckText: function (b) { return b ? "✓ Pass" : "✗ Fail"; },
        formatCheckState: function (b) { return b ? "Success" : "Error"; },

        formatEligibleMsgType: function (b) { return b ? "Success" : "Error"; },

        canEdit: function (sStatus) {
            return sStatus === "DRAFT" || sStatus === "PENDING";
        },

        // ── Permit ID deep-link (opens detail dialog) ─────────────────────────
        onPermitIdPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("permits");
            if (!oCtx) return;
            var oData = oCtx.getObject();
            if (oData) this._openPermitDetail(oData);
        },

        // ── Saved filter views (localStorage, Bridges-style) ──────────────────
        _permitViewsKey: "nhvr_permit_filter_views",
        _permitViews: [],

        _loadPermitViews: function () {
            try {
                var raw = localStorage.getItem(this._permitViewsKey);
                var parsed = raw ? JSON.parse(raw) : [];
                this._permitViews = Array.isArray(parsed) ? parsed : [];
            } catch (_) { this._permitViews = []; }
        },

        _savePermitViews: function () {
            try { localStorage.setItem(this._permitViewsKey, JSON.stringify(this._permitViews)); } catch (_) { /* ignore */ }
        },

        _rebuildPermitViewsMenu: function () {
            var oMenu = this.getView().byId("permitViewsMenu");
            if (!oMenu) return;
            oMenu.destroyItems();
            if (this._permitViews.length === 0) {
                oMenu.addItem(new sap.m.MenuItem({ text: "(no saved views)", enabled: false }));
                return;
            }
            var self = this;
            this._permitViews.forEach(function (view) {
                var oItem = new sap.m.MenuItem({ text: view.name, icon: "sap-icon://filter" });
                oItem.attachPress(function () { self.onApplyPermitView(view); });
                oMenu.addItem(oItem);
            });
            // Separator + manage entry
            var oClear = new sap.m.MenuItem({ text: "Delete all saved views", icon: "sap-icon://delete", startsSection: true });
            oClear.attachPress(function () {
                MessageBox.confirm("Delete all " + self._permitViews.length + " saved view(s)?", {
                    title: "Delete saved views",
                    onClose: function (action) {
                        if (action !== MessageBox.Action.OK) return;
                        self._permitViews = [];
                        self._savePermitViews();
                        self._rebuildPermitViewsMenu();
                        MessageToast.show("All saved views deleted");
                    }
                });
            });
            oMenu.addItem(oClear);
        },

        onSavePermitView: function () {
            var oView = this.getView();
            var current = {
                search: oView.byId("permitSearchField").getValue(),
                status: oView.byId("permitStatusFilter").getSelectedKey(),
                type:   oView.byId("permitTypeFilter").getSelectedKey()
            };
            if (!current.search && !current.status && !current.type) {
                MessageToast.show("Nothing to save — set at least one filter first.");
                return;
            }
            var self = this;
            MessageBox.prompt("Name this view:", {
                title: "Save Permit View",
                onClose: function (sName, sValue) {
                    var value = (sValue || "").trim();
                    if (sName !== MessageBox.Action.OK || !value) return;
                    self._permitViews = self._permitViews.filter(function (v) { return v.name !== value; });
                    self._permitViews.push({ name: value, criteria: current });
                    self._savePermitViews();
                    self._rebuildPermitViewsMenu();
                    // v4.7.9: dual-write to cross-module NamedViews store
                    sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                        try { NamedViews.save(NamedViews.MODULES.PERMITS, value, { criteria: current }); } catch (_) { /* noop */ }
                    });
                    MessageToast.show("Saved view: " + value);
                }
            });
        },

        onApplyPermitView: function (view) {
            if (!view || !view.criteria) return;
            var oView = this.getView();
            oView.byId("permitSearchField").setValue(view.criteria.search || "");
            oView.byId("permitStatusFilter").setSelectedKey(view.criteria.status || "");
            oView.byId("permitTypeFilter").setSelectedKey(view.criteria.type || "");
            this._applyFilter();
            MessageToast.show("Applied view: " + view.name);
        },

        onDeletePermitView: function (name) {
            this._permitViews = this._permitViews.filter(function (v) { return v.name !== name; });
            this._savePermitViews();
            this._rebuildPermitViewsMenu();
            MessageToast.show("Deleted view: " + name);
        },

        // ── Bridge hyperlink ──────────────────────────────────────────────────
        onBridgeIdPress: function (e) {
            const ctx = e.getSource().getBindingContext("permits");
            const obj = ctx ? ctx.getObject() : null;
            if (!obj) return;
            const bid = obj.bridgeId || obj.bridge_ID;
            if (bid) {
                sap.ui.core.UIComponent.getRouterFor(this).navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },

        // ── Navigation ────────────────────────────────────────────────────────

        onNavHome: function () {
            sap.ui.core.UIComponent.getRouterFor(this).navTo("Home");
        },

        // ── Info Popover ──────────────────────────────────────────
        _showInfoPopover: function (oButton, sTitle, sContent) {
            if (!this._oInfoPopover) {
                this._oInfoPopover = new sap.m.Popover({
                    placement: sap.m.PlacementType.Auto,
                    showHeader: true,
                    contentWidth: "380px"
                });
                this.getView().addDependent(this._oInfoPopover);
            }
            this._oInfoPopover.setTitle(sTitle);
            this._oInfoPopover.destroyContent();
            this._oInfoPopover.addContent(new sap.m.Text({ text: sContent }).addStyleClass("sapUiSmallMargin"));
            this._oInfoPopover.openBy(oButton);
        },

        onInfoPressPermits: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Vehicle Permits — Guide",
                "This module manages NHVR permits for oversize and overmass vehicle movements on the road network.\n\n" +
                "Permit Types:\n" +
                "• OSOM — Oversize Overmass: vehicle exceeds standard mass or dimension limits\n" +
                "• PBS — Performance-Based Standards: vehicle certified under the PBS scheme for improved mass/dimension limits\n" +
                "• CLASS 1 to CLASS 4 — NHVR mass management classes with increasing access rights\n" +
                "• ROUTE_SPECIFIC — permit for a specific origin-to-destination route\n\n" +
                "Permit Statuses:\n" +
                "• PENDING — submitted, awaiting assessment\n" +
                "• APPROVED — assessed and approved with conditions\n" +
                "• REJECTED — not approved\n" +
                "• EXPIRED — approval period has lapsed\n\n" +
                "Bridge Crossings — bridges on the permit route are listed with applicable restrictions. " +
                "A bridge with a CLOSED status will block permit approval for that route."
            );
        },

        // ── ALV Toolbar overrides ─────────────────────────────────
        onAlvRefresh: function () {
            this._loadPermits();
        },

        onAlvExportExcel: function () {
            this.onExportCSV();
        },

        onAlvExportCsv: function () {
            var aItems = this._allPermits;
            if (!aItems || !aItems.length) { MessageToast.show("No data to export."); return; }
            ExcelExport.export({
                fileName: "NHVR_VehiclePermits_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.PermitColumns,
                data    : aItems,
                format  : "csv"
            });
        },

        onAlvExportPdf: function () {
            sap.m.MessageToast.show("Print / PDF export — use browser print (Ctrl+P).");
        },

        onAlvSort: function () {
            sap.m.MessageToast.show("Sort — use column headers to sort the table.");
        },

        // ── Create Permit (alias from toolbar button) ─────────────
        onCreatePermit: function () {
            UserAnalytics.trackAction("create_permit", "Permits");
            this.onNewPermit();
        }

    }, AlvToolbarMixin));
});
