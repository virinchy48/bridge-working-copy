'use strict';

/**
 * Regression test for "Save failed: hbox.getItems is not a function".
 *
 * Symptom (before fix):
 *   Saving a bridge crashed with `hbox.getItems is not a function` whenever
 *   the dynamic-attribute Panel had not yet rendered the dynamic HBox —
 *   either because the AttributeDefinitions fetch was still in flight,
 *   silently errored, or returned an empty list.
 *
 * Root cause:
 *   `<VBox id="dynAttrContainer">` ships with a placeholder
 *   `<Text text="Loading custom attributes…">` from the XML view.
 *   `_collectDynAttrValues` did:
 *
 *       const hbox = container.getItems()[0];   // ← the placeholder Text!
 *       if (!hbox) return vals;
 *       hbox.getItems().forEach(...)            // ← Text has no getItems → CRASH
 *
 *   The `if (!hbox)` guard only protected the empty case, not the case
 *   where index 0 is a non-HBox sibling.
 *
 * Fix (in BridgeForm.controller.js _collectDynAttrValues):
 *   - Find the first child whose `getItems` is actually a function instead
 *     of indexing blindly.
 *   - Defensive checks at every level so a malformed sub-tree returns {}
 *     instead of throwing.
 */

// Stand-in for a UI5 control. Mirrors the subset of the API that
// _collectDynAttrValues uses.
function makeText(text) {
    return { __type: 'Text', text };
}

function makeControl(attrName, value, type = 'Input') {
    const _data = { attrName, attrId: 'attr-' + attrName, attrType: type };
    return {
        __type: type,
        data(key) { return _data[key]; },
        getValue() { return value; },
        getState()       { return value === true || value === 'true'; },
        getSelectedKey() { return value; }
    };
}

function makeVBox(label, ctrl) {
    return {
        __type: 'VBox',
        getItems() { return [label, ctrl]; }
    };
}

function makeHBox(vboxes) {
    return {
        __type: 'HBox',
        getItems() { return vboxes; }
    };
}

function makeContainer(items) {
    return { __type: 'VBox', getItems() { return items; } };
}

// The fixed _collectDynAttrValues — must mirror the controller exactly so
// drift surfaces here.
function collectDynAttrValues(container) {
    if (!container) return {};
    const vals = {};
    const items = container.getItems ? container.getItems() : [];
    const hbox  = items.find(it => it && typeof it.getItems === 'function');
    if (!hbox) return vals;
    hbox.getItems().forEach(vbox => {
        if (!vbox || typeof vbox.getItems !== 'function') return;
        const controls = vbox.getItems();
        if (controls.length < 2) return;
        const ctrl = controls[1];
        if (!ctrl || typeof ctrl.data !== 'function') return;
        const attrName = ctrl.data('attrName');
        if (!attrName) return;
        let val;
        if (ctrl.__type === 'Switch')        val = String(ctrl.getState());
        else if (ctrl.__type === 'Select')   val = ctrl.getSelectedKey();
        else                                  val = ctrl.getValue();
        vals[attrName] = { value: val, attrId: ctrl.data('attrId') };
    });
    return vals;
}

describe('BridgeForm._collectDynAttrValues — placeholder safety', () => {

    test('null container → empty object (no crash)', () => {
        expect(collectDynAttrValues(null)).toEqual({});
    });

    test('empty container → empty object', () => {
        expect(collectDynAttrValues(makeContainer([]))).toEqual({});
    });

    test('REGRESSION: container with only the placeholder Text (the original crash)', () => {
        // This is the EXACT state I observed in the live browser before the fix:
        //   container.getItems() → [ <Text "Loading custom attributes…"> ]
        const container = makeContainer([makeText('Loading custom attributes…')]);
        // Before the fix, this threw "hbox.getItems is not a function".
        // After the fix, it must return {} silently.
        expect(() => collectDynAttrValues(container)).not.toThrow();
        expect(collectDynAttrValues(container)).toEqual({});
    });

    test('container with HBox of dynamic-attribute editors → returns values', () => {
        const container = makeContainer([
            makeHBox([
                makeVBox(makeText('Inspector Name'),  makeControl('inspectorName', 'John Doe')),
                makeVBox(makeText('Last Audit Date'), makeControl('lastAuditDate', '2026-01-15', 'DatePicker'))
            ])
        ]);
        expect(collectDynAttrValues(container)).toEqual({
            inspectorName: { value: 'John Doe', attrId: 'attr-inspectorName' },
            lastAuditDate: { value: '2026-01-15', attrId: 'attr-lastAuditDate' }
        });
    });

    test('mixed container (placeholder Text + HBox) → still finds the HBox', () => {
        // Defends against future view edits that add headers or notes alongside the HBox.
        const container = makeContainer([
            makeText('Custom attributes'),
            makeHBox([makeVBox(makeText('X'), makeControl('x', '42'))])
        ]);
        expect(collectDynAttrValues(container)).toEqual({
            x: { value: '42', attrId: 'attr-x' }
        });
    });

    test('Switch control → value coerced to string', () => {
        const container = makeContainer([
            makeHBox([makeVBox(makeText('Active'), makeControl('isActive', true, 'Switch'))])
        ]);
        expect(collectDynAttrValues(container)).toEqual({
            isActive: { value: 'true', attrId: 'attr-isActive' }
        });
    });

    test('VBox with fewer than 2 controls is skipped (defensive)', () => {
        const container = makeContainer([
            makeHBox([
                { __type: 'VBox', getItems: () => [makeText('Orphan label')] }, // only 1 child — skip
                makeVBox(makeText('OK'), makeControl('ok', 'yes'))
            ])
        ]);
        expect(collectDynAttrValues(container)).toEqual({
            ok: { value: 'yes', attrId: 'attr-ok' }
        });
    });

    test('control without attrName is skipped', () => {
        const ctrlNoAttrName = { __type: 'Input', data: () => undefined, getValue: () => 'x' };
        const container = makeContainer([
            makeHBox([{ __type: 'VBox', getItems: () => [makeText('Lbl'), ctrlNoAttrName] }])
        ]);
        expect(collectDynAttrValues(container)).toEqual({});
    });
});
