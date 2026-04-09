using BridgeManagementService from '../service';


// ─────────────────────────────────────────────────────────────
// UI ANNOTATIONS - Fiori Elements metadata
// ─────────────────────────────────────────────────────────────

annotate BridgeManagementService.Bridges with @(
    UI.LineItem: [
        { Value: bridgeId,       Label: 'Bridge ID'      },
        { Value: name,           Label: 'Bridge Name'    },
        { Value: region,         Label: 'Region'         },
        { Value: state,          Label: 'State'          },
        { Value: routeCode,      Label: 'Route'          },
        { Value: structureType,  Label: 'Structure Type' },
        { Value: condition,      Label: 'Condition'      },
        { Value: postingStatus,  Label: 'Posting Status' },
        { Value: inspectionDate, Label: 'Last Inspection'}
    ],
    UI.SelectionFields: [
        region, state, postingStatus, condition, route_ID
    ],
    UI.HeaderInfo: {
        TypeName      : 'Bridge',
        TypeNamePlural: 'Bridges',
        Title         : { Value: name },
        Description   : { Value: bridgeId }
    },
    UI.FieldGroup #GeneralInfo: {
        Label: 'General Information',
        Data: [
            { Value: bridgeId,         Label: 'Bridge ID'       },
            { Value: name,             Label: 'Bridge Name'     },
            { Value: region,           Label: 'Region'          },
            { Value: state,            Label: 'State'           },
            { Value: structureType,    Label: 'Structure Type'  },
            { Value: material,         Label: 'Material'        },
            { Value: yearBuilt,        Label: 'Year Built'      },
            { Value: routeCode,        Label: 'Route'           },
            { Value: routeKm,          Label: 'Route KM Marker' }
        ]
    },
    UI.FieldGroup #PhysicalDetails: {
        Label: 'Physical Details',
        Data: [
            { Value: spanLengthM,      Label: 'Span Length (m)'      },
            { Value: deckWidthM,       Label: 'Deck Width (m)'       },
            { Value: clearanceHeightM, Label: 'Clearance Height (m)' },
            { Value: latitude,         Label: 'Latitude'             },
            { Value: longitude,        Label: 'Longitude'            }
        ]
    },
    UI.FieldGroup #Condition: {
        Label: 'Condition & Status',
        Data: [
            { Value: condition,        Label: 'Condition Rating' },
            { Value: conditionScore,   Label: 'Condition Score'  },
            { Value: inspectionDate,   Label: 'Inspection Date'  },
            { Value: postingStatus,    Label: 'Posting Status'   }
        ]
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'General Information', Target: '@UI.FieldGroup#GeneralInfo'    },
        { $Type: 'UI.ReferenceFacet', Label: 'Physical Details',    Target: '@UI.FieldGroup#PhysicalDetails' },
        { $Type: 'UI.ReferenceFacet', Label: 'Condition & Status',  Target: '@UI.FieldGroup#Condition'       },
        { $Type: 'UI.ReferenceFacet', Label: 'Restrictions',        Target: 'restrictions/@UI.LineItem'      },
        { $Type: 'UI.ReferenceFacet', Label: 'Dynamic Attributes',  Target: 'attributes/@UI.LineItem'        }
    ]
);

annotate BridgeManagementService.Restrictions with @(
    UI.LineItem: [
        { Value: restrictionType,  Label: 'Type'           },
        { Value: value,            Label: 'Value'          },
        { Value: unit,             Label: 'Unit'           },
        { Value: vehicleClassName, Label: 'Vehicle Class'  },
        { Value: validFromDate,    Label: 'Valid From'     },
        { Value: validToDate,      Label: 'Valid To'       },
        { Value: status,           Label: 'Status'         },
        { Value: permitRequired,   Label: 'Permit Required'}
    ],
    UI.HeaderInfo: {
        TypeName      : 'Restriction',
        TypeNamePlural: 'Restrictions',
        Title         : { Value: restrictionType },
        Description   : { Value: bridgeName }
    },
    UI.FieldGroup #RestrictionDetails: {
        Label: 'Restriction Details',
        Data: [
            { Value: restrictionType,  Label: 'Restriction Type'    },
            { Value: value,            Label: 'Value'               },
            { Value: unit,             Label: 'Unit'                },
            { Value: vehicleClassName, Label: 'Vehicle Class'       },
            { Value: direction,        Label: 'Direction'           },
            { Value: status,           Label: 'Status'              },
            { Value: permitRequired,   Label: 'Permit Required'     },
            { Value: conditionCode,    Label: 'NHVR Condition Code' }
        ]
    },
    UI.FieldGroup #TimeValidity: {
        Label: 'Time Validity',
        Data: [
            { Value: validFromDate,    Label: 'Valid From Date' },
            { Value: validToDate,      Label: 'Valid To Date'   },
            { Value: validFromTime,    Label: 'Valid From Time' },
            { Value: validToTime,      Label: 'Valid To Time'   },
            { Value: dayOfWeek,        Label: 'Days of Week'    }
        ]
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'Restriction Details', Target: '@UI.FieldGroup#RestrictionDetails' },
        { $Type: 'UI.ReferenceFacet', Label: 'Time Validity',       Target: '@UI.FieldGroup#TimeValidity'       }
    ]
);

annotate BridgeManagementService.AttributeDefinitions with @(
    UI.LineItem: [
        { Value: name,         Label: 'Attribute Name' },
        { Value: label,        Label: 'Display Label'  },
        { Value: dataType,     Label: 'Data Type'      },
        { Value: entityTarget, Label: 'Target Entity'  },
        { Value: isRequired,   Label: 'Required'       },
        { Value: displayOrder, Label: 'Display Order'  },
        { Value: isActive,     Label: 'Active'         }
    ],
    UI.HeaderInfo: {
        TypeName      : 'Attribute Definition',
        TypeNamePlural: 'Attribute Definitions',
        Title         : { Value: label },
        Description   : { Value: name }
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'Attribute Details', Target: '@UI.FieldGroup#AttrDetails' },
        { $Type: 'UI.ReferenceFacet', Label: 'Valid Values',      Target: 'validValues/@UI.LineItem'   }
    ],
    UI.FieldGroup #AttrDetails: {
        Label: 'Attribute Details',
        Data: [
            { Value: name,         Label: 'Internal Name' },
            { Value: label,        Label: 'Display Label' },
            { Value: dataType,     Label: 'Data Type'     },
            { Value: entityTarget, Label: 'Target Entity' },
            { Value: isRequired,   Label: 'Required'      },
            { Value: defaultValue, Label: 'Default Value' },
            { Value: displayOrder, Label: 'Display Order' },
            { Value: isActive,     Label: 'Active'        }
        ]
    }
);

annotate BridgeManagementService.BridgeAttributes with @(
    UI.LineItem: [
        { Value: attribute.label,    Label: 'Attribute' },
        { Value: attribute.dataType, Label: 'Type'      },
        { Value: value,              Label: 'Value'     }
    ]
);

// ─────────────────────────────────────────────────────────────
// VALUE HELP ANNOTATIONS - Search help for filter/input fields
// ─────────────────────────────────────────────────────────────

annotate BridgeManagementService.Bridges with {
    condition @(
        Common.Label: 'Condition',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'CONDITION', ValueListProperty: 'category'    },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: condition, ValueListProperty: 'code'  },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                         }
            ]
        }
    );
    postingStatus @(
        Common.Label: 'Posting Status',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'POSTING_STATUS', ValueListProperty: 'category'       },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: postingStatus, ValueListProperty: 'code'      },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                 }
            ]
        }
    );
    structureType @(
        Common.Label: 'Structure Type',
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'STRUCTURE_TYPE', ValueListProperty: 'category'       },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: structureType, ValueListProperty: 'code'      },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                 }
            ]
        }
    );
    material @(
        Common.Label: 'Material',
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'MATERIAL', ValueListProperty: 'category'     },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: material, ValueListProperty: 'code'  },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                         }
            ]
        }
    );
    state @(
        Common.Label: 'State',
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'STATE', ValueListProperty: 'category'  },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: state, ValueListProperty: 'code'},
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                   }
            ]
        }
    );
    region @(
        Common.Label: 'Region',
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'REGION', ValueListProperty: 'category'   },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: region, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                      }
            ]
        }
    );
    route @(
        Common.Label: 'Route',
        Common.ValueList: {
            CollectionPath: 'Routes',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: route_ID, ValueListProperty: 'ID'  },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'routeCode'                         },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                       }
            ]
        }
    );
};

annotate BridgeManagementService.Restrictions with {
    restrictionType @(
        Common.Label: 'Restriction Type',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'RESTRICTION_TYPE', ValueListProperty: 'category'        },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: restrictionType, ValueListProperty: 'code'       },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                    }
            ]
        }
    );
    status @(
        Common.Label: 'Status',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'RESTRICTION_STATUS', ValueListProperty: 'category'  },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: status, ValueListProperty: 'code'           },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                               }
            ]
        }
    );
    vehicleClass @(
        Common.Label: 'Vehicle Class',
        Common.ValueList: {
            CollectionPath: 'VehicleClasses',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: vehicleClass_ID, ValueListProperty: 'ID'  },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'code'                                     },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name'                                     }
            ]
        }
    );
    bridge @(
        Common.Label: 'Bridge',
        Common.ValueList: {
            CollectionPath: 'Bridges',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: bridge_ID, ValueListProperty: 'ID'       },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeId'                                },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name'                                   }
            ]
        }
    );
};

annotate BridgeManagementService.AttributeDefinitions with {
    dataType @(
        Common.Label: 'Data Type',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'DATA_TYPE', ValueListProperty: 'category'    },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: dataType, ValueListProperty: 'code'  },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                         }
            ]
        }
    );
    entityTarget @(
        Common.Label: 'Target Entity',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterConstant',    Constant: 'ENTITY_TARGET', ValueListProperty: 'category'       },
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: entityTarget, ValueListProperty: 'code'      },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                }
            ]
        }
    );
};

// ─────────────────────────────────────────────────────────────
// UI ANNOTATIONS - Lookups admin screen
// ─────────────────────────────────────────────────────────────
annotate BridgeManagementService.Lookups with @(
    UI.LineItem: [
        { Value: category,    Label: 'Category'     },
        { Value: code,        Label: 'Code / Value' },
        { Value: description, Label: 'Description'  },
        { Value: displayOrder,Label: 'Order'        },
        { Value: isActive,    Label: 'Active'       }
    ],
    UI.SelectionFields: [ category ],
    UI.HeaderInfo: {
        TypeName      : 'Lookup Value',
        TypeNamePlural: 'Lookup Values',
        Title         : { Value: code },
        Description   : { Value: category }
    },
    UI.FieldGroup #LookupDetails: {
        Label: 'Lookup Details',
        Data: [
            { Value: category,    Label: 'Category'     },
            { Value: code,        Label: 'Code / Value' },
            { Value: description, Label: 'Description'  },
            { Value: displayOrder,Label: 'Display Order'},
            { Value: isActive,    Label: 'Active'       }
        ]
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'Lookup Details', Target: '@UI.FieldGroup#LookupDetails' }
    ]
);

annotate BridgeManagementService.Lookups with {
    category @(
        Common.Label: 'Category',
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'Lookups',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: category, ValueListProperty: 'category' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'category'                               }
            ]
        }
    );
};

// ─────────────────────────────────────────────────────────────
// UI ANNOTATIONS - AttributeValidValues sub-table
// ─────────────────────────────────────────────────────────────
annotate BridgeManagementService.AttributeValidValues with @(
    UI.SelectionFields: [],
    UI.LineItem: [
        { Value: value,        Label: 'Value'        },
        { Value: label,        Label: 'Label'        },
        { Value: displayOrder, Label: 'Order'        },
        { Value: isActive,     Label: 'Active'       }
    ],
    UI.HeaderInfo: {
        TypeName      : 'Valid Value',
        TypeNamePlural: 'Valid Values',
        Title         : { Value: value },
        Description   : { Value: label }
    },
    UI.FieldGroup #ValidValueDetails: {
        Label: 'Valid Value Details',
        Data: [
            { Value: value,        Label: 'Value'        },
            { Value: label,        Label: 'Display Label'},
            { Value: displayOrder, Label: 'Display Order'},
            { Value: isActive,     Label: 'Active'       }
        ]
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'Details', Target: '@UI.FieldGroup#ValidValueDetails' }
    ]
);

annotate BridgeManagementService.AuditLogs with @(
    UI.LineItem: [
        { Value: timestamp,   Label: 'Timestamp'   },
        { Value: userId,      Label: 'User'        },
        { Value: action,      Label: 'Action'      },
        { Value: entity,      Label: 'Entity'      },
        { Value: entityName,  Label: 'Record'      },
        { Value: description, Label: 'Description' }
    ],
    UI.SelectionFields: [ action, entity, userId ],
    UI.HeaderInfo: {
        TypeName      : 'Audit Log',
        TypeNamePlural: 'Audit Logs',
        Title         : { Value: description },
        Description   : { Value: timestamp }
    }
);

annotate BridgeManagementService.BridgeHistory with @(
    UI.LineItem: [
        { Value: changedAt,     Label: 'Changed At'    },
        { Value: changedBy,     Label: 'Changed By'    },
        { Value: oldCondition,  Label: 'From'          },
        { Value: newCondition,  Label: 'To'            },
        { Value: conditionScore,Label: 'Score'         },
        { Value: notes,         Label: 'Notes'         }
    ]
);

// ─────────────────────────────────────────────────────────────
// BATCH IMPORT ACTIONS — data-consistency layer
// Called by BulkUploadModal 4-step flow
// ─────────────────────────────────────────────────────────────
