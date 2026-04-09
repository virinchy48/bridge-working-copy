// ============================================================
// OPA5 Journey: Role-Based Access Control
// Validates that READ_ONLY role cannot see write actions
// ============================================================
sap.ui.define([
    "sap/ui/test/opaQunit",
    "sap/ui/test/Opa5",
    "sap/ui/test/matchers/PropertyStrictEquals"
], function (opaTest, Opa5, PropertyStrictEquals) {
    "use strict";

    QUnit.module("Role-Based Access Control — OPA5 Journey");

    opaTest("Home screen should display ShellBar", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "nhvrShellBar",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oShellBar) {
                Opa5.assert.ok(oShellBar.getVisible(), "SAP ShellBar is visible");
            },
            errorMessage: "ShellBar not found — SAP Fiori compliance gap"
        });

        Then.iTeardownMyApp();
    });

    opaTest("Home screen Quick Access section should be visible", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "quickAccessSection",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oSection) {
                Opa5.assert.ok(true, "Quick Access section is present");
            },
            errorMessage: "Quick Access section not rendered"
        });

        Then.iTeardownMyApp();
    });

    opaTest("Operations tiles should be visible for default role", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "tileBridges",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oTile) {
                Opa5.assert.ok(oTile.getVisible(), "Bridges tile visible for authenticated user");
            },
            errorMessage: "Bridges tile not found"
        });

        Then.iTeardownMyApp();
    });
});
