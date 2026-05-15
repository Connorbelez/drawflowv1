function closestScope(node) {
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
    const menu = scopedQuery(trigger, `[data-menu="${id}"]`);
    if (menu) menu.hidden = !menu.hidden;
  }

  const popoverTrigger = event.target.closest("[data-popover-trigger]");
  if (popoverTrigger) {
    const popover = scopedQuery(popoverTrigger, "[data-popover]");
    if (popover) popover.hidden = !popover.hidden;
  }

  const openDialog = event.target.closest("[data-dialog-open]");
  if (openDialog) {
    const dialog = scopedQuery(openDialog, `[data-dialog="${openDialog.dataset.dialogOpen}"]`);
    if (dialog) dialog.hidden = false;
  }

  const closeDialog = event.target.closest("[data-dialog-close]");
  if (closeDialog) {
    const dialog = scopedQuery(closeDialog, `[data-dialog="${closeDialog.dataset.dialogClose}"]`);
    if (dialog) dialog.hidden = true;
  }

  const collapse = event.target.closest("[data-collapse]");
  if (collapse) {
    const panel = scopedQuery(collapse, `[data-collapse-panel="${collapse.dataset.collapse}"]`);
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
  const render = () => { track.style.transform = `translateX(-${index * 100}%)`; };
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
