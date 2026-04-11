sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "nhvr/bridgemanagement/model/CapabilityManager",
  "nhvr/bridgemanagement/model/RoleManager",
  "nhvr/bridgemanagement/util/DraftManager",
  "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager, RoleManager, DraftManager, LookupService) {
  "use strict";

  return Controller.extend("nhvr.bridgemanagement.controller.InspectionCreate", {

    onInit: function () {
      var oModel = new JSONModel({
        inspectionType: "L1_ROUTINE",
        standardApplied: "AS5100.7:2017",
        inspectionDate: "",
        inspectorName: "",
        inspectorCertNo: "",
        accessMethod: "VISUAL",
        deckRating: "3",
        superstructureRating: "3",
        substructureRating: "3",
        bearingRating: "3",
        jointRating: "3",
        primaryDefectCode: "NONE",
        defectSeverity: "NONE",
        inspectorNotes: "",
        estimatedRepairCost: "",
        nextInspectionDue: "",
        bridge_ID: ""
      });
      this.getView().setModel(oModel, "InspectionForm");

      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("InspectionCreate").attachPatternMatched(this._onRouteMatched, this);
      oRouter.getRoute("InspectionCreateNew").attachPatternMatched(this._onRouteMatchedNew, this);

      // Single source of truth — populate all enum dropdowns from the
      // Lookup table so admin uploads (Mass Upload → Lookup Values) flow
      // through to this form without code changes.
      var self = this;
      LookupService.load().then(function () {
        LookupService.populateFormSelect(self.byId("selInspType"), "INSPECTION_TYPE");
        LookupService.populateFormSelect(self.byId("selStandard"), "INSPECTION_STANDARD");
        LookupService.populateFormSelect(self.byId("selAccess"),   "ACCESS_METHOD");
        LookupService.populateFormSelect(self.byId("selDefect"),   "DEFECT_CLASSIFICATION");
        LookupService.populateFormSelect(self.byId("selSeverity"), "DEFECT_SEVERITY");
      });
    },

    _onRouteMatched: function (oEvent) {
      var self = this;
      var sBridgeId = oEvent.getParameter("arguments").bridgeId;
      CapabilityManager.load().then(function () {
        if (!CapabilityManager.guardRoute("INSPECTIONS", self.getOwnerComponent().getRouter())) return;
        if (sBridgeId) {
          self.getView().getModel("InspectionForm").setProperty("/bridge_ID", sBridgeId);
        }
        self._restoreDraftIfExists();
        self._startAutoSave();
        self._applyInspectionFieldRBAC();
      });
    },

    _onRouteMatchedNew: function () {
      var self = this;
      CapabilityManager.load().then(function () {
        if (!CapabilityManager.guardRoute("INSPECTIONS", self.getOwnerComponent().getRouter())) return;
        self.getView().getModel("InspectionForm").setProperty("/bridge_ID", "");
        self._restoreDraftIfExists();
        self._startAutoSave();
        self._applyInspectionFieldRBAC();
      });
    },

    // v4.7.9: Field-level RBAC for the Inspection Create form.
    _applyInspectionFieldRBAC: function () {
      try {
        RoleManager.applyFields(this.getView(), [
          { id: "selInspType",  field: "inspection.type" },
          { id: "selStandard",  field: "inspection.standard" },
          { id: "inspDate",     field: "inspection.date" },
          { id: "inspName",     field: "inspection.inspectorName" },
          { id: "inspCert",     field: "inspection.inspectorCertNo" },
          { id: "selAccess",    field: "inspection.accessMethod" },
          { id: "segDeck",      field: "inspection.deckRating" },
          { id: "segSuper",     field: "inspection.superstructureRating" },
          { id: "segSub",       field: "inspection.substructureRating" },
          { id: "segBearing",   field: "inspection.bearingRating" },
          { id: "segJoint",     field: "inspection.jointRating" },
          { id: "selDefect",    field: "inspection.primaryDefectCode" },
          { id: "selSeverity",  field: "inspection.defectSeverity" },
          { id: "inspNotes",    field: "inspection.inspectorNotes" },
          { id: "repairCost",   field: "inspection.estimatedRepairCost" },
          { id: "nextInsp",     field: "inspection.nextInspectionDue" }
        ]);
      } catch (_) { /* RoleManager unavailable — leave defaults */ }
    },

    _restoreDraftIfExists: function () {
      var self = this;
      DraftManager.loadDraft("INSPECTION", "new").then(function (data) {
        if (data) {
          MessageBox.confirm("A draft inspection was found (saved " + (data._savedAt || "earlier") + "). Restore it?", {
            title: "Restore Draft",
            onClose: function (action) {
              if (action === "OK") {
                self.getView().getModel("InspectionForm").setData(data);
                MessageToast.show("Draft restored");
              } else {
                DraftManager.deleteDraft("INSPECTION", "new");
              }
            }
          });
        }
      });
    },

    _startAutoSave: function () {
      var self = this;
      this._stopAutoSave();
      this._autoSaveTimer = setInterval(function () {
        var oModel = self.getView().getModel("InspectionForm");
        if (oModel) {
          var data = oModel.getData();
          data._savedAt = new Date().toISOString();
          DraftManager.saveDraft("INSPECTION", "new", data);
        }
      }, DraftManager.AUTO_SAVE_INTERVAL);
    },

    _stopAutoSave: function () {
      if (this._autoSaveTimer) {
        clearInterval(this._autoSaveTimer);
        this._autoSaveTimer = null;
      }
    },

    onNavBack: function () {
      this._stopAutoSave();
      window.history.go(-1);
    },

    onSaveDraft: function () {
      var oModel = this.getView().getModel("InspectionForm");
      if (oModel) {
        var data = oModel.getData();
        data._savedAt = new Date().toISOString();
        DraftManager.saveDraft("INSPECTION", "new", data).then(function () {
          MessageToast.show("Draft saved locally.");
        });
      } else {
        MessageToast.show("Draft saved locally.");
      }
    },

    onExit: function () {
      this._stopAutoSave();
    },

    onSubmitInspection: function () {
      var self = this;
      var oData = this.getView().getModel("InspectionForm").getData();
      if (!oData.inspectorName || !oData.inspectionDate) {
        MessageBox.error("Inspector name and inspection date are required.");
        return;
      }
      var ratings = ['deckRating', 'superstructureRating', 'substructureRating'];
      for (var i = 0; i < ratings.length; i++) {
          var val = oData[ratings[i]];
          if (val !== undefined && val !== null && val !== '') {
              var n = parseInt(val);
              if (isNaN(n) || n < 1 || n > 10) {
                  MessageBox.error(ratings[i] + " must be between 1 and 10.");
                  return;
              }
          }
      }
      var oPayload = Object.assign({}, oData, {
        deckRating:           parseInt(oData.deckRating, 10)           || 3,
        superstructureRating: parseInt(oData.superstructureRating, 10) || 3,
        substructureRating:   parseInt(oData.substructureRating, 10)   || 3,
        bearingRating:        parseInt(oData.bearingRating, 10)        || 3,
        jointRating:          parseInt(oData.jointRating, 10)          || 3
      });
      if (!oPayload.estimatedRepairCost) delete oPayload.estimatedRepairCost;
      if (!oPayload.bridge_ID) delete oPayload.bridge_ID;

      self.getView().setBusy(true);
      fetch("/bridge-management/BridgeInspections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(oPayload)
      })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
        return r.json();
      })
      .then(function (result) {
        self.getView().setBusy(false);
        DraftManager.deleteDraft("INSPECTION", "new");
        self._stopAutoSave();
        MessageToast.show("Inspection submitted. BHI: " + (result.bridgeHealthIndex || "—"));
        window.history.go(-1);
      })
      .catch(function (e) {
        self.getView().setBusy(false);
        MessageBox.error("Submission failed: " + e.message);
      });
    }
  });
});
