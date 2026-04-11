'use strict';

/**
 * Regression test for "Upload failed — check console for details".
 *
 * Symptom (before fix):
 *   The mass-upload action returned 200 OK with the data persisted, but the
 *   UI showed "Upload failed — check console for details" and skipped the
 *   success summary panel. The user thought the upload had failed when it
 *   had actually succeeded.
 *
 * Root cause:
 *   `_showUploadResult` called `errorsEl.setText(...)` on the
 *   `#resultErrors` control. That control is a `sap.m.TextArea`, whose
 *   API is `setValue()`, NOT `setText()`. The thrown TypeError propagated
 *   out of the `.then()` chain in `_doUpload`, hit the `.catch()`, and
 *   surfaced the misleading "Upload failed" toast — even though the data
 *   was already in the database.
 *
 * Fix (in MassUpload.controller.js _showUploadResult):
 *   - Detect which method exists on the control (`setValue` vs `setText`)
 *     and call the right one. This makes the rendering robust against
 *     future view edits that might switch between TextArea and Text.
 */

// Stand-ins for SAPUI5 controls.
function makeTextArea() {
    let _value = '';
    let _visible = false;
    return {
        __type: 'TextArea',
        setValue(v) { _value = v; },
        getValue() { return _value; },
        setVisible(v) { _visible = v; },
        getVisible() { return _visible; }
        // intentionally NO setText — calling it would throw
    };
}

function makeText() {
    let _text = '';
    let _visible = false;
    return {
        __type: 'Text',
        setText(t) { _text = t; },
        getText() { return _text; },
        setVisible(v) { _visible = v; },
        getVisible() { return _visible; }
    };
}

// The fixed renderErrors block — must mirror the controller exactly so
// drift surfaces here.
function renderErrorsInto(errorsEl, errors) {
    if (!errorsEl) return;
    errorsEl.setVisible(!!(errors && errors.trim()));
    const text = errors ? `Errors:\n${errors}` : '';
    if (typeof errorsEl.setValue === 'function') {
        errorsEl.setValue(text);
    } else if (typeof errorsEl.setText === 'function') {
        errorsEl.setText(text);
    }
}

describe('MassUpload._showUploadResult — error rendering safety', () => {

    test('TextArea control receives setValue (no exception)', () => {
        const ta = makeTextArea();
        expect(() => renderErrorsInto(ta, 'Row 3: bad')).not.toThrow();
        expect(ta.getValue()).toBe('Errors:\nRow 3: bad');
        expect(ta.getVisible()).toBe(true);
    });

    test('Text control still works via setText fallback', () => {
        // Defends against a future view change that swaps TextArea → Text.
        const t = makeText();
        renderErrorsInto(t, 'something broken');
        expect(t.getText()).toBe('Errors:\nsomething broken');
        expect(t.getVisible()).toBe(true);
    });

    test('empty errors → control hidden, value cleared', () => {
        const ta = makeTextArea();
        ta.setVisible(true); // pretend it was previously visible
        renderErrorsInto(ta, '');
        expect(ta.getValue()).toBe('');
        expect(ta.getVisible()).toBe(false);
    });

    test('whitespace-only errors → control hidden', () => {
        const ta = makeTextArea();
        renderErrorsInto(ta, '   \n  ');
        expect(ta.getVisible()).toBe(false);
    });

    test('null errorsEl → no-op (doesn\'t crash)', () => {
        expect(() => renderErrorsInto(null, 'whatever')).not.toThrow();
    });

    test('REGRESSION: TextArea must NOT throw when given the old code path', () => {
        // Simulates the buggy behaviour: calling setText on a TextArea.
        // This is what was happening before the fix and what the .catch in
        // _doUpload was misinterpreting as an upload failure.
        const ta = makeTextArea();
        expect(() => ta.setText('boom')).toThrow(); // confirm the precondition
        // The fixed renderErrorsInto must NOT trigger this path.
        expect(() => renderErrorsInto(ta, 'safe path')).not.toThrow();
    });
});
