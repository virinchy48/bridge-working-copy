sap.ui.define([], function () {
    "use strict";

    var _queue     = [];
    var _deadLetterQueue = [];
    var _listeners = [];
    var STORAGE_KEY  = "nhvr_offline_queue";
    var DLQ_STORAGE_KEY = "nhvr_offline_dlq";
    var CACHE_PREFIX = "nhvr_cache_";
    var CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
    var MAX_RETRIES  = 5;
    var MAX_BACKOFF_MS = 60000;

    return {
        /**
         * Initialise the offline sync manager.
         * Call once from the Home or App Component onInit.
         */
        init: function () {
            var self = this;
            this._needsReauth = false;
            this._restoreQueue();
            this._restoreDLQ();
            window.addEventListener("online",  function () {
                self.flushQueue();
                self._notify(true);
            });
            window.addEventListener("offline", function () {
                self._notify(false);
            });
        },

        /** @returns {boolean} true if browser reports online */
        isOnline: function () {
            return navigator.onLine;
        },

        /**
         * Queue a mutation for later replay when connectivity is restored.
         * @param {string} method  HTTP method (POST, PATCH, DELETE)
         * @param {string} url     Full URL including service path
         * @param {object} body    Request body object (will be JSON-stringified)
         */
        queueMutation: function (method, url, body) {
            var hash = this._hashMutation(method, url, body);
            // Deduplication — skip if identical mutation already queued
            var isDuplicate = _queue.some(function (item) {
                return item._hash === hash;
            });
            if (isDuplicate) {
                console.info("[NHVR:OfflineSync] Duplicate mutation skipped:", method, url);
                return;
            }
            _queue.push({
                method     : method,
                url        : url,
                body       : body,
                queuedAt   : new Date().toISOString(),
                retryCount : 0,
                _hash      : hash
            });
            this._persistQueue();
        },

        /**
         * Attempt to replay all queued mutations.
         * Auth check first; retries with exponential backoff; dead-letters after MAX_RETRIES.
         */
        flushQueue: function () {
            var self = this;
            if (_queue.length === 0) return;

            // Auth check — HEAD request to verify session before flushing
            fetch(_queue[0].url, { method: "HEAD" })
                .then(function (resp) {
                    if (resp.status === 401) {
                        self._needsReauth = true;
                        console.warn("[NHVR:OfflineSync] Session expired (401) — flush skipped.");
                        return;
                    }
                    self._needsReauth = false;
                    self._processQueue();
                })
                .catch(function () {
                    // Network error — skip flush, will retry on next online event
                    console.warn("[NHVR:OfflineSync] Auth check failed — flush skipped.");
                });
        },

        /** @private — process queue items sequentially with backoff */
        _processQueue: function () {
            var self = this;
            var pending = _queue.splice(0);
            self._persistQueue();

            pending.forEach(function (item) {
                var retryCount = item.retryCount || 0;
                var delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);

                fetch(item.url, {
                    method : item.method,
                    headers: { "Content-Type": "application/json" },
                    body   : JSON.stringify(item.body)
                }).catch(function () {
                    retryCount++;
                    if (retryCount >= MAX_RETRIES) {
                        // Move to dead letter queue
                        item.retryCount = retryCount;
                        item.deadLetteredAt = new Date().toISOString();
                        _deadLetterQueue.push(item);
                        self._persistDLQ();
                        console.warn("[NHVR:OfflineSync] Moved to dead letter queue after " + MAX_RETRIES + " retries:", item.method, item.url);
                    } else {
                        // Re-queue with incremented retry count after backoff delay
                        item.retryCount = retryCount;
                        setTimeout(function () {
                            _queue.push(item);
                            self._persistQueue();
                        }, delay);
                    }
                });
            });
        },

        /** @returns {number} number of items currently queued */
        getQueueLength: function () {
            return _queue.length;
        },

        /**
         * Register a listener for online/offline transitions.
         * @param {function} fn  Called with (isOnline: boolean)
         */
        onStatusChange: function (fn) {
            if (typeof fn === "function") {
                _listeners.push(fn);
            }
        },

        // ── Dead Letter Queue API ───────────────────────────────────
        /**
         * @returns {Array} Items that exhausted all retries.
         */
        getDeadLetterQueue: function () {
            return _deadLetterQueue.slice();
        },

        /**
         * Clear the dead letter queue.
         */
        clearDeadLetterQueue: function () {
            _deadLetterQueue = [];
            this._persistDLQ();
        },

        /**
         * @returns {boolean} true if session needs re-authentication.
         */
        needsReauth: function () {
            return !!this._needsReauth;
        },

        // ── Read Cache API ──────────────────────────────────────────
        /**
         * Fetch a URL, serve from localStorage cache when offline or within TTL.
         * @param {string}   url      OData URL to fetch
         * @param {object}   headers  Request headers
         * @param {number}   [ttl]    Cache TTL in ms (default 15 min)
         * @returns {Promise<object>} Parsed JSON response
         */
        cachedFetch: function (url, headers, ttl) {
            var self    = this;
            var maxAge  = ttl || CACHE_TTL_MS;
            var cacheKey = CACHE_PREFIX + btoa(url).slice(0, 80);

            // If offline — serve from cache immediately
            if (!navigator.onLine) {
                var cached = self._readCache(cacheKey);
                if (cached) {
                    cached._fromCache = true;
                    return Promise.resolve(cached);
                }
                return Promise.reject(new Error("Offline and no cache available for: " + url));
            }

            // Online — try network first, fall back to cache on error
            return fetch(url, { headers: headers || { Accept: "application/json" } })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    self._writeCache(cacheKey, data);
                    return data;
                })
                .catch(function (err) {
                    var cached = self._readCache(cacheKey, maxAge);
                    if (cached) {
                        console.warn("[NHVR:OfflineSync] Network failed, serving from cache:", url);
                        cached._fromCache = true;
                        return cached;
                    }
                    throw err;
                });
        },

        /**
         * Manually warm the cache for a URL (fire-and-forget).
         * @param {string} url
         * @param {object} [headers]
         */
        warmCache: function (url, headers) {
            if (!navigator.onLine) return;
            fetch(url, { headers: headers || { Accept: "application/json" } })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var cacheKey = CACHE_PREFIX + btoa(url).slice(0, 80);
                    localStorage.setItem(cacheKey, JSON.stringify({ data: data, ts: Date.now() }));
                })
                .catch(function () { /* silent — warm cache is best-effort */ });
        },

        /**
         * Clear all read-cache entries (mutations queue is preserved).
         */
        clearReadCache: function () {
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
            }
            keys.forEach(function (k) { localStorage.removeItem(k); });
        },

        // ── Private ─────────────────────────────────────────────────
        /** @private */
        _writeCache: function (key, data) {
            try {
                localStorage.setItem(key, JSON.stringify({ data: data, ts: Date.now() }));
            } catch (e) {
                // Storage quota exceeded — clear old cache entries and retry once
                try {
                    this.clearReadCache();
                    localStorage.setItem(key, JSON.stringify({ data: data, ts: Date.now() }));
                } catch (e2) {
                    console.warn("[NHVR:OfflineSync] Cache write failed:", e2.message);
                }
            }
        },

        /** @private — returns null if missing or older than maxAge */
        _readCache: function (key, maxAge) {
            try {
                var raw = localStorage.getItem(key);
                if (!raw) return null;
                var entry = JSON.parse(raw);
                if (maxAge && (Date.now() - entry.ts) > maxAge) return null;
                return entry.data;
            } catch (e) {
                return null;
            }
        },

        /** @private */
        _notify: function (online) {
            _listeners.forEach(function (fn) {
                try { fn(online); } catch (e) { /* swallow */ }
            });
        },

        /** @private */
        _persistQueue: function () {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(_queue));
            } catch (e) {
                console.warn("[NHVR:OfflineSync] Could not persist queue:", e.message);
            }
        },

        /** @private — restore queued items from localStorage on page load */
        _restoreQueue: function () {
            try {
                var stored = localStorage.getItem(STORAGE_KEY);
                _queue = stored ? JSON.parse(stored) : [];
            } catch (e) {
                _queue = [];
            }
        },

        /** @private — simple string hash for deduplication */
        _hashMutation: function (method, url, body) {
            var raw = method + "|" + url + "|" + JSON.stringify(body || {});
            var hash = 0;
            for (var i = 0; i < raw.length; i++) {
                hash = ((hash << 5) - hash) + raw.charCodeAt(i);
                hash |= 0; // Convert to 32-bit integer
            }
            return "h" + hash;
        },

        /** @private */
        _persistDLQ: function () {
            try {
                localStorage.setItem(DLQ_STORAGE_KEY, JSON.stringify(_deadLetterQueue));
            } catch (e) {
                console.warn("[NHVR:OfflineSync] Could not persist DLQ:", e.message);
            }
        },

        /** @private — restore dead letter queue from localStorage on page load */
        _restoreDLQ: function () {
            try {
                var stored = localStorage.getItem(DLQ_STORAGE_KEY);
                _deadLetterQueue = stored ? JSON.parse(stored) : [];
            } catch (e) {
                _deadLetterQueue = [];
            }
        }
    };
});
