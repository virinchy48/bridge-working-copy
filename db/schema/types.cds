// ============================================================
// NHVR Bridge Asset & Restriction Management
// Type/enum declarations — extracted from db/schema.cds in v4.7.13
// Entities + extend blocks remain in db/schema.cds.
// Note: full bounded-context split deferred — entities and extend blocks remain in db/schema.cds.
// ============================================================
namespace nhvr;

// ── From original schema.cds lines 351-466 ─────────────
type ExternalSystemType : String(50) enum {
    BANC      = 'BANC';
    AUSTROADS = 'AUSTROADS';
    RMS       = 'RMS';
    VICROADS  = 'VICROADS';
    MRWA      = 'MRWA';
    DPTI      = 'DPTI';
    TMR       = 'TMR';
    OTHER     = 'OTHER';
}

type InspectionOrderType : String(50) enum {
    ROUTINE    = 'ROUTINE';
    SPECIAL    = 'SPECIAL';
    PRINCIPAL  = 'PRINCIPAL';
    UNDERWATER = 'UNDERWATER';
    POST_EVENT = 'POST_EVENT';
    LOAD       = 'LOAD';
}

type InspectionOrderStatus : String(50) enum {
    PLANNED        = 'PLANNED';
    IN_PROGRESS    = 'IN_PROGRESS';
    PENDING_REVIEW = 'PENDING_REVIEW';
    COMPLETED      = 'COMPLETED';
    CANCELLED      = 'CANCELLED';
}

type AccessMethod : String(50) enum {
    WALK         = 'WALK';
    UNDER_BRIDGE = 'UNDER_BRIDGE';
    ROPE         = 'ROPE';
    BOAT         = 'BOAT';
    LANE_CLOSURE = 'LANE_CLOSURE';
    SCAFFOLD     = 'SCAFFOLD';
}

type RatingMethod : String(50) enum {
    VISUAL     = 'VISUAL';
    NDE        = 'NDE';
    LOAD_TEST  = 'LOAD_TEST';
    ANALYTICAL = 'ANALYTICAL';
}

type MaintenanceUrgency : String(50) enum {
    IMMEDIATE   = 'IMMEDIATE';
    SHORT_TERM  = 'SHORT_TERM';
    MEDIUM_TERM = 'MEDIUM_TERM';
    LONG_TERM   = 'LONG_TERM';
    MONITOR     = 'MONITOR';
}

type ElementGroup : String(50) enum {
    DECK           = 'DECK';
    SUPERSTRUCTURE = 'SUPERSTRUCTURE';
    SUBSTRUCTURE   = 'SUBSTRUCTURE';
    SITE           = 'SITE';
    WATERWAY       = 'WATERWAY';
    FURNITURE      = 'FURNITURE';
    BARRIERS       = 'BARRIERS';
}

type MeasurementType : String(50) enum {
    CONDITION_RATING = 'CONDITION_RATING';
    CRACK_WIDTH      = 'CRACK_WIDTH';
    DEFLECTION       = 'DEFLECTION';
    CLEARANCE        = 'CLEARANCE';
    LOAD_CAPACITY    = 'LOAD_CAPACITY';
    SCOUR_DEPTH      = 'SCOUR_DEPTH';
    CORROSION        = 'CORROSION';
}

type DefectSeverity : String(20) enum {
    LOW      = 'LOW';
    MEDIUM   = 'MEDIUM';
    HIGH     = 'HIGH';
    CRITICAL = 'CRITICAL';
}

type DefectExtent : String(20) enum {
    LOCALISED  = 'LOCALISED';
    MODERATE   = 'MODERATE';
    EXTENSIVE  = 'EXTENSIVE';
    PERVASIVE  = 'PERVASIVE';
}

type DefectCategory : String(50) enum {
    STRUCTURAL    = 'STRUCTURAL';
    SERVICEABILITY= 'SERVICEABILITY';
    DURABILITY    = 'DURABILITY';
    SAFETY        = 'SAFETY';
}

type StructuralRisk : String(20) enum {
    NEGLIGIBLE = 'NEGLIGIBLE';
    LOW        = 'LOW';
    MEDIUM     = 'MEDIUM';
    HIGH       = 'HIGH';
    EXTREME    = 'EXTREME';
}

type DefectStatus : String(20) enum {
    OPEN         = 'OPEN';
    UNDER_REPAIR = 'UNDER_REPAIR';
    REPAIRED     = 'REPAIRED';
    CLOSED       = 'CLOSED';
    MONITORING   = 'MONITORING';
}

type DefectPriority : String(20) enum {
    IMMEDIATE = 'IMMEDIATE';
    HIGH      = 'HIGH';
    MEDIUM    = 'MEDIUM';
    LOW       = 'LOW';
    ROUTINE   = 'ROUTINE';
}

// ── From original schema.cds lines 672-682 ─────────────
type RiskBand : String enum { LOW; MEDIUM; HIGH; VERY_HIGH; CRITICAL; }
type ConsequenceType : String enum { SAFETY_FATALITY; ECONOMIC; SOCIAL; ENVIRONMENTAL; NETWORK; MULTIPLE; }
type InterventionType : String enum { ROUTINE_MAINTENANCE; PREVENTIVE; CORRECTIVE; MAJOR_REHABILITATION; REPLACEMENT; MONITORING_ONLY; }
type ProgrammeStatus : String enum { PROPOSED; APPROVED; IN_PROGRESS; COMPLETE; DEFERRED; CANCELLED; }
type HeadwallType : String enum { CONCRETE_WINGWALL; PROJECTING; MITERED; SPILL_THROUGH; NONE; }
type HeritageClass : String enum { STATE; LOCAL; NATIONAL; NOT_LISTED; }
type BridgeUsage : String enum { VEHICULAR; PEDESTRIAN; RAIL; COMBINED_VECH_PED; UTILITY; PIPELINE; ANIMAL; MULTIUSE; }
type SpatialOrientation : String enum { OVERBRIDGE; UNDERBRIDGE; GRADE_SEPARATION; }
type MoveableType : String enum { FIXED; BASCULE; SWING; VERTICAL_LIFT; PONTOON; }
type PBSLevel : String enum { GENERAL_ACCESS; PBS_LEVEL_1; PBS_LEVEL_2; PBS_LEVEL_3; PBS_LEVEL_4; NOT_ASSESSED; }
type ScourVulnerability : String enum { LOW; MODERATE; HIGH; CRITICAL; NOT_APPLICABLE; }

// ── From original schema.cds lines 874-933 ─────────────
type CapacityStatus : String enum {
    FULL;         // Full capacity — no restrictions from capacity limits
    RESTRICTED;   // Below general access — restrictions applied
    REDUCED;      // Temporarily reduced (flood, damage, scour event)
    UNDER_REVIEW; // Load rating in progress — use conservative limits
    NOT_RATED;    // No load rating completed — apply minimum defaults
}

type VehicleCategory : String enum {
    GENERAL_ACCESS;    // Standard vehicles within general access limits
    HIGHER_MASS;       // HML — road-friendly suspension, pre-approved routes
    B_DOUBLE;          // B-double combination
    B_TRAIN;           // B-train combination
    ROAD_TRAIN;        // Road train — 2 or more trailers
    PBS_LEVEL2;        // Performance Based Standards Level 2
    PBS_LEVEL3;        // PBS Level 3
    PBS_LEVEL4;        // PBS Level 4
    OVERSIZE;          // Exceeds dimension limits — individual permit
    OVERMASS;          // Exceeds mass limits — individual permit
    OVERSIZE_OVERMASS; // Both oversize and overmass
    SPECIAL;           // Purpose-built special vehicle (crane, pump, etc.)
}

type SuspensionType : String enum {
    STEEL_LEAF;    // Steel leaf springs — higher dynamic impact on bridge
    AIR_SUSPENSION;// Air suspension — road-friendly, lower DLA
    RUBBER;        // Rubber suspension
    HYDRAULIC;     // Hydraulic — specialist low-loaders
    INDEPENDENT;   // Independent suspension per axle
    ROAD_FRIENDLY; // Meets Austroads road-friendly suspension criteria
}

type PermitStatus : String enum {
    DRAFT;                   // Being prepared
    PENDING;                 // Submitted, awaiting engineering assessment
    APPROVED;                // Approved — all checks passed
    APPROVED_WITH_CONDITIONS;// Approved with specific conditions
    DENIED;                  // Refused — see deniedReason
    EXPIRED;                 // Past expiryDate
    CANCELLED;               // Withdrawn by applicant or authority
    SUSPENDED;               // Temporarily suspended
}

type PermitType : String enum {
    SINGLE_TRIP; // One crossing on a specific date
    MULTI_TRIP;  // Multiple crossings within date range
    ANNUAL;      // Annual permit for regular movements
    NETWORK;     // Network access permit (PBS vehicles, approved routes)
    EMERGENCY;   // Emergency access — relaxed conditions with monitoring
}

type RouteStatus : String enum {
    ACTIVE;       // Route currently approved
    UNDER_REVIEW; // Assessment in progress
    SUSPENDED;    // Temporarily suspended
    EXPIRED;      // Past approval date
    REVOKED;      // Approval withdrawn
}

// ── BridgeCapacity ───────────────────────────────────────────

// ── From original schema.cds lines 1151-1167 ─────────────
type AssetClass : String(30) enum {
    BRIDGE              = 'BRIDGE';
    CULVERT             = 'CULVERT';
    TUNNEL              = 'TUNNEL';
    FORD                = 'FORD';
    CAUSEWAY            = 'CAUSEWAY';
    RETAINING_WALL      = 'RETAINING_WALL';
    OVERHEAD_STRUCTURE  = 'OVERHEAD_STRUCTURE';
    PEDESTRIAN_BRIDGE   = 'PEDESTRIAN_BRIDGE';
    RAILWAY_OVERPASS    = 'RAILWAY_OVERPASS';
    SIGN_GANTRY         = 'SIGN_GANTRY';
    OTHER               = 'OTHER';
}

// ── Extend Bridge with additional classification fields ───────
// Note: assetClass is already defined on the base Bridge entity (line 529)
// Here we add the richer AssetClass-typed fields and operational metadata

// ── From original schema.cds lines 1322-1328 ─────────────
type LoadRatingStatus : String enum {
    ADEQUATE;       // RF >= 1.0 for nominated vehicle
    INADEQUATE;     // RF < 1.0 — restriction required
    CONDITIONAL;    // Adequate subject to conditions (speed limit, escort, etc.)
    UNKNOWN;        // Not yet assessed for this vehicle type
    SUPERSEDED;     // Replaced by a newer rating assessment
}

// ── From original schema.cds lines 1357-1362 ─────────────
type BamsSyncStatus : String enum {
    SYNCED;   // Successfully synced
    PENDING;  // Sync queued or in-progress
    ERROR;    // Last sync failed
    NEVER;    // Never been synced
}

// ── From original schema.cds lines 1376-1382 ─────────────
type FreightRouteClass : String enum {
    PBS;
    HML;
    B_DOUBLE;
    ROAD_TRAIN;
    GENERAL;
}

// ── From original schema.cds lines 1406-1407 ─────────────
type WorkOrderPriority : String enum { HIGH; MEDIUM; LOW; }
type WorkOrderStatus   : String enum { CREATED; IN_PROGRESS; COMPLETED; CANCELLED; }

// ── From original schema.cds lines 1468-1471 ─────────────
type SensorType : String enum {
    LOAD_CELL; STRAIN_GAUGE; ACCELEROMETER; WATER_LEVEL; CRACK_MONITOR; TEMPERATURE; TILT;
}
type AlertLevel : String enum { NORMAL; WARNING; CRITICAL; OFFLINE; }

