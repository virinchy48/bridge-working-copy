'use strict';
const cds = require('@sap/cds');

module.exports = function registerAttributeHandlers(srv, h) {
    const { logAudit } = h;

    srv.before(['CREATE', 'UPDATE'], 'BridgeAttributes', async (req) => {
        const data = req.data;
        if (!data.attribute_ID) return;
        const db = await cds.connect.to('db');
        const attrDef = await db.run(SELECT.one.from('nhvr.AttributeDefinition').where({ ID: data.attribute_ID }));
        if (!attrDef) { req.error(400, `Attribute definition not found`, 'attribute_ID'); return; }
        if (attrDef.isRequired && (!data.value || data.value.trim() === '')) {
            req.error(400, `Attribute "${attrDef.label}" is required and cannot be empty`, 'value');
        }
        if (data.value) {
            const validValues = await db.run(SELECT.from('nhvr.AttributeValidValue').where({ attribute_ID: data.attribute_ID, isActive: true }));
            if (validValues.length > 0) {
                const allowed = validValues.map(v => v.value);
                if (!allowed.includes(data.value.trim())) {
                    req.error(400, `Value "${data.value}" is not valid for "${attrDef.label}". Allowed values: ${allowed.join(', ')}`, 'value');
                }
            }
        }
        if (attrDef.dataType === 'INTEGER' && data.value && isNaN(parseInt(data.value))) {
            req.error(400, `"${attrDef.label}" must be an integer`, 'value');
        }
        if (attrDef.dataType === 'DECIMAL' && data.value && isNaN(parseFloat(data.value))) {
            req.error(400, `"${attrDef.label}" must be a number`, 'value');
        }
        if (attrDef.dataType === 'BOOLEAN' && data.value && !['true','false','1','0'].includes(data.value.toLowerCase())) {
            req.error(400, `"${attrDef.label}" must be true or false`, 'value');
        }
    });

    srv.after('CREATE', 'BridgeAttributes', async (data, req) => {
        await logAudit('CREATE', 'BridgeAttributes', data.ID, `Attribute value`,
            `Bridge attribute created (value: ${data.value})`, data, req);
    });

    srv.after('UPDATE', 'BridgeAttributes', async (data, req) => {
        await logAudit('UPDATE', 'BridgeAttributes', req.params[0], `Attribute value`,
            `Bridge attribute updated (new value: ${req.data.value})`, req.data, req);
    });

    srv.after('DELETE', 'BridgeAttributes', async (data, req) => {
        await logAudit('DELETE', 'BridgeAttributes', req.params[0], '',
            `Bridge attribute deleted`, null, req);
    });
};
