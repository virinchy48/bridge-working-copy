// ============================================================
// NHVR NamedViews — Unit Test Suite (v4.7.13)
//
// Tests the cross-module saved-view store at
// app/bridge-management/webapp/util/NamedViews.js:
//   - save / list / listAll / remove / getById / count
//   - setPending / consumePending (sessionStorage handoff
//     used by the Home "My Saved Views" picker)
//
// Runs in Node by shimming sap.ui.define + storage globals.
// ============================================================
"use strict";

const path = require("path");
const fs   = require("fs");

const NV_SRC = path.join(
    __dirname, "../../app/bridge-management/webapp/util/NamedViews.js"
);

// ── Load the UI5 module in a Node context ───────────────────
function loadNamedViews() {
    const src = fs.readFileSync(NV_SRC, "utf8");
    let captured;
    const fakeStorage = () => {
        const m = new Map();
        return {
            getItem   : (k) => (m.has(k) ? m.get(k) : null),
            setItem   : (k, v) => { m.set(k, String(v)); },
            removeItem: (k) => { m.delete(k); },
            clear     : () => { m.clear(); }
        };
    };
    const sandbox = {
        sap: { ui: { define: function (_deps, factory) { captured = factory(); } } },
        localStorage  : fakeStorage(),
        sessionStorage: fakeStorage(),
        Date: Date,
        Math: Math
    };
    const fn = new Function(
        "sap", "localStorage", "sessionStorage",
        src + "\nreturn __nv__;"
    );
    // Rewrite the source so the return binds to our captured value
    const wrapped = src.replace(
        "sap.ui.define([], function () {",
        "var __nv__ = (function () {"
    ).replace(
        /\}\);\s*$/,
        "})();"
    );
    const fn2 = new Function(
        "sap", "localStorage", "sessionStorage",
        wrapped + "\nreturn __nv__;"
    );
    return fn2(sandbox.sap, sandbox.localStorage, sandbox.sessionStorage);
}

describe("NamedViews util", () => {
    let NV;

    beforeEach(() => {
        NV = loadNamedViews();
        NV._clearAll();
    });

    describe("module constants", () => {
        test("exposes four module keys", () => {
            expect(NV.MODULES.BRIDGES).toBe("BRIDGES");
            expect(NV.MODULES.RESTRICTIONS).toBe("RESTRICTIONS");
            expect(NV.MODULES.DEFECTS).toBe("DEFECTS");
            expect(NV.MODULES.PERMITS).toBe("PERMITS");
        });
    });

    describe("save / list", () => {
        test("saves a new view and lists it for that module only", () => {
            const saved = NV.save("BRIDGES", "Open defects", { criteria: [{ f: "status", v: "OPEN" }] });
            expect(saved).not.toBeNull();
            expect(saved.id).toMatch(/^nv_/);
            expect(NV.list("BRIDGES")).toHaveLength(1);
            expect(NV.list("RESTRICTIONS")).toHaveLength(0);
        });

        test("updates an existing view by name instead of duplicating", () => {
            NV.save("PERMITS", "Pending ops", { criteria: { status: "PENDING" } });
            const second = NV.save("PERMITS", "Pending ops", { criteria: { status: "APPROVED" } });
            const list = NV.list("PERMITS");
            expect(list).toHaveLength(1);
            expect(list[0].filters.criteria.status).toBe("APPROVED");
            expect(list[0].id).toBe(second.id);
        });

        test("returns null when module or name is missing", () => {
            expect(NV.save("", "x", {})).toBeNull();
            expect(NV.save("BRIDGES", "", {})).toBeNull();
        });
    });

    describe("listAll / count", () => {
        test("lists across all modules sorted by updatedAt desc", () => {
            NV.save("BRIDGES", "b1", {});
            NV.save("RESTRICTIONS", "r1", {});
            NV.save("DEFECTS", "d1", {});
            const all = NV.listAll();
            expect(all).toHaveLength(3);
            expect(NV.count()).toBe(3);
            // updatedAt desc means the last-saved shows first (or tied)
            expect(all[0].updatedAt).toBeGreaterThanOrEqual(all[all.length - 1].updatedAt);
        });
    });

    describe("remove / getById", () => {
        test("removes a view by id and stops returning it", () => {
            const v = NV.save("DEFECTS", "Critical", { criteria: { severity: "CRITICAL" } });
            expect(NV.getById(v.id)).not.toBeNull();
            expect(NV.remove("DEFECTS", v.id)).toBe(true);
            expect(NV.getById(v.id)).toBeNull();
            expect(NV.list("DEFECTS")).toHaveLength(0);
        });

        test("remove returns false when id is unknown", () => {
            expect(NV.remove("DEFECTS", "nv_does_not_exist")).toBe(false);
        });
    });

    describe("setPending / consumePending (Home picker handoff)", () => {
        test("round-trips a pending view for the matching module", () => {
            const view = NV.save("RESTRICTIONS", "Temp load limits", {
                criteria: { status: "ACTIVE", temporary: "YES" }
            });
            NV.setPending(view);
            const out = NV.consumePending("RESTRICTIONS");
            expect(out).not.toBeNull();
            expect(out.name).toBe("Temp load limits");
            expect(out.filters.criteria.temporary).toBe("YES");
        });

        test("drains the pending slot even when the module does not match", () => {
            const view = NV.save("PERMITS", "Denied", { criteria: { status: "DENIED" } });
            NV.setPending(view);
            // Wrong module — returns null but also clears, so the next matching read is empty
            expect(NV.consumePending("DEFECTS")).toBeNull();
            expect(NV.consumePending("PERMITS")).toBeNull();
        });

        test("returns null when nothing pending", () => {
            expect(NV.consumePending("BRIDGES")).toBeNull();
        });

        test("ignores invalid view payloads", () => {
            NV.setPending(null);
            NV.setPending({});        // missing module
            NV.setPending({ module: "" });
            expect(NV.consumePending("BRIDGES")).toBeNull();
        });
    });
});
