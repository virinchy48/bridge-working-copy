// ============================================================
// OPA5 Journey: SAP Fiori ShellBar Compliance
// Validates SAP Fiori Design Guidelines — ShellBar requirement
// ============================================================
sap.ui.define([
    "sap/ui/test/opaQunit",
    "sap/ui/test/Opa5",
    "sap/ui/test/actions/Press"
], function (opaTest, Opa5, Press) {
    "use strict";

    QUnit.module("SAP Fiori ShellBar — OPA5 Journey");

    opaTest("ShellBar should display app title", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "nhvrShellBar",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oShellBar) {
                Opa5.assert.strictEqual(
                    oShellBar.getTitle(),
                    "NHVR Bridge Management",
                    "ShellBar displays correct app title"
                );
            },
            errorMessage: "ShellBar title not found"
        });

        Then.iTeardownMyApp();
    });

    opaTest("ShellBar should have notifications enabled", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "nhvrShellBar",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oShellBar) {
                Opa5.assert.ok(oShellBar.getShowNotifications(), "Notifications enabled in ShellBar");
            },
            errorMessage: "ShellBar not found"
        });

        Then.iTeardownMyApp();
    });

    opaTest("ShellBar role switch button should be present", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html");

        Then.waitFor({
            id: "btnRoleSwitch",
            viewName: "nhvr.bridgemanagement.view.Home",
            success: function (oBtn) {
                Opa5.assert.ok(oBtn.getVisible(), "Role switch button in ShellBar additionalContent");
            },
            errorMessage: "Role switch button not found"
        });

        Then.iTeardownMyApp();
    });
});
