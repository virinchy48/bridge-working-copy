'use strict';
const cds = require('@sap/cds');

module.exports = function registerUploadHandlers(srv, helpers) {
    const { getBridgeByKey, logAudit, updateBridgePostingStatus } = helpers;

    // ── Shared CSV parser (handles quoted fields) ──────────────
    function parseCSVLine(line) {
        const result = [];
        let current = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else { current += char; }
        }
        result.push(current.trim());
        return result;
    }

    // ── CSV Header Whitelists ──────────────────────────────────
    const BRIDGE_HEADERS = new Set([
        'bridgeId','name','region','state','structureType','material',
        'latitude','longitude','routeCode','routeKm','condition',
        'conditionScore','yearBuilt','spanLengthM','totalLengthM','widthM',
        'clearanceHeightM','postingStatus','isActive','lga','assetOwner',
        'maintenanceAuthority','conditionRating','numberOfSpans','numberOfLanes',
        'designLoad','nhvrRouteAssessed','gazetteRef','freightRoute',
        'overMassRoute','highPriorityAsset','floodImpacted','scourRisk',
        'aadtVehicles','nhvrRef','remarks','deckWidthM','inspectionDate'
    ]);
    const RESTRICTION_HEADERS = new Set([
        'restrictionType','value','unit','bridgeId','vehicleClassCode',
        'routeCode','validFromDate','validToDate','status','permitRequired',
        'notes','gazetteRef','nhvrRef'
    ]);
    const MAX_CSV_ROWS  = 10000;

    function validateCSVHeaders(headers, allowed) {
        var bad = headers.filter(function(h) { return !allowed.has(h); });
        return bad.length ? 'Unexpected columns: ' + bad.join(', ') : null;
    }

    // ── massUploadBridges ──────────────────────────────────────
    srv.on('massUploadBridges', async (req) => {
        const { csvData } = req.data;
        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV data is empty');
        const db = await cds.connect.to('db');
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const hdrErr = validateCSVHeaders(headers, BRIDGE_HEADERS);
        if (hdrErr) return req.error(400, hdrErr);
        if (lines.length - 1 > MAX_CSV_ROWS) return req.error(400, 'CSV exceeds maximum of ' + MAX_CSV_ROWS + ' rows');
        const dataLines = lines.slice(1);
        let successCount = 0, updatedCount = 0, failureCount = 0, totalProcessed = 0;
        const errors = [];
        const routes = await db.run(SELECT.from('nhvr.Route').columns('ID', 'routeCode'));
        const routeMap = {};
        routes.forEach(r => { routeMap[r.routeCode] = r.ID; });
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < dataLines.length; i++) {
                const line = dataLines[i].trim();
                if (!line) continue;
                const rowNum = i + 2;
                try {
                    const values = parseCSVLine(line);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] || ''; });
                    if (row.routeCode) {
                        row.route_ID = routeMap[row.routeCode];
                        if (!row.route_ID) { errors.push(`Row ${rowNum}: Route "${row.routeCode}" not found`); failureCount++; continue; }
                        delete row.routeCode;
                    }
                    ['latitude','longitude','routeKm','spanLengthM','totalLengthM','widthM','clearanceHeightM'].forEach(f => { if (row[f]) row[f] = parseFloat(row[f]); });
                    ['yearBuilt','conditionRating','conditionScore','numberOfSpans','numberOfLanes','aadtVehicles'].forEach(f => { if (row[f]) row[f] = parseInt(row[f]); });
                    ['nhvrRouteAssessed','freightRoute','overMassRoute','highPriorityAsset','floodImpacted','signageRequired'].forEach(f => {
                        if (row[f] !== undefined && row[f] !== '') row[f] = (row[f] === 'true' || row[f] === 'TRUE' || row[f] === '1');
                    });
                    if (!row.bridgeId || !row.name) { errors.push(`Row ${rowNum}: bridgeId and name are required`); failureCount++; continue; }
                    const existing = await getBridgeByKey(row.bridgeId, db);
                    if (existing) {
                        await tx.run(UPDATE('nhvr.Bridge').set(row).where({ bridgeId: row.bridgeId }));
                        updatedCount++;
                    } else {
                        row.isActive = true;
                        row.postingStatus = row.postingStatus || 'UNRESTRICTED';
                        await tx.run(INSERT.into('nhvr.Bridge').entries(row));
                        successCount++;
                    }
                } catch (err) { errors.push(`Row ${rowNum}: ${err.message}`); failureCount++; }
            }
            totalProcessed = dataLines.filter(l => l.trim()).length;
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName: 'mass-upload-bridges.csv', uploadType: 'BRIDGE',
                totalRecords: totalProcessed, successCount: successCount + updatedCount, failureCount,
                status: failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS', errorDetails: errors.join('\n')
            }));
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Bridge upload failed: ${e.message}. All changes rolled back.`);
        }
        await logAudit('ACTION', 'UploadLogs', 'mass-upload', 'Bridge Upload',
            `Mass upload: ${successCount} created, ${updatedCount} updated, ${failureCount} failed`, null, req);
        return { status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            totalRecords: totalProcessed, successCount, updatedCount, failureCount, errors: errors.join('\n') };
    });

    // ── massUploadRestrictions ─────────────────────────────────
    srv.on('massUploadRestrictions', async (req) => {
        const { csvData } = req.data;
        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV data is empty');
        const db = await cds.connect.to('db');
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const hdrErr = validateCSVHeaders(headers, RESTRICTION_HEADERS);
        if (hdrErr) return req.error(400, hdrErr);
        const dataLines = lines.slice(1);
        let successCount = 0, failureCount = 0;
        const errors = [];
        const bridges = await db.run(SELECT.from('nhvr.Bridge').columns('ID', 'bridgeId'));
        const bridgeMap = {};
        bridges.forEach(b => { bridgeMap[b.bridgeId] = b.ID; });
        const vcList = await db.run(SELECT.from('nhvr.VehicleClass').columns('ID', 'code'));
        const vcMap = {};
        vcList.forEach(v => { vcMap[v.code] = v.ID; });
        const routes = await db.run(SELECT.from('nhvr.Route').columns('ID', 'routeCode'));
        const routeMap = {};
        routes.forEach(r => { routeMap[r.routeCode] = r.ID; });
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < dataLines.length; i++) {
                const line = dataLines[i].trim();
                if (!line) continue;
                const rowNum = i + 2;
                try {
                    const values = parseCSVLine(line);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] || ''; });
                    if (row.bridgeId) {
                        row.bridge_ID = bridgeMap[row.bridgeId];
                        if (!row.bridge_ID) { errors.push(`Row ${rowNum}: Bridge "${row.bridgeId}" not found`); failureCount++; continue; }
                        delete row.bridgeId;
                    }
                    if (row.vehicleClassCode) {
                        row.vehicleClass_ID = vcMap[row.vehicleClassCode];
                        if (!row.vehicleClass_ID) { errors.push(`Row ${rowNum}: VehicleClass "${row.vehicleClassCode}" not found`); failureCount++; continue; }
                        delete row.vehicleClassCode;
                    }
                    if (row.routeCode) { row.route_ID = routeMap[row.routeCode]; delete row.routeCode; }
                    if (row.value) row.value = parseFloat(row.value);
                    ['permitRequired','signageRequired','isTemporary'].forEach(f => {
                        if (row[f] !== undefined && row[f] !== '') row[f] = (row[f] === 'true' || row[f] === 'TRUE' || row[f] === '1');
                    });
                    if (row.directionApplied === undefined || row.directionApplied === '') row.directionApplied = 'BOTH';
                    if (!row.restrictionType || !row.value || !row.unit) {
                        errors.push(`Row ${rowNum}: restrictionType, value, and unit are required`); failureCount++; continue;
                    }
                    row.status = row.status || 'ACTIVE';
                    row.isActive = true;
                    await tx.run(INSERT.into('nhvr.Restriction').entries(row));
                    successCount++;
                    if (row.bridge_ID) await updateBridgePostingStatus(row.bridge_ID);
                } catch (err) { errors.push(`Row ${rowNum}: ${err.message}`); failureCount++; }
            }
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName: 'mass-upload-restrictions.csv', uploadType: 'RESTRICTION',
                totalRecords: dataLines.filter(l => l.trim()).length, successCount, failureCount,
                status: failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS', errorDetails: errors.join('\n')
            }));
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Restriction upload failed: ${e.message}. All changes rolled back.`);
        }
        await logAudit('ACTION', 'UploadLogs', 'mass-upload', 'Restriction Upload',
            `Mass upload: ${successCount} restrictions imported, ${failureCount} failed`, null, req);
        return { status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            totalRecords: dataLines.filter(l => l.trim()).length, successCount, failureCount, errors: errors.join('\n') };
    });

    // ── massUploadRoutes ───────────────────────────────────────
    srv.on('massUploadRoutes', async (req) => {
        const { csvData } = req.data;
        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV data is empty');
        const db = await cds.connect.to('db');
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataLines = lines.slice(1);
        let successCount = 0, updatedCount = 0, failureCount = 0, totalProcessed = 0;
        const errors = [];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < dataLines.length; i++) {
                const line = dataLines[i].trim();
                if (!line) continue;
                const rowNum = i + 2;
                try {
                    const values = parseCSVLine(line);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] || ''; });
                    if (!row.routeCode || !row.description) { errors.push(`Row ${rowNum}: routeCode and description are required`); failureCount++; continue; }
                    if (row.isActive !== undefined && row.isActive !== '')
                        row.isActive = (row.isActive === 'true' || row.isActive === 'TRUE' || row.isActive === '1');
                    const existing = await db.run(SELECT.one.from('nhvr.Route').where({ routeCode: row.routeCode }));
                    if (existing) {
                        delete row.routeCode;
                        await tx.run(UPDATE('nhvr.Route').set(row).where({ routeCode: existing.routeCode || row.routeCode }));
                        row.routeCode = existing.routeCode; updatedCount++;
                    } else {
                        row.isActive = row.isActive !== undefined ? row.isActive : true;
                        await tx.run(INSERT.into('nhvr.Route').entries(row)); successCount++;
                    }
                } catch (err) { errors.push(`Row ${rowNum}: ${err.message}`); failureCount++; }
            }
            totalProcessed = dataLines.filter(l => l.trim()).length;
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName: 'mass-upload-routes.csv', uploadType: 'ROUTE',
                totalRecords: totalProcessed, successCount: successCount + updatedCount, failureCount,
                status: failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS', errorDetails: errors.join('\n')
            }));
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Route upload failed: ${e.message}. All changes rolled back.`);
        }
        await logAudit('ACTION', 'UploadLogs', 'mass-upload', 'Route Upload',
            `Mass upload: ${successCount} created, ${updatedCount} updated, ${failureCount} failed`, null, req);
        return { status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            totalRecords: totalProcessed, successCount, updatedCount, failureCount, errors: errors.join('\n') };
    });

    // ── massUploadVehicleClasses ───────────────────────────────
    srv.on('massUploadVehicleClasses', async (req) => {
        const { csvData } = req.data;
        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV data is empty');
        const db = await cds.connect.to('db');
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataLines = lines.slice(1);
        let successCount = 0, updatedCount = 0, failureCount = 0, totalProcessed = 0;
        const errors = [];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < dataLines.length; i++) {
                const line = dataLines[i].trim();
                if (!line) continue;
                const rowNum = i + 2;
                try {
                    const values = parseCSVLine(line);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] || ''; });
                    if (!row.code || !row.name) { errors.push(`Row ${rowNum}: code and name are required`); failureCount++; continue; }
                    ['maxMassKg','maxHeightM','maxWidthM','maxLengthM','maxAxleLoad_t'].forEach(f => { if (row[f]) row[f] = parseFloat(row[f]); });
                    if (row.sortOrder) row.sortOrder = parseInt(row.sortOrder);
                    ['isActive','isSystem','permitRequired'].forEach(f => {
                        if (row[f] !== undefined && row[f] !== '') row[f] = (row[f] === 'true' || row[f] === 'TRUE' || row[f] === '1');
                    });
                    const existing = await db.run(SELECT.one.from('nhvr.VehicleClass').where({ code: row.code }));
                    if (existing) {
                        const code = row.code; delete row.code;
                        await tx.run(UPDATE('nhvr.VehicleClass').set(row).where({ code })); updatedCount++;
                    } else {
                        row.isActive  = row.isActive  !== undefined ? row.isActive  : true;
                        row.isSystem  = row.isSystem  !== undefined ? row.isSystem  : false;
                        row.sortOrder = row.sortOrder !== undefined ? row.sortOrder : 0;
                        await tx.run(INSERT.into('nhvr.VehicleClass').entries(row)); successCount++;
                    }
                } catch (err) { errors.push(`Row ${rowNum}: ${err.message}`); failureCount++; }
            }
            totalProcessed = dataLines.filter(l => l.trim()).length;
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName: 'mass-upload-vehicleclasses.csv', uploadType: 'VEHICLE_CLASS',
                totalRecords: totalProcessed, successCount: successCount + updatedCount, failureCount,
                status: failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS', errorDetails: errors.join('\n')
            }));
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `VehicleClass upload failed: ${e.message}. All changes rolled back.`);
        }
        await logAudit('ACTION', 'UploadLogs', 'mass-upload', 'VehicleClass Upload',
            `Mass upload: ${successCount} created, ${updatedCount} updated, ${failureCount} failed`, null, req);
        return { status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            totalRecords: totalProcessed, successCount, updatedCount, failureCount, errors: errors.join('\n') };
    });

    // massUploadInspectionOrders removed in cut-down BIS variant
    // (InspectionOrder entity was removed). Mass upload of bridge
    // defects below still works without an inspection-order parent.

    // ── massUploadBridgeDefects ────────────────────────────────
    srv.on('massUploadBridgeDefects', async (req) => {
        const { csvData } = req.data;
        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV data is empty');
        const db = await cds.connect.to('db');
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataLines = lines.slice(1);
        let successCount = 0, updatedCount = 0, failureCount = 0, totalProcessed = 0;
        const errors = [];
        const bridges = await db.run(SELECT.from('nhvr.Bridge').columns('ID', 'bridgeId'));
        const bridgeMap = {};
        bridges.forEach(b => { bridgeMap[b.bridgeId] = b.ID; });
        const VALID_SEVERITY = ['LOW','MEDIUM','HIGH','CRITICAL'];
        const VALID_CATEGORY = ['STRUCTURAL','SERVICEABILITY','DURABILITY','SAFETY'];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < dataLines.length; i++) {
                const line = dataLines[i].trim();
                if (!line) continue;
                const rowNum = i + 2;
                try {
                    const values = parseCSVLine(line);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] || ''; });
                    if (!row.bridgeId)       { errors.push(`Row ${rowNum}: bridgeId required`);       failureCount++; continue; }
                    if (!row.defectCategory) { errors.push(`Row ${rowNum}: defectCategory required`); failureCount++; continue; }
                    if (!row.severity)       { errors.push(`Row ${rowNum}: severity required`);       failureCount++; continue; }
                    if (!row.description)    { errors.push(`Row ${rowNum}: description required`);    failureCount++; continue; }
                    if (!VALID_SEVERITY.includes((row.severity||'').toUpperCase())) { errors.push(`Row ${rowNum}: severity must be ${VALID_SEVERITY.join('|')}`); failureCount++; continue; }
                    if (!VALID_CATEGORY.includes((row.defectCategory||'').toUpperCase())) { errors.push(`Row ${rowNum}: defectCategory must be ${VALID_CATEGORY.join('|')}`); failureCount++; continue; }
                    row.bridge_ID = bridgeMap[row.bridgeId];
                    if (!row.bridge_ID) { errors.push(`Row ${rowNum}: Bridge "${row.bridgeId}" not found`); failureCount++; continue; }
                    delete row.bridgeId;
                    row.severity = (row.severity||'').toUpperCase();
                    row.defectCategory = (row.defectCategory||'').toUpperCase();
                    if (row.status) row.status = row.status.toUpperCase();
                    if (row.repairEstimateAUD) row.repairEstimateAUD = parseFloat(row.repairEstimateAUD);
                    if (row.defectNumber) {
                        const existing = await db.run(SELECT.one.from('nhvr.BridgeDefect')
                            .where({ defectNumber: row.defectNumber, bridge_ID: row.bridge_ID }));
                        if (existing) {
                            const dNum = row.defectNumber; delete row.defectNumber;
                            await tx.run(UPDATE('nhvr.BridgeDefect').set(row)
                                .where({ defectNumber: dNum, bridge_ID: row.bridge_ID }));
                            updatedCount++; continue;
                        }
                    }
                    row.status = row.status || 'OPEN';
                    await tx.run(INSERT.into('nhvr.BridgeDefect').entries(row)); successCount++;
                } catch (err) { errors.push(`Row ${rowNum}: ${err.message}`); failureCount++; }
            }
            totalProcessed = dataLines.filter(l => l.trim()).length;
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName: 'mass-upload-bridge-defects.csv', uploadType: 'BRIDGE_DEFECT',
                totalRecords: totalProcessed, successCount: successCount + updatedCount, failureCount,
                status: failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS', errorDetails: errors.join('\n')
            }));
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `BridgeDefect upload failed: ${e.message}. All changes rolled back.`);
        }
        await logAudit('ACTION', 'UploadLogs', 'mass-upload', 'BridgeDefect Upload',
            `Mass upload: ${successCount} created, ${updatedCount} updated, ${failureCount} failed`, null, req);
        return { status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            totalRecords: totalProcessed, successCount, updatedCount, failureCount, errors: errors.join('\n') };
    });

    // ── massUploadLookups ──────────────────────────────────────
    // Hardened mass-upload for admin-configurable lookup values.
    // Design goals:
    //   • Header whitelist (fail fast on typos / unknown columns)
    //   • Row cap (denial-of-service guard)
    //   • Category/code normalisation + length enforcement
    //   • Per-row change capture in LookupChangeLog
    //   • Transaction-safe audit log (writes BEFORE commit)
    //   • UploadLog persisted even on partial failure (inside tx)
    const LOOKUP_HEADERS = new Set(['category','code','description','displayOrder','isActive']);
    const LOOKUP_CATEGORY_MAX = 50;
    const LOOKUP_CODE_MAX     = 200;
    const LOOKUP_DESC_MAX     = 300;

    // Convert an xlsx (base64-encoded) workbook's first sheet to CSV text.
    // Uses the `xlsx` package (SheetJS). Throws on parse error so the
    // outer handler can return a 400 with a friendly message.
    function xlsxBase64ToCsv(base64) {
        const XLSX = require('xlsx');
        const buf = Buffer.from(base64, 'base64');
        const wb = XLSX.read(buf, { type: 'buffer' });
        if (!wb.SheetNames || !wb.SheetNames.length) {
            throw new Error('Workbook contains no sheets');
        }
        // Prefer a sheet named "Lookups" (our own template), fall back to first
        const sheetName = wb.SheetNames.includes('Lookups') ? 'Lookups' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_csv(ws);
    }

    srv.on('massUploadLookups', async (req) => {
        let { csvData, fileBase64, fileName } = req.data;

        // If the client sent an xlsx file, decode it server-side and turn the
        // first sheet into CSV. We then run the exact same pipeline as a plain
        // csvData upload — no code duplication.
        if (fileBase64 && fileBase64.length > 0) {
            try {
                csvData = xlsxBase64ToCsv(fileBase64);
            } catch (e) {
                return req.error(400, `Could not parse xlsx file: ${e.message}`);
            }
        }

        if (!csvData || csvData.trim() === '') return req.error(400, 'CSV / xlsx data is empty');

        const lines = csvData.trim().split(/\r?\n/);
        if (lines.length < 2) return req.error(400, 'CSV must contain a header row and at least one data row');

        const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());
        const badCols = headers.filter(h => h && !LOOKUP_HEADERS.has(h));
        if (badCols.length) {
            return req.error(400, `Unknown column(s): ${badCols.join(', ')}. Allowed: ${Array.from(LOOKUP_HEADERS).join(', ')}`);
        }
        if (!headers.includes('category') || !headers.includes('code')) {
            return req.error(400, "CSV must include 'category' and 'code' columns");
        }

        const dataLines = lines.slice(1).filter(l => l.trim());
        if (dataLines.length > MAX_CSV_ROWS) {
            return req.error(400, `CSV exceeds maximum of ${MAX_CSV_ROWS} rows (got ${dataLines.length})`);
        }

        let successCount = 0, updatedCount = 0, failureCount = 0;
        const errors = [];
        const rowResults = [];   // { row, category, code, status, message }
        const tx = cds.tx(req);

        try {
            for (let i = 0; i < dataLines.length; i++) {
                const rowNum = i + 2; // +1 for header, +1 for 1-indexed
                try {
                    const values = parseCSVLine(dataLines[i]);
                    const row = {};
                    headers.forEach((hdr, idx) => { row[hdr] = values[idx] !== undefined ? values[idx] : ''; });

                    // Required fields
                    if (!row.category) {
                        errors.push(`Row ${rowNum}: category required`);
                        rowResults.push({ row: rowNum, category: '', code: row.code || '', status: 'ERROR', message: 'category required' });
                        failureCount++; continue;
                    }
                    if (!row.code) {
                        errors.push(`Row ${rowNum}: code required`);
                        rowResults.push({ row: rowNum, category: row.category || '', code: '', status: 'ERROR', message: 'code required' });
                        failureCount++; continue;
                    }

                    // Normalise: upper-case + trim (prevents near-duplicate categories)
                    row.category = String(row.category).trim().toUpperCase();
                    row.code     = String(row.code).trim().toUpperCase();

                    // Length enforcement (matches schema String(N))
                    if (row.category.length > LOOKUP_CATEGORY_MAX) {
                        errors.push(`Row ${rowNum}: category exceeds ${LOOKUP_CATEGORY_MAX} chars`);
                        rowResults.push({ row: rowNum, category: row.category, code: row.code, status: 'ERROR', message: `category exceeds ${LOOKUP_CATEGORY_MAX} chars` });
                        failureCount++; continue;
                    }
                    if (row.code.length > LOOKUP_CODE_MAX) {
                        errors.push(`Row ${rowNum}: code exceeds ${LOOKUP_CODE_MAX} chars`);
                        rowResults.push({ row: rowNum, category: row.category, code: row.code, status: 'ERROR', message: `code exceeds ${LOOKUP_CODE_MAX} chars` });
                        failureCount++; continue;
                    }
                    if (row.description && row.description.length > LOOKUP_DESC_MAX) {
                        row.description = row.description.substring(0, LOOKUP_DESC_MAX);
                    }

                    // Coerce typed fields
                    if (row.displayOrder) {
                        const n = parseInt(row.displayOrder);
                        if (Number.isNaN(n)) {
                            errors.push(`Row ${rowNum}: displayOrder must be numeric`);
                            rowResults.push({ row: rowNum, category: row.category, code: row.code, status: 'ERROR', message: 'displayOrder must be numeric' });
                            failureCount++; continue;
                        }
                        row.displayOrder = n;
                    }
                    if (row.isActive !== undefined && row.isActive !== '') {
                        row.isActive = (row.isActive === 'true' || row.isActive === 'TRUE' || row.isActive === '1');
                    }

                    const existing = await tx.run(
                        SELECT.one.from('nhvr.Lookup').where({ category: row.category, code: row.code })
                    );

                    const auditUser = req && req.user ? req.user.id : 'system';
                    const auditRole = (['Admin','BridgeManager','Viewer'].find(r => req && req.user && req.user.is && req.user.is(r))) || 'Unknown';

                    if (existing) {
                        const { category, code } = row;
                        const updatePayload = { ...row };
                        delete updatePayload.category;
                        delete updatePayload.code;
                        await tx.run(UPDATE('nhvr.Lookup').set(updatePayload).where({ category, code }));
                        updatedCount++;
                        rowResults.push({ row: rowNum, category, code, status: 'UPDATED', message: 'existing row updated' });
                        // Per-row change log in AuditLog (old → new snapshot for traceability)
                        await tx.run(INSERT.into('nhvr.AuditLog').entries({
                            timestamp  : new Date().toISOString(),
                            userId     : auditUser,
                            userRole   : auditRole,
                            action     : 'UPDATE',
                            entity     : 'Lookups',
                            entityId   : `${category}/${code}`,
                            entityName : `${category}/${code}`,
                            changes    : JSON.stringify({
                                before: { description: existing.description, displayOrder: existing.displayOrder, isActive: existing.isActive },
                                after : { description: updatePayload.description, displayOrder: updatePayload.displayOrder, isActive: updatePayload.isActive }
                            }),
                            description: `Lookup updated via mass upload (row ${rowNum})`
                        }));
                    } else {
                        row.isActive = row.isActive !== undefined ? row.isActive : true;
                        await tx.run(INSERT.into('nhvr.Lookup').entries(row));
                        successCount++;
                        rowResults.push({ row: rowNum, category: row.category, code: row.code, status: 'CREATED', message: 'new row inserted' });
                        await tx.run(INSERT.into('nhvr.AuditLog').entries({
                            timestamp  : new Date().toISOString(),
                            userId     : auditUser,
                            userRole   : auditRole,
                            action     : 'CREATE',
                            entity     : 'Lookups',
                            entityId   : `${row.category}/${row.code}`,
                            entityName : `${row.category}/${row.code}`,
                            changes    : JSON.stringify({ after: row }),
                            description: `Lookup created via mass upload (row ${rowNum})`
                        }));
                    }
                } catch (err) {
                    errors.push(`Row ${rowNum}: ${err.message}`);
                    rowResults.push({ row: rowNum, category: '', code: '', status: 'ERROR', message: err.message });
                    failureCount++;
                }
            }

            const totalProcessed = dataLines.length;

            // Persist UploadLog (inside tx — rolls back on fatal errors only)
            await tx.run(INSERT.into('nhvr.UploadLog').entries({
                fileName    : fileName || (fileBase64 ? 'mass-upload-lookups.xlsx' : 'mass-upload-lookups.csv'),
                uploadType  : 'LOOKUP',
                totalRecords: totalProcessed,
                successCount: successCount + updatedCount,
                failureCount,
                status      : failureCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS',
                errorDetails: errors.join('\n')
            }));

            // Audit log BEFORE commit so it shares the transaction
            try {
                await tx.run(INSERT.into('nhvr.AuditLog').entries({
                    timestamp  : new Date().toISOString(),
                    userId     : req && req.user ? req.user.id : 'system',
                    userRole   : (['Admin','BridgeManager','Viewer'].find(r => req && req.user && req.user.is && req.user.is(r))) || 'Unknown',
                    action     : 'ACTION',
                    entity     : 'UploadLogs',
                    entityId   : 'mass-upload-lookups',
                    entityName : 'Lookup Upload',
                    changes    : JSON.stringify({ successCount, updatedCount, failureCount, totalProcessed }),
                    description: `Mass upload: ${successCount} created, ${updatedCount} updated, ${failureCount} failed`
                }));
            } catch (auditErr) {
                // Don't fail the whole upload if audit insert has schema drift
                cds.log('nhvr-upload').warn('Audit log insert failed:', auditErr.message);
            }

            await tx.commit();

            return {
                status      : failureCount === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
                totalRecords: totalProcessed,
                successCount,
                updatedCount,
                failureCount,
                errors      : errors.join('\n'),
                rowResults  : JSON.stringify(rowResults)
            };
        } catch (e) {
            try { await tx.rollback(); } catch (_) { /* ignore */ }
            return req.error(500, `Lookup upload failed: ${e.message}. All changes rolled back.`);
        }
    });

    // ── massDownloadBridges ────────────────────────────────────
    srv.on('massDownloadBridges', async (req) => {
        const { region, state, routeCode } = req.data;
        const db = await cds.connect.to('db');
        const where = { isActive: true };
        if (region) where.region = region;
        if (state)  where.state  = state;
        let bridges = await db.run(SELECT.from('nhvr.Bridge').where(where));
        if (routeCode) {
            const route = await db.run(SELECT.one.from('nhvr.Route').where({ routeCode }));
            bridges = route ? bridges.filter(b => b.route_ID === route.ID) : [];
        }
        const routes = await db.run(SELECT.from('nhvr.Route').columns('ID', 'routeCode'));
        const routeById = {};
        routes.forEach(r => { routeById[r.ID] = r.routeCode; });
        const headers = ['bridgeId','name','region','state','structureType','material','yearBuilt',
            'latitude','longitude','routeCode','routeKm','spanLengthM','deckWidthM','clearanceHeightM',
            'condition','conditionScore','inspectionDate','postingStatus'];
        const csvLines = [headers.join(',')];
        for (const b of bridges) {
            csvLines.push([
                b.bridgeId||'', `"${(b.name||'').replace(/"/g,'""')}"`,
                b.region||'', b.state||'', b.structureType||'', b.material||'',
                b.yearBuilt||'', b.latitude||'', b.longitude||'',
                routeById[b.route_ID]||'', b.routeKm||'', b.spanLengthM||'',
                b.deckWidthM||'', b.clearanceHeightM||'', b.condition||'',
                b.conditionScore||'', b.inspectionDate||'', b.postingStatus||''
            ].join(','));
        }
        return { csvData: csvLines.join('\n'), totalRecords: bridges.length };
    });

    // ── validateRestriction ────────────────────────────────────
    srv.on('validateRestriction', async (req) => {
        const { bridgeId, vehicleClassCode, checkDate, checkTime, restrictionType } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db, true);
        if (!bridge) return { isAllowed: false, message: `Bridge "${bridgeId}" not found`, permitRequired: false };
        const vc = await db.run(SELECT.one.from('nhvr.VehicleClass').where({ code: vehicleClassCode, isActive: true }));
        const whereClause = { bridge_ID: bridge.ID, status: 'ACTIVE', isActive: true };
        if (restrictionType) whereClause.restrictionType = restrictionType;
        if (vc)              whereClause.vehicleClass_ID = vc.ID;
        const restrictions = await db.run(SELECT.from('nhvr.Restriction').where(whereClause));
        if (restrictions.length === 0)
            return { isAllowed: true, message: 'No restrictions found for this vehicle on this bridge', permitRequired: false };
        const checkDateObj = checkDate ? new Date(checkDate) : new Date();
        const checkDay = ['SUN','MON','TUE','WED','THU','FRI','SAT'][checkDateObj.getDay()];
        for (const r of restrictions) {
            if (r.validFromDate && new Date(r.validFromDate) > checkDateObj) continue;
            if (r.validToDate   && new Date(r.validToDate)   < checkDateObj) continue;
            if (r.dayOfWeek) {
                const allowedDays = r.dayOfWeek.split(',').map(d => d.trim());
                if (!allowedDays.includes(checkDay)) continue;
            }
            if (r.validFromTime && r.validToTime && checkTime) {
                if (checkTime < r.validFromTime || checkTime > r.validToTime) continue;
            }
            return {
                isAllowed: false, restrictionValue: r.value, unit: r.unit,
                message: `Vehicle restricted. ${r.restrictionType}: ${r.value} ${r.unit}` +
                         (r.permitRequired ? ' (Permit may be available)' : ''),
                permitRequired: r.permitRequired || false
            };
        }
        return { isAllowed: true, message: 'Vehicle is permitted on this bridge at the specified time', permitRequired: false };
    });

    // ── importBridgesBatch ─────────────────────────────────────
    srv.on('importBridgesBatch', async (req) => {
        const { rows } = req.data;
        if (!rows || !rows.length) return req.error(400, 'No rows provided');
        if (rows.length > 500) return req.error(400, 'Maximum 500 rows per call');
        const db = await cds.connect.to('db');
        let created = 0, updated = 0, failed = 0;
        const errors = [];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    if (!row.bridgeId || !row.name || !row.state) {
                        errors.push({ row: i+1, field: 'bridgeId/name/state', message: 'Required fields missing' }); failed++; continue;
                    }
                    if (row.conditionRating != null && (row.conditionRating < 1 || row.conditionRating > 10)) {
                        errors.push({ row: i+1, field: 'conditionRating', message: 'Must be 1–10' }); failed++; continue;
                    }
                    const existing = await getBridgeByKey(row.bridgeId, db);
                    const record = {
                        bridgeId: row.bridgeId, name: row.name, state: row.state,
                        routeNumber: row.routeNumber||null, lga: row.lga||null, region: row.region||null,
                        assetOwner: row.assetOwner||null, bancId: row.bancId||null,
                        totalLengthM: row.totalLengthM||null, widthM: row.widthM||null,
                        numberOfSpans: row.numberOfSpans||null, clearanceHeightM: row.clearanceHeightM||null,
                        numberOfLanes: row.numberOfLanes||null, structureType: row.structureType||null,
                        material: row.material||null, yearBuilt: row.yearBuilt||null,
                        postingStatus: row.postingStatus||'UNRESTRICTED',
                        nhvrRouteAssessed: row.nhvrRouteAssessed||false, hmlApproved: row.hmlApproved||false,
                        bdoubleApproved: row.bdoubleApproved||false, freightRoute: row.freightRoute||false,
                        gazetteRef: row.gazetteRef||null, conditionRating: row.conditionRating||null,
                        condition: row.condition||null, inspectionDate: row.inspectionDate||null,
                        highPriorityAsset: row.highPriorityAsset||false,
                        latitude: row.latitude||null, longitude: row.longitude||null,
                        remarks: row.remarks||null, dataSource: row.dataSource||null
                    };
                    if (existing) {
                        await tx.run(UPDATE('nhvr.Bridge').set(record).where({ ID: existing.ID }));
                        await tx.run(INSERT.into('nhvr.AuditLog').entries({
                            ID: cds.utils.uuid(), entityName: 'Bridge', entityId: existing.ID,
                            action: 'BULK_IMPORT_UPDATE', changedBy: req.user.id||'SYSTEM',
                            changedAt: new Date().toISOString(), description: `Bulk import updated bridge ${row.bridgeId}`
                        }));
                        updated++;
                    } else {
                        record.ID = cds.utils.uuid();
                        await tx.run(INSERT.into('nhvr.Bridge').entries(record));
                        await tx.run(INSERT.into('nhvr.AuditLog').entries({
                            ID: cds.utils.uuid(), entityName: 'Bridge', entityId: record.ID,
                            action: 'BULK_IMPORT_CREATE', changedBy: req.user.id||'SYSTEM',
                            changedAt: new Date().toISOString(), description: `Bulk import created bridge ${row.bridgeId}`
                        }));
                        created++;
                    }
                } catch (err) { errors.push({ row: i+1, field: '', message: err.message||String(err) }); failed++; }
            }
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Bridge batch import failed: ${e.message}. All changes rolled back.`);
        }
        return { created, updated, failed, errors };
    });

    // ── importRestrictionsBatch ────────────────────────────────
    srv.on('importRestrictionsBatch', async (req) => {
        const { rows } = req.data;
        if (!rows || !rows.length) return req.error(400, 'No rows provided');
        if (rows.length > 500) return req.error(400, 'Maximum 500 rows per call');
        const db = await cds.connect.to('db');
        let created = 0, updated = 0, failed = 0;
        const errors = [];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    if (!row.bridge_bridgeId || !row.restrictionType || !row.value || !row.unit) {
                        errors.push({ row: i+1, field: 'bridge_bridgeId/restrictionType/value/unit', message: 'Required fields missing' });
                        failed++; continue;
                    }
                    const bridge = await getBridgeByKey(row.bridge_bridgeId, db);
                    if (!bridge) {
                        errors.push({ row: i+1, field: 'bridge_bridgeId', message: `Bridge not found: ${row.bridge_bridgeId}` });
                        failed++; continue;
                    }
                    const record = {
                        ID: cds.utils.uuid(), bridge_ID: bridge.ID,
                        restrictionType: row.restrictionType, value: row.value, unit: row.unit,
                        status: row.status||'ACTIVE', isTemporary: row.isTemporary||false,
                        permitRequired: row.permitRequired||false,
                        validFromDate: row.validFromDate||null, validToDate: row.validToDate||null,
                        gazetteRef: row.gazetteRef||null, approvedBy: row.approvedBy||null,
                        notes: row.notes||null, isActive: true
                    };
                    await tx.run(INSERT.into('nhvr.Restriction').entries(record));
                    created++;
                } catch (err) { errors.push({ row: i+1, field: '', message: err.message||String(err) }); failed++; }
            }
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Restriction batch import failed: ${e.message}. All changes rolled back.`);
        }
        return { created, updated, failed, errors };
    });
};
