// ============================================================
// NHVR Bridge Management — OPA5 Integration Test Suite
// SAP UI5 One Page Acceptance (OPA5) framework
// ============================================================
/* global QUnit */
sap.ui.require([
    "nhvr/bridgemanagement/test/integration/journeys/NavigationJourney",
    "nhvr/bridgemanagement/test/integration/journeys/BridgeListJourney",
    "nhvr/bridgemanagement/test/integration/journeys/RoleBasedAccessJourney",
    "nhvr/bridgemanagement/test/integration/journeys/ShellBarJourney"
], function () {
    "use strict";
    QUnit.start();
});
