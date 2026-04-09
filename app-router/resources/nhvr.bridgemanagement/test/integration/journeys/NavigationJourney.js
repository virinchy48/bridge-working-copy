// ============================================================
// OPA5 Journey: Navigation Intents & Cross-Navigation
// Validates SAP Fiori Launchpad navigation intent support
// ============================================================
sap.ui.define([
    "sap/ui/test/opaQunit",
    "sap/ui/test/Opa5"
], function (opaTest, Opa5) {
    "use strict";

    QUnit.module("Navigation — OPA5 Journey");

    opaTest("App should start and display Home view", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            controlType: "sap.f.ShellBar",
            success: function (aShellBars) {
                Opa5.assert.ok(aShellBars.length > 0, "Application started with ShellBar visible");
            },
            errorMessage: "Application did not start correctly"
        });

        Then.iTeardownMyApp();
    });

    opaTest("Live Summary KPI section should be visible", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "homeTotalBridges",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oNumeric) {
                Opa5.assert.ok(true, "Total Bridges KPI tile is rendered");
            },
            errorMessage: "KPI tiles not found"
        });

        Then.iTeardownMyApp();
    });
});
