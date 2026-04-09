// NHVR Technical Architecture Presentation
// PptxGenJS build script — run with: node build_pptx.js

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout  = "LAYOUT_WIDE"; // 13.3" × 7.5"
pres.author  = "NHVR Architecture & Engineering";
pres.title   = "NHVR Bridge Asset & Restriction Management — Technical Architecture v3.2.1";
pres.subject = "Architecture Documentation";

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  navy:     "1B2A4A",
  blue:     "0070F2",
  orange:   "E9730C",
  white:    "FFFFFF",
  offwhite: "F4F6FA",
  silver:   "E0E5EE",
  mid:      "8A9BBB",
  dark:     "111D30",
  green:    "1A7F3C",
  red:      "C0392B",
  // section accents
  s1:       "0070F2",   // Screen Flow   → blue
  s2:       "E9730C",   // Data Model    → orange
  s3:       "1A7F3C",   // ER Diagram    → green
};

const W = 13.3;   // slide width inches
const H = 7.5;    // slide height inches

// ── Helper: footer ────────────────────────────────────────────────────────────
function addFooter(slide, pageNum) {
  slide.addText(
    "NHVR Internal — Confidential  |  Version 3.2.1  |  Architecture & Engineering",
    { x: 0.5, y: H - 0.38, w: W - 1.4, h: 0.28, fontSize: 8, color: C.mid, align: "left", margin: 0 }
  );
  slide.addText(String(pageNum), {
    x: W - 0.7, y: H - 0.38, w: 0.4, h: 0.28, fontSize: 8, color: C.mid, align: "right", margin: 0
  });
  // thin footer rule
  slide.addShape(pres.shapes.LINE, {
    x: 0.5, y: H - 0.42, w: W - 1, h: 0,
    line: { color: C.silver, width: 0.5 }
  });
}

// ── Helper: section banner (coloured strip at top) ────────────────────────────
function addSectionBanner(slide, label, color, pageNum) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.38, fill: { color }, line: { color } });
  slide.addText(label, {
    x: 0.4, y: 0, w: W - 0.8, h: 0.38,
    fontSize: 9, bold: true, color: C.white, valign: "middle", margin: 0
  });
  addFooter(slide, pageNum);
}

// ── Helper: slide title block ─────────────────────────────────────────────────
function addTitle(slide, title, sub) {
  slide.addText(title, {
    x: 0.5, y: 0.45, w: W - 1, h: 0.65,
    fontSize: 26, bold: true, color: C.navy, fontFace: "Calibri", margin: 0
  });
  if (sub) {
    slide.addText(sub, {
      x: 0.5, y: 1.05, w: W - 1, h: 0.32,
      fontSize: 13, color: C.mid, fontFace: "Calibri", margin: 0
    });
  }
}

// ── Helper: entity box for ER/data model slides ───────────────────────────────
function addEntityBox(slide, x, y, w, h, title, fields, accentColor) {
  const acc = accentColor || C.blue;
  // card background
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.white },
    line: { color: C.silver, width: 1 },
    shadow: { type: "outer", blur: 5, offset: 2, angle: 135, color: "000000", opacity: 0.10 }
  });
  // header strip
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.34,
    fill: { color: acc }, line: { color: acc }
  });
  slide.addText(title, {
    x: x + 0.1, y, w: w - 0.2, h: 0.34,
    fontSize: 10, bold: true, color: C.white, valign: "middle", margin: 0
  });
  // fields
  if (fields && fields.length > 0) {
    const items = fields.map((f, i) => ({
      text: f,
      options: { breakLine: i < fields.length - 1, fontSize: 9, color: i === 0 ? C.navy : "444444", bold: i === 0 }
    }));
    slide.addText(items, {
      x: x + 0.12, y: y + 0.38, w: w - 0.24, h: h - 0.44,
      valign: "top", margin: 0
    });
  }
}

// ── Helper: flow box ─────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function addFlowBox(slide, x, y, w, h, label, sublabel, color) {
  const bg = color || C.blue;
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: bg },
    line: { color: bg },
    shadow: { type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.12 }
  });
  slide.addText(label, {
    x: x + 0.05, y, w: w - 0.1, h: sublabel ? h * 0.55 : h,
    fontSize: 9, bold: true, color: C.white, align: "center", valign: sublabel ? "bottom" : "middle", margin: 0
  });
  if (sublabel) {
    slide.addText(sublabel, {
      x: x + 0.05, y: y + h * 0.55, w: w - 0.1, h: h * 0.45,
      fontSize: 7.5, color: C.white, align: "center", valign: "top", margin: 0
    });
  }
}

// ── Helper: arrow ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function addArrow(slide, x1, y1, x2, y2, color) {
  const c = color || C.mid;
  const dx = x2 - x1, dy = y2 - y1;
  slide.addShape(pres.shapes.LINE, {
    x: x1, y: y1, w: dx, h: dy,
    line: { color: c, width: 1.2, endArrowType: "triangle" }
  });
}

let pageNum = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — COVER
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  // large decorative rectangle right
  s.addShape(pres.shapes.RECTANGLE, { x: 9.5, y: 0, w: 3.8, h: H, fill: { color: C.blue }, line: { color: C.blue } });
  // orange accent strip
  s.addShape(pres.shapes.RECTANGLE, { x: 9.3, y: 0, w: 0.25, h: H, fill: { color: C.orange }, line: { color: C.orange } });

  // Decorative circles on right panel
  s.addShape(pres.shapes.OVAL, { x: 10.1, y: 0.6, w: 2.2, h: 2.2, fill: { color: "0060D0", transparency: 60 }, line: { color: "0060D0", transparency: 60 } });
  s.addShape(pres.shapes.OVAL, { x: 10.8, y: 3.5, w: 1.5, h: 1.5, fill: { color: "0050BB", transparency: 50 }, line: { color: "0050BB", transparency: 50 } });

  // Title
  s.addText("NHVR", { x: 0.7, y: 1.3, w: 8.2, h: 0.9, fontSize: 52, bold: true, color: C.orange, fontFace: "Calibri", margin: 0 });
  s.addText("Bridge Asset & Restriction\nManagement System", {
    x: 0.7, y: 2.15, w: 8.2, h: 1.3,
    fontSize: 28, bold: true, color: C.white, fontFace: "Calibri", margin: 0
  });

  // divider
  s.addShape(pres.shapes.LINE, { x: 0.7, y: 3.55, w: 5.5, h: 0, line: { color: C.orange, width: 2 } });

  s.addText("Technical Architecture Documentation", { x: 0.7, y: 3.7, w: 8, h: 0.4, fontSize: 16, color: C.mid, fontFace: "Calibri", margin: 0 });
  s.addText("Version 3.2.1  |  For Architecture, Engineering & Support Teams", { x: 0.7, y: 4.15, w: 8, h: 0.35, fontSize: 12, color: C.mid, fontFace: "Calibri", margin: 0 });

  // Three section badges at bottom
  const badges = [
    { label: "01  Screen Flow", color: C.s1 },
    { label: "02  Data Model",  color: C.s2 },
    { label: "03  ER Diagram",  color: C.s3 },
  ];
  badges.forEach((b, i) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7 + i * 2.8, y: 5.5, w: 2.5, h: 0.55, fill: { color: b.color }, line: { color: b.color } });
    s.addText(b.label, { x: 0.7 + i * 2.8, y: 5.5, w: 2.5, h: 0.55, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  });

  s.addText("NHVR Internal — Confidential  |  Version 3.2.1  |  Architecture & Engineering", {
    x: 0.5, y: H - 0.38, w: W - 1, h: 0.28, fontSize: 8, color: C.mid, align: "left", margin: 0
  });
  pageNum++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — TABLE OF CONTENTS
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "TABLE OF CONTENTS", C.navy, pageNum++);
  addTitle(s, "What's Inside", "Three reference views for architecture, engineering, and support teams");

  const sections = [
    { num: "01", title: "Screen Flow Diagram", desc: "All 19 screens, user role access matrix, and the full navigation graph from Home to every feature", color: C.s1, page: "3 – 6" },
    { num: "02", title: "Data Model", desc: "All 18 entities with key fields, data types, enumerations, and inter-entity associations", color: C.s2, page: "7 – 11" },
    { num: "03", title: "Entity Relationship Diagram", desc: "Visual ER diagram, foreign key mapping, and cardinality reference table", color: C.s3, page: "12 – 15" },
  ];

  sections.forEach((sec, i) => {
    const y = 1.55 + i * 1.65;
    // card
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: W - 1, h: 1.4,
      fill: { color: C.white },
      line: { color: C.silver, width: 0.75 },
      shadow: { type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.08 }
    });
    // accent strip
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.18, h: 1.4, fill: { color: sec.color }, line: { color: sec.color } });
    // number
    s.addText(sec.num, { x: 0.75, y: y + 0.28, w: 0.8, h: 0.72, fontSize: 36, bold: true, color: sec.color, margin: 0 });
    // title
    s.addText(sec.title, { x: 1.65, y: y + 0.2, w: 9.8, h: 0.42, fontSize: 17, bold: true, color: C.navy, margin: 0 });
    // desc
    s.addText(sec.desc, { x: 1.65, y: y + 0.62, w: 9.8, h: 0.55, fontSize: 11.5, color: "444444", margin: 0 });
    // page
    s.addText(`Slides ${sec.page}`, { x: W - 2.2, y: y + 0.28, w: 1.6, h: 0.4, fontSize: 10, color: C.mid, align: "right", margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — SECTION 1 DIVIDER: SCREEN FLOW
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.s1 };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.2, h: H, fill: { color: C.dark }, line: { color: C.dark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 4.2, y: 0, w: 0.15, h: H, fill: { color: C.orange }, line: { color: C.orange } });

  s.addShape(pres.shapes.OVAL, { x: 0.4, y: 2.5, w: 3.2, h: 3.2, fill: { color: "FFFFFF", transparency: 92 }, line: { color: "FFFFFF", transparency: 92 } });
  s.addShape(pres.shapes.OVAL, { x: -0.3, y: 0.2, w: 2, h: 2, fill: { color: "FFFFFF", transparency: 88 }, line: { color: "FFFFFF", transparency: 88 } });

  s.addText("01", { x: 0.5, y: 1.4, w: 3, h: 1.2, fontSize: 80, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("SCREEN\nFLOW\nDIAGRAM", { x: 4.6, y: 1.8, w: 8.2, h: 2.5, fontSize: 38, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("User roles · 19 screens · Navigation paths", { x: 4.6, y: 4.5, w: 8.2, h: 0.5, fontSize: 16, color: "CCE0FF", fontFace: "Calibri", margin: 0 });

  s.addText("NHVR Internal — Confidential  |  Version 3.2.1", { x: 0.5, y: H - 0.38, w: W - 1, h: 0.28, fontSize: 8, color: "88AACC", align: "left", margin: 0 });
  s.addText(String(pageNum++), { x: W - 0.7, y: H - 0.38, w: 0.4, h: 0.28, fontSize: 8, color: "88AACC", align: "right", margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — USER ROLE ACCESS MATRIX
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "01  SCREEN FLOW — User Role Access Matrix", C.s1, pageNum++);
  addTitle(s, "Role-Based Screen Access", "Six roles mapped to functional access areas");

  // Table data
  const hdr = ["Role", "Home", "Bridges / Map", "Route Planner", "Inspections", "Defects", "Permits", "Reports", "Mass Edit/Upload", "Admin"];
  const rows = [
    ["NHVR_Admin",         "✔","✔","✔","✔","✔","✔","✔","✔","✔"],
    ["NHVR_BridgeManager", "✔","✔","✔","✔","✔","✔","✔","✔","✗"],
    ["NHVR_Inspector",     "✔","✔ (read)","✗","✔","✔","✗","✗","✗","✗"],
    ["NHVR_Operator",      "✔","✔ (read)","✔","✗","✗","✔","✗","✔","✗"],
    ["NHVR_Executive",     "✔","Map only","✗","✗","✗","✗","✔","✗","✗"],
    ["NHVR_Viewer",        "✔","✔ (read)","✗","✔ (read)","✔ (read)","✔ (read)","✔","✗","✗"],
  ];

  const colWidths = [2.0, 0.82, 1.15, 1.0, 1.0, 0.8, 0.8, 0.85, 1.15, 0.7];

  const tableData = [
    hdr.map(h => ({ text: h, options: { bold: true, fontSize: 9.5, color: C.white, fill: { color: C.navy }, align: "center" } })),
    ...rows.map((row, ri) => row.map((cell, ci) => {
      const isRole = ci === 0;
      const isTick = cell === "✔";
      const isCross = cell === "✗";
      return {
        text: cell,
        options: {
          fontSize: isRole ? 9.5 : 10,
          bold: isRole,
          color: isTick ? C.green : isCross ? C.red : C.navy,
          fill: { color: ri % 2 === 0 ? C.white : "EDF1FA" },
          align: isRole ? "left" : "center"
        }
      };
    }))
  ];

  s.addTable(tableData, {
    x: 0.4, y: 1.45, w: W - 0.8, h: 4.6,
    colW: colWidths,
    border: { pt: 0.5, color: C.silver },
    rowH: 0.52
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — SCREEN INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "01  SCREEN FLOW — Screen Inventory (19 Screens)", C.s1, pageNum++);
  addTitle(s, "All Application Screens", "Each screen with its primary purpose and category");

  const screens = [
    { name: "Home",                cat: "Core",    desc: "KPI dashboard tiles, navigation hub — role-specific sections" },
    { name: "Bridges",             cat: "Core",    desc: "Paginated list, advanced AND/OR filter, 2,126+ assets" },
    { name: "BridgeDetail",        cat: "Core",    desc: "8-tab object page: Overview, Restrictions, Inspections, Defects, Attributes…" },
    { name: "BridgeForm",          cat: "Core",    desc: "Create/Edit bridge — 9 sections including dynamic custom attributes" },
    { name: "MapView",             cat: "Core",    desc: "Leaflet geospatial map — filter sync with Bridges list" },
    { name: "RoutePlanner",        cat: "Route",   desc: "Origin/Destination, OSRM/Valhalla routing, bridge assessment + road classification" },
    { name: "RouteAssessment",     cat: "Route",   desc: "Assess named freight route for a specific vehicle class" },
    { name: "FreightRouteDetail",  cat: "Route",   desc: "Named route detail page — links to RouteAssessment" },
    { name: "Reports",             cat: "BI",      desc: "Executive KPI/analytics dashboard with charts" },
    { name: "Permits",             cat: "Ops",     desc: "Heavy vehicle permit register — CRUD" },
    { name: "MassEdit",            cat: "Ops",     desc: "Multi-bridge bulk attribute update with preview/diff dialog" },
    { name: "MassUpload",          cat: "Ops",     desc: "CSV bulk import — upload log with error reporting" },
    { name: "InspectionDashboard", cat: "Inspect", desc: "All inspection orders — overdue list — links to BridgeDetail" },
    { name: "Defects",             cat: "Inspect", desc: "All-bridges defect register — filter by severity/status" },
    { name: "AdminConfig",         cat: "Admin",   desc: "Lookups, Role Config, Attribute Definitions — 3 tabs" },
    { name: "AdminRestrictionTypes", cat: "Admin", desc: "Restriction type master data management" },
    { name: "AdminVehicleTypes",   cat: "Admin",   desc: "Vehicle class master data management" },
    { name: "HelpAssistant",       cat: "System",  desc: "Contextual help overlay — available on all screens" },
    { name: "NotificationInbox",   cat: "System",  desc: "Bell notification overlay — accessible from Home toolbar" },
  ];

  const catColor = { Core: C.navy, Route: C.s1, BI: "7B3FA0", Ops: C.orange, Inspect: "1A7F3C", Admin: C.red, System: C.mid };

  const cols = 3;
  const bw = (W - 0.8) / cols;
  const bh = 0.64;
  const startY = 1.45;

  screens.forEach((sc, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.4 + col * bw;
    const y = startY + row * (bh + 0.08);

    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: bw - 0.12, h: bh,
      fill: { color: C.white }, line: { color: C.silver, width: 0.5 },
      shadow: { type: "outer", blur: 3, offset: 1, angle: 135, color: "000000", opacity: 0.07 }
    });
    // category pill
    const cc = catColor[sc.cat] || C.mid;
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.08, y: y + 0.08, w: 0.72, h: 0.22, fill: { color: cc }, line: { color: cc } });
    s.addText(sc.cat, { x: x + 0.08, y: y + 0.08, w: 0.72, h: 0.22, fontSize: 7, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    // name
    s.addText(sc.name, { x: x + 0.85, y: y + 0.05, w: bw - 1.1, h: 0.28, fontSize: 10, bold: true, color: C.navy, margin: 0 });
    // desc
    s.addText(sc.desc, { x: x + 0.1, y: y + 0.34, w: bw - 0.3, h: 0.26, fontSize: 8, color: "555555", margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — NAVIGATION FLOW DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "01  SCREEN FLOW — Navigation Flow Diagram", C.s1, pageNum++);
  addTitle(s, "Screen Navigation Paths", "From Home to all features — coloured by functional area");

  // Home box — centre-left
  const homeX = 0.5, homeY = 2.8, homeW = 1.4, homeH = 0.6;
  s.addShape(pres.shapes.RECTANGLE, { x: homeX, y: homeY, w: homeW, h: homeH, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("🏠 HOME", { x: homeX, y: homeY, w: homeW, h: homeH, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  // Helper for flow nodes
  function node(x, y, label, color) {
    const w = 1.65, h = 0.48;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: color || C.blue }, line: { color: color || C.blue },
      shadow: { type: "outer", blur: 3, offset: 1, angle: 135, color: "000000", opacity: 0.10 }
    });
    s.addText(label, { x, y, w, h, fontSize: 8.5, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    return { x, y, w, h };
  }

  function connector(fromBox, toBox, color) {
    const x1 = fromBox.x + fromBox.w;
    const y1 = fromBox.y + fromBox.h / 2;
    const x2 = toBox.x;
    const y2 = toBox.y + toBox.h / 2;
    s.addShape(pres.shapes.LINE, {
      x: x1, y: y1, w: x2 - x1, h: y2 - y1,
      line: { color: color || C.silver, width: 1, endArrowType: "triangle" }
    });
  }

  // Column x positions
  const c1 = homeX + homeW + 0.25;  // 2.15
  const c2 = c1 + 1.85;             // 4.0
  const c3 = c2 + 1.85;             // 5.85
  const c4 = c3 + 1.85;             // 7.7

  // Core path
  const nBridges   = node(c1, 1.0,  "Bridges List",    C.navy);
  const nMapView   = node(c1, 1.62, "Map View",         C.navy);
  const nDetail    = node(c2, 1.0,  "Bridge Detail",    C.navy);
  const nForm      = node(c3, 1.0,  "Bridge Form",      C.navy);

  // Route path
  const nRPlanner  = node(c1, 2.55, "Route Planner",    C.s1);
  const nRAssess   = node(c2, 2.55, "Route Assessment", C.s1);
  const nFRoute    = node(c1, 3.18, "Freight Route Det",C.s1);

  // Ops path
  const nPermits   = node(c1, 3.8,  "Permits",          C.orange);
  const nMassEdit  = node(c1, 4.42, "Mass Edit",        C.orange);
  const nUpload    = node(c1, 5.04, "Mass Upload",       C.orange);

  // Reports
  const nReports   = node(c2, 3.18, "Reports",          "7B3FA0");

  // Inspection path
  const nInspDash  = node(c2, 3.8,  "Inspection Dash",  C.green);
  const nDefects   = node(c2, 4.42, "Defects",          C.green);

  // Admin path
  const nAdmin     = node(c3, 3.8,  "Admin Config",     C.red);
  const nRestType  = node(c3, 4.42, "Admin Restr. Types",C.red);
  const nVehType   = node(c3, 5.04, "Admin Vehicle Types",C.red);

  // System overlays
  const nHelp      = node(c4, 1.6,  "Help Assistant",   C.mid);
  const nNotif     = node(c4, 2.22, "Notification Inbox",C.mid);

  const home = { x: homeX, y: homeY, w: homeW, h: homeH };

  // Draw connectors from Home to col1
  [nBridges, nMapView, nRPlanner, nFRoute, nPermits, nMassEdit, nUpload].forEach(n => connector(home, n, C.s1));

  // Col1 → col2
  connector(nBridges,  nDetail, C.navy);
  connector(nRPlanner, nRAssess, C.s1);
  connector(nFRoute,   nRAssess, C.s1);

  // Col2 → col3
  connector(nDetail,   nForm, C.navy);
  connector(nInspDash, nAdmin, C.silver);
  connector(nDefects,  nRestType, C.silver);

  // Detail tabs note
  s.addShape(pres.shapes.RECTANGLE, { x: c3, y: 1.52, w: 1.65, h: 1.22, fill: { color: "EDF1FA" }, line: { color: C.silver, width: 0.5 } });
  s.addText("BridgeDetail Tabs:", { x: c3 + 0.1, y: 1.56, w: 1.5, h: 0.28, fontSize: 8, bold: true, color: C.navy, margin: 0 });
  s.addText([
    { text: "Overview  •  Restrictions", options: { breakLine: true, fontSize: 7.5, color: "444444" } },
    { text: "Inspections  •  Insp. Orders", options: { breakLine: true, fontSize: 7.5, color: "444444" } },
    { text: "Defects  •  External Refs", options: { breakLine: true, fontSize: 7.5, color: "444444" } },
    { text: "Attributes  •  History", options: { fontSize: 7.5, color: "444444" } },
  ], { x: c3 + 0.1, y: 1.86, w: 1.5, h: 0.82, valign: "top", margin: 0 });

  // Home → Reports/Inspection/Defects (via col2)
  connector(home, nReports, "7B3FA0");
  connector(home, nInspDash, C.green);
  connector(home, nDefects, C.green);
  connector(home, nAdmin, C.red);
  connector(home, nRestType, C.red);
  connector(home, nVehType, C.red);
  connector(home, nHelp, C.mid);
  connector(home, nNotif, C.mid);

  // Legend
  const legend = [
    { label: "Core Asset Management", color: C.navy },
    { label: "Route & Assessment",    color: C.s1 },
    { label: "Operations",            color: C.orange },
    { label: "Inspection & Defects",  color: C.green },
    { label: "Reports / BI",          color: "7B3FA0" },
    { label: "Admin Configuration",   color: C.red },
    { label: "System / Overlays",     color: C.mid },
  ];
  legend.forEach((l, i) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5 + i * 1.82, y: 6.72, w: 0.2, h: 0.2, fill: { color: l.color }, line: { color: l.color } });
    s.addText(l.label, { x: 0.74 + i * 1.82, y: 6.71, w: 1.6, h: 0.22, fontSize: 7.5, color: "444444", margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — SECTION 2 DIVIDER: DATA MODEL
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.orange };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.2, h: H, fill: { color: C.dark }, line: { color: C.dark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 4.2, y: 0, w: 0.15, h: H, fill: { color: C.s1 }, line: { color: C.s1 } });

  s.addShape(pres.shapes.OVAL, { x: 0.5, y: 0.5, w: 2.5, h: 2.5, fill: { color: "FFFFFF", transparency: 90 }, line: { color: "FFFFFF", transparency: 90 } });
  s.addShape(pres.shapes.OVAL, { x: 1.2, y: 3.8, w: 1.8, h: 1.8, fill: { color: "FFFFFF", transparency: 88 }, line: { color: "FFFFFF", transparency: 88 } });

  s.addText("02", { x: 0.5, y: 1.4, w: 3, h: 1.2, fontSize: 80, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("DATA\nMODEL", { x: 4.6, y: 1.8, w: 8.2, h: 2.0, fontSize: 48, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("18 entities · fields · types · associations", { x: 4.6, y: 4.0, w: 8.2, h: 0.5, fontSize: 16, color: "FFD0A0", fontFace: "Calibri", margin: 0 });

  s.addText("NHVR Internal — Confidential  |  Version 3.2.1", { x: 0.5, y: H - 0.38, w: W - 1, h: 0.28, fontSize: 8, color: "BB8860", align: "left", margin: 0 });
  s.addText(String(pageNum++), { x: W - 0.7, y: H - 0.38, w: 0.4, h: 0.28, fontSize: 8, color: "BB8860", align: "right", margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — DATA MODEL ENTITY OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "02  DATA MODEL — Entity Overview", C.s2, pageNum++);
  addTitle(s, "18 Entities at a Glance", "Grouped by functional domain");

  const groups = [
    { title: "Core Assets", color: C.navy, entities: ["Bridge", "BridgeConditionHistory", "BridgeExternalRef", "BridgeAttribute"] },
    { title: "Restrictions & Routes", color: C.s1, entities: ["Restriction", "RestrictionChangeLog", "Route", "VehicleClass"] },
    { title: "Inspection & Defects", color: C.green, entities: ["InspectionOrder", "InspectionRecord", "MeasurementDocument", "BridgeDefect"] },
    { title: "Operations & Config", color: C.orange, entities: ["Permit", "AttributeDefinition", "Lookup", "RoleConfig"] },
    { title: "Audit & Logging", color: "7B3FA0", entities: ["AuditLog", "UploadLog"] },
  ];

  let gy = 1.5;
  const gw = (W - 0.8) / 5 - 0.1;

  groups.forEach((g, gi) => {
    const x = 0.4 + gi * ((W - 0.8) / 5);
    // group header
    s.addShape(pres.shapes.RECTANGLE, { x, y: gy, w: gw, h: 0.36, fill: { color: g.color }, line: { color: g.color } });
    s.addText(g.title, { x: x + 0.08, y: gy, w: gw - 0.16, h: 0.36, fontSize: 9, bold: true, color: C.white, valign: "middle", margin: 0 });

    g.entities.forEach((e, ei) => {
      const ey = gy + 0.4 + ei * 1.12;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: ey, w: gw, h: 1.0,
        fill: { color: C.white }, line: { color: C.silver, width: 0.75 },
        shadow: { type: "outer", blur: 3, offset: 1, angle: 135, color: "000000", opacity: 0.07 }
      });
      s.addShape(pres.shapes.RECTANGLE, { x, y: ey, w: 0.12, h: 1.0, fill: { color: g.color }, line: { color: g.color } });
      s.addText(e, { x: x + 0.18, y: ey + 0.12, w: gw - 0.26, h: 0.38, fontSize: 9.5, bold: true, color: C.navy, margin: 0 });
      s.addText("Entity", { x: x + 0.18, y: ey + 0.52, w: gw - 0.26, h: 0.24, fontSize: 8, color: C.mid, margin: 0 });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — BRIDGE & RESTRICTION ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "02  DATA MODEL — Core Asset Entities", C.s2, pageNum++);
  addTitle(s, "Bridge & Restriction Entities", "Primary business objects — Bridge is the root of most relationships");

  // Bridge entity box
  addEntityBox(s, 0.4, 1.4, 5.9, 5.6, "Bridge  (Primary Asset — 2,126+ records)", [
    "🔑 ID : UUID  |  bridgeId : String  |  name : String",
    "state : String  |  region : String  |  lga : String  |  councilArea : String",
    "latitude : Decimal  |  longitude : Decimal",
    "structureType : String  |  material : String  |  yearBuilt : Integer",
    "spanLengthM : Decimal  |  deckWidthM : Decimal  |  clearanceHeightM : Decimal",
    "condition : Enum (GOOD / FAIR / POOR / CRITICAL / UNKNOWN)",
    "conditionRating : Integer (1-10)  |  conditionScore : Decimal (0-100)",
    "postingStatus : Enum (UNRESTRICTED / POSTED / CLOSED / TEMPORARY)",
    "isActive : Boolean  |  lastInspectionDate : Date  |  nextInspectionDue : Date",
    "roadRoute : String  |  routeNumber : String",
    "roadHierarchy : Enum (NATIONAL / STATE / REGIONAL / LOCAL)",
    "assetOwner : String  |  maintenanceAuthority : String",
    "──── Associations ────",
    "→ Restrictions (1:N)  → InspectionRecords (1:N)  → BridgeDefects (1:N)",
    "→ BridgeAttributes (1:N)  → ExternalRefs (1:N)  → ConditionHistory (1:N)",
  ], C.navy);

  // Restriction entity box
  addEntityBox(s, 6.6, 1.4, 6.3, 2.8, "Restriction", [
    "🔑 ID : UUID  |  bridge_ID : FK → Bridge",
    "route_ID : FK → Route (optional)",
    "restrictionType : Enum (MASS_LIMIT / CLEARANCE_HEIGHT /",
    "  CLEARANCE_WIDTH / SPEED / VEHICLE_TYPE / ROAD_TRAIN /",
    "  B_DOUBLE / PBS)",
    "value : Decimal  |  unit : String",
    "status : Enum (ACTIVE / INACTIVE / TEMPORARY / EXPIRED)",
    "validFromDate : Date  |  validToDate : Date",
    "reason : String  |  isTemporary : Boolean",
    "appliedBy : String  |  approvedBy : String",
    "→ RestrictionChangeLog (1:N)",
  ], C.s1);

  // Route entity box
  addEntityBox(s, 6.6, 4.35, 3.05, 2.65, "Route", [
    "🔑 ID : UUID  |  routeCode : String",
    "routeName : String  |  state : String",
    "startLocation / endLocation : String",
    "totalLengthKm : Decimal",
    "roadClass : String  |  status : String",
    "→ Restrictions (1:N)",
  ], C.s1);

  // VehicleClass entity box
  addEntityBox(s, 9.8, 4.35, 3.1, 2.65, "VehicleClass", [
    "🔑 ID : UUID  |  classCode : String",
    "(PBS1/PBS2/PBS3/PBS4/ROAD_TRAIN/",
    " B_DOUBLE/B_TRIPLE/A_DOUBLE)",
    "maxGVM_t / maxGCM_t : Decimal",
    "maxHeight_m / maxWidth_m : Decimal",
    "maxLength_m : Decimal",
    "description : String  |  isActive : Boolean",
    "→ Permits (1:N)",
  ], C.s1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — INSPECTION & DEFECT ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "02  DATA MODEL — Inspection & Defect Entities", C.s2, pageNum++);
  addTitle(s, "Inspection Chain & Defect Register", "Inspection orders drive records and measurements; defects track structural issues");

  addEntityBox(s, 0.4, 1.4, 4.0, 2.9, "InspectionOrder", [
    "🔑 ID : UUID  |  orderNumber : String",
    "bridge_ID : FK → Bridge",
    "status : Enum (PLANNED / IN_PROGRESS /",
    "  COMPLETED / CANCELLED)",
    "plannedDate : Date  |  completedDate : Date",
    "assignedInspector : String",
    "priority : Enum (ROUTINE / URGENT / EMERGENCY)",
    "→ MeasurementDocuments (1:N)",
    "→ InspectionRecord (1:1)",
  ], C.green);

  addEntityBox(s, 4.6, 1.4, 4.0, 2.9, "InspectionRecord", [
    "🔑 ID : UUID",
    "bridge_ID : FK → Bridge",
    "inspectionOrder_ID : FK → InspectionOrder",
    "inspectionDate : Date",
    "inspectorName : String",
    "standard : String  (AS5100/BIMM)",
    "conditionRatingAssigned : Integer (1-10)",
    "overallScore : Decimal",
    "findings : LargeString",
    "recommendations : LargeString",
    "nextInspectionDate : Date",
  ], C.green);

  addEntityBox(s, 8.8, 1.4, 4.1, 2.9, "MeasurementDocument", [
    "🔑 ID : UUID",
    "inspectionOrder_ID : FK → InspectionOrder",
    "elementType : String",
    "  (e.g. DECK / PIER / ABUTMENT / BEARING)",
    "conditionGrade : String  (A/B/C/D/E/F)",
    "measurementValue : Decimal",
    "unit : String",
    "notes : LargeString",
    "recordedAt : Timestamp",
    "recordedBy : String",
  ], C.green);

  addEntityBox(s, 0.4, 4.45, 5.9, 2.55, "BridgeDefect", [
    "🔑 ID : UUID  |  bridge_ID : FK → Bridge",
    "defectCode : String  |  severity : Enum (LOW / MEDIUM / HIGH / CRITICAL)",
    "defectCategory : String  (STRUCTURAL / SURFACE / DRAINAGE / SAFETY)",
    "description : LargeString  |  locationOnStructure : String",
    "raisedDate : Date  |  raisedBy : String",
    "status : Enum (OPEN / IN_PROGRESS / CLOSED / DEFERRED)",
    "closureNotes : LargeString  |  closedDate : Date  |  closedBy : String",
  ], C.green);

  addEntityBox(s, 6.6, 4.45, 6.3, 2.55, "BridgeConditionHistory", [
    "🔑 ID : UUID  |  bridge_ID : FK → Bridge",
    "conditionRating : Integer (1-10)",
    "conditionScore : Decimal (0-100)",
    "condition : Enum (GOOD / FAIR / POOR / CRITICAL / UNKNOWN)",
    "recordedAt : Timestamp  |  recordedBy : String",
    "changeReason : String  |  previousRating : Integer",
    "— Populated automatically on conditionRating change —",
  ], C.green);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — OPERATIONS & CONFIG ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "02  DATA MODEL — Operations, Config & Audit Entities", C.s2, pageNum++);
  addTitle(s, "Permits · Attributes · Audit · Config", "Dynamic attribute schema, permit register, audit trail, and system configuration");

  addEntityBox(s, 0.4, 1.4, 3.9, 2.7, "Permit", [
    "🔑 ID : UUID  |  permitNumber : String",
    "vehicleClass_ID : FK → VehicleClass",
    "status : Enum (PENDING / APPROVED /",
    "  REJECTED / EXPIRED / REVOKED)",
    "applicantName : String  |  permitType : String",
    "validFrom : Date  |  validTo : Date",
    "maxMass_t : Decimal  |  maxHeight_m : Decimal",
    "routeDescription : LargeString",
  ], C.orange);

  addEntityBox(s, 4.55, 1.4, 3.9, 2.7, "AttributeDefinition", [
    "🔑 ID : UUID  |  attributeCode : String",
    "label : String",
    "dataType : Enum (STRING / INTEGER / DECIMAL /",
    "  BOOLEAN / DATE / LOOKUP)",
    "isRequired : Boolean",
    "filterEnabled : Boolean  |  reportEnabled : Boolean",
    "massEditEnabled : Boolean",
    "validValues : LargeString  (JSON for LOOKUP type)",
    "isActive : Boolean",
    "→ BridgeAttributes (1:N)",
  ], C.orange);

  addEntityBox(s, 8.7, 1.4, 4.2, 2.7, "BridgeAttribute", [
    "🔑 ID : UUID",
    "bridge_ID : FK → Bridge",
    "attributeDef_ID : FK → AttributeDefinition",
    "value : String",
    "(validated against AttributeDefinition.dataType",
    " and validValues at write time)",
  ], C.orange);

  addEntityBox(s, 0.4, 4.3, 3.9, 2.7, "Lookup", [
    "🔑 ID : UUID",
    "category : String  (e.g. BRIDGE_TYPE)",
    "code : String  |  label : String",
    "sortOrder : Integer  |  isActive : Boolean",
    "— Admin-managed dropdown values —",
    "— Used by LOOKUP-type AttributeDefinitions —",
  ], C.orange);

  addEntityBox(s, 4.55, 4.3, 3.9, 2.7, "AuditLog  (Immutable)", [
    "🔑 ID : UUID  |  entityType : String",
    "entityId : String (UUID of changed record)",
    "action : Enum (CREATE / UPDATE / DELETE)",
    "changedBy : String  |  changedAt : Timestamp",
    "oldValues : LargeString  (JSON)",
    "newValues : LargeString  (JSON)",
    "— Written by CAP AFTER hooks, never updated —",
  ], "7B3FA0");

  addEntityBox(s, 8.7, 4.3, 4.2, 2.7, "RoleConfig  &  UploadLog", [
    "RoleConfig  (standalone config, no FK)",
    "  ID · roleCode · featureName · featureEnabled",
    "  fieldName · fieldVisible · fieldEditable · fieldRequired",
    "",
    "UploadLog  (bulk import audit)",
    "  ID · uploadedBy · uploadedAt · fileName",
    "  totalRecords · successCount · errorCount",
    "  status · errors (JSON)",
  ], C.mid);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — SECTION 3 DIVIDER: ER DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.green };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.2, h: H, fill: { color: C.dark }, line: { color: C.dark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 4.2, y: 0, w: 0.15, h: H, fill: { color: C.orange }, line: { color: C.orange } });

  s.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.8, w: 2.8, h: 2.8, fill: { color: "FFFFFF", transparency: 90 }, line: { color: "FFFFFF", transparency: 90 } });
  s.addShape(pres.shapes.OVAL, { x: 1.5, y: 4.0, w: 1.6, h: 1.6, fill: { color: "FFFFFF", transparency: 88 }, line: { color: "FFFFFF", transparency: 88 } });

  s.addText("03", { x: 0.5, y: 1.4, w: 3, h: 1.2, fontSize: 80, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("ENTITY\nRELATIONSHIP\nDIAGRAM", { x: 4.6, y: 1.4, w: 8.2, h: 2.8, fontSize: 34, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("Keys · foreign keys · cardinality · visual ER map", { x: 4.6, y: 4.4, w: 8.2, h: 0.5, fontSize: 14, color: "A0D4B0", fontFace: "Calibri", margin: 0 });

  s.addText("NHVR Internal — Confidential  |  Version 3.2.1", { x: 0.5, y: H - 0.38, w: W - 1, h: 0.28, fontSize: 8, color: "80B090", align: "left", margin: 0 });
  s.addText(String(pageNum++), { x: W - 0.7, y: H - 0.38, w: 0.4, h: 0.28, fontSize: 8, color: "80B090", align: "right", margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — ER DIAGRAM (Core Relationships)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "03  ER DIAGRAM — Core Entity Relationships", C.s3, pageNum++);
  addTitle(s, "Entity Relationship Diagram — Core", "Bridge is the central entity; all major entities connect via FK");

  // Helper: small ER entity box
  function erBox(label, x, y, w, h, color) {
    const c = color || C.navy;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: C.white }, line: { color: c, width: 1.5 },
      shadow: { type: "outer", blur: 4, offset: 1, angle: 135, color: "000000", opacity: 0.10 }
    });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.3, fill: { color: c }, line: { color: c } });
    s.addText(label, { x: x + 0.06, y, w: w - 0.12, h: 0.3, fontSize: 9, bold: true, color: C.white, valign: "middle", align: "center", margin: 0 });
    return { x, y, w, h };
  }

  // Helper: FK label connector
  function erLine(x1, y1, x2, y2, label, color) {
    const c = color || C.mid;
    s.addShape(pres.shapes.LINE, {
      x: x1, y: y1, w: x2 - x1, h: y2 - y1,
      line: { color: c, width: 1, endArrowType: "diamond" }
    });
    if (label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      s.addText(label, { x: mx - 0.4, y: my - 0.16, w: 0.8, h: 0.22, fontSize: 7, color: c, align: "center", margin: 0 });
    }
  }

  // Central Bridge box
  const bw = 2.4, bh = 3.5;
  const bx = (W - bw) / 2, by = 1.5;
  s.addShape(pres.shapes.RECTANGLE, { x: bx, y: by, w: bw, h: bh, fill: { color: C.white }, line: { color: C.navy, width: 2.5 }, shadow: { type: "outer", blur: 8, offset: 3, angle: 135, color: "000000", opacity: 0.15 } });
  s.addShape(pres.shapes.RECTANGLE, { x: bx, y: by, w: bw, h: 0.35, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("Bridge", { x: bx, y: by, w: bw, h: 0.35, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  s.addText([
    { text: "🔑 ID (UUID, PK)", options: { bold: true, breakLine: true } },
    { text: "bridgeId : String", options: { breakLine: true } },
    { text: "name / state / region", options: { breakLine: true } },
    { text: "lat / lon : Decimal", options: { breakLine: true } },
    { text: "condition : Enum", options: { breakLine: true } },
    { text: "conditionRating (1-10)", options: { breakLine: true } },
    { text: "postingStatus : Enum", options: { breakLine: true } },
    { text: "roadHierarchy : Enum", options: { breakLine: true } },
    { text: "isActive : Boolean", options: { breakLine: true } },
    { text: "…and 25+ more fields" },
  ], { x: bx + 0.1, y: by + 0.42, w: bw - 0.2, h: bh - 0.55, fontSize: 8.5, color: "333333", valign: "top", margin: 0 });

  // Left side entities
  const r1  = erBox("Restriction",            0.3,  1.5, 2.1, 1.6, C.s1);
  const ri  = erBox("RestrictionChangeLog",   0.3,  3.3, 2.1, 1.0, C.s1);
  const io  = erBox("InspectionOrder",        0.3,  4.55, 2.1, 1.4, C.green);

  // Right side entities
  const ir  = erBox("InspectionRecord",       W - 2.5, 1.5, 2.1, 1.4, C.green);
  const md  = erBox("MeasurementDocument",    W - 2.5, 3.1, 2.1, 1.1, C.green);
  const bd  = erBox("BridgeDefect",           W - 2.5, 4.4, 2.1, 1.2, C.green);

  // Bottom entities
  const ba  = erBox("BridgeAttribute",        2.6,  5.8, 1.8, 0.9, C.orange);
  const ext = erBox("BridgeExternalRef",      4.75, 5.8, 1.8, 0.9, C.orange);
  const ch  = erBox("BridgeConditionHistory", 6.9,  5.8, 2.2, 0.9, C.green);
  const al  = erBox("AuditLog",               9.4,  5.8, 1.8, 0.9, "7B3FA0");

  // Left connectors — right edge of entity to left edge of Bridge
  erLine(r1.x + r1.w,  r1.y  + r1.h/2,  bx, by + bh*0.2, "1:N", C.s1);
  erLine(ri.x + ri.w,  ri.y  + ri.h/2,  r1.x + r1.w/2, r1.y + r1.h, "1:N", C.s1);
  erLine(io.x + io.w,  io.y  + io.h/2,  bx, by + bh*0.65, "1:N", C.green);

  // Right connectors
  erLine(bx + bw, by + bh*0.2, ir.x, ir.y + ir.h/2, "1:N", C.green);
  erLine(ir.x + ir.w/2, ir.y + ir.h, md.x + md.w/2, md.y, "1:N", C.green);
  erLine(bx + bw, by + bh*0.55, bd.x, bd.y + bd.h/2, "1:N", C.green);

  // Bottom connectors (from Bridge bottom)
  erLine(bx + bw*0.2, by + bh, ba.x  + ba.w/2,  ba.y,  "1:N", C.orange);
  erLine(bx + bw*0.5, by + bh, ext.x + ext.w/2, ext.y, "1:N", C.orange);
  erLine(bx + bw*0.7, by + bh, ch.x  + ch.w/2,  ch.y,  "1:N", C.green);
  erLine(bx + bw*0.95, by + bh, al.x  + al.w/2,  al.y, "logs", "7B3FA0");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 14 — ER DIAGRAM (Secondary Relationships)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "03  ER DIAGRAM — Secondary & Config Relationships", C.s3, pageNum++);
  addTitle(s, "Entity Relationship Diagram — Config & Operations", "Attribute schema, permits, lookups, and route-level restrictions");

  // AttributeDefinition → BridgeAttribute ← Bridge
  addEntityBox(s, 0.3, 1.4, 3.6, 2.8, "AttributeDefinition", [
    "🔑 ID : UUID",
    "attributeCode : String",
    "label : String",
    "dataType : Enum (STRING/INTEGER/DECIMAL/",
    "  BOOLEAN/DATE/LOOKUP)",
    "isRequired / filterEnabled / reportEnabled",
    "massEditEnabled : Boolean",
    "validValues : JSON (for LOOKUP type)",
  ], C.orange);

  addEntityBox(s, 4.3, 2.2, 3.0, 2.0, "BridgeAttribute", [
    "🔑 ID : UUID",
    "bridge_ID : FK → Bridge",
    "attributeDef_ID : FK → AttributeDefinition",
    "value : String",
    "(type-validated on write)",
  ], C.orange);

  addEntityBox(s, 7.6, 1.4, 3.0, 1.8, "Bridge  (ref)", [
    "🔑 ID : UUID  (PK)",
    "— central entity —",
    "(see core ER slide for full fields)",
  ], C.navy);

  addEntityBox(s, 7.6, 3.4, 3.0, 1.8, "VehicleClass", [
    "🔑 ID : UUID",
    "classCode : String",
    "maxGVM_t / maxGCM_t / maxHeight_m",
    "maxWidth_m / maxLength_m",
    "isActive : Boolean",
  ], C.s1);

  addEntityBox(s, 7.6, 5.4, 3.0, 1.6, "Permit", [
    "🔑 ID : UUID",
    "vehicleClass_ID : FK → VehicleClass",
    "permitNumber / status / validFrom / validTo",
    "applicantName / routeDescription",
  ], C.orange);

  addEntityBox(s, 0.3, 4.45, 3.0, 1.7, "Lookup", [
    "🔑 ID : UUID",
    "category : String",
    "code : String  |  label : String",
    "sortOrder : Integer  |  isActive : Boolean",
    "— values for LOOKUP-type Attributes —",
  ], C.orange);

  addEntityBox(s, 3.6, 4.45, 3.4, 1.7, "Route", [
    "🔑 ID : UUID",
    "routeCode / routeName / state",
    "startLocation / endLocation",
    "totalLengthKm / roadClass / status",
    "→ Restrictions (1:N via route_ID FK)",
  ], C.s1);

  // Connectors
  // AttributeDef → BridgeAttribute
  s.addShape(pres.shapes.LINE, { x: 3.9, y: 2.8, w: 0.4, h: 0, line: { color: C.orange, width: 1.2, endArrowType: "triangle" } });
  s.addText("1", { x: 3.65, y: 2.7, w: 0.22, h: 0.22, fontSize: 9, bold: true, color: C.orange, margin: 0 });
  s.addText("N", { x: 4.1, y: 2.7, w: 0.22, h: 0.22, fontSize: 9, bold: true, color: C.orange, margin: 0 });

  // Bridge → BridgeAttribute
  s.addShape(pres.shapes.LINE, { x: 7.6, y: 2.5, w: -0.3, h: 0.7, line: { color: C.navy, width: 1.2, endArrowType: "triangle" } });
  s.addText("1:N", { x: 7.0, y: 2.6, w: 0.5, h: 0.22, fontSize: 8, color: C.navy, margin: 0 });

  // VehicleClass → Permit
  s.addShape(pres.shapes.LINE, { x: 9.1, y: 5.2, w: 0, h: 0.2, line: { color: C.s1, width: 1.2, endArrowType: "triangle" } });
  s.addText("1:N", { x: 9.2, y: 5.1, w: 0.5, h: 0.22, fontSize: 8, color: C.s1, margin: 0 });

  // Lookup usage note
  s.addShape(pres.shapes.LINE, { x: 3.3, y: 5.2, w: 0.3, h: -0.3, line: { color: C.orange, width: 1, dashType: "dash" } });
  s.addText("used by LOOKUP-type attrs", { x: 0.3, y: 6.25, w: 3.0, h: 0.22, fontSize: 7.5, color: C.mid, align: "center", margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 15 — CARDINALITY REFERENCE TABLE
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "03  ER DIAGRAM — Cardinality & Foreign Key Reference", C.s3, pageNum++);
  addTitle(s, "FK & Cardinality Reference", "Complete list of all foreign key relationships and their cardinality");

  const hdrRow = [
    { text: "From Entity",    options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10 } },
    { text: "To Entity",      options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10 } },
    { text: "FK Field",       options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10 } },
    { text: "Cardinality",    options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, align: "center" } },
    { text: "Notes",          options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10 } },
  ];

  const relRows = [
    ["Bridge",               "Restriction",            "bridge_ID",          "1 : N", "A bridge can have many active restrictions"],
    ["Bridge",               "InspectionRecord",       "bridge_ID",          "1 : N", "AS 5100 formal inspections per bridge"],
    ["Bridge",               "InspectionOrder",        "bridge_ID",          "1 : N", "One work order per inspection event"],
    ["Bridge",               "BridgeDefect",           "bridge_ID",          "1 : N", "Defects raised during inspections"],
    ["Bridge",               "BridgeAttribute",        "bridge_ID",          "1 : N", "Dynamic custom attribute values"],
    ["Bridge",               "BridgeExternalRef",      "bridge_ID",          "1 : N", "BANC / RMS / VicRoads cross-references"],
    ["Bridge",               "BridgeConditionHistory", "bridge_ID",          "1 : N", "Immutable condition change audit trail"],
    ["InspectionOrder",      "MeasurementDocument",    "inspectionOrder_ID", "1 : N", "Element-level structural measurements"],
    ["InspectionOrder",      "InspectionRecord",       "inspectionOrder_ID", "1 : 1", "Completed order produces one record"],
    ["AttributeDefinition",  "BridgeAttribute",        "attributeDef_ID",    "1 : N", "Schema definition → per-bridge values"],
    ["Restriction",          "RestrictionChangeLog",   "restriction_ID",     "1 : N", "Lifecycle events (enable/disable/extend)"],
    ["Route",                "Restriction",            "route_ID",           "1 : N", "Route-level restrictions (optional FK)"],
    ["VehicleClass",         "Permit",                 "vehicleClass_ID",    "1 : N", "Permits issued per vehicle class"],
    ["Lookup",               "BridgeAttribute (value)","category / code",    "1 : N", "Provides valid values for LOOKUP-type attrs"],
    ["AuditLog",             "(any entity)",           "entityId",           "poly",  "Polymorphic: entityType discriminates the target"],
  ];

  const tableData = [
    hdrRow,
    ...relRows.map((row, ri) => row.map((cell, ci) => ({
      text: cell,
      options: {
        fontSize: 9.5,
        color: ci === 3 ? C.s1 : C.dark,
        bold: ci === 3,
        fill: { color: ri % 2 === 0 ? C.white : "EDF1FA" },
        align: ci === 3 ? "center" : "left"
      }
    })))
  ];

  s.addTable(tableData, {
    x: 0.4, y: 1.45, w: W - 0.8, h: 5.55,
    colW: [2.3, 2.3, 2.1, 1.1, 4.7],
    border: { pt: 0.5, color: C.silver },
    rowH: 0.345
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 16 — TECH STACK & DEPLOYMENT OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  addSectionBanner(s, "APPENDIX — Technology Stack & Deployment Architecture", C.navy, pageNum++);
  addTitle(s, "Technology Stack", "SAP BTP Cloud Foundry — three-tier architecture");

  const layers = [
    {
      label: "FRONTEND (App Router)", color: C.s1,
      items: ["SAP UI5 v1.120+ Freestyle — XML Views + JS Controllers (MVC)", "19 screens · Leaflet.js maps · OSRM/Valhalla routing", "XSUAA JWT authentication · Role-based UI via RoleManager.js", "Deployed to SAP BTP CF — nhvr-bridge-app-router (256 MB)"]
    },
    {
      label: "BACKEND (CAP Node.js)", color: C.orange,
      items: ["SAP CAP @sap/cds v9 — OData V4 service at /bridge-management/", "30+ custom actions · BEFORE/AFTER validation hooks · AuditLog writes", "@sap/xssec v4 + passport — JWT validation per @requires scope", "Deployed to SAP BTP CF — nhvr-bridge-srv (512 MB / 1 GB disk)"]
    },
    {
      label: "DATABASE (SAP HANA Cloud)", color: C.green,
      items: ["HANA Cloud HDI container — nhvr-db (hdi-shared plan)", "2,126 bridge records + 15 seed data CSV files", "@cap-js/hana v2 + @sap/hana-client v2 (CDS v9 requirement)", "DB Deployer — nhvr-bridge-db-deployer (stops after deploy, normal)"]
    },
    {
      label: "BTP SERVICES", color: "7B3FA0",
      items: ["nhvr-xsuaa — Authentication & JWT issuance", "nhvr-destination — srv-api service destination binding", "nhvr-logging — Application log streaming", "CI/CD: GitHub Actions → mbt build → cf deploy (Node.js 24)"]
    }
  ];

  layers.forEach((l, i) => {
    const x = 0.4 + (i % 2) * 6.3;
    const y = 1.5 + Math.floor(i / 2) * 2.9;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 6.1, h: 2.65,
      fill: { color: C.white }, line: { color: C.silver, width: 0.75 },
      shadow: { type: "outer", blur: 5, offset: 2, angle: 135, color: "000000", opacity: 0.08 }
    });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 6.1, h: 0.34, fill: { color: l.color }, line: { color: l.color } });
    s.addText(l.label, { x: x + 0.1, y, w: 5.9, h: 0.34, fontSize: 10, bold: true, color: C.white, valign: "middle", margin: 0 });
    const textItems = l.items.map((item, ii) => ({
      text: item,
      options: { bullet: true, breakLine: ii < l.items.length - 1, fontSize: 9.5, color: "333333", paraSpaceAfter: 3 }
    }));
    s.addText(textItems, { x: x + 0.15, y: y + 0.4, w: 5.8, h: 2.15, valign: "top", margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 17 — CLOSING
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.orange }, line: { color: C.orange } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: H - 0.12, w: W, h: 0.12, fill: { color: C.blue }, line: { color: C.blue } });

  s.addShape(pres.shapes.OVAL, { x: 8.5, y: 0.5, w: 4.5, h: 4.5, fill: { color: "FFFFFF", transparency: 94 }, line: { color: "FFFFFF", transparency: 94 } });
  s.addShape(pres.shapes.OVAL, { x: -0.5, y: 3.5, w: 3, h: 3, fill: { color: "FFFFFF", transparency: 92 }, line: { color: "FFFFFF", transparency: 92 } });

  s.addText("Document Summary", { x: 1.0, y: 1.4, w: 8, h: 0.6, fontSize: 28, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 1.0, y: 2.1, w: 5, h: 0, line: { color: C.orange, width: 2 } });

  const summary = [
    { icon: "01", label: "Screen Flow", val: "19 screens · 6 role profiles · Full nav graph" },
    { icon: "02", label: "Data Model",  val: "18 entities · 100+ fields · 6 enumeration types" },
    { icon: "03", label: "ER Diagram",  val: "15 FK relationships · Cardinality reference table" },
  ];
  summary.forEach((item, i) => {
    const y = 2.4 + i * 1.05;
    s.addShape(pres.shapes.RECTANGLE, { x: 1.0, y, w: 0.7, h: 0.7, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(item.icon, { x: 1.0, y, w: 0.7, h: 0.7, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s.addText(item.label, { x: 1.85, y: y + 0.04, w: 4, h: 0.32, fontSize: 14, bold: true, color: C.white, margin: 0 });
    s.addText(item.val,   { x: 1.85, y: y + 0.36, w: 9, h: 0.28, fontSize: 11, color: C.mid, margin: 0 });
  });

  s.addText("NHVR Bridge Asset & Restriction Management System  |  v3.2.1", {
    x: 1.0, y: 5.7, w: 10, h: 0.35, fontSize: 12, color: C.mid, margin: 0
  });
  s.addText("NHVR Internal — Confidential  |  Architecture & Engineering Team", {
    x: 1.0, y: 6.1, w: 10, h: 0.28, fontSize: 10, color: C.mid, margin: 0
  });
  s.addText(String(pageNum++), { x: W - 0.7, y: H - 0.38, w: 0.4, h: 0.28, fontSize: 8, color: C.mid, align: "right", margin: 0 });
}

// ── Write file ─────────────────────────────────────────────────────────────────
const outPath = "/Users/siddharthaampolu/21 NHVR APP/docs/NHVR_Technical_Architecture_v3.2.1.pptx";
pres.writeFile({ fileName: outPath })
  .then(() => console.log("✅ PPTX written to:", outPath))
  .catch(err => { console.error("❌ Error:", err); process.exit(1); });
