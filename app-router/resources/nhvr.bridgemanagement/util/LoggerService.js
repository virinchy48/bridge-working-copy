// ============================================================
// NHVR Logger Service — Environment-aware logging utility
// Replaces all console.log/warn/error calls in the application
//
// Usage:
//   sap.ui.define(["nhvr/bridgemanagement/util/LoggerService"], function (Logger) {
//       Logger.info("Bridges", "Loaded {0} bridges", [count]);
//       Logger.error("BridgeDetail", "Load failed", err);
//   });
// ============================================================
sap.ui.define([], function () {
    "use strict";

    // Detect environment from URL
    var _isLocalDev = (window.location.hostname === "localhost" ||
                       window.location.hostname === "127.0.0.1" ||
                       window.location.port === "4004");

    var LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };

    // In local dev show DEBUG+; in production show WARN+ only
    var _currentLevel = _isLocalDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

    function _format(component, message, args) {
        var msg = "[NHVR:" + component + "] " + message;
        if (args && args.length) {
            args.forEach(function (a, i) {
                msg = msg.replace("{" + i + "}", String(a));
            });
        }
        return msg;
    }

    function _stamp() {
        return new Date().toISOString().substring(11, 23);
    }

    return {
        setLevel: function (level) {
            if (LOG_LEVELS[level] !== undefined) { _currentLevel = LOG_LEVELS[level]; }
        },

        debug: function (component, message, args) {
            if (_currentLevel <= LOG_LEVELS.DEBUG) {
                console.debug(_stamp(), _format(component, message, args));
            }
        },

        info: function (component, message, args) {
            if (_currentLevel <= LOG_LEVELS.INFO) {
                console.info(_stamp(), _format(component, message, args));
            }
        },

        warn: function (component, message, args) {
            if (_currentLevel <= LOG_LEVELS.WARN) {
                console.warn(_stamp(), _format(component, message, args));
            }
        },

        error: function (component, message, err) {
            if (_currentLevel <= LOG_LEVELS.ERROR) {
                var msg = _format(component, message, null);
                if (err && err.message) { msg += " | " + err.message; }
                console.error(_stamp(), msg, err || "");
            }
        }
    };
});
