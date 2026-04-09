/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Frontend Service (Singleton)
   Portable: works in any SAP UI5 / CAP application
   ─────────────────────────────────────────────────────────────
   Design principles:
     • All track() calls are fire-and-forget (push to queue, return)
     • requestIdleCallback for queue processing
     • sendBeacon on visibilitychange / pagehide for guaranteed delivery
     • 100-event queue cap, 50KB payload cap
     • Analytics failure NEVER blocks business flow
   ──────────────────────────────────────────────────────────────── */
sap.ui.define([
    "nhvr/bridgemanagement/util/LoggerService"
], function (Logger) {
    "use strict";

    var TAG = "AnalyticsService";

    // ── Module-private state ─────────────────────────────────────
    var _enabled        = false;
    var _sampleRate     = 1.0;
    var _queue          = [];
    var _maxQueueSize   = 100;
    var _maxPayloadBytes = 51200;  // 50 KB
    var _flushIntervalMs = 30000;  // 30 s
    var _flushTimer     = null;
    var _sessionId      = null;
    var _pseudoUserId   = null;    // hashed server-side; placeholder here
    var _userRole       = null;
    var _environment    = "production";
    var _excludedRoutes = [];
    var _excludedEvents = [];
    var _rateLimitCount = 0;
    var _rateLimitReset = 0;
    var _rateLimitMax   = 100;
    var _initialized    = false;
    var _lastPageView   = "";
    var _pageViewDebounce = null;
    var _heartbeatTimer = null;

    var BASE = "/bridge-management";

    // ── Helpers ──────────────────────────────────────────────────
    function _uuid() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function _getBrowserCategory() {
        var ua = navigator.userAgent || "";
        var browser = "Other";
        if (ua.indexOf("Chrome") > -1 && ua.indexOf("Edg") === -1) browser = "Chrome";
        else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
        else if (ua.indexOf("Safari") > -1 && ua.indexOf("Chrome") === -1) browser = "Safari";
        else if (ua.indexOf("Edg") > -1) browser = "Edge";

        var platform = "Desktop";
        if (/Mobi|Android/i.test(ua)) platform = "Mobile";
        else if (/Tablet|iPad/i.test(ua)) platform = "Tablet";

        return browser + "/" + platform;
    }

    function _getScreenBucket() {
        var w = window.screen ? window.screen.width : 0;
        if (w <= 480) return "Mobile";
        if (w <= 1280) return "HD";
        if (w <= 1920) return "FHD";
        if (w <= 2560) return "QHD";
        return "4K";
    }

    function _checkRateLimit() {
        var now = Date.now();
        if (now > _rateLimitReset) {
            _rateLimitCount = 0;
            _rateLimitReset = now + 60000;
        }
        _rateLimitCount++;
        return _rateLimitCount <= _rateLimitMax;
    }

    function _scheduleFlush() {
        if (_flushTimer) return;
        if (typeof requestIdleCallback === "function") {
            _flushTimer = requestIdleCallback(function () {
                _flushTimer = null;
                _doFlush();
            }, { timeout: _flushIntervalMs });
        } else {
            _flushTimer = setTimeout(function () {
                _flushTimer = null;
                _doFlush();
            }, Math.min(_flushIntervalMs, 5000));
        }
    }

    function _doFlush() {
        if (_queue.length === 0) return;
        var snapshot = _queue.splice(0, _queue.length);

        // Chunk by payload size
        var chunks = [];
        var current = [];
        var currentSize = 0;
        for (var i = 0; i < snapshot.length; i++) {
            var evtJson = JSON.stringify(snapshot[i]);
            var evtSize = evtJson.length * 2; // rough byte estimate
            if (currentSize + evtSize > _maxPayloadBytes && current.length > 0) {
                chunks.push(current);
                current = [];
                currentSize = 0;
            }
            current.push(snapshot[i]);
            currentSize += evtSize;
        }
        if (current.length > 0) chunks.push(current);

        for (var c = 0; c < chunks.length; c++) {
            _sendChunk(chunks[c]);
        }
    }

    function _sendChunk(events) {
        var payload = JSON.stringify({ events: events });
        var url = BASE + "/ingestEvents";

        try {
            // Prefer sendBeacon (works on page unload)
            if (navigator.sendBeacon) {
                var blob = new Blob([payload], { type: "application/json" });
                var sent = navigator.sendBeacon(url, blob);
                if (sent) return;
            }
            // Fallback to fetch with keepalive
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true
            }).catch(function () { /* silent */ });
        } catch (err) {
            Logger.warn(TAG, "Flush failed", err);
        }
    }

    function _onVisibilityChange() {
        if (document.visibilityState === "hidden") {
            _doFlush();
            AnalyticsService.track("session", "session_end", {});
            _doFlush(); // flush the session_end too
        }
    }

    function _onPageHide() {
        _doFlush();
    }

    // ── Public API ──────────────────────────────────────────────
    var AnalyticsService = {

        /**
         * Initialize the analytics service.
         * Call once from Component.js after user info is available.
         * @param {object} opts - { userId, role, environment, basePath }
         */
        init: function (opts) {
            if (_initialized) return;
            opts = opts || {};

            _sessionId = _uuid();
            _pseudoUserId = opts.userId || "anonymous";  // server hashes this
            _userRole = opts.role || "Unknown";
            _environment = opts.environment || "production";
            if (opts.basePath) BASE = opts.basePath;

            // Fetch config from backend
            try {
                fetch(BASE + "/AnalyticsConfigs?$filter=configKey eq 'GLOBAL'&$top=1", {
                    headers: { Accept: "application/json" }
                }).then(function (r) {
                    return r.ok ? r.json() : null;
                }).then(function (data) {
                    if (data && data.value && data.value.length > 0) {
                        var cfg = data.value[0];
                        _enabled = cfg.enabled !== false;
                        _sampleRate = typeof cfg.sampleRate === "number" ? cfg.sampleRate : 1.0;
                        _flushIntervalMs = cfg.flushIntervalMs || 30000;
                        _maxQueueSize = cfg.maxQueueSize || 100;
                        _maxPayloadBytes = cfg.maxPayloadBytes || 51200;
                        _rateLimitMax = cfg.rateLimitPerMin || 100;
                        try { _excludedRoutes = JSON.parse(cfg.excludedRoutes || "[]"); } catch (e) { _excludedRoutes = []; }
                        try { _excludedEvents = JSON.parse(cfg.excludedEvents || "[]"); } catch (e) { _excludedEvents = []; }
                    } else {
                        _enabled = true; // default on
                    }
                    Logger.debug(TAG, "Config loaded, enabled=" + _enabled + ", sampleRate=" + _sampleRate);
                }).catch(function () {
                    _enabled = true; // fail-open for analytics
                    Logger.debug(TAG, "Config fetch failed, defaulting to enabled");
                });
            } catch (e) {
                _enabled = true;
            }

            // Register lifecycle handlers
            document.addEventListener("visibilitychange", _onVisibilityChange);
            window.addEventListener("pagehide", _onPageHide);

            // Session start
            _initialized = true;
            this.track("session", "session_start", {});

            // Heartbeat (every 5 min)
            _heartbeatTimer = setInterval(function () {
                AnalyticsService.track("session", "session_heartbeat", {});
            }, 300000);

            Logger.debug(TAG, "Initialized, sessionId=" + _sessionId);
        },

        /**
         * Clean shutdown.
         */
        destroy: function () {
            if (_flushTimer) {
                if (typeof cancelIdleCallback === "function") {
                    cancelIdleCallback(_flushTimer);
                } else {
                    clearTimeout(_flushTimer);
                }
                _flushTimer = null;
            }
            if (_heartbeatTimer) {
                clearInterval(_heartbeatTimer);
                _heartbeatTimer = null;
            }
            _doFlush();
            document.removeEventListener("visibilitychange", _onVisibilityChange);
            window.removeEventListener("pagehide", _onPageHide);
            _initialized = false;
        },

        /**
         * Core tracking method. Fire-and-forget.
         * @param {string} category - from allowlist (e.g. "navigation", "bridge_ops")
         * @param {string} eventType - from allowlist (e.g. "page_view", "bridge_close")
         * @param {object} data - optional { targetRoute, targetEntityId, durationMs, ... }
         */
        track: function (category, eventType, data) {
            try {
                if (!_initialized || !_enabled) return;
                if (Math.random() >= _sampleRate) return;
                if (_excludedEvents.indexOf(eventType) > -1) return;
                if (data && data.targetRoute && _excludedRoutes.indexOf(data.targetRoute) > -1) return;
                if (!_checkRateLimit()) return;

                var evt = {
                    timestamp:       new Date().toISOString(),
                    sessionId:       _sessionId,
                    category:        category,
                    eventType:       eventType,
                    targetRoute:     (data && data.targetRoute) || null,
                    targetEntityId:  (data && data.targetEntityId) || null,
                    durationMs:      (data && data.durationMs) || null,
                    resultCount:     (data && data.resultCount) || null,
                    errorCode:       (data && data.errorCode) || null,
                    errorMessage:    (data && data.errorMessage) ? String(data.errorMessage).substring(0, 200) : null,
                    metadata:        (data && data.metadata) ? JSON.stringify(data.metadata).substring(0, 500) : null,
                    browserCategory: _getBrowserCategory(),
                    screenBucket:    _getScreenBucket(),
                    workflowId:      (data && data.workflowId) || null,
                    workflowStep:    (data && data.workflowStep) || null,
                    workflowTotal:   (data && data.workflowTotal) || null
                };

                // Queue cap — drop heartbeats first, then oldest
                if (_queue.length >= _maxQueueSize) {
                    var heartbeatIdx = -1;
                    for (var i = 0; i < _queue.length; i++) {
                        if (_queue[i].eventType === "session_heartbeat") { heartbeatIdx = i; break; }
                    }
                    if (heartbeatIdx > -1) {
                        _queue.splice(heartbeatIdx, 1);
                    } else {
                        _queue.shift(); // drop oldest
                    }
                }

                _queue.push(evt);
                _scheduleFlush();
            } catch (err) {
                // Analytics failure NEVER blocks business flow
                Logger.warn(TAG, "track() failed silently", err);
            }
        },

        // ── Convenience Methods ──────────────────────────────────

        /**
         * Track page view (debounced 300ms).
         */
        trackPageView: function (routeName) {
            if (_pageViewDebounce) clearTimeout(_pageViewDebounce);
            _pageViewDebounce = setTimeout(function () {
                if (routeName === _lastPageView) return; // skip duplicate
                _lastPageView = routeName;
                AnalyticsService.track("navigation", "page_view", { targetRoute: routeName });
            }, 300);
        },

        /**
         * Track a business action.
         */
        trackAction: function (eventType, data) {
            data = data || {};
            var cat = "feature_use";
            // Auto-categorize based on event prefix
            if (eventType.indexOf("bridge_") === 0) cat = "bridge_ops";
            else if (eventType.indexOf("restriction_") === 0) cat = "restriction_ops";
            else if (eventType.indexOf("inspection_") === 0 || eventType.indexOf("defect_") === 0) cat = "inspection_ops";
            else if (eventType.indexOf("mass_upload") === 0) cat = "upload";
            else if (eventType.indexOf("export_") === 0) cat = "export";
            else if (eventType.indexOf("search_") === 0 || eventType.indexOf("filter_") === 0) cat = "search";
            this.track(cat, eventType, data);
        },

        /**
         * Track an error.
         */
        trackError: function (errorType, code, message) {
            this.track("error", errorType || "app_error", {
                errorCode: code ? String(code).substring(0, 10) : null,
                errorMessage: message ? String(message).substring(0, 200) : null
            });
        },

        /**
         * Track slow performance.
         */
        trackPerformance: function (routeOrAction, durationMs) {
            var type = durationMs > 5000 ? "slow_api" : "slow_load";
            this.track("performance", type, {
                targetRoute: routeOrAction,
                durationMs: Math.round(durationMs)
            });
        },

        // ── Workflow Tracking ────────────────────────────────────

        /**
         * Start workflow tracking.
         * @returns {string} workflowId (UUID)
         */
        startWorkflow: function (type, totalSteps) {
            var wfId = _uuid();
            this.track("workflow", "workflow_start", {
                workflowId: wfId,
                workflowStep: 0,
                workflowTotal: totalSteps,
                metadata: { type: type }
            });
            return wfId;
        },

        trackWorkflowStep: function (workflowId, step) {
            this.track("workflow", "workflow_step", {
                workflowId: workflowId,
                workflowStep: step
            });
        },

        completeWorkflow: function (workflowId) {
            this.track("workflow", "workflow_complete", { workflowId: workflowId });
        },

        abandonWorkflow: function (workflowId, lastStep) {
            this.track("workflow", "workflow_abandon", {
                workflowId: workflowId,
                workflowStep: lastStep
            });
        },

        // ── Utility ──────────────────────────────────────────────
        isEnabled: function () { return _enabled && _initialized; },
        getSessionId: function () { return _sessionId; },
        getQueueLength: function () { return _queue.length; },
        flush: function () { _doFlush(); }
    };

    return AnalyticsService;
});
