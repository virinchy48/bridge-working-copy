# NHVR Bridge Asset & Restriction Management System
## Documentation Index

> **Last updated:** 2026-04-06
> **System version:** 4.7.17
> All files are in `/21 NHVR APP/docs/`

---

## v4.7.17 Technical Documentation (Current)

| # | Document | File | Audience | Contents |
|---|----------|------|----------|----------|
| 1 | **BTP Initial Setup Guide** | `01-BTP-SETUP-GUIDE.md` | DevOps / Infrastructure | Complete BTP environment setup, service provisioning, build and deploy steps, CI/CD, troubleshooting |
| 2 | **User Guide** | `02-USER-GUIDE.md` | End Users (all roles) | Feature-by-feature walkthrough of all 35 screens, workflows, role-specific guidance |
| 3 | **Implementation Guide** | `03-IMPLEMENTATION-GUIDE.md` | Developers / Engineering | Architecture deep dive, data model, adding features, testing strategy, customization |
| 4 | **Admin Configuration Guide** | `04-ADMIN-CONFIGURATION-GUIDE.md` | System Administrators | Role management, dynamic attributes, lookups, integrations, data quality rules, monitoring |
| 5 | **API Reference** | `05-API-REFERENCE.md` | Developers / Integration | OData V4 entity sets, function imports, actions, filtering, pagination, error handling |

---

## Architecture & Technical

| # | Document | File | Audience | Contents |
|---|----------|------|----------|----------|
| 6 | **Target Architecture v4** | `TARGET_ARCHITECTURE_v4.md` | Architecture | Target state architecture for v4.x |
| 7 | **Security Self-Assessment** | `SECURITY_SELF_ASSESSMENT.md` | Security / Compliance | Security controls assessment |
| 8 | **Privacy Impact Assessment** | `PRIVACY_IMPACT_ASSESSMENT.md` | Legal / Compliance | PIA for bridge data handling |
| 9 | **WCAG Accessibility Audit** | `WCAG_ACCESSIBILITY_AUDIT.md` | UX / Compliance | WCAG 2.1 AA compliance audit |

---

## Quick Key Facts

| Item | Value |
|------|-------|
| App URL (BTP) | `https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com` |
| Local Dev URL | `http://localhost:4004/bridge-management/webapp/index.html` |
| Start local server | `npm run watch` |
| BTP CF API | `https://api.cf.us10-001.hana.ondemand.com` |
| CF Org / Space | `592f5a7btrial` / `dev` |
| HANA instance | `Hanaclouddb` |
| System version | 4.7.4 |
| Screens | 35 views, 31 controllers |
| Bridge records | 2,126+ |
| Entity count | 40+ |
| User roles | 8 (Admin, BridgeManager, Inspector, Operator, Executive, Viewer, Uploader, TechAdmin) |
| Role collections | 7 (NHVR_Admin, NHVR_BridgeManager, NHVR_Inspector, NHVR_Operator, NHVR_Viewer, NHVR_Executive, NHVR_TechAdmin) |
| Test count | 1,514 unit/integration + 101 functional |
| Node.js | >=20 |
| CDS version | v9 |
