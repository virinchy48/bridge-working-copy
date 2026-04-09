/**
 * SuperTester v2 — Jest setupFiles hook
 * Runs in each worker process BEFORE test modules are loaded.
 * Must set NODE_ENV before @sap/cds is first required, so CDS reads
 * the [supertester] profile from .cdsrc.json (pointing to db-supertester.sqlite).
 */
'use strict';
process.env.NODE_ENV = 'supertester';
