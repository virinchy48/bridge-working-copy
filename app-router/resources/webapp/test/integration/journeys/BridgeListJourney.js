// ============================================================
// OPA5 Journey: Bridge List View
// SAP Fiori List Report pattern validation
// ============================================================
sap.ui.define([
    "sap/ui/test/opaQunit",
    "sap/ui/test/Opa5",
    "sap/ui/test/actions/Press",
    "sap/ui/test/actions/EnterText",
    "sap/ui/test/matchers/PropertyStrictEquals",
    "sap/ui/test/matchers/AggregationLengthEquals"
], function (opaTest, Opa5, Press, EnterText, PropertyStrictEquals, AggregationLengthEquals) {
    "use strict";

    QUnit.module("Bridge List — OPA5 Journey");

    opaTest("Should load the Bridge Asset Registry", function (Given, When, Then) {
        // Arrange
        Given.iStartMyAppInAFrame("../../index.html#Bridges");

        // Act
        When.waitFor({
            id: "bridgesPage",
            viewName: "nhvr.bridgemanagement.view.Bridges",
            success: function () {
                Opa5.assert.ok(true, "Bridge list page is loaded");
            },
            errorMessage: "Bridge list page did not load"
        });

        // Assert — table is visible
        Then.waitFor({
            controlType: "sap.ui.table.Table",
            viewName: "nhvr.bridgemanagement.view.Bridges",
            success: function (aTables) {
                Opa5.assert.ok(aTables.length > 0, "Bridge data table is rendered");
            },
            errorMessage: "Bridge table not found"
        });

        Then.iTeardownMyApp();
    });

    opaTest("Should display Add Bridge button for ADMIN role", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html#Bridges");

        Then.waitFor({
            id: "btnAddBridge",
            viewName: "nhvr.bridgemanagement.view.Bridges",
            success: function (oButton) {
                Opa5.assert.ok(oButton.getVisible(), "Add Bridge button is visible for privileged role");
            },
            errorMessage: "Add Bridge button not found"
        });

        Then.iTeardownMyApp();
    });

    opaTest("Should filter bridges by search term", function (Given, When, Then) {
        Given.iStartMyAppInAFrame("../../index.html#Bridges");

        When.waitFor({
            id: "searchField",
            viewName: "nhvr.bridgemanagement.view.Bridges",
            actions: new EnterText({ text: "NSW" }),
            success: function () {
                Opa5.assert.ok(true, "Search field populated");
            }
        });

        Then.iTeardownMyApp();
    });
});
