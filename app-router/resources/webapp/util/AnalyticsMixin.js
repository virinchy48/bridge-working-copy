/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Controller Mixin
   Portable: works in any SAP UI5 / CAP application
   ─────────────────────────────────────────────────────────────
   Usage:
     sap.ui.define([
       "nhvr/bridgemanagement/util/AnalyticsMixin",
       "nhvr/bridgemanagement/util/HelpAssistantMixin"
     ], function(AnalyticsMixin, HelpAssistantMixin) {
       return Controller.extend("...", Object.assign({
         onInit: function() {
           this._initAnalytics("RouteName");
         }
       }, HelpAssistantMixin, AnalyticsMixin));
     });
   ──────────────────────────────────────────────────────────────── */
sap.ui.define([
    "nhvr/bridgemanagement/util/AnalyticsService",
    "nhvr/bridgemanagement/util/LoggerService"
], function (AnalyticsService, Logger) {
    "use strict";

    var AnalyticsMixin = {

        /**
         * Initialize analytics for this controller.
         * Call in onInit(). Auto-tracks page_view on every route match.
         * @param {string} routeName - Route/screen name (e.g. "BridgeDetail")
         */
        _initAnalytics: function (routeName) {
            this._analyticsRouteName = routeName;
            this._analyticsPageStart = null;

            // Auto-track page view on first load
            if (routeName) {
                AnalyticsService.trackPageView(routeName);
                this._analyticsPageStart = performance.now();
            }

            // Attach to route for subsequent navigations
            try {
                var oRouter = this.getOwnerComponent().getRouter();
                var oRoute = oRouter.getRoute(routeName);
                if (oRoute) {
                    oRoute.attachPatternMatched(this._onAnalyticsRouteMatched, this);
                }
            } catch (e) {
                // Non-routed controllers (fragments, dialogs) — silent
            }
        },

        /**
         * Route matched handler — auto page_view + time-on-page for previous page.
         */
        _onAnalyticsRouteMatched: function () {
            // Track time spent on previous page
            this._trackPageDuration();
            // New page timer
            this._analyticsPageStart = performance.now();
            AnalyticsService.trackPageView(this._analyticsRouteName);
        },

        /**
         * Track coarse time-on-page (duration since _initAnalytics or last route match).
         */
        _trackPageDuration: function () {
            if (this._analyticsPageStart && this._analyticsRouteName) {
                var durationMs = Math.round(performance.now() - this._analyticsPageStart);
                if (durationMs > 1000 && durationMs < 3600000) { // between 1s and 1hr
                    AnalyticsService.track("navigation", "page_view", {
                        targetRoute: this._analyticsRouteName,
                        durationMs: durationMs
                    });
                }
                this._analyticsPageStart = null;
            }
        },

        /**
         * Convenience: track a business action from this controller.
         * @param {string} eventType - e.g. "bridge_close"
         * @param {object} [data] - optional data
         */
        _trackAction: function (eventType, data) {
            data = data || {};
            data.targetRoute = data.targetRoute || this._analyticsRouteName;
            AnalyticsService.trackAction(eventType, data);
        },

        /**
         * Convenience: track an error from this controller.
         * @param {string} errorType - "validation_error", "api_error", "app_error"
         * @param {string} code - short code
         * @param {string} message - will be truncated to 200 chars
         */
        _trackError: function (errorType, code, message) {
            AnalyticsService.trackError(errorType, code, message);
        },

        /**
         * Instrumented fetch — wraps window.fetch to auto-track slow APIs and errors.
         * Use instead of raw fetch() for OData calls you want performance-tracked.
         * @param {string} url
         * @param {object} [opts]
         * @returns {Promise<Response>}
         */
        _trackedFetch: function (url, opts) {
            var routeName = this._analyticsRouteName;
            var start = performance.now();

            return fetch(url, opts).then(function (response) {
                var elapsed = performance.now() - start;
                // Track slow APIs (> 3s)
                if (elapsed > 3000) {
                    AnalyticsService.trackPerformance(routeName, elapsed);
                }
                // Track API errors
                if (!response.ok) {
                    AnalyticsService.trackError("api_error",
                        String(response.status),
                        url.split("?")[0].substring(0, 100) + " " + response.statusText
                    );
                }
                return response;
            }).catch(function (err) {
                AnalyticsService.trackError("api_error", "NETWORK", err.message);
                throw err; // re-throw — analytics never blocks business
            });
        }
    };

    return AnalyticsMixin;
});
