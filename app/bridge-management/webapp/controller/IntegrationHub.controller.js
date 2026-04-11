// ============================================================
// IntegrationHub.controller.js
// Manages S/4HANA, BANC, ESRI integrations plus field mapping
// and cross-system launch configuration.
// ============================================================
sap.ui.define([
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/json/JSONModel',
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'sap/m/BusyDialog',
    'nhvr/bridgemanagement/model/CapabilityManager',
    'nhvr/bridgemanagement/util/LookupService'
], function (Controller, JSONModel, MessageToast, MessageBox, BusyDialog, CapabilityManager, LookupService) {
    'use strict';

    const SRV = '/bridge-management/';
    const LS_MAP_CONFIG   = 'nhvr_map_config';
    const LS_FIELD_MAPS   = 'nhvr_field_mappings';
    const LS_CROSS_LAUNCH = 'nhvr_cross_launch';

    // Default field mappings per system
    const DEFAULT_MAPPINGS = {
        S4HANA: [
            { bmsField: 'bridgeId',        bmsFieldLabel: 'Bridge ID',        direction: 'BOTH',    externalField: 'EquipmentNumber',   externalFieldLabel: 'Equipment No.',     transformation: '', isActive: true },
            { bmsField: 'name',            bmsFieldLabel: 'Bridge Name',      direction: 'BOTH',    externalField: 'EquipmentName',     externalFieldLabel: 'Description',       transformation: '', isActive: true },
            { bmsField: 'condition',       bmsFieldLabel: 'Condition',        direction: 'TO_EXT',  externalField: 'UserStatus',        externalFieldLabel: 'User Status',       transformation: '', isActive: true },
            { bmsField: 'conditionScore',  bmsFieldLabel: 'Condition Score',  direction: 'TO_EXT',  externalField: 'UserField1',        externalFieldLabel: 'User Field 1',      transformation: '', isActive: true },
            { bmsField: 'inspectionDate',  bmsFieldLabel: 'Inspection Date',  direction: 'BOTH',    externalField: 'StartDate',         externalFieldLabel: 'Start Date',        transformation: '', isActive: true },
            { bmsField: 'assetOwner',      bmsFieldLabel: 'Asset Owner',      direction: 'BOTH',    externalField: 'Company',           externalFieldLabel: 'Company Code',      transformation: '', isActive: true },
            { bmsField: 'latitude',        bmsFieldLabel: 'Latitude',         direction: 'BOTH',    externalField: 'GeoCoordLat',       externalFieldLabel: 'Geo Latitude',      transformation: '', isActive: true },
            { bmsField: 'longitude',       bmsFieldLabel: 'Longitude',        direction: 'BOTH',    externalField: 'GeoCoordLng',       externalFieldLabel: 'Geo Longitude',     transformation: '', isActive: true },
            { bmsField: 'postingStatus',   bmsFieldLabel: 'Posting Status',   direction: 'TO_EXT',  externalField: 'MaintPriority',     externalFieldLabel: 'Maintenance Priority', transformation: '', isActive: true }
        ],
        BANC: [
            { bmsField: 'bridgeId',        bmsFieldLabel: 'Bridge ID',        direction: 'TO_EXT',  externalField: 'BRIDGE_ID',         externalFieldLabel: 'Bridge ID (BANC)',  transformation: '', isActive: true },
            { bmsField: 'name',            bmsFieldLabel: 'Bridge Name',      direction: 'TO_EXT',  externalField: 'STRUCTURE_NAME',    externalFieldLabel: 'Structure Name',    transformation: '', isActive: true },
            { bmsField: 'structureType',   bmsFieldLabel: 'Structure Type',   direction: 'TO_EXT',  externalField: 'STRUCTURE_TYPE',    externalFieldLabel: 'Structure Type',    transformation: '', isActive: true },
            { bmsField: 'yearBuilt',       bmsFieldLabel: 'Year Built',       direction: 'TO_EXT',  externalField: 'YEAR_BUILT',        externalFieldLabel: 'Year Built',        transformation: '', isActive: true },
            { bmsField: 'spanLengthM',     bmsFieldLabel: 'Span Length (m)',  direction: 'TO_EXT',  externalField: 'SPAN_LENGTH',       externalFieldLabel: 'Span Length',       transformation: '', isActive: true },
            { bmsField: 'conditionRating', bmsFieldLabel: 'Condition Rating', direction: 'TO_EXT',  externalField: 'COND_RATING',       externalFieldLabel: 'Condition Rating',  transformation: '', isActive: true },
            { bmsField: 'inspectionDate',  bmsFieldLabel: 'Inspection Date',  direction: 'TO_EXT',  externalField: 'INSP_DATE',         externalFieldLabel: 'Inspection Date',   transformation: '', isActive: true }
        ],
        ESRI: [
            { bmsField: 'bridgeId',       bmsFieldLabel: 'Bridge ID',        direction: 'BOTH',    externalField: 'BRIDGE_ID',         externalFieldLabel: 'Bridge ID',         transformation: '', isActive: true },
            { bmsField: 'name',           bmsFieldLabel: 'Bridge Name',      direction: 'BOTH',    externalField: 'NAME',              externalFieldLabel: 'Name',              transformation: '', isActive: true },
            { bmsField: 'latitude',       bmsFieldLabel: 'Latitude',         direction: 'BOTH',    externalField: 'latitude',          externalFieldLabel: 'Latitude',          transformation: '', isActive: true },
            { bmsField: 'longitude',      bmsFieldLabel: 'Longitude',        direction: 'BOTH',    externalField: 'longitude',         externalFieldLabel: 'Longitude',         transformation: '', isActive: true },
            { bmsField: 'condition',      bmsFieldLabel: 'Condition',        direction: 'TO_EXT',  externalField: 'CONDITION',         externalFieldLabel: 'Condition',         transformation: '', isActive: true },
            { bmsField: 'postingStatus',  bmsFieldLabel: 'Posting Status',   direction: 'TO_EXT',  externalField: 'STATUS',            externalFieldLabel: 'Status',            transformation: '', isActive: true }
        ],
        CUSTOM: []
    };

    // Default cross-system launch configs
    const DEFAULT_CROSS_LAUNCH = [
        {
            systemCode     : 'S4HANA',
            displayName    : 'SAP S/4HANA Equipment',
            iconSrc        : 'sap-icon://system-second-call',
            externalRefType: 'S4HANA',
            urlTemplate    : 'https://your-s4.example.com/sap/bc/ui5_ui5/flp#Equipment-displayFactSheet?Equipment={{externalId}}',
            openIn         : '_blank',
            isEnabled      : false,
            notes          : 'Opens S/4HANA Equipment Master factsheet for this bridge'
        },
        {
            systemCode     : 'BANC',
            displayName    : 'Austroads BANC Portal',
            iconSrc        : 'sap-icon://database',
            externalRefType: 'BANC',
            urlTemplate    : 'https://banc.austroads.com.au/bridges/{{externalId}}',
            openIn         : '_blank',
            isEnabled      : false,
            notes          : 'Opens the bridge record in the Austroads BANC portal'
        },
        {
            systemCode     : 'ESRI',
            displayName    : 'ESRI ArcGIS Portal',
            iconSrc        : 'sap-icon://map',
            externalRefType: 'ESRI',
            urlTemplate    : 'https://www.arcgis.com/apps/mapviewer/index.html?find={{bridgeId}}',
            openIn         : '_blank',
            isEnabled      : false,
            notes          : 'Opens bridge location in ArcGIS Map Viewer'
        }
    ];

    return Controller.extend('nhvr.bridgemanagement.controller.IntegrationHub', {

        // ── Init ─────────────────────────────────────────────────
        onInit: function () {
            this._oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            this._oRouter.getRoute('integrationHub').attachPatternMatched(this._onRouteMatched, this);

            // Main integration model
            this._oIntModel = new JSONModel({
                s4Active           : false,
                bancActive         : false,
                esriActive         : false,
                integrationStatus  : {},
                // Field mapping
                currentFMSystem    : 'S4HANA',
                fieldMappings      : [],
                allFieldMappings   : {},   // keyed by systemCode
                fieldMappingDialog : {
                    title: 'Add Field Mapping', mode: 'ADD', index: -1,
                    bmsField: '', bmsFieldLabel: '', direction: 'BOTH',
                    externalField: '', externalFieldLabel: '', transformation: '', isActive: true
                },
                // Cross-launch
                crossLaunchConfigs : [],
                crossLaunchDialog  : {
                    title: 'Add Launch Configuration', mode: 'ADD', index: -1,
                    systemCode: '', displayName: '', iconSrc: 'sap-icon://action-settings',
                    externalRefType: '', urlTemplate: '', openIn: '_blank', isEnabled: true, notes: ''
                }
            });
            this.getView().setModel(this._oIntModel, 'integrationModel');

            // Filter dropdowns + cross-launch target selector sourced from Lookup table
            var self = this;
            LookupService.load().then(function () {
                LookupService.populateSelect(self.byId("logSystemFilter"),   "EXTERNAL_SYSTEM_TYPE", "All Systems");
                LookupService.populateSelect(self.byId("logStatusFilter"),   "INTEGRATION_STATUS",   "All Status");
                LookupService.populateFormSelect(self.byId("crossLaunchTestSystem"), "EXTERNAL_SYSTEM_TYPE");
            });

            // Integration config form model (S/4HANA, BANC, ESRI settings)
            this._oCfgModel = new JSONModel({
                s4  : { isActive: false, baseUrl: '', username: '', _password: '', s4Client: '100',
                        s4MaintenancePlant: '', s4EquipClass: 'BRIDGE_INFRA', s4EquipCategory: 'M',
                        workCenter: '' },
                banc: { isActive: false, bancStateCode: 'NSW', bancAgencyCode: 'NHVR',
                        includeInspections: true, includeDefects: true },
                esri: { isActive: false, baseUrl: '', esriLayerId: '0', _token: '',
                        tokenUrl: '', username: '', _password: '' }
            });
            this.getView().setModel(this._oCfgModel, 'cfgModel');

            // Map/GIS config model
            const savedMapCfg = this._loadLocalStorage(LS_MAP_CONFIG) || {};
            this._oMapModel = new JSONModel(Object.assign({
                esriPortalUrl       : 'https://www.arcgis.com',
                esriFeatureServiceUrl: '',
                esriApiKey          : '',
                esriQueryWhere      : '1=1',
                defaultCenter_lat   : -27.0,
                defaultCenter_lng   : 133.0,
                defaultZoom         : 5,
                defaultBaseMap      : 'osm',
                projection          : 'EPSG:4326',
                clusteringEnabled   : true,
                clusterRadius       : 60,
                maxZoomBeforeCluster: 15,
                refLayersJson       : '[]',
                parsedRefLayers     : []
            }, savedMapCfg));
            this.getView().setModel(this._oMapModel, 'mapConfig');

            // SAP EAM / S4HANA object mapping (displayed in Tab 1 EAM panel)
            var eamMapping = [
                { bmsObject: 'Bridge',                      sapObject: 'Functional Location (FLOC)',    tCode: 'IL01/IL03',   status: 'Planned', fieldMapping: 'bridgeId → FLOC ID; name → Description; state → Work Center; region → Plant; condition → User Status' },
                { bmsObject: 'BridgeDefect',                sapObject: 'PM Notification (Type M2)',     tCode: 'IW21/IW22',   status: 'Planned', fieldMapping: 'defectCategory → Damage Code; severity → Priority; description → Long Text; structuralRisk → Effect; closureDate → Completion Date' },
                { bmsObject: 'Restriction',                 sapObject: 'Permit to Work / Eng. Change',  tCode: 'CN01/PTPN',   status: 'Planned', fieldMapping: 'restrictionType → Permit Type; value → Limit Value; validFromDate → Valid From; gazetteRef → Document Ref' },
                { bmsObject: 'BridgeCapacity',              sapObject: 'Classification / Characteristic', tCode: 'CL20N/CT04', status: 'Planned', fieldMapping: 'loadStandard → Characteristic; grossVehicleMass → Value; ratingDate → Date; ratingRef → Document' },
                { bmsObject: 'Route',                       sapObject: 'Linear Asset / Work Center',    tCode: 'IR01/CR01',   status: 'Planned', fieldMapping: 'routeCode → Linear ID; description → Short Text; state → Company Code; region → Plant' },
                { bmsObject: 'AuditLog',                    sapObject: 'Change Document / CDH',         tCode: 'RSSCD100',    status: 'Active',  fieldMapping: 'userId → User; action → Change Type; timestamp → Changed At; entity → Object Class; changes → Change Fields' },
                { bmsObject: 'BridgeExternalRef (BANC)',    sapObject: 'Equipment Master (External)',   tCode: 'IE01/IE03',   status: 'Active',  fieldMapping: 'externalId → External No.; externalURL → Deep-link; systemType → Manufacturer; isPrimary → Main Reference flag' }
            ];
            this._oHubModel = new JSONModel({ eamMapping: eamMapping });
            this.getView().setModel(this._oHubModel, 'integrationHub');

            this._busyDialog = null;
            this._cfgDialog  = null;
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute('INTEGRATION_HUB', self.getOwnerComponent().getRouter())) return;
                self.onRefreshStatus();
                self._loadConfigs();
                self._loadFieldMappingsFromStorage();
                self._loadCrossLaunchFromStorage();
            });
        },

        // ── Navigation ────────────────────────────────────────────
        onNavBack: function () {
            this._oRouter.navTo('Home');
        },

        // ── Refresh integration status ─────────────────────────
        onRefreshStatus: function () {
            const that = this;
            fetch(`${SRV}getIntegrationStatus`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body   : JSON.stringify({})
            })
            .then(r => r.json())
            .then(data => {
                const list = data && data.value || [];
                const byCode = {};
                list.forEach(s => { byCode[s.systemCode] = s; });
                const m = that._oIntModel;
                m.setProperty('/integrationStatus', byCode);
                m.setProperty('/s4Active',   !!(byCode.S4HANA && byCode.S4HANA.isActive));
                m.setProperty('/bancActive',  !!(byCode.BANC   && byCode.BANC.isActive));
                m.setProperty('/esriActive',  !!(byCode.ESRI   && byCode.ESRI.isActive));
                that._updateStatusTile('s4',   byCode.S4HANA);
                that._updateStatusTile('banc',  byCode.BANC);
                that._updateStatusTile('esri',  byCode.ESRI);
            })
            .catch(() => {/* silently fail — backend may not have these endpoints yet */});
        },

        _updateStatusTile: function (prefix, status) {
            if (!status) return;
            const badge    = this.byId(prefix + 'StatusBadge');
            const lastSync = this.byId(prefix + 'LastSync');
            const total    = this.byId(prefix + 'TotalSynced');
            if (!badge) return;
            if (!status.isConfigured) {
                badge.setText('Not Configured').setState('Warning');
            } else if (!status.isActive) {
                badge.setText('Inactive').setState('None');
            } else if (status.lastSyncStatus === 'ERROR') {
                badge.setText('Error').setState('Error');
            } else if (status.lastSyncStatus === 'SUCCESS') {
                badge.setText('Active').setState('Success');
            } else {
                badge.setText('Configured').setState('Information');
            }
            if (lastSync) lastSync.setText(status.lastSyncAt
                ? 'Last: ' + new Date(status.lastSyncAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
                : 'Never synced');
            if (total) total.setText(status.totalSynced > 0 ? `${status.totalSynced} records synced` : '');
        },

        // ── Load backend configs ──────────────────────────────────
        _loadConfigs: function () {
            const that = this;
            fetch(`${SRV}IntegrationConfigs?$filter=isActive eq true`)
                .then(r => r.json())
                .then(data => {
                    const cfgs = data && data.value || [];
                    cfgs.forEach(c => {
                        const code = (c.systemCode || '').toLowerCase();
                        if (code === 's4hana') {
                            that._oCfgModel.setProperty('/s4/isActive',           c.isActive);
                            that._oCfgModel.setProperty('/s4/baseUrl',             c.baseUrl || '');
                            that._oCfgModel.setProperty('/s4/s4Client',            c.s4Client || '100');
                            that._oCfgModel.setProperty('/s4/s4MaintenancePlant',  c.s4MaintenancePlant || '');
                            that._oCfgModel.setProperty('/s4/s4EquipClass',        c.s4EquipClass || 'BRIDGE_INFRA');
                            that._oCfgModel.setProperty('/s4/s4EquipCategory',     c.s4EquipCategory || 'M');
                            that._oCfgModel.setProperty('/s4/workCenter',          c.workCenter || '');
                            that._s4ConfigId = c.ID;
                        } else if (code === 'banc') {
                            that._oCfgModel.setProperty('/banc/isActive',     c.isActive);
                            that._oCfgModel.setProperty('/banc/bancStateCode', c.bancStateCode || 'NSW');
                            that._oCfgModel.setProperty('/banc/bancAgencyCode',c.bancAgencyCode || '');
                            that._bancConfigId = c.ID;
                        } else if (code === 'esri') {
                            that._oCfgModel.setProperty('/esri/isActive',    c.isActive);
                            that._oCfgModel.setProperty('/esri/baseUrl',     c.baseUrl || '');
                            that._oCfgModel.setProperty('/esri/esriLayerId', String(c.esriLayerId || '0'));
                            that._esriConfigId = c.ID;
                        }
                    });
                })
                .catch(() => {/* backend may not have IntegrationConfigs yet */});
        },

        // ── Field Mapping ─────────────────────────────────────────

        _loadFieldMappingsFromStorage: function () {
            const saved = this._loadLocalStorage(LS_FIELD_MAPS) || {};
            // Merge defaults with saved overrides
            const allMaps = {};
            ['S4HANA', 'BANC', 'ESRI', 'CUSTOM'].forEach(sys => {
                allMaps[sys] = saved[sys] || DEFAULT_MAPPINGS[sys] || [];
            });
            this._oIntModel.setProperty('/allFieldMappings', allMaps);
            // Display current system
            const cur = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            this._oIntModel.setProperty('/fieldMappings', allMaps[cur] || []);
        },

        onFieldMappingSystemChange: function (oEvent) {
            const key = oEvent.getParameter('item') && oEvent.getParameter('item').getKey
                ? oEvent.getParameter('item').getKey()
                : (this.byId('fieldMappingSystemBtn').getSelectedItem()
                    ? this.byId('fieldMappingSystemBtn').getSelectedItem().getKey()
                    : 'S4HANA');
            this._oIntModel.setProperty('/currentFMSystem', key);
            const all = this._oIntModel.getProperty('/allFieldMappings') || {};
            this._oIntModel.setProperty('/fieldMappings', all[key] || []);
        },

        onLoadDefaultMappings: function () {
            const sys = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            MessageBox.confirm(
                `Load default field mappings for ${sys}? This will overwrite your current mappings for this system.`,
                {
                    title: 'Load Defaults',
                    onClose: a => {
                        if (a !== 'OK') return;
                        const defaults = (DEFAULT_MAPPINGS[sys] || []).map(m => Object.assign({}, m));
                        const all = this._oIntModel.getProperty('/allFieldMappings') || {};
                        all[sys] = defaults;
                        this._oIntModel.setProperty('/allFieldMappings', all);
                        this._oIntModel.setProperty('/fieldMappings', defaults);
                        MessageToast.show(`Default mappings loaded for ${sys}. Click 'Save Mappings' to persist.`);
                    }
                }
            );
        },

        onAddFieldMapping: function () {
            const sys = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            this._oIntModel.setProperty('/fieldMappingDialog', {
                title: `Add Field Mapping — ${sys}`, mode: 'ADD', index: -1,
                bmsField: '', bmsFieldLabel: '', direction: 'BOTH',
                externalField: '', externalFieldLabel: '', transformation: '', isActive: true
            });
            this.byId('fieldMappingDialog').open();
        },

        onEditFieldMapping: function (oEvent) {
            const ctx  = oEvent.getSource().getBindingContext('integrationModel');
            if (!ctx) return;
            const item = ctx.getObject();
            const idx  = parseInt(ctx.getPath().split('/').pop(), 10);
            this._oIntModel.setProperty('/fieldMappingDialog', Object.assign({}, item, {
                title: 'Edit Field Mapping',
                mode : 'EDIT',
                index: idx
            }));
            this.byId('fieldMappingDialog').open();
        },

        onConfirmFieldMapping: function () {
            const dlg = this._oIntModel.getProperty('/fieldMappingDialog');
            if (!dlg.bmsField || !dlg.externalField) {
                MessageToast.show('BMS Field and External Field are required.');
                return;
            }
            const sys  = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            const all  = this._oIntModel.getProperty('/allFieldMappings') || {};
            const maps = (all[sys] || []).slice();
            const entry = {
                bmsField          : dlg.bmsField,
                bmsFieldLabel     : dlg.bmsFieldLabel || dlg.bmsField,
                direction         : dlg.direction,
                externalField     : dlg.externalField,
                externalFieldLabel: dlg.externalFieldLabel || dlg.externalField,
                transformation    : dlg.transformation || '',
                isActive          : dlg.isActive !== false
            };
            if (dlg.mode === 'EDIT' && dlg.index >= 0) {
                maps[dlg.index] = entry;
            } else {
                maps.push(entry);
            }
            all[sys] = maps;
            this._oIntModel.setProperty('/allFieldMappings', all);
            this._oIntModel.setProperty('/fieldMappings', maps);
            this.byId('fieldMappingDialog').close();
        },

        onCancelFieldMapping: function () {
            this.byId('fieldMappingDialog').close();
        },

        onDeleteFieldMapping: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext('integrationModel');
            if (!ctx) return;
            const idx = parseInt(ctx.getPath().split('/').pop(), 10);
            const sys = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            const all = this._oIntModel.getProperty('/allFieldMappings') || {};
            const maps = (all[sys] || []).slice();
            maps.splice(idx, 1);
            all[sys] = maps;
            this._oIntModel.setProperty('/allFieldMappings', all);
            this._oIntModel.setProperty('/fieldMappings', maps);
        },

        onSaveFieldMappings: function () {
            const all = this._oIntModel.getProperty('/allFieldMappings') || {};
            this._saveLocalStorage(LS_FIELD_MAPS, all);
            const sys = this._oIntModel.getProperty('/currentFMSystem') || 'S4HANA';
            MessageToast.show(`Field mappings for ${sys} saved (${(all[sys] || []).length} mappings).`);
        },

        // ── Cross-System Launch ───────────────────────────────────

        _loadCrossLaunchFromStorage: function () {
            const saved = this._loadLocalStorage(LS_CROSS_LAUNCH);
            const configs = saved || DEFAULT_CROSS_LAUNCH.map(c => Object.assign({}, c));
            this._oIntModel.setProperty('/crossLaunchConfigs', configs);
            // Refresh the cross-launch system selector
            this._refreshCrossLaunchSelector();
        },

        _refreshCrossLaunchSelector: function () {
            const configs  = this._oIntModel.getProperty('/crossLaunchConfigs') || [];
            const enabled  = configs.filter(c => c.isEnabled).map(c => c.systemCode);
            const sel      = this.byId('crossLaunchTestSystem');
            if (!sel) return;
            sel.destroyItems();
            configs.forEach(c => {
                if (c.isEnabled) {
                    sel.addItem(new sap.ui.core.Item({ key: c.systemCode, text: c.displayName }));
                }
            });
            // Add defaults if none enabled
            if (!enabled.length) {
                ['S4HANA', 'BANC', 'ESRI'].forEach(k =>
                    sel.addItem(new sap.ui.core.Item({ key: k, text: k })));
            }
        },

        onAddCrossLaunchSystem: function () {
            this._oIntModel.setProperty('/crossLaunchDialog', {
                title: 'Add Launch Configuration', mode: 'ADD', index: -1,
                systemCode: '', displayName: '', iconSrc: 'sap-icon://action-settings',
                externalRefType: '', urlTemplate: '', openIn: '_blank', isEnabled: true, notes: ''
            });
            this.byId('crossLaunchDialog').open();
        },

        onEditCrossLaunchSystem: function (oEvent) {
            const ctx  = oEvent.getSource().getBindingContext('integrationModel');
            if (!ctx) return;
            const item = ctx.getObject();
            const idx  = parseInt(ctx.getPath().split('/').pop(), 10);
            this._oIntModel.setProperty('/crossLaunchDialog', Object.assign({}, item, {
                title: 'Edit Launch Configuration',
                mode : 'EDIT',
                index: idx
            }));
            this.byId('crossLaunchDialog').open();
        },

        onConfirmCrossLaunchSystem: function () {
            const dlg = this._oIntModel.getProperty('/crossLaunchDialog');
            if (!dlg.systemCode || !dlg.displayName || !dlg.urlTemplate) {
                MessageToast.show('System Code, Display Name and URL Template are required.');
                return;
            }
            const configs = (this._oIntModel.getProperty('/crossLaunchConfigs') || []).slice();
            const entry = {
                systemCode     : dlg.systemCode.toUpperCase(),
                displayName    : dlg.displayName,
                iconSrc        : dlg.iconSrc || 'sap-icon://action-settings',
                externalRefType: dlg.externalRefType || dlg.systemCode.toUpperCase(),
                urlTemplate    : dlg.urlTemplate,
                openIn         : dlg.openIn || '_blank',
                isEnabled      : dlg.isEnabled !== false,
                notes          : dlg.notes || ''
            };
            if (dlg.mode === 'EDIT' && dlg.index >= 0) {
                configs[dlg.index] = entry;
            } else {
                configs.push(entry);
            }
            this._oIntModel.setProperty('/crossLaunchConfigs', configs);
            this.byId('crossLaunchDialog').close();
            this._refreshCrossLaunchSelector();
        },

        onCancelCrossLaunchSystem: function () {
            this.byId('crossLaunchDialog').close();
        },

        onDeleteCrossLaunchSystem: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext('integrationModel');
            if (!ctx) return;
            const idx     = parseInt(ctx.getPath().split('/').pop(), 10);
            const configs = (this._oIntModel.getProperty('/crossLaunchConfigs') || []).slice();
            configs.splice(idx, 1);
            this._oIntModel.setProperty('/crossLaunchConfigs', configs);
            this._refreshCrossLaunchSelector();
        },

        onCrossLaunchToggle: function () {
            this._refreshCrossLaunchSelector();
        },

        onSaveCrossLaunchConfigs: function () {
            const configs = this._oIntModel.getProperty('/crossLaunchConfigs') || [];
            this._saveLocalStorage(LS_CROSS_LAUNCH, configs);
            MessageToast.show(`Cross-system launch configs saved (${configs.length} systems).`);
        },

        // Preview / test a cross-system launch
        onPreviewCrossLaunch: function () {
            const bridgeId = this.byId('crossLaunchTestBridgeId').getValue().trim();
            const sysCode  = this.byId('crossLaunchTestSystem').getSelectedKey();
            if (!bridgeId) { MessageToast.show('Enter a Bridge ID to test.'); return; }
            if (!sysCode)  { MessageToast.show('Select a target system.'); return; }

            // Find launch config
            const configs = this._oIntModel.getProperty('/crossLaunchConfigs') || [];
            const cfg     = configs.find(c => c.systemCode === sysCode);
            if (!cfg) { MessageBox.warning(`No launch config found for system '${sysCode}'.`); return; }

            // Fetch the bridge's ExternalRefs
            fetch(`${SRV}BridgeExternalRefs?$filter=bridge/bridgeId eq '${encodeURIComponent(bridgeId)}' and systemType eq '${encodeURIComponent(cfg.externalRefType)}'`)
                .then(r => r.json())
                .then(data => {
                    const refs     = data && data.value || [];
                    const extId    = refs.length > 0 ? refs[0].externalId : null;
                    const bridgeName = refs.length > 0 && refs[0].bridgeName ? refs[0].bridgeName : bridgeId;

                    if (!extId) {
                        this.byId('crossLaunchPreviewBox').setVisible(true);
                        this.byId('crossLaunchResolvedId').setText('No external reference found for this bridge in ' + sysCode);
                        this.byId('crossLaunchResolvedUrl').setHref('').setText('Cannot resolve URL — no external ID');
                        return;
                    }

                    const url = (cfg.urlTemplate || '')
                        .replace(/\{\{externalId\}\}/g, encodeURIComponent(extId))
                        .replace(/\{\{bridgeId\}\}/g,   encodeURIComponent(bridgeId))
                        .replace(/\{\{bridgeName\}\}/g,  encodeURIComponent(bridgeName));

                    this.byId('crossLaunchPreviewBox').setVisible(true);
                    this.byId('crossLaunchResolvedId').setText(extId);
                    this.byId('crossLaunchResolvedUrl').setHref(url).setText(url);
                })
                .catch(e => MessageBox.error('Could not look up external reference: ' + e.message));
        },

        // Direct launch (called from bridge detail or test button in table)
        onTestCrossLaunch: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext('integrationModel');
            if (!ctx) return;
            const cfg = ctx.getObject();
            if (!cfg || !cfg.urlTemplate) {
                MessageBox.warning('No URL template defined for this launch configuration.');
                return;
            }
            // Use bridge ID test field value, or prompt
            const bridgeId = this.byId('crossLaunchTestBridgeId').getValue().trim();
            if (!bridgeId) {
                MessageToast.show('Enter a Bridge ID in the Test panel below to test this launch config.');
                return;
            }
            // Scroll to test panel and populate system
            const sel = this.byId('crossLaunchTestSystem');
            if (sel) sel.setSelectedKey(cfg.systemCode);
            this.onPreviewCrossLaunch();
        },

        // ── GIS / Map Config ──────────────────────────────────────

        onSaveEsriConfig: function () {
            const cfg = this._oMapModel.getData();
            const saved = this._loadLocalStorage(LS_MAP_CONFIG) || {};
            Object.assign(saved, {
                esriPortalUrl       : cfg.esriPortalUrl,
                esriFeatureServiceUrl: cfg.esriFeatureServiceUrl,
                esriApiKey          : cfg.esriApiKey,
                esriQueryWhere      : cfg.esriQueryWhere
            });
            this._saveLocalStorage(LS_MAP_CONFIG, saved);
            MessageToast.show('ESRI ArcGIS config saved.');
        },

        onSaveGISViewport: function () {
            const cfg   = this._oMapModel.getData();
            const saved = this._loadLocalStorage(LS_MAP_CONFIG) || {};
            Object.assign(saved, {
                defaultCenter_lat: parseFloat(cfg.defaultCenter_lat) || -27.0,
                defaultCenter_lng: parseFloat(cfg.defaultCenter_lng) || 133.0,
                defaultZoom      : parseInt(cfg.defaultZoom, 10) || 5,
                defaultBaseMap   : cfg.defaultBaseMap,
                projection       : cfg.projection
            });
            this._saveLocalStorage(LS_MAP_CONFIG, saved);
            MessageToast.show('Map viewport settings saved.');
        },

        onResetGISViewport: function () {
            MessageBox.confirm('Reset map viewport to defaults?', {
                onClose: a => {
                    if (a !== 'OK') return;
                    const saved = this._loadLocalStorage(LS_MAP_CONFIG) || {};
                    delete saved.defaultCenter_lat;
                    delete saved.defaultCenter_lng;
                    delete saved.defaultZoom;
                    delete saved.defaultBaseMap;
                    delete saved.projection;
                    this._saveLocalStorage(LS_MAP_CONFIG, saved);
                    this._oMapModel.setProperty('/defaultCenter_lat', -27.0);
                    this._oMapModel.setProperty('/defaultCenter_lng', 133.0);
                    this._oMapModel.setProperty('/defaultZoom', 5);
                    this._oMapModel.setProperty('/defaultBaseMap', 'osm');
                    this._oMapModel.setProperty('/projection', 'EPSG:4326');
                    MessageToast.show('Map viewport reset to defaults.');
                }
            });
        },

        onSaveGISClustering: function () {
            const cfg   = this._oMapModel.getData();
            const saved = this._loadLocalStorage(LS_MAP_CONFIG) || {};
            Object.assign(saved, {
                clusteringEnabled   : cfg.clusteringEnabled,
                clusterRadius       : parseInt(cfg.clusterRadius, 10) || 60,
                maxZoomBeforeCluster: parseInt(cfg.maxZoomBeforeCluster, 10) || 15
            });
            this._saveLocalStorage(LS_MAP_CONFIG, saved);
            MessageToast.show('Clustering settings saved.');
        },

        onAddGISReferenceLayer: function () {
            MessageBox.show(
                'Reference layer editor coming in next release. ' +
                'For now, edit the JSON in mapConfig>/refLayersJson directly.',
                { title: 'Add Reference Layer', icon: MessageBox.Icon.INFORMATION }
            );
        },

        onEditGISReferenceLayer: function (oEvent) {
            const ctx  = oEvent.getSource().getBindingContext('mapConfig');
            if (!ctx) return;
            const item = ctx.getObject();
            MessageBox.show(
                `Layer: ${item.name}\nURL: ${item.url}\nType: ${item.type}\nAuto-load: ${item.isDefault}`,
                { title: 'Reference Layer Details', icon: MessageBox.Icon.INFORMATION }
            );
        },

        onOpenAddSystemDialog: function () {
            // Open config dialog on S/4HANA tab
            this.onOpenConfigDialog().then(() => {
                const tabBar = sap.ui.getCore().byId('configTabBar');
                if (tabBar) tabBar.setSelectedIndex(0);
            });
        },

        // ── System integration: bulk sync / export ────────────────
        onSyncAllToS4: function () {
            const that = this;
            MessageBox.confirm(
                'Sync all bridges to SAP S/4HANA Equipment Master. This may take several minutes.',
                {
                    title  : 'Confirm S/4HANA Bulk Sync',
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: a => {
                        if (a === MessageBox.Action.YES) {
                            that._callAction('syncAllBridgesToS4', null, 'Syncing to S/4HANA…');
                        }
                    }
                }
            );
        },

        onExportToBANC: function () {
            const that   = this;
            const bancCfg = this._oCfgModel.getProperty('/banc');
            this._callAction('exportToBANC', {
                includeInspections: bancCfg.includeInspections !== false,
                includeDefects    : bancCfg.includeDefects     !== false
            }, 'Generating BANC export…', function (result) {
                that._downloadBase64CSV(result.structuresCSV,  'NHVR_BANC_Structures.csv');
                if (result.inspectionsCSV) that._downloadBase64CSV(result.inspectionsCSV, 'NHVR_BANC_Inspections.csv');
                if (result.defectsCSV)     that._downloadBase64CSV(result.defectsCSV,     'NHVR_BANC_Defects.csv');
                MessageBox.success(
                    `BANC export complete.\nStructures: ${result.structureCount} | Inspections: ${result.inspectionCount} | Defects: ${result.defectCount}`,
                    { title: 'BANC Export' }
                );
            });
        },

        onSyncAllToESRI: function () {
            const that = this;
            MessageBox.confirm(
                'Sync all bridges to ArcGIS Feature Service. Features without coordinates will be skipped.',
                {
                    title  : 'Confirm ArcGIS Bulk Sync',
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: a => {
                        if (a === MessageBox.Action.YES) {
                            that._callAction('syncAllBridgesToESRI', null, 'Syncing to ArcGIS…');
                        }
                    }
                }
            );
        },

        // ── Test connections ──────────────────────────────────────
        onTestAllConnections: function () {
            ['S4HANA', 'BANC', 'ESRI'].forEach(code => this._testConnection(code));
        },

        _testConnection: function (systemCode) {
            fetch(`${SRV}testIntegrationConnection`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ systemCode })
            })
            .then(r => r.json())
            .then(data => {
                const r   = data && data.value || data;
                const msg = `${systemCode}: ${r.message || (r.ok ? 'OK' : 'Failed')}`;
                if (r.ok) MessageToast.show(msg);
                else      MessageBox.warning(msg + (r.details ? '\n' + r.details : ''));
            })
            .catch(e => MessageBox.error(`Connection test failed for ${systemCode}: ${e.message}`));
        },

        onTestS4Connection  : function () { this._testConnection('S4HANA'); },
        onTestEsriConnection: function () { this._testConnection('ESRI'); },

        // ── Config dialog (tile/configure button) ─────────────────
        onOpenS4Config  : function () { this._openConfigTab(0); },
        onOpenBancConfig: function () { this._openConfigTab(1); },
        onOpenEsriConfig: function () { this._openConfigTab(2); },

        _openConfigTab: function (tabIdx) {
            this.onOpenConfigDialog().then(() => {
                const tabBar = sap.ui.getCore().byId('configTabBar');
                if (tabBar) tabBar.setSelectedIndex(tabIdx);
            });
        },

        onOpenConfigDialog: function () {
            const that = this;
            if (this._cfgDialog) {
                this._cfgDialog.open();
                return Promise.resolve();
            }
            return sap.ui.core.Fragment.load({
                name      : 'nhvr.bridgemanagement.view.IntegrationConfigDialog',
                controller: this
            }).then(oDialog => {
                that._cfgDialog = oDialog;
                that.getView().addDependent(oDialog);
                // Populate state Select from OData Lookups (items removed from XML)
                LookupService.load().then(function () {
                    LookupService.populateFormSelect(oDialog.getContent && oDialog.getContent()[0]
                        ? sap.ui.getCore().byId(oDialog.getId() + '--bancStateCode')
                        : null, "STATE");
                    // Fallback: find by fragment-scoped ID
                    var oStateSelect = sap.ui.getCore().byId('bancStateCode') ||
                                       (oDialog.findElements && oDialog.findElements(true).find(function(e) { return e.getId && e.getId().indexOf('bancStateCode') >= 0; }));
                    if (oStateSelect) LookupService.populateFormSelect(oStateSelect, "STATE");
                });
                oDialog.open();
            });
        },

        onCloseConfigDialog: function () {
            if (this._cfgDialog) this._cfgDialog.close();
        },

        onSaveIntegrationConfig: function () {
            const that = this;
            const cfg  = this._oCfgModel.getData();
            const saves = [];
            if (this._s4ConfigId) {
                saves.push(this._patchConfig(this._s4ConfigId, {
                    isActive: cfg.s4.isActive, baseUrl: cfg.s4.baseUrl,
                    s4Client: cfg.s4.s4Client, s4MaintenancePlant: cfg.s4.s4MaintenancePlant,
                    s4EquipClass: cfg.s4.s4EquipClass, s4EquipCategory: cfg.s4.s4EquipCategory,
                    workCenter: cfg.s4.workCenter
                }));
            }
            if (this._bancConfigId) {
                saves.push(this._patchConfig(this._bancConfigId, {
                    isActive: cfg.banc.isActive, bancStateCode: cfg.banc.bancStateCode,
                    bancAgencyCode: cfg.banc.bancAgencyCode
                }));
            }
            if (this._esriConfigId) {
                saves.push(this._patchConfig(this._esriConfigId, {
                    isActive: cfg.esri.isActive, baseUrl: cfg.esri.baseUrl,
                    esriLayerId: cfg.esri.esriLayerId
                }));
            }
            Promise.all(saves)
                .then(() => {
                    MessageToast.show('Integration configuration saved');
                    that.onCloseConfigDialog();
                    that.onRefreshStatus();
                    that._oIntModel.setProperty('/s4Active',  cfg.s4.isActive);
                    that._oIntModel.setProperty('/bancActive', cfg.banc.isActive);
                    that._oIntModel.setProperty('/esriActive', cfg.esri.isActive);
                })
                .catch(e => MessageBox.error('Save failed: ' + e.message));
        },

        _patchConfig: function (id, payload) {
            return fetch(`${SRV}IntegrationConfigs(${id})`, {
                method : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(payload)
            }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
        },

        // ── Row-level S/4HANA sync ────────────────────────────────
        onSyncSingleToS4: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext();
            if (!ctx) return;
            this._callBridgeAction(ctx.getProperty('bridge_ID'), 'syncBridgeToS4', null, 'Syncing bridge to S/4HANA…');
        },

        onPullFromS4: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext();
            if (!ctx) return;
            this._callBridgeAction(ctx.getProperty('bridge_ID'), 'syncBridgeFromS4', null, 'Pulling from S/4HANA…');
        },

        // ── Mapping search ────────────────────────────────────────
        onSearchS4Mapping: function (oEvent) {
            const q       = oEvent.getParameter('query') || '';
            const table   = this.byId('s4MappingTable');
            if (!table) return;
            const binding = table.getBinding('items');
            if (!binding) return;
            binding.filter(q ? [new sap.ui.model.Filter({
                filters: [
                    new sap.ui.model.Filter('equipmentNumber', sap.ui.model.FilterOperator.Contains, q),
                    new sap.ui.model.Filter('bridge/bridgeId', sap.ui.model.FilterOperator.Contains, q)
                ], and: false
            })] : []);
        },

        onExportS4Mapping: function () {
            MessageToast.show('Mapping export — coming soon');
        },

        // ── Log filters ───────────────────────────────────────────
        onLogSystemFilter: function () { this._applyLogFilters(); },
        onLogStatusFilter: function () { this._applyLogFilters(); },

        _applyLogFilters: function () {
            const table   = this.byId('integrationLogTable');
            if (!table) return;
            const binding = table.getBinding('items');
            if (!binding) return;
            const sys    = this.byId('logSystemFilter') && this.byId('logSystemFilter').getSelectedKey();
            const status = this.byId('logStatusFilter') && this.byId('logStatusFilter').getSelectedKey();
            const filters = [];
            if (sys    && sys    !== 'ALL') filters.push(new sap.ui.model.Filter('systemCode', sap.ui.model.FilterOperator.EQ, sys));
            if (status && status !== 'ALL') filters.push(new sap.ui.model.Filter('status',     sap.ui.model.FilterOperator.EQ, status));
            binding.filter(filters);
        },

        onClearLog: function () {
            MessageBox.warning('Clear all integration logs? This cannot be undone.', {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: a => { if (a === MessageBox.Action.YES) MessageToast.show('Log clear — admin action not yet implemented'); }
            });
        },

        // ── Generic action callers ────────────────────────────────
        _callAction: function (actionName, params, busyMsg, onSuccess) {
            const that = this;
            this._showBusy(busyMsg || 'Processing…');
            fetch(`${SRV}${actionName}`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(params || {})
            })
            .then(r => r.json())
            .then(data => {
                that._hideBusy();
                const result = data && data.value || data;
                const strip  = that.byId('syncResultStrip');
                if (result && result.success) {
                    const msg = result.message || `${actionName} completed`;
                    if (strip) { strip.setType('Success').setText(msg).setVisible(true); } else { MessageToast.show(msg); }
                    if (onSuccess) onSuccess(result);
                    that.onRefreshStatus();
                } else {
                    const err = (result && result.error && result.error.message) || (result && result.message) || JSON.stringify(result);
                    if (strip) { strip.setType('Error').setText('Error: ' + err).setVisible(true); } else { MessageBox.error(err); }
                }
            })
            .catch(e => { that._hideBusy(); MessageBox.error(`${actionName} failed: ${e.message}`); });
        },

        _callBridgeAction: function (bridgeId, actionName, params, busyMsg) {
            const that = this;
            this._showBusy(busyMsg || 'Processing…');
            fetch(`${SRV}Bridges(${bridgeId})/${actionName}`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(params || {})
            })
            .then(r => r.json())
            .then(data => {
                that._hideBusy();
                const result = data && data.value || data;
                const msg    = (result && result.message) || `${actionName} completed`;
                if (result && (result.success || result.ok)) { MessageToast.show(msg); that.onRefreshStatus(); }
                else MessageBox.warning(msg);
            })
            .catch(e => { that._hideBusy(); MessageBox.error(`${actionName} failed: ${e.message}`); });
        },

        // ── Helpers ───────────────────────────────────────────────
        _downloadBase64CSV: function (b64, filename) {
            try {
                const text = atob(b64);
                const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
            } catch (e) { console.error('CSV download failed:', e); }
        },

        _showBusy: function (msg) {
            if (!this._busyDialog) this._busyDialog = new BusyDialog({ text: msg || 'Processing…' });
            else this._busyDialog.setText(msg || 'Processing…');
            this._busyDialog.open();
        },

        _hideBusy: function () { if (this._busyDialog) this._busyDialog.close(); },

        _loadLocalStorage: function (key) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
        },

        _saveLocalStorage: function (key, val) {
            try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota exceeded */ }
        },

        // ── EAM Mapping Export ────────────────────────────────
        onExportEamMapping: function () {
            var mapping = this.getView().getModel('integrationHub').getProperty('/eamMapping') || [];
            var header  = ['BMS Object', 'SAP S/4HANA Object', 'SAP T-Code', 'Integration Status', 'Key Field Mapping'];
            var rows    = mapping.map(function (r) {
                return [r.bmsObject, r.sapObject, r.tCode, r.status, r.fieldMapping].join('\t');
            });
            var content = header.join('\t') + '\n' + rows.join('\n');
            var blob    = new Blob(['\ufeff' + content], { type: 'text/tab-separated-values;charset=utf-8;' });
            var url     = URL.createObjectURL(blob);
            var a       = document.createElement('a');
            a.href      = url;
            a.download  = 'nhvr-sap-eam-mapping.xls';
            a.click();
            URL.revokeObjectURL(url);
            MessageToast.show('EAM mapping exported');
        }
    });
});
