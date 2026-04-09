sap.ui.define([], function () {
    "use strict";

    return {
        isAvailable: function () {
            return !!(navigator && navigator.geolocation);
        },

        getCurrentPosition: function (options) {
            return new Promise(function (resolve, reject) {
                if (!navigator || !navigator.geolocation) {
                    reject(new Error("Geolocation not available"));
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        resolve({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            timestamp: new Date(pos.timestamp).toISOString()
                        });
                    },
                    function (err) {
                        reject(new Error("Geolocation error: " + err.message));
                    },
                    Object.assign({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }, options || {})
                );
            });
        },

        watchPosition: function (callback, options) {
            if (!navigator || !navigator.geolocation) return null;
            return navigator.geolocation.watchPosition(
                function (pos) {
                    callback({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        timestamp: new Date(pos.timestamp).toISOString()
                    });
                },
                function () {},
                Object.assign({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }, options || {})
            );
        },

        stopWatch: function (watchId) {
            if (navigator && navigator.geolocation && watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        }
    };
});
