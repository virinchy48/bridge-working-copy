// Flat config for ESLint v9+ (installed: v10.x).
// Intentionally minimal — acts as a safety-net lint, not a style enforcer.
// The `lint` npm script is wired through `npm run verify`.

const js = require("@eslint/js");

module.exports = [
    // 1. Global ignores — keep lint fast and avoid generated/vendored code.
    {
        ignores: [
            "node_modules/**",
            "gen/**",
            "dist/**",
            "coverage/**",
            "mta_archives/**",
            "**/*.mtar",
            // k6 load-test scripts use ES module imports; they run in k6 VM, not Node.
            "test/perf/**",
            "test/performance/**",
            // Mirror copies — lint the source only.
            "app-router/resources/**",
            // Vendored / third-party inside webapp.
            "app/bridge-management/webapp/lib/**",
            // Jest per-project config shim, if present.
            "jest.projects.config.js"
        ]
    },

    // 2. Baseline recommended rules + disable new-in-eslint-v9 strict rules that
    // aren't worth chasing across a large legacy JS codebase.
    js.configs.recommended,
    {
        rules: {
            "no-useless-assignment": "off",
            "no-redeclare": "off",
            "preserve-caught-error": "off",
            "no-empty-pattern": "off",
            "no-dupe-keys": "warn"
        }
    },

    // 3. Project-wide JS relaxations — this repo leans on runtime duck-typing
    // and legacy UI5 patterns that trip stricter rules.
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                // Node
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                module: "readonly",
                require: "readonly",
                exports: "writable",
                global: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                setImmediate: "readonly",
                clearImmediate: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                fetch: "readonly",
                Promise: "readonly",
                // Node 20+ globals
                AbortSignal: "readonly",
                AbortController: "readonly",
                performance: "readonly",
                crypto: "readonly",
                structuredClone: "readonly"
            }
        },
        rules: {
            // Unused-vars: flag truly dead local vars, but leave function args
            // alone — UI5 event handlers conventionally declare (oEvent, ...)
            // even when a particular handler only needs some of them, and
            // forcing _-prefixes on boilerplate just creates noise. `_`-prefixed
            // locals still opt out, and unused catch bindings are ignored.
            "no-unused-vars": ["warn", {
                args: "none",
                varsIgnorePattern: "^_",
                caughtErrors: "none"
            }],
            "no-empty": ["warn", { allowEmptyCatch: true }],
            "no-useless-escape": "off",
            "no-prototype-builtins": "off",
            "no-case-declarations": "off",
            "no-inner-declarations": "off",
            "no-constant-condition": ["warn", { checkLoops: false }],
            "no-control-regex": "off"
        }
    },

    // 4. UI5 controllers/views + nested webapps — AMD modules with browser globals.
    {
        files: ["app/**/*.js", "scripts/**/webapp/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: {
                sap: "readonly",
                jQuery: "readonly",
                $: "readonly",
                // DOM
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                location: "readonly",
                history: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",
                indexedDB: "readonly",
                // Network / workers
                XMLHttpRequest: "readonly",
                AbortSignal: "readonly",
                AbortController: "readonly",
                // Files / encoding
                FormData: "readonly",
                FileReader: "readonly",
                Blob: "readonly",
                File: "readonly",
                btoa: "readonly",
                atob: "readonly",
                crypto: "readonly",
                // Timing / animation
                performance: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                requestIdleCallback: "readonly",
                cancelIdleCallback: "readonly",
                // Dialogs / speech
                alert: "readonly",
                confirm: "readonly",
                prompt: "readonly",
                SpeechSynthesisUtterance: "readonly",
                speechSynthesis: "readonly",
                // Map libraries (pluggable providers in webapp/util/providers/)
                L: "readonly",
                google: "readonly",
                maplibregl: "readonly",
                turf: "readonly",
                // Test shims occasionally reused in demo controllers
                QUnit: "readonly"
            }
        }
    },

    // 5. CAP service/handler code — CDS runtime exposes SELECT/INSERT/UPDATE/DELETE/cds as globals.
    {
        files: ["srv/**/*.js", "db/**/*.js"],
        languageOptions: {
            globals: {
                cds: "readonly",
                SELECT: "readonly",
                INSERT: "readonly",
                UPDATE: "readonly",
                DELETE: "readonly",
                UPSERT: "readonly",
                CREATE: "readonly",
                DROP: "readonly"
            }
        }
    },

    // 6. Test files — Jest globals + CAP globals (integration tests use CQL).
    {
        files: ["test/**/*.js", "**/*.test.js", "**/*.spec.js"],
        languageOptions: {
            globals: {
                describe: "readonly",
                it: "readonly",
                test: "readonly",
                expect: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                jest: "readonly",
                fail: "readonly",
                // CAP globals for integration tests
                cds: "readonly",
                SELECT: "readonly",
                INSERT: "readonly",
                UPDATE: "readonly",
                DELETE: "readonly",
                UPSERT: "readonly"
            }
        }
    }
];
