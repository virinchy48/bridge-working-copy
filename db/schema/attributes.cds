// ============================================================
// DYNAMIC ATTRIBUTES — extensible metadata system
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';

// ─────────────────────────────────────────────────────────────
// LOOKUP — admin lookup table
// ─────────────────────────────────────────────────────────────
entity Lookup : cuid, managed {
    category    : String(50)  @mandatory;
    code        : String(200) @mandatory;
    description : String(300);
    displayOrder: Integer default 0;
    isActive    : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// ATTRIBUTE DEFINITION — dynamic attribute schema
// ─────────────────────────────────────────────────────────────
entity AttributeDefinition : cuid, managed {
    name        : String(100) @mandatory;
    label       : String(200) @mandatory;
    dataType    : String(20)  @mandatory;
    entityTarget: String(50) default 'BRIDGE';
    isRequired  : Boolean default false;
    defaultValue: String(500);
    displayOrder: Integer default 0;
    isActive        : Boolean default true;
    filterEnabled   : Boolean default true;
    reportEnabled   : Boolean default true;
    massEditEnabled : Boolean default false;
    exportEnabled   : Boolean default true;
    validValues : Composition of many AttributeValidValue on validValues.attribute = $self;
    bridgeAttributes: Association to many BridgeAttribute on bridgeAttributes.attribute = $self;
}

// ─────────────────────────────────────────────────────────────
// ATTRIBUTE VALID VALUE
// ─────────────────────────────────────────────────────────────
entity AttributeValidValue : cuid, managed {
    attribute   : Association to AttributeDefinition @mandatory;
    value       : String(200) @mandatory;
    label       : String(300);
    displayOrder: Integer default 0;
    isActive    : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// BRIDGE ATTRIBUTE — dynamic attribute values (Bridge-only, backward-compat)
// ─────────────────────────────────────────────────────────────
entity BridgeAttribute : cuid, managed {
    bridge      : Association to Bridge @mandatory;
    attribute   : Association to AttributeDefinition @mandatory;
    value       : String(2000);
}

// ─────────────────────────────────────────────────────────────
// ENTITY ATTRIBUTE — polymorphic dynamic attribute values
// Covers: RESTRICTION | DEFECT | PERMIT | ROUTE | INSPECTION_ORDER
// ─────────────────────────────────────────────────────────────
entity EntityAttribute : cuid, managed {
    entityType  : String(50)   @mandatory;   // RESTRICTION|DEFECT|PERMIT|ROUTE|INSPECTION_ORDER
    entityId    : UUID         @mandatory;   // FK to parent entity (no CDS FK — polymorphic)
    attribute   : Association to AttributeDefinition @mandatory;
    value       : String(2000);
}

// ── Backlink association on Bridge ───────────────────────────
extend Bridge with {
    attributes : Association to many BridgeAttribute on attributes.bridge = $self;
}
