// ============================================================
// NHVR Bridge Asset & Restriction Management — Service Layer
// OData V4 Service Definition (barrel file)
// ============================================================
//
// This file defines the empty service shell. Domain files under
// srv/services/ extend it with entities, actions, and annotations.
//
// Sub-file layout:
//   bridges.cds          — Bridges, Routes, VehicleClasses + batch import
//   restrictions.cds     — Restrictions + gazette + feed sources
//   inspections.cds      — Inspections, defects, work orders
//   capacity-permits.cds — Capacity, vehicles, permits, load ratings
//   risk-investment.cds  — Risk, investment, deterioration, scour
//   freight.cds          — Freight routes + routing engine
//   integration.cds      — Documents, S/4HANA, BANC, ESRI, IoT
//   admin.cds            — Lookups, attributes, config, audit, notifications
//   tenancy.cds          — Multi-tenant licensing
//   reporting.cds        — Views, analytics, utility functions, proxies
//   _annotations.cds     — All UI + value-help annotations
//
// Analytics service is separate: srv/analytics-service.cds.
// ============================================================

service BridgeManagementService @(path: '/bridge-management') {
}

// Domain files extend the service with entities, actions, functions
using from './services/bridges';
using from './services/restrictions';
using from './services/inspections';
using from './services/capacity-permits';
using from './services/risk-investment';
using from './services/freight';
using from './services/integration';
using from './services/admin';
using from './services/tenancy';
using from './services/reporting';

// Annotations load AFTER all entities are declared
using from './services/_annotations';
