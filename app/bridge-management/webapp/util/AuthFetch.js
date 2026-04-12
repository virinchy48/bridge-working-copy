sap.ui.define([], function () {
    "use strict";

    var _csrfToken = null;
    var _tokenPromise = null;
    var BASE = "/bridge-management/";

    function _isLocalhost() {
        var h = window.location.hostname;
        return h === "localhost" || h === "127.0.0.1";
    }

    function _baseHeaders() {
        var headers = { "Content-Type": "application/json", "Accept": "application/json" };
        if (_isLocalhost()) {
            headers["Authorization"] = "Basic " + btoa("admin:admin");
        }
        return headers;
    }

    function _fetchCsrfToken() {
        if (_tokenPromise) return _tokenPromise;
        _tokenPromise = fetch(BASE, {
            method: "HEAD",
            headers: Object.assign({}, _baseHeaders(), { "x-csrf-token": "fetch" }),
            credentials: _isLocalhost() ? "same-origin" : "include"
        }).then(function (res) {
            _csrfToken = res.headers.get("x-csrf-token") || "";
            _tokenPromise = null;
            return _csrfToken;
        }).catch(function () {
            _tokenPromise = null;
            return "";
        });
        return _tokenPromise;
    }

    function _isMutating(method) {
        return ["POST", "PUT", "PATCH", "DELETE"].indexOf((method || "").toUpperCase()) >= 0;
    }

    /**
     * Drop-in fetch() replacement with CSRF token management.
     * Automatically fetches CSRF token for mutating requests.
     * Retries once on 403 with refreshed token.
     */
    var AuthFetch = {
        fetch: function (url, options) {
            options = options || {};
            var method = (options.method || "GET").toUpperCase();
            var headers = Object.assign({}, _baseHeaders(), options.headers || {});
            var creds = _isLocalhost() ? "same-origin" : "include";

            if (!_isMutating(method)) {
                return fetch(url, Object.assign({}, options, { headers: headers, credentials: creds }));
            }

            // For mutating requests, ensure CSRF token
            var doFetch = function (token) {
                if (token) headers["x-csrf-token"] = token;
                return fetch(url, Object.assign({}, options, { headers: headers, credentials: creds }));
            };

            if (_csrfToken) {
                return doFetch(_csrfToken).then(function (res) {
                    if (res.status === 403) {
                        // Token may have expired, refresh and retry once
                        _csrfToken = null;
                        return _fetchCsrfToken().then(doFetch);
                    }
                    return res;
                });
            }

            return _fetchCsrfToken().then(doFetch);
        },

        /** Convenience: POST JSON */
        post: function (url, body) {
            return this.fetch(url, { method: "POST", body: JSON.stringify(body) });
        },

        /**
         * GET and parse JSON with proper error surfacing.
         * Throws on non-OK responses (instead of letting r.json() silently
         * blow up on an HTML error page). The thrown Error carries a
         * `.status` field so callers can differentiate 401/403/etc.
         */
        getJson: function (url, extraHeaders) {
            var headers = Object.assign({}, _baseHeaders(), extraHeaders || {});
            var creds = _isLocalhost() ? "same-origin" : "include";
            return fetch(url, { headers: headers, credentials: creds }).then(function (r) {
                if (!r.ok) {
                    var err = new Error("HTTP " + r.status + " " + r.statusText);
                    err.status = r.status;
                    throw err;
                }
                return r.json().catch(function () {
                    throw new Error("Response was not valid JSON (server likely returned an HTML error page)");
                });
            });
        },

        /** Convenience: PATCH JSON */
        patch: function (url, body) {
            return this.fetch(url, { method: "PATCH", body: JSON.stringify(body) });
        },

        /** Convenience: DELETE */
        del: function (url) {
            return this.fetch(url, { method: "DELETE" });
        },

        /** Reset cached token (useful for testing) */
        resetToken: function () {
            _csrfToken = null;
            _tokenPromise = null;
        }
    };

    return AuthFetch;
});
