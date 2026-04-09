// ============================================================
// NHVR Bridge Management — Table Personalisation Utility
// SAP ALV-inspired column settings, variant management, export
//
// Usage (in any controller):
//   TablePersonalisation.buildGroupedList(oList, attrs, savedKeys)
//   TablePersonalisation.getSelectedKeys(oList)
//   TablePersonalisation.saveVariant(storageKey, name, keys)
//   TablePersonalisation.loadVariants(storageKey) → [{name, keys, isDefault}]
//   TablePersonalisation.deleteVariant(storageKey, name)
//   TablePersonalisation.updateStats(statsCtrl, oList)
// ============================================================
sap.ui.define([], function () {
    "use strict";

    /**
     * Build a grouped, searchable list using GroupHeaderListItem + StandardListItem.
     * @param {sap.m.List} oList        - the sap.m.List control to populate
     * @param {object[]}  attrs         - attribute definitions with {key, label, sectionLabel}
     * @param {string[]}  savedKeys     - currently selected keys
     * @param {string}    [searchQuery] - optional filter string
     */
    function buildGroupedList(oList, attrs, savedKeys, searchQuery, sectionFilter) {
        oList.destroyItems();
        var q = (searchQuery || "").toLowerCase();

        // Apply section filter first
        if (sectionFilter) {
            attrs = attrs.filter(function (a) { return a.sectionLabel === sectionFilter; });
        }

        // Group attributes by sectionLabel preserving order
        var groups = [];
        var groupMap = {};
        attrs.forEach(function (attr) {
            var sl = attr.sectionLabel || "Other";
            if (!groupMap[sl]) {
                groupMap[sl] = [];
                groups.push(sl);
            }
            groupMap[sl].push(attr);
        });

        groups.forEach(function (sectionLabel) {
            var sectionAttrs = groupMap[sectionLabel];
            // Filter if searching
            var visible = !q ? sectionAttrs : sectionAttrs.filter(function (a) {
                return a.label.toLowerCase().indexOf(q) !== -1 ||
                       (a.sectionLabel || "").toLowerCase().indexOf(q) !== -1;
            });
            if (visible.length === 0) return;

            // Group header
            var selectedInGroup = visible.filter(function (a) { return savedKeys.indexOf(a.key) >= 0; }).length;
            var oHeader = new sap.m.GroupHeaderListItem({
                title: sectionLabel + " (" + selectedInGroup + "/" + visible.length + ")",
                upperCase: false
            });
            oHeader.data("sectionLabel", sectionLabel);
            oList.addItem(oHeader);

            // Column items
            visible.forEach(function (attr) {
                var oItem = new sap.m.StandardListItem({
                    title: attr.label,
                    description: attr.shortLabel || attr.sectionLabel || "",
                    selected: savedKeys.indexOf(attr.key) >= 0
                });
                oItem.data("attrKey", attr.key);
                oItem.data("sectionLabel", sectionLabel);
                oList.addItem(oItem);
            });
        });
    }

    /**
     * Return selected column keys from the list.
     */
    function getSelectedKeys(oList) {
        return oList.getSelectedItems().map(function (item) {
            return item.data("attrKey");
        }).filter(Boolean);
    }

    /**
     * Update group headers with current selection counts.
     * Call after each selection change.
     */
    function updateGroupHeaders(oList) {
        var items = oList.getItems();

        // Two-pass: first collect per-group counts, then update headers
        var groupCounts = {};
        var groupSelected2 = {};
        items.forEach(function (item) {
            if (item.isA("sap.m.GroupHeaderListItem")) return;
            var sl = item.data("sectionLabel");
            if (!sl) return;
            if (!groupCounts[sl]) { groupCounts[sl] = 0; groupSelected2[sl] = 0; }
            groupCounts[sl]++;
            if (item.getSelected()) groupSelected2[sl]++;
        });
        items.forEach(function (item) {
            if (!item.isA("sap.m.GroupHeaderListItem")) return;
            var sl = item.data("sectionLabel");
            if (!sl) return;
            var total = groupCounts[sl] || 0;
            var sel   = groupSelected2[sl] || 0;
            item.setTitle(sl + " (" + sel + "/" + total + ")");
        });
    }

    /**
     * Update a stats Text control: "N of M columns visible"
     */
    function updateStats(statsCtrl, oList) {
        if (!statsCtrl) return;
        var items = oList.getItems().filter(function (i) {
            return !i.isA("sap.m.GroupHeaderListItem");
        });
        var sel = items.filter(function (i) { return i.getSelected(); }).length;
        statsCtrl.setText(sel + " of " + items.length + " columns visible");
    }

    /**
     * Select or deselect all visible (non-header) items.
     */
    function setAllSelected(oList, bSelected) {
        oList.getItems().forEach(function (item) {
            if (!item.isA("sap.m.GroupHeaderListItem")) {
                item.setSelected(bSelected);
            }
        });
    }

    // ── Variant management (localStorage) ─────────────────

    var STANDARD_VARIANT = "__standard__";

    function loadVariants(storageKey) {
        try {
            var raw = JSON.parse(localStorage.getItem(storageKey + "_variants") || "[]");
            return Array.isArray(raw) ? raw : [];
        } catch (e) { return []; }
    }

    function saveVariant(storageKey, name, keys) {
        var variants = loadVariants(storageKey);
        // Upsert
        var existing = variants.findIndex(function (v) { return v.name === name; });
        if (existing >= 0) {
            variants[existing].keys = keys;
            variants[existing].savedAt = new Date().toISOString();
        } else {
            variants.push({ name: name, keys: keys, savedAt: new Date().toISOString() });
        }
        localStorage.setItem(storageKey + "_variants", JSON.stringify(variants));
    }

    function deleteVariant(storageKey, name) {
        var variants = loadVariants(storageKey).filter(function (v) { return v.name !== name; });
        localStorage.setItem(storageKey + "_variants", JSON.stringify(variants));
    }

    /**
     * Populate a sap.m.Select with variant options.
     * Always includes a "Standard" entry at top.
     */
    function populateVariantSelect(oSelect, variants, currentKeys, defaultKeys) {
        if (!oSelect) return;
        oSelect.destroyItems();
        // Standard entry
        oSelect.addItem(new sap.ui.core.Item({ key: STANDARD_VARIANT, text: "Standard (Defaults)" }));
        variants.forEach(function (v) {
            oSelect.addItem(new sap.ui.core.Item({ key: v.name, text: v.name }));
        });
        // Detect if current matches a variant
        var matched = STANDARD_VARIANT;
        if (currentKeys && defaultKeys) {
            var sameAsDefault = currentKeys.length === defaultKeys.length &&
                currentKeys.every(function (k) { return defaultKeys.indexOf(k) >= 0; });
            if (!sameAsDefault) {
                variants.forEach(function (v) {
                    if (v.keys.length === currentKeys.length &&
                        v.keys.every(function (k) { return currentKeys.indexOf(k) >= 0; })) {
                        matched = v.name;
                    }
                });
            }
        }
        oSelect.setSelectedKey(matched);
    }

    /**
     * Get unique sections from attribute list, preserving order.
     * Returns [{key: sectionLabel, text: sectionLabel}, ...]
     */
    function getSections(attrs) {
        var seen = {};
        var result = [];
        attrs.forEach(function (a) {
            var sl = a.sectionLabel || "Other";
            if (!seen[sl]) {
                seen[sl] = true;
                result.push({ key: sl, text: sl });
            }
        });
        return result;
    }

    return {
        buildGroupedList     : buildGroupedList,
        getSelectedKeys      : getSelectedKeys,
        updateGroupHeaders   : updateGroupHeaders,
        updateStats          : updateStats,
        setAllSelected       : setAllSelected,
        loadVariants         : loadVariants,
        saveVariant          : saveVariant,
        deleteVariant        : deleteVariant,
        populateVariantSelect: populateVariantSelect,
        getSections          : getSections,
        STANDARD_VARIANT     : STANDARD_VARIANT
    };
});
