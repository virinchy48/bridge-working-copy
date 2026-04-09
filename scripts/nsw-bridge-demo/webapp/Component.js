sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
  "use strict";
  return UIComponent.extend("nsw.bridge.demo.Component", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      // Permit state model
      this.setModel(new JSONModel({
        selectedBridge: null,
        results: [],
        hasResults: false
      }), "state");
    }
  });
});
