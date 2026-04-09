# NHVR Bridge Management -- User Acceptance Test Scripts

**Application**: NHVR Bridge Asset & Restriction Management System
**Version**: 3.4.8
**Environment**: SAP BTP Cloud Foundry (Trial)
**Date**: 2026-04-03

---

## How to Use This Document

1. Log in to the application with the persona credentials listed for each section.
2. Execute each scenario in order. Record Pass or Fail in the checkbox column.
3. If a step fails, note the actual result and any error messages in the Comments column.
4. All scenarios assume a clean browser session (clear cache / incognito recommended).

---

## Persona 1: Bridge Engineer (BridgeManager role)

**Login**: User with NHVR_BridgeManager role collection assigned
**Local dev user**: bob (password: any)

### Scenario A: Create New Bridge Record

**Precondition**: User is logged in and on the Home screen. At least one Route exists in the system.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to the Bridges list screen via the sidebar or Home tile. | Bridges list loads with existing bridge records displayed. | [ ] |
| 2 | Click the "Create Bridge" button in the toolbar. | The Bridge Form opens in create mode with empty fields. | [ ] |
| 3 | Enter a unique Bridge ID (e.g., TEST-BR-001). | Field accepts the value without error. | [ ] |
| 4 | Fill in mandatory fields: Bridge Name, State (e.g., NSW), LGA, Road Name, Latitude, Longitude. | All fields accept valid values. Latitude accepts values between -90 and 90; Longitude between -180 and 180. | [ ] |
| 5 | Set Condition Rating to 7 and Condition Score to 70. | Fields accept numeric values. Condition label auto-derives to the appropriate rating category. | [ ] |
| 6 | Select a Route from the Route dropdown. | Dropdown shows available routes and selection is accepted. | [ ] |
| 7 | Click "Save". | Success message displayed. User is navigated to the Bridge Detail screen for the newly created bridge. | [ ] |
| 8 | Verify the bridge appears in the Bridges list when navigating back. | The new bridge (TEST-BR-001) is visible in the list with correct State and Condition values. | [ ] |

---

### Scenario B: Add Mass Restriction to Existing Bridge

**Precondition**: User is logged in. At least one bridge exists (e.g., TEST-BR-001 from Scenario A).

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to the Bridges list and open bridge TEST-BR-001. | Bridge Detail screen loads with all bridge information displayed. | [ ] |
| 2 | Scroll to the Restrictions section. | Restrictions table is visible (may be empty). | [ ] |
| 3 | Click "Add Restriction". | The Add Restriction dialog opens with fields for restriction type, value, and dates. | [ ] |
| 4 | Select restriction type "MASS" from the Type dropdown. | Field accepts the selection. Value field label updates to reflect mass units (tonnes). | [ ] |
| 5 | Enter restriction value: 42.5 (tonnes). | Numeric value is accepted. System validates that value is greater than 0. | [ ] |
| 6 | Enter Valid From Date as today and Valid To Date as 6 months from today. | Date fields accept valid dates. System validates that From date is before To date. | [ ] |
| 7 | Enter a reason: "Structural assessment pending deck replacement". | Free text field accepts the input. | [ ] |
| 8 | Click "Save" or "Apply". | Success message displayed. The restriction appears in the Restrictions table with status Active and the entered values. | [ ] |
| 9 | Verify an Audit Log entry was created for the restriction. | Navigate to the Audit Log section; a record exists showing the restriction creation with timestamp and user. | [ ] |

---

### Scenario C: Change Bridge Condition Rating

**Precondition**: User is logged in. Bridge TEST-BR-001 exists with Condition Rating 7.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to Bridge Detail for TEST-BR-001. | Bridge Detail loads showing current Condition Rating of 7. | [ ] |
| 2 | Click "Change Condition" action button. | A dialog opens with fields for new Condition Value and Score. | [ ] |
| 3 | Set new Condition Rating to 4 and Condition Score to 40. | Fields accept the values. | [ ] |
| 4 | Confirm the change. | Success message displayed. The Bridge Detail screen updates to show Condition Rating 4 and the corresponding condition label. | [ ] |
| 5 | Verify the Condition History section shows the change. | A new entry appears in Bridge Condition History with old value (7), new value (4), timestamp, and the user who made the change. | [ ] |

---

## Persona 2: Inspector (Inspector role)

**Login**: User with NHVR_Inspector role collection assigned
**Local dev user**: (assign Inspector role via RoleConfig or mock auth)

### Scenario A: Create Inspection Order

**Precondition**: User is logged in. At least one bridge exists in the system.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to the Inspections screen via the sidebar or Home tile. | Inspections list loads showing existing inspection orders (if any). | [ ] |
| 2 | Click "Create Inspection Order". | The inspection creation form or dialog opens. | [ ] |
| 3 | Search for and select a bridge (e.g., TEST-BR-001) in the Bridge field. | Bridge search help displays matching bridges. Selection populates bridge details. | [ ] |
| 4 | Set Inspection Type to "Routine" and Planned Date to a future date. | Fields accept the values. | [ ] |
| 5 | Click "Save". | Success message displayed. New inspection order appears in the list with status "Planned". | [ ] |
| 6 | Verify the inspection order is visible on the Home screen Inspections tile. | Home screen tile count increments to reflect the new planned inspection. | [ ] |

---

### Scenario B: Raise Defect During Inspection

**Precondition**: User is logged in. An inspection order exists in "In Progress" status (use "Start Inspection" action if currently in "Planned" status).

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Open the in-progress inspection order from the Inspections list. | Inspection Detail screen loads showing the inspection and associated bridge information. | [ ] |
| 2 | Navigate to the Defects section within the inspection. | Defects table is visible (may be empty). | [ ] |
| 3 | Click "Add Defect" or "Raise Defect". | A defect creation form or dialog opens. | [ ] |
| 4 | Enter defect details: Component = "Deck", Severity = "Major", Description = "Longitudinal cracking observed across 3 spans". | All fields accept the input values. | [ ] |
| 5 | Click "Save". | Success message displayed. The defect appears in the Defects table with status "Open" and severity "Major". | [ ] |
| 6 | Verify the defect is linked to the correct bridge. | Defect record shows the bridge ID and name of the inspected bridge. | [ ] |
| 7 | Verify the Home screen "Open Defects" KPI tile reflects the new defect. | Open Defects count increments by 1. | [ ] |

---

### Scenario C: Complete Inspection With Findings

**Precondition**: User is logged in. An inspection order exists in "In Progress" status with at least one defect raised (from Scenario B).

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Open the in-progress inspection order. | Inspection Detail loads with status "In Progress" and the previously raised defect(s) visible. | [ ] |
| 2 | Click "Complete Inspection" action button. | A completion dialog opens requesting summary findings, overall rating, and recommended actions. | [ ] |
| 3 | Enter Overall Rating: 4, Summary: "Deck deterioration requires monitoring. One major defect raised." | Fields accept the input. | [ ] |
| 4 | Enter Recommended Action: "Schedule detailed structural assessment within 90 days". | Field accepts the input. | [ ] |
| 5 | Confirm completion. | Success message displayed. Inspection status changes to "Completed". Completion date is set to today. | [ ] |
| 6 | Verify the inspection is no longer editable. | Attempting to modify fields shows them as read-only or disabled. The "Complete Inspection" button is no longer available. | [ ] |
| 7 | Navigate to the associated bridge and check that its condition history reflects any rating change from the inspection. | If the inspection updated the bridge condition, a new entry appears in Bridge Condition History. | [ ] |

---

## Persona 3: System Administrator (Admin role)

**Login**: User with NHVR_Admin role collection assigned
**Local dev user**: alice (password: any)

### Scenario A: Configure Role Permissions

**Precondition**: User is logged in. Admin Configuration screen is accessible.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to Admin Configuration from the sidebar. | Admin Configuration screen loads with tabs for Attributes, Role Config, and Lookups. | [ ] |
| 2 | Select the "Role Config" tab. | Role configuration table loads showing all roles (Admin, BridgeManager, Inspector, Operator, Executive, Viewer) and their feature/field settings. | [ ] |
| 3 | Locate the "Inspector" role row and toggle the "featureEnabled" switch for a specific feature (e.g., "Permit Management") to OFF. | Toggle switches state. The row visually reflects the disabled state. | [ ] |
| 4 | Click "Save" on the Role Config section. | Success message displayed. Changes are persisted. | [ ] |
| 5 | Open a new browser tab and log in as an Inspector user. | Inspector user session starts. | [ ] |
| 6 | Verify the disabled feature is not visible to the Inspector. | The feature that was toggled off (e.g., Permit Management tile or menu item) is hidden from the Inspector's view. | [ ] |
| 7 | Return to the Admin session and re-enable the feature. Save again. | Feature is re-enabled and the Inspector can see it after refreshing. | [ ] |

---

### Scenario B: Perform Mass Upload via CSV

**Precondition**: User is logged in. A valid CSV file with bridge data is prepared (matching the expected column format from the upload template).

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to the Mass Upload screen from the sidebar or Admin area. | Mass Upload screen loads with the file upload area and instructions visible. | [ ] |
| 2 | Download the CSV template (if a template download link is available). | Template file downloads with the correct column headers matching the bridge data model. | [ ] |
| 3 | Click "Upload" or drag-and-drop the prepared CSV file. | File is accepted. A preview table shows the parsed rows with column mappings. | [ ] |
| 4 | Review the preview. Verify row count matches the CSV file. | Preview displays the correct number of rows and all columns are mapped to the correct bridge fields. | [ ] |
| 5 | Click "Confirm Upload" or "Import". | Progress indicator appears. After processing, a summary is displayed showing records created, updated, and any errors. | [ ] |
| 6 | Verify newly uploaded bridges appear in the Bridges list. | Navigating to the Bridges list and searching for the uploaded bridge IDs returns the new records with correct data. | [ ] |
| 7 | Check the Upload Log for the import record. | Upload Log shows an entry with timestamp, user, file name, record counts, and status (Success or Partial). | [ ] |

---

### Scenario C: View Audit Log for Recent Changes

**Precondition**: User is logged in. Data changes have been made in previous scenarios (bridge creation, restriction addition, condition change, inspection completion).

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Navigate to the Audit Log screen from the sidebar. | Audit Log list loads showing recent entries sorted by timestamp (newest first). | [ ] |
| 2 | Filter the audit log by Entity Type = "Bridge". | The list filters to show only bridge-related changes. | [ ] |
| 3 | Locate the entry for the bridge creation performed in Persona 1, Scenario A. | An entry exists with Action = "CREATE", Entity = "Bridge", Entity ID matching TEST-BR-001, and the correct user and timestamp. | [ ] |
| 4 | Expand or click the audit log entry to view details. | Detail view shows the field values that were set during creation (bridge name, state, condition, coordinates). | [ ] |
| 5 | Filter by Entity Type = "Restriction". | The list updates to show restriction-related audit entries. | [ ] |
| 6 | Verify the restriction creation from Persona 1, Scenario B is logged. | An entry exists with Action = "CREATE", Entity = "Restriction", the correct bridge reference, and the restriction details (type, value). | [ ] |
| 7 | Clear all filters and verify the log is immutable. | No "Edit" or "Delete" buttons are available on any audit log entry. The log is read-only. | [ ] |

---

## Sign-Off

| Role | Tester Name | Date | Signature |
|------|-------------|------|-----------|
| Bridge Engineer | | | |
| Inspector | | | |
| System Administrator | | | |
| UAT Lead | | | |
