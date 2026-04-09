// ============================================================
// NHVR Bridge Asset & Restriction Management — Data Model
// SAP CAP CDS Schema (barrel file)
// ============================================================
//
// This file is a barrel — it imports all domain sub-files under
// db/schema/. Each sub-file owns a bounded context.
//
// Sub-file layout:
//   types.cds            — 39 enum types
//   core.cds             — Bridge, Route, VehicleClass + infra extends
//   attributes.cds       — dynamic attribute system
//   restrictions.cds     — restrictions, gazette, feed sources
//   inspection.cds       — inspections, defects, work orders
//   capacity-permits.cds — capacity, vehicles, permits, load ratings
//   risk-investment.cds  — risk, investment, deterioration, scour
//   freight.cds          — freight routes, bridge assignments
//   integration.cds      — external refs, docs, sensors, BAMS, S/4
//   tenancy.cds          — multi-tenant licensing
//   admin.cds            — config, audit, notifications, thresholds
//
// srv/service.cds imports via `using nhvr from '../db/schema';`
// which transitively resolves all entities through this barrel.
//
// Analytics entities live in db/analytics.cds (separate bounded context).
// ============================================================

namespace nhvr;

using { cuid, managed, Country } from '@sap/cds/common';

using from './schema/types';
using from './schema/core';
using from './schema/attributes';
using from './schema/restrictions';
using from './schema/inspection';
using from './schema/capacity-permits';
using from './schema/risk-investment';
using from './schema/freight';
using from './schema/integration';
using from './schema/tenancy';
using from './schema/admin';
