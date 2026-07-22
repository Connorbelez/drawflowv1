import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "src/components/ui/html");

const components = [
  "accordion",
  "alert-dialog",
  "alert",
  "aspect-ratio",
  "autocomplete",
  "avatar",
  "badge",
  "breadcrumb",
  "button-group",
  "button",
  "calendar",
  "card",
  "carousel",
  "chart",
  "checkbox",
  "checkbox-group",
  "collapsible",
  "combobox",
  "command",
  "context-menu",
  "dialog",
  "direction-aware-tabs",
  "direction",
  "drawer",
  "dropdown-menu",
  "empty",
  "field",
  "fieldset",
  "file-uploader",
  "form",
  "frame",
  "group",
  "hover-card",
  "inline-edit",
  "input-group",
  "input-otp",
  "input",
  "intro-disclosure",
  "ipad",
  "iphone",
  "item",
  "kbd",
  "label",
  "menu",
  "menubar",
  "meter",
  "native-select",
  "navigation-menu",
  "number-field",
  "otp-field",
  "pagination",
  "popover",
  "preview-card",
  "progress",
  "radio-group",
  "resizable",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "sidebar",
  "safari",
  "skeleton",
  "slider",
  "sonner",
  "sortable-list",
  "sortableMileStoneList",
  "spinner",
  "switch",
  "table",
  "tabs",
  "textarea",
  "toast",
  "toggle-group",
  "toggle",
  "toolbar",
  "tooltip",
];

const titles = Object.fromEntries(
  components.map((name) => [
    name,
    name
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  ])
);

const icon = {
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  command: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3Z"/></svg>`,
  ellipsis: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12h.01M19 12h.01M5 12h.01"/></svg>`,
  file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M20 16.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.5"/></svg>`,
};

function page(name, body, description = "", assetsPrefix = "../assets") {
  const title = titles[name] ?? name;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} HTML Snippet</title>
    <link rel="stylesheet" href="${assetsPrefix}/ui.css" />
    <script defer src="${assetsPrefix}/ui.js"></script>
  </head>
  <body>
    <main class="snippet-shell" data-component="${name}">
      <header class="snippet-header">
        <span class="snippet-eyebrow">DrawFlow UI HTML</span>
        <h1>${title}</h1>
        ${description ? `<p>${description}</p>` : ""}
      </header>
      <section class="snippet-stage" aria-label="${title} preview">
${indent(body, 8)}
      </section>
    </main>
  </body>
</html>
`;
}

function indent(value, spaces) {
  const pad = " ".repeat(spaces);
  return value
    .trim()
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

function dialogMarkup(kind = "dialog") {
  const danger = kind === "alert-dialog";
  return `<div class="df-stack">
  <button class="df-button df-button-default" data-dialog-open="${kind}">${danger ? "Delete draw package" : "Open dialog"}</button>
  <div class="df-overlay" data-dialog="${kind}" hidden>
    <section class="df-dialog" role="dialog" aria-modal="true" aria-labelledby="${kind}-title">
      <button class="df-icon-button df-dialog-close" data-dialog-close="${kind}" aria-label="Close">${icon.close}</button>
      <div class="df-dialog-icon">${danger ? icon.alert : icon.file}</div>
      <h2 id="${kind}-title">${danger ? "Release cannot be undone" : "Evidence package ready"}</h2>
      <p>${danger ? "This removes the pending package and writes an audit event for lender review." : "The borrower uploaded required invoices, photos, and lien waivers for this milestone."}</p>
      <footer class="df-dialog-actions">
        <button class="df-button df-button-outline" data-dialog-close="${kind}">Cancel</button>
        <button class="df-button ${danger ? "df-button-destructive" : "df-button-default"}">${danger ? "Delete package" : "Approve package"}</button>
      </footer>
    </section>
  </div>
</div>`;
}

function menuMarkup(type = "dropdown") {
  return `<div class="df-menu-demo">
  <button class="df-button df-button-outline" data-menu-trigger="${type}">Milestone actions ${icon.chevronDown}</button>
  <div class="df-menu" data-menu="${type}" hidden>
    <button class="df-menu-item">${icon.file}<span>Open evidence</span><kbd>⌘O</kbd></button>
    <button class="df-menu-item"><span class="df-dot success"></span><span>Mark ready</span></button>
    <button class="df-menu-item" data-checked="true">${icon.check}<span>Require site visit</span></button>
    <div class="df-menu-separator"></div>
    <button class="df-menu-item danger">${icon.alert}<span>Escalate variance</span></button>
  </div>
</div>`;
}

const calendar = `<div class="df-calendar">
  <header><button class="df-icon-button" aria-label="Previous month">‹</button><strong>May 2026</strong><button class="df-icon-button" aria-label="Next month">›</button></header>
  <div class="df-calendar-grid weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
  <div class="df-calendar-grid days">${Array.from({ length: 35 }, (_, i) => {
    const day = i - 3;
    const cls =
      day === 13
        ? "selected"
        : day < 1 || day > 31
          ? "muted"
          : day === 20
            ? "range"
            : "";
    return `<button class="${cls}">${day < 1 ? 27 + i : day > 31 ? day - 31 : day}</button>`;
  }).join("")}</div>
</div>`;

function tableMarkup() {
  return `<div class="df-table-wrap">
  <table class="df-table">
    <thead><tr><th>Milestone</th><th>Budget</th><th>Status</th><th class="text-right">Progress</th></tr></thead>
    <tbody>
      <tr><td>Foundation inspection</td><td>$42,000</td><td><span class="df-badge success">Approved</span></td><td class="text-right">100%</td></tr>
      <tr><td>Framing package</td><td>$86,400</td><td><span class="df-badge warning">Review</span></td><td class="text-right">72%</td></tr>
      <tr><td>MEP rough-in</td><td>$58,900</td><td><span class="df-badge secondary">Pending</span></td><td class="text-right">28%</td></tr>
    </tbody>
  </table>
</div>`;
}

function tabsMarkup() {
  return `<div class="df-tabs" data-tabs>
  <div class="df-tabs-list" role="tablist">
    <button class="active" data-tab="roadmap">Roadmap</button>
    <button data-tab="evidence">Evidence</button>
    <button data-tab="draws">Draws</button>
  </div>
  <div class="df-tab-panel active" data-tab-panel="roadmap">Critical path milestones are grouped into two reimbursement draws.</div>
  <div class="df-tab-panel" data-tab-panel="evidence">Five invoices and eleven site photos are ready for lender review.</div>
  <div class="df-tab-panel" data-tab-panel="draws">Draw 03 is blocked by a site visit override.</div>
</div>`;
}

const formGroup = `<div class="df-form-grid">
  <label class="df-label" for="amount">Requested amount</label>
  <input id="amount" class="df-input" value="$86,400" />
  <p class="df-help">Must remain within borrower working capital limit.</p>
  <label class="df-label" for="notes">Reviewer notes</label>
  <textarea id="notes" class="df-textarea">Framing photos verified. Awaiting lien waiver.</textarea>
</div>`;

const sortableItems = `<div class="df-sortable" data-sortable>
  ${["Permits posted", "Foundation complete", "Framing inspection", "MEP rough-in"].map((item, index) => `<article class="df-sort-item" draggable="true"><span class="df-grip">⋮⋮</span><div><strong>${item}</strong><small>Milestone ${index + 1}</small></div><span class="df-badge secondary">${index === 2 ? "Review" : "Ready"}</span></article>`).join("\n  ")}
</div>`;

const milestoneSortable = `<div class="df-sortable milestone" data-sortable>
  ${["Draw 01 · Sitework", "Draw 02 · Foundation", "Draw 03 · Framing", "Draw 04 · Finishes"].map((item, index) => `<article class="df-sort-item" draggable="true"><span class="df-grip">⋮⋮</span><div><strong>${item}</strong><small>${index === 2 ? "Blocked by site visit" : "Dependencies clear"}</small></div><div class="df-progress mini"><span style="width:${[100, 100, 68, 12][index]}%"></span></div></article>`).join("\n  ")}
</div>`;

function componentBody(name) {
  switch (name) {
    case "accordion":
      return `<div class="df-accordion" data-accordion>
  ${["Budget version", "Evidence rules", "Release authority"].map((item, i) => `<article class="df-accordion-item" ${i === 0 ? "data-open" : ""}><button>${item}${icon.chevronDown}</button><div><p>${["Budget revisions are versioned and never overwrite the approved baseline.", "Geofence failure marks evidence location-unverified while preserving uploads.", "Lender admins retain final draw-release authority."][i]}</p></div></article>`).join("\n  ")}
</div>`;
    case "alert-dialog":
      return dialogMarkup("alert-dialog");
    case "alert":
      return `<div class="df-alert">${icon.alert}<div><h3>Working capital warning</h3><p>This draw grouping exceeds the borrower working capital limit by $12,400.</p></div></div>`;
    case "aspect-ratio":
      return `<div class="df-aspect"><div><strong>16:9 site photo</strong><span>Framing bay · geofence verified</span></div></div>`;
    case "autocomplete":
      return `<div class="df-autocomplete" data-autocomplete>
  <label class="df-label" for="autocomplete-build">Assign reviewer</label>
  <input id="autocomplete-build" class="df-input" value="Ari Lender" aria-controls="autocomplete-options" aria-expanded="true" />
  <div class="df-menu static" id="autocomplete-options" role="listbox">
    <button class="df-menu-item" role="option" aria-selected="true">${icon.check}<span>Ari Lender</span><small>Admin</small></button>
    <button class="df-menu-item" role="option"><span class="df-dot success"></span><span>Maya Field</span><small>Inspector</small></button>
    <button class="df-menu-item" role="option"><span class="df-dot warning"></span><span>Noah Risk</span><small>Staff reviewer</small></button>
  </div>
</div>`;
    case "avatar":
      return `<div class="df-avatar-row"><span class="df-avatar"><img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80" alt="Reviewer" /></span><span class="df-avatar fallback">AL</span><span class="df-avatar sm">DF</span></div>`;
    case "badge":
      return `<div class="df-inline">${["Default", "Secondary", "Outline", "Success", "Warning", "Destructive"].map((v) => `<span class="df-badge ${v.toLowerCase()}">${v}</span>`).join("")}</div>`;
    case "breadcrumb":
      return `<nav class="df-breadcrumb" aria-label="Breadcrumb"><a>Builds</a>${icon.chevronRight}<a>Oak Ridge</a>${icon.chevronRight}<span>Draw 03</span></nav>`;
    case "button":
      return `<div class="df-inline">${["default", "outline", "secondary", "ghost", "destructive", "link"].map((v) => `<button class="df-button df-button-${v}">${v}</button>`).join("")}</div>`;
    case "button-group":
      return `<div class="df-button-group"><button>Cheapest feasible</button><button class="active">Fastest</button><button>Capital constrained</button></div>`;
    case "calendar":
      return calendar;
    case "card":
      return `<article class="df-card"><header><p>Draw 03</p><h2>Framing reimbursement</h2></header><p>Evidence review is complete. One site visit report is awaiting admin override.</p><footer><span class="df-badge warning">Admin review</span><strong>$86,400</strong></footer></article>`;
    case "carousel":
      return `<div class="df-carousel" data-carousel><div class="df-carousel-track">${["Foundation", "Framing", "MEP"].map((v, i) => `<article class="df-carousel-slide ${i === 0 ? "active" : ""}"><strong>${v}</strong><span>Evidence package ${i + 1}</span></article>`).join("")}</div><button class="df-icon-button" data-carousel-prev>‹</button><button class="df-icon-button" data-carousel-next>›</button></div>`;
    case "chart":
      return `<div class="df-chart"><div class="bars">${[52, 82, 64, 38, 72].map((v, i) => `<span style="height:${v}%" data-label="D${i + 1}"></span>`).join("")}</div><footer><strong>Draw cost curve</strong><span>Fee + interest exposure</span></footer></div>`;
    case "checkbox":
      return `<label class="df-check"><input type="checkbox" checked /><span>${icon.check}</span>Require lien waiver before release</label>`;
    case "checkbox-group":
      return `<fieldset class="df-checkbox-group">
  <legend>Required evidence</legend>
  ${["Invoice packet", "Site photos", "Lien waiver", "Permit closeout"].map((item, i) => `<label class="df-check"><input type="checkbox" ${i < 2 ? "checked" : ""} /><span>${icon.check}</span>${item}</label>`).join("\n  ")}
</fieldset>`;
    case "collapsible":
      return `<div class="df-collapsible"><button class="df-button df-button-outline" data-collapse="permit">Permit packet ${icon.chevronDown}</button><div data-collapse-panel="permit"><p>3 uploaded files, last reviewed by lender staff.</p></div></div>`;
    case "combobox":
      return `<div class="df-combobox"><input class="df-input" value="Framing inspection" aria-label="Milestone" /><div class="df-menu static"><button class="df-menu-item">Framing inspection</button><button class="df-menu-item">Foundation inspection</button><button class="df-menu-item">MEP rough-in</button></div></div>`;
    case "command":
      return `<div class="df-command"><label>${icon.search}<input placeholder="Search actions..." /></label><div><button>Open draw workspace<kbd>⌘K</kbd></button><button>Schedule site visit<kbd>S</kbd></button><button>Request missing evidence<kbd>R</kbd></button></div></div>`;
    case "context-menu":
      return `<div class="df-context-target" data-context-target>Right click milestone card<div class="df-menu context" data-context-menu hidden><button class="df-menu-item">Open</button><button class="df-menu-item">Duplicate</button><button class="df-menu-item danger">Archive</button></div></div>`;
    case "dialog":
      return dialogMarkup("dialog");
    case "direction-aware-tabs":
      return tabsMarkup(name);
    case "direction":
      return `<div class="df-direction" dir="rtl"><span>RTL</span><p>Draw release controls mirror correctly when direction changes.</p></div>`;
    case "drawer":
      return `<div><button class="df-button df-button-default" data-drawer-open>Open drawer</button><aside class="df-drawer" data-drawer><button class="df-icon-button" data-drawer-close>${icon.close}</button><h2>Draw summary</h2><p>Review budget, evidence, and admin approval state before release.</p>${tableMarkup()}</aside></div>`;
    case "dropdown-menu":
      return menuMarkup("dropdown");
    case "empty":
      return `<div class="df-empty">${icon.file}<h2>No site visits scheduled</h2><p>Create a visit when evidence requires physical verification.</p><button class="df-button df-button-default">Schedule visit</button></div>`;
    case "field":
      return formGroup;
    case "fieldset":
      return `<fieldset class="df-fieldset">
  <legend>Draw release policy</legend>
  <p>Configure the lender checks that must pass before funds can be released.</p>
  ${formGroup}
</fieldset>`;
    case "file-uploader":
      return `<label class="df-upload" data-file-upload>${icon.upload}<strong>Upload evidence</strong><span>Drop invoices, waivers, or site photos here</span><input type="file" multiple /></label><ul class="df-file-list" data-file-list><li>${icon.file}<span>framing-invoice.pdf</span><strong>1.4 MB</strong></li></ul>`;
    case "form":
      return `<form class="df-form" data-form>
  <div class="df-form-grid">
    <label class="df-label" for="form-build">Build name</label>
    <input id="form-build" class="df-input" value="Oak Ridge townhomes" />
    <label class="df-label" for="form-policy">Draw policy</label>
    <select id="form-policy" class="df-native-select"><option>Standard reimbursement</option><option>Admin override required</option></select>
    <label class="df-check"><input type="checkbox" checked /><span>${icon.check}</span>Write audit event on submit</label>
  </div>
  <footer><button class="df-button df-button-outline" type="button">Cancel</button><button class="df-button df-button-default" type="submit">Save policy</button></footer>
</form>`;
    case "frame":
      return `<section class="df-frame">
  <header class="df-frame-header"><h2>Evidence review frame</h2><p>Structural wrapper for related panels.</p></header>
  <article class="df-frame-panel"><strong>Framing package</strong><span class="df-badge warning">Needs admin</span><p>Site visit report is complete. Override reason remains required.</p></article>
  <article class="df-frame-panel compact"><strong>Audit trail</strong><p>6 events recorded for Draw 03.</p></article>
</section>`;
    case "group":
      return `<div class="df-group" role="group" aria-label="Draw view controls">
  <button class="df-button df-button-outline">Roadmap</button>
  <span class="df-group-separator"></span>
  <button class="df-button df-button-outline active">Draws</button>
  <span class="df-group-separator"></span>
  <button class="df-button df-button-outline">Evidence</button>
</div>`;
    case "hover-card":
      return `<div class="df-hover-wrap"><button class="df-button df-button-link" data-hover-card>Oak Ridge build</button><article class="df-hover-card" hidden><h3>Oak Ridge build</h3><p>4 active draws, $228k remaining budget, 2 pending admin decisions.</p></article></div>`;
    case "inline-edit":
      return `<div class="df-inline-edit" data-inline-edit>
  <label class="df-label" for="inline-edit-budget">Milestone budget</label>
  <div><input id="inline-edit-budget" class="df-input" value="$86,400" /><button class="df-button df-button-default">Save</button></div>
  <p class="df-help">Budget revisions create a new version and audit event.</p>
</div>`;
    case "input":
      return `<input class="df-input" value="Oak Ridge townhomes" aria-label="Build name" />`;
    case "input-group":
      return `<div class="df-input-group"><span>$</span><input value="86,400" aria-label="Amount" /><button>Verify</button></div>`;
    case "input-otp":
      return `<div class="df-otp" data-otp>${Array.from({ length: 6 }, (_, i) => `<input maxlength="1" inputmode="numeric" value="${i < 3 ? i + 2 : ""}" />`).join("")}</div>`;
    case "intro-disclosure":
      return `<section class="df-intro-disclosure"><button data-collapse="intro"><strong>DrawFlow reimbursement rules</strong>${icon.chevronDown}</button><div data-collapse-panel="intro"><p>Funds release only after work completion, evidence review, and lender admin approval.</p></div></section>`;
    case "ipad":
      return `<div class="df-device df-device-ipad"><div class="df-device-screen"><header><strong>Site visit</strong><span class="df-badge success">Offline draft</span></header><div class="df-device-map">Geofence attempt</div><footer><button class="df-button df-button-default">Capture report</button></footer></div></div>`;
    case "iphone":
      return `<div class="df-device df-device-iphone"><div class="df-device-screen"><header><strong>Evidence</strong></header><div class="df-device-photo">${icon.upload}<span>3 photos queued</span></div><button class="df-button df-button-default">Sync</button></div></div>`;
    case "item":
      return `<div class="df-item"><div>${icon.file}</div><section><h3>Framing invoice packet</h3><p>Uploaded by borrower · location verified</p></section><span class="df-badge success">Ready</span></div>`;
    case "kbd":
      return `<p class="df-kbd-row">Open command menu <kbd class="df-kbd">⌘</kbd><kbd class="df-kbd">K</kbd></p>`;
    case "label":
      return `<label class="df-label" for="label-demo">Borrower working capital limit</label><input id="label-demo" class="df-input" value="$125,000" />`;
    case "menu":
      return menuMarkup("menu");
    case "menubar":
      return `<nav class="df-menubar">${["Build", "Draws", "Evidence", "Admin"].map((v, i) => `<button class="${i === 1 ? "active" : ""}">${v}</button>`).join("")}</nav>`;
    case "meter":
      return `<div class="df-meter-block"><div><span>Borrower working capital used</span><strong>$82k / $125k</strong></div><meter class="df-meter" min="0" max="125" value="82">66%</meter><p>Under limit after draw grouping optimization.</p></div>`;
    case "native-select":
      return `<select class="df-native-select"><option>Cheapest feasible plan</option><option>Fastest plan</option><option>Capital constrained plan</option></select>`;
    case "navigation-menu":
      return `<nav class="df-navigation-menu"><a class="active">Workspace</a><a>Draw plans</a><a>Evidence</a><a>Audit log</a></nav>`;
    case "number-field":
      return `<div class="df-number-field" data-number-field>
  <label class="df-label" for="number-field-draw">Draw fee</label>
  <div><button class="df-icon-button" aria-label="Decrease">−</button><input id="number-field-draw" class="df-input" type="number" value="450" /><button class="df-icon-button" aria-label="Increase">+</button></div>
  <p class="df-help">Lender configurable per released draw.</p>
</div>`;
    case "otp-field":
      return `<div class="df-otp-field"><label class="df-label">Admin release code</label>${componentBody("input-otp")}<p class="df-help">Used for final draw-release authority.</p></div>`;
    case "pagination":
      return `<nav class="df-pagination" aria-label="Pagination"><button>Previous</button><button class="active">1</button><button>2</button><button>3</button><span>…</span><button>8</button><button>Next</button></nav>`;
    case "popover":
      return `<div class="df-popover-demo"><button class="df-button df-button-outline" data-popover-trigger>Policy limit</button><div class="df-popover" data-popover hidden><h3>Lender draw policy limit</h3><p>Maximum reimbursable amount per draw is $95,000.</p></div></div>`;
    case "preview-card":
      return `<article class="df-preview-card">
  <div class="df-preview-media"><span>Draw 03</span></div>
  <section><h3>Framing reimbursement</h3><p>Evidence complete with one admin override pending.</p><span class="df-badge warning">Review</span></section>
</article>`;
    case "progress":
      return `<div class="df-progress-block"><div><span>Evidence completeness</span><strong>72%</strong></div><div class="df-progress"><span style="width:72%"></span></div></div>`;
    case "radio-group":
      return `<fieldset class="df-radio-group"><legend>Plan strategy</legend>${["Cheapest feasible", "Fastest", "Capital constrained"].map((v, i) => `<label><input type="radio" name="strategy" ${i === 0 ? "checked" : ""} /><span></span>${v}</label>`).join("")}</fieldset>`;
    case "resizable":
      return `<div class="df-resizable" data-resizable><section>Milestone rail</section><button aria-label="Resize panel"></button><section>Draw workspace</section></div>`;
    case "scroll-area":
      return `<div class="df-scroll-area">${Array.from({ length: 12 }, (_, i) => `<p>Audit event ${String(i + 1).padStart(2, "0")} · state transition recorded</p>`).join("")}</div>`;
    case "select":
      return `<div class="df-select"><button data-menu-trigger="select">Select status ${icon.chevronDown}</button><div class="df-menu" data-menu="select" hidden><button class="df-menu-item">Ready for admin</button><button class="df-menu-item">Needs evidence</button><button class="df-menu-item">Site visit required</button></div></div>`;
    case "separator":
      return `<div class="df-separator-demo"><span>Budget</span><hr class="df-separator" /><span>Evidence</span><hr class="df-separator vertical" /><span>Approval</span></div>`;
    case "sheet":
      return `<div><button class="df-button df-button-outline" data-sheet-open>Open sheet</button><aside class="df-sheet" data-sheet><button class="df-icon-button" data-sheet-close>${icon.close}</button><h2>Admin approval</h2><p>Approve release after evidence and site visit checks pass.</p><button class="df-button df-button-default">Release funds</button></aside></div>`;
    case "sidebar":
      return `<div class="df-sidebar-layout"><aside class="df-sidebar"><strong>DrawFlow</strong><a class="active">Workspace</a><a>Draws</a><a>Evidence</a><a>Admin</a></aside><section><h2>Build Workspace</h2><p>Canonical roadmap, budget, evidence, and approval context.</p></section></div>`;
    case "safari":
      return `<div class="df-browser-frame"><header><span></span><span></span><span></span><input value="drawflow.local/builds/oak-ridge" aria-label="Address" /></header><main><h2>Build Workspace</h2><p>Roadmap, draw groups, evidence, and approvals in one canonical surface.</p>${componentBody("progress")}</main></div>`;
    case "skeleton":
      return `<div class="df-skeleton-card"><span class="df-skeleton avatar"></span><div><span class="df-skeleton line"></span><span class="df-skeleton line short"></span></div></div>`;
    case "slider":
      return `<label class="df-slider"><span>Working capital utilization</span><input type="range" min="0" max="100" value="64" /></label>`;
    case "sonner":
      return `<div class="df-toast-stack"><article class="df-toast"><strong>Evidence uploaded</strong><p>3 files added to Draw 03.</p></article><article class="df-toast success"><strong>Audit event written</strong><p>Admin override reason captured.</p></article></div>`;
    case "sortable-list":
      return sortableItems;
    case "sortableMileStoneList":
      return milestoneSortable;
    case "spinner":
      return `<div class="df-spinner-wrap"><span class="df-spinner" role="status"></span><span>Optimizing draw plan</span></div>`;
    case "switch":
      return `<label class="df-switch"><input type="checkbox" checked /><span></span>Require site visit before release</label>`;
    case "table":
      return tableMarkup();
    case "tabs":
      return tabsMarkup(name);
    case "textarea":
      return `<textarea class="df-textarea" aria-label="Notes">Borrower submitted updated framing photos from the north elevation.</textarea>`;
    case "toast":
      return componentBody("sonner");
    case "toggle":
      return `<button class="df-toggle active" data-toggle>${icon.check} Geofence required</button>`;
    case "toggle-group":
      return `<div class="df-toggle-group">${["Day", "Week", "Month"].map((v, i) => `<button class="${i === 1 ? "active" : ""}">${v}</button>`).join("")}</div>`;
    case "toolbar":
      return `<div class="df-toolbar" role="toolbar" aria-label="Evidence editor toolbar">
  <div class="df-toolbar-group"><button class="df-icon-button" aria-label="Bold"><strong>B</strong></button><button class="df-icon-button" aria-label="Italic"><em>I</em></button></div>
  <span class="df-toolbar-separator"></span>
  <input class="df-toolbar-input" value="Reviewer note" aria-label="Toolbar input" />
  <button class="df-button df-button-default">Apply</button>
</div>`;
    case "tooltip":
      return `<div class="df-tooltip-demo"><button class="df-icon-button" data-tooltip="Admin approval is required before funds are released.">?</button><span class="df-tooltip" hidden></span></div>`;
    default:
      return `<article class="df-card"><h2>${titles[name]}</h2><p>Standalone HTML implementation matching DrawFlow UI tokens.</p></article>`;
  }
}

const sharedCss = `@font-face {
  font-family: "Oxanium Variable";
  src: url("../../../../../node_modules/@fontsource-variable/oxanium/files/oxanium-latin-wght-normal.woff2") format("woff2");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.841 0.238 128.85);
  --primary-foreground: oklch(0.405 0.101 131.063);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.98 0.01 25);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.705 0.015 286.067);
  --success: oklch(0.58 0.16 145);
  --warning: oklch(0.62 0.14 85);
  --info: oklch(0.54 0.14 240);
  --radius: 0.625rem;
  color-scheme: light;
}

* { box-sizing: border-box; border-color: var(--border); outline-color: color-mix(in oklch, var(--ring), transparent 50%); }
html { min-height: 100%; font-family: "Oxanium Variable", ui-sans-serif, system-ui, sans-serif; }
body { min-height: 100%; margin: 0; background: var(--background); color: var(--foreground); font-size: 14px; -webkit-font-smoothing: antialiased; }
button, input, textarea, select { font: inherit; }
button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
[hidden] { display: none !important; }
.snippet-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: 32px; padding: 32px; background: linear-gradient(180deg, color-mix(in oklch, var(--muted), transparent 50%), var(--background)); }
.snippet-header { align-self: start; position: sticky; top: 32px; }
.snippet-eyebrow { display: inline-flex; margin-bottom: 10px; color: var(--muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.snippet-header h1 { margin: 0; font-size: clamp(28px, 5vw, 56px); line-height: .95; letter-spacing: 0; }
.snippet-header p { max-width: 34ch; color: var(--muted-foreground); line-height: 1.6; }
.snippet-stage { position: relative; min-height: 420px; display: grid; place-items: center; padding: 48px; border: 1px solid var(--border); border-radius: var(--radius); background: color-mix(in oklch, var(--card), transparent 8%); box-shadow: 0 20px 80px oklch(0 0 0 / .06); overflow: hidden; }
.df-stack, .df-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.df-stack { flex-direction: column; align-items: stretch; min-width: min(420px, 100%); }
.df-button { display: inline-flex; height: 1.75rem; align-items: center; justify-content: center; gap: .25rem; border: 1px solid transparent; border-radius: calc(var(--radius) - 2px); padding: 0 .5rem; background: transparent; color: var(--foreground); font-size: .75rem; line-height: 1.625; font-weight: 500; white-space: nowrap; transition: background .16s, border-color .16s, transform .08s, color .16s, box-shadow .16s; }
.df-button:active { transform: translateY(1px); }
.df-button:focus-visible, .df-input:focus, .df-textarea:focus, .df-native-select:focus, .df-toolbar-input:focus { border-color: var(--ring); box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring), transparent 70%); outline: 0; }
.df-button svg { width: .875rem; height: .875rem; }
.df-button-default { background: var(--primary); color: var(--primary-foreground); }
.df-button-default:hover { background: color-mix(in oklch, var(--primary), transparent 20%); }
.df-button-outline { border-color: var(--border); background: var(--background); }
.df-button-outline:hover { background: color-mix(in oklch, var(--input), transparent 50%); }
.df-button-secondary { background: var(--secondary); color: var(--secondary-foreground); }
.df-button-secondary:hover { background: color-mix(in oklch, var(--secondary), transparent 20%); }
.df-button-ghost:hover { background: var(--muted); }
.df-button-destructive { background: color-mix(in oklch, var(--destructive), transparent 90%); color: var(--destructive); }
.df-button-destructive:hover { background: color-mix(in oklch, var(--destructive), transparent 80%); }
.df-button-link { color: var(--primary); text-underline-offset: 4px; }
.df-button-link:hover { text-decoration: underline; }
.df-icon-button { display: inline-grid; width: 1.75rem; height: 1.75rem; place-items: center; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--background); color: var(--foreground); }
.df-card { width: min(420px, 100%); border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--card-foreground); padding: 24px; box-shadow: 0 1px 2px oklch(0 0 0 / .04); }
.df-card header p, .df-card p { color: var(--muted-foreground); }
.df-card h2, .df-card h3 { margin: 0 0 8px; }
.df-card footer { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
.df-badge { display: inline-flex; align-items: center; border: 1px solid transparent; border-radius: 999px; padding: .125rem .5rem; font-size: .6875rem; font-weight: 600; background: var(--primary); color: var(--primary-foreground); }
.df-badge.secondary { background: var(--secondary); color: var(--secondary-foreground); }
.df-badge.outline { border-color: var(--border); background: transparent; color: var(--foreground); }
.df-badge.success { background: color-mix(in oklch, var(--success), transparent 86%); color: color-mix(in oklch, var(--success), black 20%); }
.df-badge.warning { background: color-mix(in oklch, var(--warning), transparent 84%); color: color-mix(in oklch, var(--warning), black 30%); }
.df-badge.destructive { background: color-mix(in oklch, var(--destructive), transparent 88%); color: var(--destructive); }
.df-input, .df-textarea, .df-native-select { width: 100%; border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); background: transparent; color: var(--foreground); font-size: .75rem; transition: border-color .16s, box-shadow .16s; }
.df-input, .df-native-select { height: 2rem; padding: 0 .75rem; }
.df-textarea { min-height: 88px; padding: .5rem .75rem; resize: vertical; }
.df-label { display: inline-flex; align-items: center; gap: .375rem; font-size: .75rem; font-weight: 500; }
.df-help { margin: -6px 0 8px; color: var(--muted-foreground); font-size: .75rem; }
.df-form-grid { width: min(420px, 100%); display: grid; gap: 10px; }
.df-form { width: min(460px, 100%); display: grid; gap: 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 18px; }
.df-form footer { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border); padding-top: 14px; }
.df-fieldset, .df-checkbox-group { width: min(520px, 100%); display: grid; gap: 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 18px; }
.df-fieldset legend, .df-checkbox-group legend { padding: 0 6px; font-weight: 700; }
.df-fieldset > p { margin: 0 0 4px; color: var(--muted-foreground); line-height: 1.5; }
.df-alert { width: min(460px, 100%); display: grid; grid-template-columns: 20px 1fr; gap: 12px; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; color: var(--foreground); }
.df-alert h3 { margin: 0 0 4px; font-size: .875rem; }
.df-alert p { margin: 0; color: var(--muted-foreground); font-size: .75rem; line-height: 1.5; }
.df-accordion { width: min(520px, 100%); border-top: 1px solid var(--border); }
.df-accordion-item { border-bottom: 1px solid var(--border); }
.df-accordion-item > button { width: 100%; display: flex; align-items: center; justify-content: space-between; border: 0; background: transparent; padding: 16px 0; font-weight: 600; }
.df-accordion-item > div { display: none; color: var(--muted-foreground); line-height: 1.55; padding: 0 0 16px; }
.df-accordion-item[data-open] > div { display: block; }
.df-accordion-item[data-open] svg { transform: rotate(180deg); }
.df-overlay { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: oklch(0 0 0 / .35); padding: 24px; }
.df-dialog { position: relative; width: min(440px, 100%); border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); padding: 24px; box-shadow: 0 24px 80px oklch(0 0 0 / .22); }
.df-dialog-close { position: absolute; top: 12px; right: 12px; }
.df-dialog-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 999px; background: var(--muted); margin-bottom: 12px; }
.df-dialog h2 { margin: 0 0 8px; }
.df-dialog p { margin: 0; color: var(--muted-foreground); line-height: 1.55; }
.df-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.df-menu-demo, .df-select, .df-popover-demo, .df-hover-wrap, .df-autocomplete { position: relative; display: inline-block; }
.df-autocomplete { width: min(360px, 100%); display: grid; gap: 8px; }
.df-menu { position: absolute; z-index: 10; top: calc(100% + 6px); left: 0; min-width: 220px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--popover); color: var(--popover-foreground); padding: 4px; box-shadow: 0 12px 36px oklch(0 0 0 / .12); }
.df-menu.static { position: static; margin-top: 6px; box-shadow: none; }
.df-menu.context { top: 60%; left: 50%; }
.df-menu-item { width: 100%; display: grid; grid-template-columns: 16px 1fr auto; align-items: center; gap: 8px; border: 0; border-radius: calc(var(--radius) - 4px); background: transparent; color: inherit; padding: 7px 8px; text-align: left; font-size: .75rem; }
.df-menu-item:hover { background: var(--accent); color: var(--accent-foreground); }
.df-menu-item.danger { color: var(--destructive); }
.df-menu-item small { color: var(--muted-foreground); font-size: .68rem; }
.df-menu-separator { height: 1px; margin: 4px -4px; background: var(--border); }
.df-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted-foreground); }
.df-dot.success { background: var(--success); }
.df-calendar { width: 300px; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; background: var(--card); }
.df-calendar header, .df-progress-block > div:first-child { display: flex; align-items: center; justify-content: space-between; }
.df-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
.df-calendar .weekdays { margin: 12px 0 4px; color: var(--muted-foreground); font-size: .7rem; }
.df-calendar .days button { aspect-ratio: 1; border: 0; border-radius: calc(var(--radius) - 4px); background: transparent; }
.df-calendar .days button:hover, .df-calendar .days .range { background: var(--accent); }
.df-calendar .days .selected { background: var(--primary); color: var(--primary-foreground); }
.df-calendar .days .muted { color: var(--muted-foreground); opacity: .55; }
.df-table-wrap { width: min(620px, 100%); overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
.df-table { width: 100%; border-collapse: collapse; font-size: .75rem; }
.df-table th, .df-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
.df-table th { color: var(--muted-foreground); font-weight: 500; }
.df-table tr:last-child td { border-bottom: 0; }
.text-right { text-align: right !important; }
.df-tabs { width: min(520px, 100%); }
.df-tabs-list, .df-toggle-group, .df-button-group { display: inline-flex; align-items: center; gap: 2px; border-radius: calc(var(--radius) - 2px); background: var(--muted); padding: 3px; }
.df-tabs-list button, .df-toggle-group button, .df-button-group button { border: 0; border-radius: calc(var(--radius) - 4px); background: transparent; padding: 5px 10px; font-size: .75rem; color: var(--muted-foreground); }
.df-tabs-list .active, .df-toggle-group .active, .df-button-group .active { background: var(--background); color: var(--foreground); box-shadow: 0 1px 2px oklch(0 0 0 / .08); }
.df-tab-panel { display: none; margin-top: 12px; border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; color: var(--muted-foreground); }
.df-tab-panel.active { display: block; }
.df-aspect { width: min(560px, 100%); aspect-ratio: 16 / 9; display: grid; place-items: end start; border-radius: var(--radius); padding: 20px; color: white; background: linear-gradient(135deg, oklch(0.32 0.04 260), oklch(0.55 0.14 145)); overflow: hidden; }
.df-aspect div { display: grid; gap: 4px; }
.df-avatar-row { display: flex; align-items: center; gap: 10px; }
.df-avatar { width: 40px; height: 40px; display: grid; place-items: center; overflow: hidden; border-radius: 999px; background: var(--muted); border: 1px solid var(--border); font-size: .75rem; font-weight: 700; }
.df-avatar img { width: 100%; height: 100%; object-fit: cover; }
.df-avatar.sm { width: 32px; height: 32px; }
.df-breadcrumb { display: flex; align-items: center; gap: 8px; color: var(--muted-foreground); font-size: .75rem; }
.df-breadcrumb a { color: inherit; text-decoration: none; }
.df-breadcrumb span { color: var(--foreground); }
.df-carousel { position: relative; width: min(520px, 100%); overflow: hidden; }
.df-carousel-track { display: flex; transition: transform .2s; }
.df-carousel-slide { min-width: 100%; min-height: 220px; display: grid; place-items: center; align-content: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
.df-carousel > button { position: absolute; top: 50%; transform: translateY(-50%); }
.df-carousel > button[data-carousel-prev] { left: 10px; }
.df-carousel > button[data-carousel-next] { right: 10px; }
.df-chart { width: min(520px, 100%); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; background: var(--card); }
.df-chart .bars { height: 220px; display: flex; align-items: end; gap: 12px; border-bottom: 1px solid var(--border); }
.df-chart .bars span { flex: 1; min-width: 28px; border-radius: calc(var(--radius) - 4px) calc(var(--radius) - 4px) 0 0; background: var(--primary); position: relative; }
.df-chart footer { display: flex; justify-content: space-between; margin-top: 12px; color: var(--muted-foreground); }
.df-check, .df-radio-group label, .df-switch, .df-slider { display: flex; align-items: center; gap: 10px; }
.df-check input, .df-radio-group input, .df-switch input { position: absolute; opacity: 0; }
.df-check span { width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid var(--primary); border-radius: 4px; background: var(--primary); color: var(--primary-foreground); }
.df-collapsible [data-collapse-panel] { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; color: var(--muted-foreground); }
.df-command { width: min(520px, 100%); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--popover); }
.df-command label { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); padding: 10px 12px; }
.df-command input { width: 100%; border: 0; outline: 0; background: transparent; }
.df-command button { width: 100%; display: flex; justify-content: space-between; border: 0; background: transparent; padding: 10px 12px; text-align: left; }
.df-command button:hover { background: var(--accent); }
.df-context-target { position: relative; display: grid; width: 280px; height: 160px; place-items: center; border: 1px dashed var(--border); border-radius: var(--radius); color: var(--muted-foreground); }
.df-direction { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; max-width: 360px; }
.df-drawer, .df-sheet { position: absolute; z-index: 15; background: var(--background); border: 1px solid var(--border); box-shadow: 0 20px 60px oklch(0 0 0 / .16); padding: 24px; transition: transform .2s; }
.df-drawer:not(.open), .df-sheet:not(.open) { box-shadow: none; pointer-events: none; }
.df-drawer { inset: auto 0 0; border-radius: var(--radius) var(--radius) 0 0; transform: translateY(100%); }
.df-drawer.open { transform: translateY(0); }
.df-sheet { top: 0; right: 0; width: min(380px, 90vw); height: 100%; transform: translateX(100%); }
.df-sheet.open { transform: translateX(0); }
.df-empty { display: grid; place-items: center; gap: 8px; max-width: 360px; text-align: center; }
.df-empty svg { width: 40px; height: 40px; color: var(--muted-foreground); }
.df-empty h2, .df-empty p { margin: 0; }
.df-empty p { color: var(--muted-foreground); line-height: 1.5; }
.df-upload { width: min(460px, 100%); display: grid; place-items: center; gap: 8px; border: 1px dashed var(--border); border-radius: var(--radius); padding: 36px; color: var(--muted-foreground); text-align: center; }
.df-upload strong { color: var(--foreground); }
.df-upload input { display: none; }
.df-file-list { width: min(460px, 100%); padding: 0; margin: 12px 0 0; list-style: none; }
.df-file-list li { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); padding: 8px 10px; }
.df-hover-card, .df-popover { position: absolute; top: calc(100% + 8px); left: 0; z-index: 10; width: 260px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--popover); padding: 14px; box-shadow: 0 12px 36px oklch(0 0 0 / .12); }
.df-input-group { display: flex; width: min(360px, 100%); border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); overflow: hidden; }
.df-input-group span, .df-input-group button { display: grid; place-items: center; padding: 0 10px; background: var(--muted); border: 0; }
.df-input-group input { min-width: 0; flex: 1; border: 0; padding: 0 10px; height: 2rem; outline: 0; }
.df-inline-edit, .df-number-field, .df-otp-field { width: min(420px, 100%); display: grid; gap: 8px; }
.df-inline-edit > div, .df-number-field > div { display: flex; gap: 8px; align-items: center; }
.df-number-field .df-input { text-align: center; }
.df-otp { display: flex; gap: 8px; }
.df-otp input { width: 38px; height: 42px; border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); text-align: center; font-weight: 700; }
.df-intro-disclosure { width: min(520px, 100%); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.df-intro-disclosure button { width: 100%; display: flex; justify-content: space-between; border: 0; background: transparent; padding: 0; text-align: left; }
.df-intro-disclosure p { color: var(--muted-foreground); line-height: 1.55; }
.df-item { width: min(520px, 100%); display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.df-item > div:first-child { width: 36px; height: 36px; display: grid; place-items: center; border-radius: calc(var(--radius) - 2px); background: var(--muted); }
.df-item h3, .df-item p { margin: 0; }
.df-item p { color: var(--muted-foreground); font-size: .75rem; }
.df-kbd, kbd { display: inline-flex; min-width: 1.5rem; height: 1.5rem; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: calc(var(--radius) - 4px); background: var(--muted); padding: 0 .35rem; font-family: inherit; font-size: .6875rem; }
.df-kbd-row { display: flex; align-items: center; gap: 6px; }
.df-frame { width: min(620px, 100%); display: flex; flex-direction: column; gap: 4px; border-radius: calc(var(--radius) + 8px); background: color-mix(in oklch, var(--muted), transparent 28%); padding: 4px; }
.df-frame-header { padding: 14px 18px 10px; }
.df-frame-header h2, .df-frame-header p { margin: 0; }
.df-frame-header p { margin-top: 3px; color: var(--muted-foreground); font-size: .75rem; }
.df-frame-panel { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); padding: 18px; box-shadow: 0 1px 2px oklch(0 0 0 / .04); }
.df-frame-panel p { grid-column: 1 / -1; margin: 0; color: var(--muted-foreground); line-height: 1.5; }
.df-frame-panel.compact { display: block; padding: 14px 18px; }
.df-group { display: inline-flex; align-items: stretch; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--background); overflow: hidden; }
.df-group .df-button { border: 0; border-radius: 0; }
.df-group .df-button.active { background: var(--accent); color: var(--accent-foreground); }
.df-group-separator { width: 1px; background: var(--border); }
.df-menubar, .df-navigation-menu { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); padding: 4px; background: var(--background); }
.df-menubar button, .df-navigation-menu a { border: 0; border-radius: calc(var(--radius) - 4px); background: transparent; color: var(--muted-foreground); padding: 7px 10px; text-decoration: none; font-size: .75rem; }
.df-menubar .active, .df-navigation-menu .active { background: var(--accent); color: var(--accent-foreground); }
.df-pagination { display: flex; align-items: center; gap: 4px; }
.df-pagination button { min-width: 32px; height: 32px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: transparent; }
.df-pagination .active { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }
.df-progress-block { width: min(420px, 100%); display: grid; gap: 8px; }
.df-progress { height: 8px; overflow: hidden; border-radius: 999px; background: var(--secondary); }
.df-progress span { display: block; height: 100%; border-radius: inherit; background: var(--primary); }
.df-progress.mini { width: 96px; height: 6px; }
.df-meter-block { width: min(420px, 100%); display: grid; gap: 8px; }
.df-meter-block > div { display: flex; justify-content: space-between; gap: 16px; }
.df-meter-block span, .df-meter-block p { color: var(--muted-foreground); }
.df-meter-block p { margin: 0; font-size: .75rem; }
.df-meter { width: 100%; height: 12px; accent-color: var(--primary); }
.df-preview-card { width: min(360px, 100%); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: 0 1px 2px oklch(0 0 0 / .04); }
.df-preview-media { min-height: 150px; display: grid; place-items: end start; padding: 16px; color: var(--primary-foreground); background: linear-gradient(135deg, color-mix(in oklch, var(--primary), black 8%), oklch(0.5 0.12 230)); }
.df-preview-media span { border-radius: 999px; background: oklch(0 0 0 / .24); padding: 4px 8px; font-size: .7rem; }
.df-preview-card section { display: grid; gap: 8px; padding: 16px; }
.df-preview-card h3, .df-preview-card p { margin: 0; }
.df-preview-card p { color: var(--muted-foreground); line-height: 1.45; }
.df-radio-group { display: grid; gap: 10px; border: 0; }
.df-radio-group legend { margin-bottom: 4px; font-weight: 700; }
.df-radio-group label span { width: 18px; height: 18px; border: 1px solid var(--input); border-radius: 999px; }
.df-radio-group input:checked + span { border: 5px solid var(--primary); }
.df-resizable { width: min(640px, 100%); height: 260px; display: grid; grid-template-columns: 200px 8px 1fr; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.df-resizable section { display: grid; place-items: center; padding: 20px; }
.df-resizable section:first-child { background: var(--muted); }
.df-resizable > button { border: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: repeating-linear-gradient(0deg, var(--border) 0 2px, transparent 2px 6px); }
.df-scroll-area { width: min(420px, 100%); max-height: 240px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
.df-scroll-area p { margin: 0; padding: 10px 0; border-bottom: 1px solid var(--border); color: var(--muted-foreground); }
.df-separator-demo { display: flex; align-items: center; gap: 12px; color: var(--muted-foreground); }
.df-separator { width: 80px; border: 0; border-top: 1px solid var(--border); }
.df-separator.vertical { width: 1px; height: 28px; border-top: 0; border-left: 1px solid var(--border); }
.df-sidebar-layout { width: min(720px, 100%); min-height: 360px; display: grid; grid-template-columns: 220px 1fr; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.df-sidebar { display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); background: var(--muted); padding: 14px; }
.df-sidebar strong { margin-bottom: 10px; }
.df-sidebar a { border-radius: calc(var(--radius) - 4px); padding: 8px 10px; color: var(--muted-foreground); text-decoration: none; }
.df-sidebar a.active { background: var(--background); color: var(--foreground); }
.df-sidebar-layout section { padding: 24px; }
.df-device { background: var(--foreground); padding: 10px; box-shadow: 0 18px 60px oklch(0 0 0 / .18); }
.df-device-ipad { width: min(520px, 100%); border-radius: 28px; }
.df-device-iphone { width: 236px; border-radius: 34px; }
.df-device-screen { min-height: 330px; display: grid; align-content: space-between; gap: 16px; border-radius: 20px; background: var(--background); padding: 18px; overflow: hidden; }
.df-device-iphone .df-device-screen { min-height: 430px; border-radius: 26px; }
.df-device-screen header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.df-device-map, .df-device-photo { min-height: 180px; display: grid; place-items: center; align-content: center; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius); background: radial-gradient(circle at 30% 20%, color-mix(in oklch, var(--primary), transparent 78%), transparent 30%), var(--muted); color: var(--muted-foreground); }
.df-device-photo svg { width: 32px; height: 32px; }
.df-browser-frame { width: min(680px, 100%); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: 0 1px 2px oklch(0 0 0 / .04); }
.df-browser-frame header { display: grid; grid-template-columns: 10px 10px 10px 1fr; gap: 8px; align-items: center; border-bottom: 1px solid var(--border); background: var(--muted); padding: 10px; }
.df-browser-frame header span { width: 10px; height: 10px; border-radius: 999px; background: var(--muted-foreground); opacity: .55; }
.df-browser-frame header input { min-width: 0; border: 1px solid var(--border); border-radius: 999px; background: var(--background); padding: 5px 10px; color: var(--muted-foreground); font-size: .7rem; }
.df-browser-frame main { display: grid; gap: 12px; padding: 20px; }
.df-browser-frame h2, .df-browser-frame p { margin: 0; }
.df-browser-frame p { color: var(--muted-foreground); }
.df-skeleton-card { display: grid; grid-template-columns: 40px 200px; gap: 12px; align-items: center; }
.df-skeleton { display: block; border-radius: var(--radius); background: linear-gradient(90deg, var(--muted), color-mix(in oklch, var(--muted), white 55%), var(--muted)); background-size: 220% 100%; animation: shimmer 1.4s infinite; }
.df-skeleton.avatar { width: 40px; height: 40px; border-radius: 999px; }
.df-skeleton.line { width: 200px; height: 14px; margin: 6px 0; }
.df-skeleton.line.short { width: 132px; }
.df-slider { width: min(420px, 100%); flex-direction: column; align-items: stretch; }
.df-slider input { accent-color: var(--primary); }
.df-toast-stack { position: absolute; right: 24px; bottom: 24px; display: grid; gap: 10px; }
.df-toast { width: 320px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); padding: 14px; box-shadow: 0 12px 36px oklch(0 0 0 / .12); }
.df-toast p { margin: 4px 0 0; color: var(--muted-foreground); }
.df-toast.success { border-color: color-mix(in oklch, var(--success), transparent 55%); }
.df-sortable { width: min(560px, 100%); display: grid; gap: 8px; }
.df-sort-item { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 10px; }
.df-sort-item small { display: block; margin-top: 2px; color: var(--muted-foreground); }
.df-grip { color: var(--muted-foreground); cursor: grab; }
.df-spinner-wrap { display: flex; align-items: center; gap: 10px; color: var(--muted-foreground); }
.df-spinner { width: 20px; height: 20px; border: 2px solid var(--muted); border-top-color: var(--primary); border-radius: 999px; animation: spin .7s linear infinite; }
.df-switch span { width: 36px; height: 20px; border-radius: 999px; background: var(--input); padding: 2px; transition: background .16s; }
.df-switch span::before { content: ""; display: block; width: 16px; height: 16px; border-radius: 999px; background: var(--background); transition: transform .16s; box-shadow: 0 1px 2px oklch(0 0 0 / .18); }
.df-switch input:checked + span { background: var(--primary); }
.df-switch input:checked + span::before { transform: translateX(16px); }
.df-toggle { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: transparent; padding: 6px 10px; }
.df-toggle.active { background: var(--accent); color: var(--accent-foreground); }
.df-toolbar { width: min(620px, 100%); display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 6px; }
.df-toolbar-group { display: flex; align-items: center; gap: 4px; }
.df-toolbar-separator { align-self: stretch; width: 1px; background: var(--border); }
.df-toolbar-input { min-width: 0; flex: 1; height: 1.75rem; border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); background: transparent; padding: 0 .5rem; color: var(--foreground); font-size: .75rem; }
.df-tooltip-demo { position: relative; }
.df-tooltip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 220px; border-radius: calc(var(--radius) - 2px); background: var(--foreground); color: var(--background); padding: 8px 10px; font-size: .75rem; text-align: center; }
@keyframes shimmer { to { background-position: -220% 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .snippet-shell { grid-template-columns: 1fr; padding: 18px; } .snippet-header { position: static; } .snippet-stage { padding: 24px; min-height: 360px; } .df-sidebar-layout { grid-template-columns: 1fr; } .df-sidebar { border-right: 0; border-bottom: 1px solid var(--border); } }
`;

const sharedJs = `function closestScope(node) {
  return node.closest("[data-ui-scope], .df-menu-demo, .df-select, .df-popover-demo, .df-collapsible, .df-intro-disclosure, .snippet-stage, .mockup-page") || document;
}

function scopedQuery(trigger, selector) {
  const scope = closestScope(trigger);
  return scope.querySelector(selector) || document.querySelector(selector);
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-menu-trigger]");
  if (trigger) {
    const id = trigger.dataset.menuTrigger;
    const menu = scopedQuery(trigger, \`[data-menu="\${id}"]\`);
    if (menu) menu.hidden = !menu.hidden;
  }

  const popoverTrigger = event.target.closest("[data-popover-trigger]");
  if (popoverTrigger) {
    const popover = scopedQuery(popoverTrigger, "[data-popover]");
    if (popover) popover.hidden = !popover.hidden;
  }

  const openDialog = event.target.closest("[data-dialog-open]");
  if (openDialog) {
    const dialog = scopedQuery(openDialog, \`[data-dialog="\${openDialog.dataset.dialogOpen}"]\`);
    if (dialog) dialog.hidden = false;
  }

  const closeDialog = event.target.closest("[data-dialog-close]");
  if (closeDialog) {
    const dialog = scopedQuery(closeDialog, \`[data-dialog="\${closeDialog.dataset.dialogClose}"]\`);
    if (dialog) dialog.hidden = true;
  }

  const collapse = event.target.closest("[data-collapse]");
  if (collapse) {
    const panel = scopedQuery(collapse, \`[data-collapse-panel="\${collapse.dataset.collapse}"]\`);
    if (panel) panel.hidden = !panel.hidden;
  }

  const tab = event.target.closest("[data-tab]");
  if (tab) {
    const root = tab.closest("[data-tabs]");
    root.querySelectorAll("[data-tab]").forEach((node) => node.classList.toggle("active", node === tab));
    root.querySelectorAll("[data-tab-panel]").forEach((node) => node.classList.toggle("active", node.dataset.tabPanel === tab.dataset.tab));
  }

  const drawerOpen = event.target.closest("[data-drawer-open]");
  if (drawerOpen) scopedQuery(drawerOpen, "[data-drawer]")?.classList.add("open");
  const drawerClose = event.target.closest("[data-drawer-close]");
  if (drawerClose) scopedQuery(drawerClose, "[data-drawer]")?.classList.remove("open");
  const sheetOpen = event.target.closest("[data-sheet-open]");
  if (sheetOpen) scopedQuery(sheetOpen, "[data-sheet]")?.classList.add("open");
  const sheetClose = event.target.closest("[data-sheet-close]");
  if (sheetClose) scopedQuery(sheetClose, "[data-sheet]")?.classList.remove("open");
});

document.addEventListener("mouseover", (event) => {
  const tip = event.target.closest("[data-tooltip]");
  if (tip) {
    const node = scopedQuery(tip, ".df-tooltip");
    node.textContent = tip.dataset.tooltip;
    node.hidden = false;
  }
  const hover = event.target.closest("[data-hover-card]");
  if (hover) hover.parentElement.querySelector(".df-hover-card").hidden = false;
});

document.addEventListener("mouseout", (event) => {
  const tip = event.target.closest("[data-tooltip]");
  if (tip) scopedQuery(tip, ".df-tooltip").hidden = true;
  const hover = event.target.closest("[data-hover-card]");
  if (hover) hover.parentElement.querySelector(".df-hover-card").hidden = true;
});

document.addEventListener("contextmenu", (event) => {
  const target = event.target.closest("[data-context-target]");
  if (!target) return;
  event.preventDefault();
  const menu = target.querySelector("[data-context-menu]");
  menu.hidden = false;
  menu.style.left = event.offsetX + "px";
  menu.style.top = event.offsetY + "px";
});

document.querySelectorAll("[data-accordion] .df-accordion-item > button").forEach((button) => {
  button.addEventListener("click", () => button.parentElement.toggleAttribute("data-open"));
});

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const track = carousel.querySelector(".df-carousel-track");
  const slides = carousel.querySelectorAll(".df-carousel-slide");
  let index = 0;
  const render = () => { track.style.transform = \`translateX(-\${index * 100}%)\`; };
  carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => { index = (index + slides.length - 1) % slides.length; render(); });
  carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => { index = (index + 1) % slides.length; render(); });
});

document.querySelectorAll("[data-sortable]").forEach((list) => {
  let dragged;
  list.addEventListener("dragstart", (event) => { dragged = event.target.closest(".df-sort-item"); });
  list.addEventListener("dragover", (event) => event.preventDefault());
  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target.closest(".df-sort-item");
    if (dragged && target && dragged !== target) target.before(dragged);
  });
});

document.querySelectorAll("[data-otp] input").forEach((input, index, inputs) => {
  input.addEventListener("input", () => {
    if (input.value && inputs[index + 1]) inputs[index + 1].focus();
  });
});
`;

const indexPage = page(
  "html-snippets",
  `<div class="df-card" style="width:min(760px,100%)">
  <h2>HTML snippet index</h2>
  <p>Composable HTML fragments, preview pages, and high-resolution mockups for src/components/ui.</p>
  <div class="snippet-index">
    <a href="./mockups/admin-dashboard.html">Admin Dashboard Mockup</a>
    ${components.map((name) => `<a href="./previews/${name}/">${titles[name]} Preview</a>`).join("\n    ")}
  </div>
</div>`,
  "Use assets/ui.css and assets/ui.js for composed mockups; snippets/*.html contains raw component fragments.",
  "./assets"
);

const indexCss = `.snippet-index { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 18px; }
.snippet-index a { display: block; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); padding: 8px 10px; color: var(--foreground); text-decoration: none; }
.snippet-index a:hover { background: var(--accent); }
`;

const mockupCss = `.mockup-page { min-height: 100vh; background: var(--background); color: var(--foreground); }
.mockup-admin { min-height: 100vh; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: color-mix(in oklch, var(--muted), transparent 70%); }
.mockup-admin-sidebar { display: flex; flex-direction: column; gap: 8px; border-right: 1px solid var(--border); background: var(--background); padding: 18px; }
.mockup-admin-brand { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.mockup-admin-brand strong { font-size: 1rem; }
.mockup-admin-nav { display: grid; gap: 4px; }
.mockup-admin-nav a { display: flex; align-items: center; justify-content: space-between; border-radius: calc(var(--radius) - 2px); padding: 8px 10px; color: var(--muted-foreground); text-decoration: none; font-size: .75rem; }
.mockup-admin-nav a.active, .mockup-admin-nav a:hover { background: var(--accent); color: var(--accent-foreground); }
.mockup-admin-main { position: relative; min-width: 0; overflow: hidden; padding: 18px; }
.mockup-admin-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.mockup-admin-title h1 { margin: 0; font-size: 1.5rem; line-height: 1.1; }
.mockup-admin-title p { margin: 4px 0 0; color: var(--muted-foreground); font-size: .75rem; }
.mockup-admin-actions { display: flex; align-items: center; gap: 8px; }
.mockup-admin-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, .8fr); gap: 16px; align-items: start; }
.mockup-admin-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.mockup-metric { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 14px; }
.mockup-metric span { color: var(--muted-foreground); font-size: .6875rem; text-transform: uppercase; letter-spacing: .08em; }
.mockup-metric strong { display: block; margin-top: 8px; font-size: 1.35rem; line-height: 1; }
.mockup-metric small { display: block; margin-top: 8px; color: var(--muted-foreground); }
.mockup-panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; }
.mockup-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding: 12px 14px; }
.mockup-panel-header h2 { margin: 0; font-size: .9rem; }
.mockup-panel-header p { margin: 3px 0 0; color: var(--muted-foreground); font-size: .72rem; }
.mockup-panel-body { padding: 14px; }
.mockup-kanban { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.mockup-lane { display: grid; gap: 8px; align-content: start; border: 1px solid var(--border); border-radius: var(--radius); background: color-mix(in oklch, var(--muted), transparent 72%); padding: 10px; }
.mockup-lane h3 { display: flex; justify-content: space-between; margin: 0 0 2px; color: var(--muted-foreground); font-size: .72rem; font-weight: 600; }
.mockup-task { display: grid; gap: 8px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--background); padding: 10px; }
.mockup-task strong { font-size: .78rem; }
.mockup-task p { margin: 0; color: var(--muted-foreground); font-size: .7rem; line-height: 1.45; }
.mockup-task-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mockup-side-stack { display: grid; gap: 16px; }
.mockup-audit-list { display: grid; gap: 8px; max-height: 300px; overflow: auto; }
.mockup-audit-item { display: grid; grid-template-columns: 8px 1fr auto; gap: 10px; align-items: start; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.mockup-audit-item::before { content: ""; width: 8px; height: 8px; margin-top: 4px; border-radius: 999px; background: var(--primary); }
.mockup-audit-item strong { display: block; font-size: .75rem; }
.mockup-audit-item span { color: var(--muted-foreground); font-size: .68rem; }
.mockup-release-card { display: grid; gap: 12px; }
.mockup-release-card .df-progress-block { width: 100%; }
@media (max-width: 980px) { .mockup-admin { grid-template-columns: 1fr; } .mockup-admin-sidebar { border-right: 0; border-bottom: 1px solid var(--border); } .mockup-admin-grid, .mockup-kanban, .mockup-admin-metrics { grid-template-columns: 1fr; } .mockup-admin-topbar { align-items: flex-start; flex-direction: column; } }
`;

function htmlDocument({
  title,
  body,
  assetsPrefix = "../assets",
  className = "",
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${assetsPrefix}/ui.css" />
    <script defer src="${assetsPrefix}/ui.js"></script>
  </head>
  <body class="${className}">
${indent(body, 4)}
  </body>
</html>
`;
}

function adminDashboardMockup() {
  return htmlDocument({
    title: "DrawFlow Admin Dashboard Mockup",
    assetsPrefix: "../assets",
    className: "mockup-page",
    body: `<main class="mockup-admin" data-ui-scope>
  <aside class="mockup-admin-sidebar">
    <div class="mockup-admin-brand"><strong>DrawFlow</strong><span class="df-badge success">Admin</span></div>
    <nav class="mockup-admin-nav" aria-label="Admin navigation">
      <a class="active" href="#">Release queue <span>9</span></a>
      <a href="#">Build proposals <span>14</span></a>
      <a href="#">Site visit overrides <span>3</span></a>
      <a href="#">Budget revisions <span>6</span></a>
      <a href="#">Webhook events <span>42</span></a>
    </nav>
    <div class="df-separator-demo" style="margin: 8px 0;"><hr class="df-separator" /></div>
    <label class="df-switch"><input type="checkbox" checked /><span></span>Auto-refresh queue</label>
  </aside>
  <section class="mockup-admin-main">
    <header class="mockup-admin-topbar">
      <div class="mockup-admin-title">
        <h1>Lender admin control plane</h1>
        <p>Final authority for proposal approvals, budget revisions, site-visit overrides, and draw releases.</p>
      </div>
      <div class="mockup-admin-actions">
        <div class="df-popover-demo" data-ui-scope>
          <button class="df-button df-button-outline" data-popover-trigger>Policy limit</button>
          <div class="df-popover" data-popover hidden><h3>Lender draw policy limit</h3><p>Maximum reimbursable release this cycle is $95,000.</p></div>
        </div>
        <div class="df-menu-demo" data-ui-scope>
          <button class="df-button df-button-default" data-menu-trigger="admin-actions">Admin actions ${icon.chevronDown}</button>
          <div class="df-menu" data-menu="admin-actions" hidden>
            <button class="df-menu-item">${icon.check}<span>Approve selected</span><kbd>A</kbd></button>
            <button class="df-menu-item">${icon.file}<span>Export audit packet</span><kbd>E</kbd></button>
            <div class="df-menu-separator"></div>
            <button class="df-menu-item danger">${icon.alert}<span>Escalate exception</span></button>
          </div>
        </div>
      </div>
    </header>
    <section class="mockup-admin-metrics" aria-label="Admin queue metrics">
      <article class="mockup-metric"><span>Ready releases</span><strong>9</strong><small>$684k pending funds</small></article>
      <article class="mockup-metric"><span>Override requests</span><strong>3</strong><small>2 geofence failures</small></article>
      <article class="mockup-metric"><span>Budget revisions</span><strong>6</strong><small>All versioned</small></article>
      <article class="mockup-metric"><span>Webhook health</span><strong>99.8%</strong><small>42 events today</small></article>
    </section>
    <section class="mockup-admin-grid">
      <div>
        <section class="mockup-panel">
          <header class="mockup-panel-header">
            <div><h2>Admin release kanban</h2><p>Evidence review, site visit, and final release states.</p></div>
            <div class="df-tabs-list" role="tablist"><button class="active">Draws</button><button>Visits</button><button>Budgets</button></div>
          </header>
          <div class="mockup-panel-body">
            <div class="mockup-kanban">
              <section class="mockup-lane"><h3>Ready for admin <span>3</span></h3>
                <article class="mockup-task"><strong>Oak Ridge · Draw 03</strong><p>Framing evidence complete. Site visit report recommends release.</p><div class="mockup-task-footer"><span class="df-badge success">Ready</span><button class="df-button df-button-default">Release</button></div></article>
                <article class="mockup-task"><strong>Maple Court · Draw 02</strong><p>Foundation inspection approved with no policy warnings.</p><div class="mockup-task-footer"><span class="df-badge success">Ready</span><button class="df-button df-button-outline">Review</button></div></article>
              </section>
              <section class="mockup-lane"><h3>Needs override <span>3</span></h3>
                <article class="mockup-task"><strong>Hudson Row · Site visit</strong><p>Evidence retained; geofence failed and needs admin reason.</p><div class="mockup-task-footer"><span class="df-badge warning">Override</span><button class="df-button df-button-outline" data-sheet-open>Open</button></div></article>
                <article class="mockup-task"><strong>Cedar Works · Budget v4</strong><p>Material variance exceeds configured lender policy.</p><div class="mockup-task-footer"><span class="df-badge warning">Policy</span><button class="df-button df-button-outline">Compare</button></div></article>
              </section>
              <section class="mockup-lane"><h3>Blocked <span>2</span></h3>
                <article class="mockup-task"><strong>North Pier · Draw 04</strong><p>Missing lien waiver and borrower capital warning.</p><div class="mockup-task-footer"><span class="df-badge destructive">Blocked</span><button class="df-button df-button-destructive">Escalate</button></div></article>
              </section>
            </div>
          </div>
        </section>
        <section class="mockup-panel" style="margin-top:16px;">
          <header class="mockup-panel-header"><div><h2>Release table</h2><p>Amounts remain reimbursement-only; interest starts after release.</p></div><button class="df-button df-button-outline">Export CSV</button></header>
          ${tableMarkup()}
        </section>
      </div>
      <aside class="mockup-side-stack">
        <section class="mockup-panel">
          <header class="mockup-panel-header"><div><h2>Release readiness</h2><p>Draw 03 · Oak Ridge</p></div><span class="df-badge warning">Admin review</span></header>
          <div class="mockup-panel-body mockup-release-card">
            <div class="df-progress-block"><div><span>Evidence completeness</span><strong>92%</strong></div><div class="df-progress"><span style="width:92%"></span></div></div>
            <label class="df-check"><input type="checkbox" checked /><span>${icon.check}</span>Evidence package preserved</label>
            <label class="df-check"><input type="checkbox" checked /><span>${icon.check}</span>Audit reason required for override</label>
            <button class="df-button df-button-default" data-dialog-open="release-confirm">Approve release</button>
            <div class="df-overlay" data-dialog="release-confirm" hidden>
              <section class="df-dialog" role="dialog" aria-modal="true" aria-labelledby="release-confirm-title">
                <button class="df-icon-button df-dialog-close" data-dialog-close="release-confirm" aria-label="Close">${icon.close}</button>
                <div class="df-dialog-icon">${icon.check}</div>
                <h2 id="release-confirm-title">Approve $86,400 release?</h2>
                <p>This records final lender admin authority and starts interest only after funds are released.</p>
                <footer class="df-dialog-actions"><button class="df-button df-button-outline" data-dialog-close="release-confirm">Cancel</button><button class="df-button df-button-default">Approve release</button></footer>
              </section>
            </div>
          </div>
        </section>
        <section class="mockup-panel">
          <header class="mockup-panel-header"><div><h2>Audit stream</h2><p>Material decisions and webhook events.</p></div></header>
          <div class="mockup-panel-body mockup-audit-list">
            ${["Admin override requested · Hudson Row", "Budget v4 created · Cedar Works", "Webhook delivered · draw.release.ready", "Site report signed · Oak Ridge", "Evidence location-unverified · Hudson Row"].map((item, index) => `<article class="mockup-audit-item"><div><strong>${item}</strong><span>${index + 2} min ago · organization scoped</span></div><span class="df-badge secondary">Audit</span></article>`).join("\n            ")}
          </div>
        </section>
      </aside>
    </section>
    <aside class="df-sheet" data-sheet>
      <button class="df-icon-button" data-sheet-close>${icon.close}</button>
      <h2>Site visit override</h2>
      <p>Evidence is retained and marked location-unverified. Add an admin reason before release.</p>
      <textarea class="df-textarea">Reviewer confirmed physical progress through signed report and timestamped photos.</textarea>
      <button class="df-button df-button-default" style="margin-top:12px;">Save override reason</button>
    </aside>
  </section>
</main>`,
  });
}

await mkdir(outDir, { recursive: true });
for (const generatedPath of [
  "assets",
  "previews",
  "snippets",
  "mockups",
  "index.html",
  "README.md",
  "manifest.json",
]) {
  await rm(path.join(outDir, generatedPath), { recursive: true, force: true });
}
await mkdir(path.join(outDir, "assets"), { recursive: true });
await mkdir(path.join(outDir, "previews"), { recursive: true });
await mkdir(path.join(outDir, "snippets"), { recursive: true });
await mkdir(path.join(outDir, "mockups"), { recursive: true });
await writeFile(
  path.join(outDir, "assets/ui.css"),
  `${sharedCss}\n${indexCss}\n${mockupCss}`
);
await writeFile(path.join(outDir, "assets/ui.js"), sharedJs);
await writeFile(path.join(outDir, "index.html"), indexPage);
await writeFile(
  path.join(outDir, "README.md"),
  `# UI HTML Snippets

Composable HTML, CSS, and JavaScript artifacts for every component in \`src/components/ui\`.

Directory layout:

- \`assets/ui.css\`: the single stylesheet for component previews, snippets, and mockups.
- \`assets/ui.js\`: shared composable interaction behavior.
- \`snippets/<component>.html\`: raw HTML fragments for composing high-resolution mockups.
- \`previews/<component>/index.html\`: standalone inspection pages for each component.
- \`mockups/*.html\`: composed product mockups built from the same assets.
- \`composed/*.html\`: extracted fragments generated from existing React components.

Use \`../assets/ui.css\` and \`../assets/ui.js\` from mockups, or \`../../assets/ui.css\` and \`../../assets/ui.js\` from preview pages.

Extract an existing React component into a mockup-ready fragment:

\`\`\`sh
bun run ui:html:extract path/to/Component.tsx --export ComponentName --out component-name
\`\`\`

Use \`--props props.json\` for JSON-serializable props, \`--fit false\` for full-width/page components, and \`--inline false\` when you want to preserve project classes instead of inlining computed styles.
`
);

for (const name of components) {
  const dir = path.join(outDir, "previews", name);
  await mkdir(dir, { recursive: true });
  const body = componentBody(name);
  await writeFile(path.join(outDir, "snippets", `${name}.html`), `${body}\n`);
  await writeFile(
    path.join(dir, "index.html"),
    page(
      name,
      body,
      "Standalone preview of the composable HTML component fragment.",
      "../../assets"
    )
  );
}

await writeFile(
  path.join(outDir, "mockups/admin-dashboard.html"),
  adminDashboardMockup()
);

await writeFile(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      source: "src/components/ui",
      assets: ["assets/ui.css", "assets/ui.js"],
      snippets: components.map((name) => `snippets/${name}.html`),
      previews: components.map((name) => `previews/${name}/index.html`),
      mockups: ["mockups/admin-dashboard.html"],
      count: components.length,
      components,
    },
    null,
    2
  )}\n`
);

console.log(
  `Generated ${components.length} composable component snippets, previews, and mockups in ${path.relative(root, outDir)}`
);
