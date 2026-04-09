# NHVR Bridge Management — Privacy Impact Assessment (PIA)
## Aligned to: Australian Privacy Act 1988 | OAIC PIA Guide (2023)

---

| Field | Value |
|-------|-------|
| Application | NHVR Bridge Asset & Restriction Management |
| Version | 3.2.1 |
| PIA Date | 2026-03-30 |
| PIA Author | Internal development team |
| Review Status | DRAFT — Pending legal and privacy officer sign-off |
| Classification | OFFICIAL — Internal use only |
| Trigger | New system deployment; data hosted on US East region (sovereignty gap) |

---

## 1. Project Overview

### 1.1 Purpose
The NHVR Bridge Asset & Restriction Management System is a SAP BTP-hosted web application used by National Heavy Vehicle Regulator (NHVR) staff to manage 2,126+ bridge assets across the Australian national road network. The system supports:

- Tracking bridge physical condition and structural ratings (AS 5100 standard)
- Applying and managing weight, height, width, and speed restrictions
- Recording inspection outcomes and defect registers
- Managing heavy vehicle permits and route assessments
- Bulk data upload via CSV for bridge data maintenance

### 1.2 Primary Data Nature
**This system primarily handles INFRASTRUCTURE data, not citizen PII.** The core business objects — bridges, restrictions, routes, vehicle classes, inspection records, and defects — describe physical assets and operational rules. They contain no names, addresses, financial records, or identifying information about members of the public.

However, the system does capture and store **a limited category of personal data relating to NHVR staff and contractors**, as described in Section 2.

### 1.3 Applicable Privacy Framework
- Australian Privacy Act 1988 (Cth) — Australian Privacy Principles (APPs) 1–13
- OAIC Privacy Impact Assessment Guide (2023)
- NHVR Information Security Policy (reference document — not in scope of this PIA)

---

## 2. Data Inventory — Personal Data Processed

### 2.1 Personal Data Elements Identified

| Field | Entity | Description | Classification |
|-------|--------|-------------|----------------|
| `userId` | `AuditLog` | XSUAA user identifier (typically email address) of user who performed a data change | Personal — staff |
| `userRole` | `AuditLog` | Role of the user at time of action (e.g., ADMIN, BRIDGE_MANAGER) | Operational metadata |
| `performedBy` | `BridgeEventLog` | User identifier of staff member who performed a bridge state change (close, reopen, restriction) | Personal — staff |
| `changedBy` | `BridgeConditionHistory` | User identifier of staff member who updated a bridge condition rating | Personal — staff |
| `changedBy` | `RestrictionChangeLog` | User identifier of staff member who modified a restriction | Personal — staff |
| `inspector` | `InspectionRecord` | Name of inspector who conducted an AS 5100 formal bridge inspection | Personal — contractor/staff |
| `assignedTo` | `InspectionOrder` | User or team assigned to an inspection work order | Personal — staff/contractor |
| `changedBy` | `TenantAttributeChangeLog` | User who modified a tenant attribute | Personal — staff |
| SAP XSUAA session | App Router | JWT token containing user email, name, and assigned roles; stored in session cookie | Personal — staff |

### 2.2 What Is NOT Collected
The following personal data categories are explicitly **not** collected by this system:
- Citizen or public user data of any kind
- Heavy vehicle operator names, licences, or ABNs (permits reference permit IDs, not individuals)
- Financial data, payment information, or credit details
- Health information, biometric data, or sensitive personal information (as defined in Privacy Act s.6)
- Location data of individuals
- Device identifiers or browser fingerprints persisted to the database

### 2.3 Volume and Sensitivity
The personal data in this system consists of internal staff identifiers (XSUAA email addresses) stored in audit and event log tables. This is low-sensitivity personal data typical of enterprise business systems. There is no mass collection of citizen PII.

---

## 3. Data Flow

### 3.1 End-to-End Flow

```
NHVR Staff (browser)
        │
        ▼ HTTPS — XSUAA JWT issued, stored in session cookie
SAP App Router (nhvr-bridge-app-router)
  Cloud Foundry — US10-001 (US East, Virginia)
  Session timeout: 15 minutes
        │
        ▼ JWT forwarded on every OData call
CAP Backend (nhvr-bridge-srv)
  Cloud Foundry — US10-001 (US East, Virginia)
  Extracts req.user.id from JWT → writes to AuditLog.userId
        │
        ▼ HDI Container
SAP HANA Cloud (nhvr-db)
  Service plan: hdi-shared
  Region: US10-001 (US East, Virginia, USA)
  Data at rest: AES-256 (SAP-managed)
  Backup: SAP BTP managed backups (US region)
```

### 3.2 External Services (Frontend-Only)
The browser makes direct calls to the following external services for map functionality. **No personal data is transmitted to these services** — only geographic coordinates of bridge assets (public infrastructure data):
- `https://nominatim.openstreetmap.org` — place name lookup
- `https://api.openrouteservice.org` — route calculation
- `https://router.project-osrm.org` — alternative routing

### 3.3 Data Retention
No formal data retention policy has been defined in this version of the application. AuditLog, BridgeEventLog, BridgeConditionHistory, and RestrictionChangeLog records accumulate indefinitely. A retention and deletion policy must be defined before production deployment.

---

## 4. Privacy Risks and Controls

### Risk 1 — Data Sovereignty (HIGH RISK)
| | |
|---|---|
| **Description** | All application data — including staff userId fields in AuditLog — is stored in SAP HANA Cloud on the **US10-001 (US East, Virginia, USA)** region. Australian government agencies and critical infrastructure operators are expected to comply with data sovereignty requirements under the Australian Protective Security Policy Framework (PSPF) and ASD guidance. NHVR is classified as a critical infrastructure entity under the Security of Critical Infrastructure Act 2018 (Cth). |
| **Risk** | Staff personal data (email addresses in AuditLog) and operational bridge restriction data are held outside Australian jurisdiction. The US government may compel access under US law (e.g., CLOUD Act). |
| **Current Control** | None — data is on US East. |
| **Required Action** | Migrate to SAP BTP **AP10 (Australia, Sydney)** region before production deployment with operational data. This requires reprovisioning the HANA Cloud instance, updating `mta.yaml` CF API endpoint, and redeploying all BTP services. |
| **Owner** | NHVR CTO / BTP Platform Administrator |
| **Target Date** | Prior to production go-live |

### Risk 2 — Staff Email Addresses in Audit Logs (MEDIUM RISK)
| | |
|---|---|
| **Description** | `AuditLog.userId`, `BridgeEventLog.performedBy`, `BridgeConditionHistory.changedBy`, and `RestrictionChangeLog.changedBy` store XSUAA user identifiers, which are typically employee email addresses, in plaintext in the HANA Cloud database. |
| **Risk** | In the event of a database breach, or if AuditLog data is exported or shared, staff email addresses would be exposed. Under APP 11 (security of personal information), NHVR must take reasonable steps to protect personal information from misuse, interference, loss, and unauthorised access. |
| **Current Control** | HANA Cloud AES-256 encryption at rest; XSUAA-gated application access; no public AuditLog export feature. |
| **Required Action** | Implement pseudonymisation: store a hashed or tokenised user reference in audit fields for production, with a separate secured mapping table held by the identity administrator. Alternatively, ensure AuditLog data is classified as OFFICIAL:Sensitive and access restricted to Admin role only. |
| **Owner** | Application developer / Data architect |
| **Target Date** | Pre-production |

### Risk 3 — Inspector Names in InspectionRecord (LOW-MEDIUM RISK)
| | |
|---|---|
| **Description** | `InspectionRecord.inspector` stores the name (free text, up to 100 chars) of the bridge inspector. This may be the full name of an employee or contractor. |
| **Risk** | Contractor names associated with specific bridge inspection outcomes could be used to profile or identify individuals. Limited risk given operational context. |
| **Current Control** | Field is accessible only to authenticated NHVR users with Viewer scope or higher. |
| **Required Action** | Confirm with HR and procurement whether contractors have been notified that their names are recorded in the system (APP 5 — notification at or before collection). |
| **Owner** | NHVR Privacy Officer |
| **Target Date** | Pre-production |

### Risk 4 — No Formal Data Retention Policy (MEDIUM RISK)
| | |
|---|---|
| **Description** | AuditLog, BridgeEventLog, BridgeConditionHistory, and RestrictionChangeLog accumulate indefinitely with no deletion mechanism. Staff email addresses in these logs may be retained beyond any reasonable business need, contrary to APP 11.2 (destruction/de-identification when no longer needed). |
| **Current Control** | None. |
| **Required Action** | Define a data retention schedule (suggested: AuditLog — 7 years for infrastructure records; personal data fields — anonymise after staff departure or 3 years). Implement a scheduled archival/anonymisation job. |
| **Owner** | NHVR Records Manager / Application developer |
| **Target Date** | Within 6 months of production deployment |

### Risk 5 — XSUAA Session Cookie (LOW RISK)
| | |
|---|---|
| **Description** | The SAP App Router manages XSUAA sessions via an HTTP-only, secure session cookie. Session timeout is 15 minutes (xs-app.json). JWT access token validity is 1 hour. |
| **Current Control** | HTTP-only and Secure cookie flags enforced by SAP App Router. 15-minute idle session timeout. HSTS header enforced. |
| **Required Action** | None — controls are adequate. |

---

## 5. Data Sovereignty Issue — Detailed Analysis

### 5.1 Current State
The NHVR Bridge Management application is deployed on **SAP BTP Cloud Foundry, region US10-001 (US East — Virginia, USA)**. This was selected as the initial development and trial environment due to SAP BTP trial account availability.

### 5.2 Applicable Australian Requirements
- **PSPF Policy 10** — Mandatory for Australian Government entities: official information must be stored in Australia unless a risk assessment justifies offshore storage.
- **Security of Critical Infrastructure Act 2018** — NHVR's role as the national heavy vehicle regulator places it within the transport sector critical infrastructure. The bridge restriction data managed by this system directly informs heavy vehicle route approvals — loss or manipulation of this data could affect national supply chain integrity.
- **ASD Cloud Computing Security Considerations** — Recommends Australian-hosted services for OFFICIAL and above data.

### 5.3 Impact Assessment
| Data Type | Sovereignty Risk | Notes |
|-----------|-----------------|-------|
| Bridge asset data (2,126 records) | MEDIUM | Coordinates, condition, restrictions — public infrastructure data; no direct PII but operationally sensitive |
| AuditLog with userId (email) | HIGH | Personal data of NHVR staff held in US jurisdiction |
| XSUAA JWT/session metadata | MEDIUM | Processed through SAP BTP US10-001 App Router |
| Backup data | HIGH | SAP-managed backups remain in US10-001 region |

### 5.4 Remediation Path
1. Provision SAP HANA Cloud instance in **AP10 (Australia — Sydney)** region.
2. Update `mta.yaml` Cloud Foundry API endpoint and space from `us10-001` to `ap10`.
3. Rebuild and redeploy the full MTA archive to the AP10 space.
4. Update `xs-security.json` redirect URIs to reflect the new AP10 App Router URL.
5. Validate XSUAA service instance is created in AP10.
6. Decommission the US10-001 deployment and confirm data deletion.

**Estimated effort**: 3–5 business days for platform migration. No application code changes required.

---

## 6. Australian Privacy Principles — Compliance Summary

| APP | Principle | Status | Notes |
|-----|-----------|--------|-------|
| APP 1 | Open and transparent management of personal information | PARTIAL | Privacy policy for staff not yet documented for this system |
| APP 2 | Anonymity and pseudonymity | PARTIAL | System requires XSUAA login; anonymous access not applicable. Audit fields not pseudonymised — see Risk 2 |
| APP 3 | Collection of solicited personal information | COMPLIANT | Only collects userId (operational necessity for audit trail) and inspector name (operational field) |
| APP 4 | Dealing with unsolicited personal information | COMPLIANT | No unsolicited PII pathways identified |
| APP 5 | Notification of collection | OPEN | Staff and contractors must be notified that names/emails are recorded in audit logs |
| APP 6 | Use or disclosure of personal information | COMPLIANT | Audit data used only for internal audit purposes; no third-party disclosure |
| APP 7 | Direct marketing | N/A | No marketing function |
| APP 8 | Cross-border disclosure | HIGH RISK | US10-001 hosting constitutes cross-border disclosure — see Section 5 |
| APP 9 | Adoption, use, disclosure of government related identifiers | N/A | No government identifiers (TFN, Medicare) processed |
| APP 10 | Quality of personal information | COMPLIANT | Audit fields derived from authenticated XSUAA identity — accurate by design |
| APP 11 | Security of personal information | PARTIAL | Encryption at rest present; retention policy absent; US jurisdiction risk |
| APP 12 | Access to personal information | OPEN | No mechanism for a staff member to request or review their own audit log entries |
| APP 13 | Correction of personal information | OPEN | No mechanism for correction of personal information in AuditLog |

---

## 7. Recommendations Summary

| Priority | Recommendation | APP | Timeline |
|----------|---------------|-----|----------|
| CRITICAL | Migrate deployment to SAP BTP AP10 (Australia) before handling operational data | APP 8, APP 11 | Before go-live |
| HIGH | Pseudonymise userId / performedBy / changedBy in AuditLog and event logs | APP 2, APP 11 | Before go-live |
| HIGH | Document and communicate staff privacy notice (collection notification) | APP 5 | Before go-live |
| MEDIUM | Define data retention schedule; implement anonymisation job for departed staff | APP 11 | Within 6 months |
| MEDIUM | Implement APP 12/13 process: allow staff to access and request correction of their audit log entries | APP 12, APP 13 | Within 12 months |
| LOW | Conduct annual PIA review as system evolves | APP 1 | Annually |

---

## 8. Sign-Off

This Privacy Impact Assessment has been prepared to assess the privacy implications of the NHVR Bridge Asset & Restriction Management System prior to production deployment.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Privacy Officer | | | |
| CTO / System Owner | | | |
| Legal Counsel | | | |
| Project Manager | | | |

**Next Review Date**: 2027-03-30 (annual), or on any material change to data flows, hosting region, or data types collected.

---

*Document classification: OFFICIAL — Internal use only*
*Prepared in accordance with: OAIC Privacy Impact Assessment Guide (2023)*
*Reference: Australian Privacy Act 1988 (Cth), Schedule 1 — Australian Privacy Principles*
