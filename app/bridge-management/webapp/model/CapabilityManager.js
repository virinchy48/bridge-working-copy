sap.ui.define([], function () {
    "use strict";

    var _loaded = false;
    var _profile = {};
    var _loadPromise = null;

    function _allowAllProfile() {
        return _profile;
    }

    return {
        load: function () {
            if (_loadPromise) return _loadPromise;
            _loaded = true;
            _loadPromise = Promise.resolve(_allowAllProfile());
            return _loadPromise;
        },

        isLoaded: function () { return _loaded; },
        isFailOpen: function () { return true; },
        isStale: function () { return false; },
        isEnabled: function () { return true; },
        canView: function () { return true; },
        canEdit: function () { return true; },
        canAdmin: function () { return true; },
        getByCategory: function () { return {}; },
        getAll: function () { return []; },

        applyToControls: function (view, mappings) {
            if (!view || !mappings) return;
            mappings.forEach(function (m) {
                var ctrl = view.byId(m.id);
                if (!ctrl || !ctrl.setVisible) return;
                ctrl.setVisible(true);
            });
        },

        filterNavItems: function (items) {
            return items || [];
        },

        guardRoute: function () {
            return true;
        },

        reset: function () {
            _profile = {};
            _loaded = false;
            _loadPromise = null;
        }
    };
});
