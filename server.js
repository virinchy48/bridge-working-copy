'use strict';
const cds = require('@sap/cds');

// ── Lightweight in-memory rate limiter ──────────────────────────────────────
// No external dependency required; uses a sliding-window counter per IP.
// Limits: 200 req / 60 s per IP on all /bridge-management/* endpoints.
// Reset: automatic per window; map is pruned every 5 min to prevent leaks.
const RATE_WINDOW_MS  = 60 * 1000;   // 1 minute window
const RATE_MAX        = 200;          // max requests per window per IP
const rateLimitStore  = new Map();    // ip → { count, windowStart }

function rateLimitMiddleware(req, res, next) {
    // Only apply to OData service paths
    if (!req.path || !req.path.startsWith('/bridge-management')) return next();

    // Behind SAP App Router, real client IP is in X-Forwarded-For (trust proxy set below)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? forwarded.split(',')[0].trim() : null)
             || req.ip
             || (req.connection && req.connection.remoteAddress)
             || 'unknown';
    const now  = Date.now();
    const entry = rateLimitStore.get(ip);

    if (!entry || (now - entry.windowStart) > RATE_WINDOW_MS) {
        rateLimitStore.set(ip, { count: 1, windowStart: now });
        return next();
    }

    entry.count += 1;
    if (entry.count > RATE_MAX) {
        const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.set('X-RateLimit-Limit', String(RATE_MAX));
        res.set('X-RateLimit-Remaining', '0');
        res.status(429).json({
            error: { code: '429', message: 'Too Many Requests — retry after ' + retryAfter + 's' }
        });
        return;
    }

    res.set('X-RateLimit-Limit', String(RATE_MAX));
    res.set('X-RateLimit-Remaining', String(RATE_MAX - entry.count));
    next();
}

// Prune expired entries every 5 minutes to prevent memory leaks
setInterval(function pruneRateLimitStore() {
    const now = Date.now();
    for (const [ip, entry] of rateLimitStore) {
        if ((now - entry.windowStart) > RATE_WINDOW_MS * 2) {
            rateLimitStore.delete(ip);
        }
    }
}, 5 * 60 * 1000).unref();  // .unref() so timer does not block process exit

// ── Register rate limiter before CDS routes are set up ──────────────────────
// CDS v9 documented pattern: cds.on('bootstrap', app => ...) runs before
// any OData route is registered, guaranteeing the middleware fires first.
cds.on('bootstrap', (app) => {
    // Trust the first proxy hop (SAP App Router) so req.ip resolves correctly
    app.set('trust proxy', 1);

    // ── Security headers middleware ────────────────────────────────────────────
    app.use(function securityHeaders(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
        res.setHeader('Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://ui5.sap.com https://sapui5.hana.ondemand.com https://sdk.openui5.org https://unpkg.com https://cdnjs.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline' https://ui5.sap.com https://sapui5.hana.ondemand.com https://sdk.openui5.org https://unpkg.com; " +
            "font-src 'self' https://ui5.sap.com https://sapui5.hana.ondemand.com https://sdk.openui5.org data:; " +
            "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://ui5.sap.com https://sapui5.hana.ondemand.com; " +
            "connect-src 'self' https://api.openrouteservice.org https://*.hana.ondemand.com;"
        );
        next();
    });

    app.use(rateLimitMiddleware);

    // ── UI5 CDN reverse proxy ──────────────────────────────────────────────────
    // When sapui5.hana.ondemand.com is unreachable from the browser (503),
    // proxy requests through the CDS server where curl/https works fine.
    const https = require('https');
    app.get('/ui5cdn/*path', (req, res) => {
        const path = req.params.path;
        const cdnUrl = 'https://sapui5.hana.ondemand.com/1.133.0/resources/' + path;
        https.get(cdnUrl, (cdnRes) => {
            if (cdnRes.statusCode >= 400) {
                res.status(cdnRes.statusCode).end();
                return;
            }
            res.set('Content-Type', cdnRes.headers['content-type'] || 'application/javascript');
            res.set('Access-Control-Allow-Origin', '*');
            cdnRes.pipe(res);
        }).on('error', (err) => {
            res.status(502).json({ error: 'CDN proxy error: ' + err.message });
        });
    });
});

// ── Export default CDS server ────────────────────────────────────────────────
module.exports = cds.server;
