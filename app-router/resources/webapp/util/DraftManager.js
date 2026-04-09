sap.ui.define([], function () {
    "use strict";

    var DB_NAME = "nhvr_drafts";
    var STORE_NAME = "drafts";
    var DB_VERSION = 1;

    function _openDB() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                // Fallback to localStorage
                resolve(null);
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "draftKey" });
                }
            };
            request.onsuccess = function (e) { resolve(e.target.result); };
            request.onerror = function () { resolve(null); }; // Fallback gracefully
        });
    }

    // localStorage fallback
    var LS_KEY = "nhvr_drafts_fallback";

    function _lsGet() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
    }

    function _lsSet(data) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* quota */ }
    }

    return {
        saveDraft: function (entityType, entityId, data) {
            var draftKey = entityType + ":" + (entityId || "new");
            var record = { draftKey: draftKey, entityType: entityType, entityId: entityId, data: data, savedAt: new Date().toISOString() };

            return _openDB().then(function (db) {
                if (db) {
                    return new Promise(function (resolve) {
                        var tx = db.transaction(STORE_NAME, "readwrite");
                        tx.objectStore(STORE_NAME).put(record);
                        tx.oncomplete = function () { resolve(true); };
                        tx.onerror = function () { resolve(false); };
                    });
                }
                // localStorage fallback
                var drafts = _lsGet();
                drafts[draftKey] = record;
                _lsSet(drafts);
                return true;
            });
        },

        loadDraft: function (entityType, entityId) {
            var draftKey = entityType + ":" + (entityId || "new");

            return _openDB().then(function (db) {
                if (db) {
                    return new Promise(function (resolve) {
                        var tx = db.transaction(STORE_NAME, "readonly");
                        var req = tx.objectStore(STORE_NAME).get(draftKey);
                        req.onsuccess = function () { resolve(req.result ? req.result.data : null); };
                        req.onerror = function () { resolve(null); };
                    });
                }
                var drafts = _lsGet();
                return drafts[draftKey] ? drafts[draftKey].data : null;
            });
        },

        deleteDraft: function (entityType, entityId) {
            var draftKey = entityType + ":" + (entityId || "new");

            return _openDB().then(function (db) {
                if (db) {
                    return new Promise(function (resolve) {
                        var tx = db.transaction(STORE_NAME, "readwrite");
                        tx.objectStore(STORE_NAME).delete(draftKey);
                        tx.oncomplete = function () { resolve(true); };
                        tx.onerror = function () { resolve(false); };
                    });
                }
                var drafts = _lsGet();
                delete drafts[draftKey];
                _lsSet(drafts);
                return true;
            });
        },

        listDrafts: function () {
            return _openDB().then(function (db) {
                if (db) {
                    return new Promise(function (resolve) {
                        var tx = db.transaction(STORE_NAME, "readonly");
                        var req = tx.objectStore(STORE_NAME).getAll();
                        req.onsuccess = function () {
                            resolve((req.result || []).map(function (r) {
                                return { entityType: r.entityType, entityId: r.entityId, savedAt: r.savedAt };
                            }));
                        };
                        req.onerror = function () { resolve([]); };
                    });
                }
                var drafts = _lsGet();
                return Object.values(drafts).map(function (r) {
                    return { entityType: r.entityType, entityId: r.entityId, savedAt: r.savedAt };
                });
            });
        },

        /** Auto-save: call every 30s during form editing */
        AUTO_SAVE_INTERVAL: 30000
    };
});
