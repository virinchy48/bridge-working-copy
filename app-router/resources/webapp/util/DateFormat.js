// ============================================================
// NHVR Date Format Utility — Consistent en-AU date formatting
//
// Usage:
//   DateFormat.toDisplay(value)          → "15/03/2026"
//   DateFormat.toDisplayWithTime(value)  → "15/03/2026 14:30"
//   DateFormat.toISO(value)              → "2026-03-15"
//   DateFormat.isOverdue(dateStr)        → true/false
//   DateFormat.daysUntil(dateStr)        → -5 (negative = overdue)
// ============================================================
sap.ui.define([], function () {
    "use strict";

    function _parse(val) {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        var d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }

    function _pad(n) { return String(n).padStart(2, "0"); }

    return {
        /**
         * Format a date value as DD/MM/YYYY (en-AU).
         * Returns "—" if value is empty or invalid.
         */
        toDisplay: function (val) {
            var d = _parse(val);
            if (!d) return "—";
            return _pad(d.getDate()) + "/" + _pad(d.getMonth() + 1) + "/" + d.getFullYear();
        },

        /**
         * Format a date-time value as DD/MM/YYYY HH:MM.
         */
        toDisplayWithTime: function (val) {
            var d = _parse(val);
            if (!d) return "—";
            return _pad(d.getDate()) + "/" + _pad(d.getMonth() + 1) + "/" + d.getFullYear() +
                   " " + _pad(d.getHours()) + ":" + _pad(d.getMinutes());
        },

        /**
         * Format a date as ISO 8601 (yyyy-MM-dd).
         */
        toISO: function (val) {
            var d = _parse(val);
            if (!d) return null;
            return d.getFullYear() + "-" + _pad(d.getMonth() + 1) + "-" + _pad(d.getDate());
        },

        /**
         * Returns true if the date is in the past.
         */
        isOverdue: function (val) {
            var d = _parse(val);
            if (!d) return false;
            return d < new Date();
        },

        /**
         * Returns number of days until the date (negative = overdue).
         */
        daysUntil: function (val) {
            var d = _parse(val);
            if (!d) return null;
            return Math.round((d.getTime() - Date.now()) / 86400000);
        },

        /**
         * Returns a human-readable relative label.
         * E.g. "2 days overdue", "Due in 5 days", "Due today"
         */
        relativeLabel: function (val) {
            var days = this.daysUntil(val);
            if (days === null) return "—";
            if (days < -1)  return Math.abs(days) + " days overdue";
            if (days === -1) return "1 day overdue";
            if (days === 0)  return "Due today";
            if (days === 1)  return "Due tomorrow";
            if (days <= 7)   return "Due in " + days + " days";
            if (days <= 30)  return "Due in " + Math.ceil(days / 7) + " weeks";
            return "Due " + this.toDisplay(val);
        }
    };
});
