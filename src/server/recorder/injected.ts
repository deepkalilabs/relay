export const RECORDER_BINDING = "__browserMemoryEmit";

export const RECORDER_SCRIPT = String.raw`(() => {
  if (window.__browserMemoryRecorderInstalled) return;
  window.__browserMemoryRecorderInstalled = true;

  const timers = new WeakMap();
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const clip = (value, size = 180) => normalize(value).slice(0, size);
  const escapeCss = (value) => window.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  const emit = (payload) => {
    try {
      const result = window.${RECORDER_BINDING}?.(payload);
      if (result?.catch) result.catch(() => undefined);
    } catch {}
  };

  const implicitRole = (element) => {
    const tag = element.tagName.toLowerCase();
    const type = String(element.getAttribute("type") || "").toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return element.multiple ? "listbox" : "combobox";
    if (tag === "input") {
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type !== "hidden") return "textbox";
    }
    return "";
  };

  const labelFor = (element) => {
    if (element.labels?.length) return clip([...element.labels].map((label) => label.innerText).join(" "));
    const wrapping = element.closest("label");
    return wrapping ? clip(wrapping.innerText) : "";
  };

  const accessibleName = (element) => {
    const aria = element.getAttribute("aria-label");
    if (aria) return clip(aria);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const value = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (normalize(value)) return clip(value);
    }
    const label = labelFor(element);
    if (label) return label;
    if (element instanceof HTMLImageElement && element.alt) return clip(element.alt);
    if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)) return clip(element.value);
    return clip(element.innerText || element.textContent || element.getAttribute("title") || element.getAttribute("placeholder") || "");
  };

  const unique = (selector) => {
    try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
  };

  const cssPath = (element) => {
    if (element.id) return "#" + escapeCss(element.id);
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
      }
      parts.unshift(part);
      const selector = parts.join(" > ");
      if (unique(selector)) return selector;
      current = parent;
    }
    return parts.length ? "body > " + parts.join(" > ") : "body";
  };

  const xpath = (element) => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(current.tagName.toLowerCase() + "[" + index + "]");
      current = current.parentElement;
    }
    return "/" + parts.join("/");
  };

  const describe = (element) => {
    const candidates = [];
    const testId = element.getAttribute("data-testid");
    const role = element.getAttribute("role") || implicitRole(element);
    const name = accessibleName(element);
    const label = labelFor(element);
    const text = clip(element.innerText || element.textContent || "");
    if (testId) candidates.push({ kind: "testId", value: testId, exact: true, unique: document.querySelectorAll('[data-testid="' + escapeCss(testId) + '"]').length === 1 });
    if (role && name) candidates.push({ kind: "role", value: role, name, exact: true });
    if (name) candidates.push({ kind: "accessibleName", value: name, exact: true });
    if (label && label !== name) candidates.push({ kind: "label", value: label, exact: true });
    if (text && text !== name && text.length <= 120) candidates.push({ kind: "text", value: text, exact: true });
    const css = cssPath(element);
    candidates.push({ kind: "css", value: css, exact: true, unique: unique(css) });
    candidates.push({ kind: "xpath", value: xpath(element), exact: true });
    return {
      tagName: element.tagName.toLowerCase(),
      inputType: element instanceof HTMLInputElement ? element.type : undefined,
      frameUrl: location.href,
      candidates,
    };
  };

  const actionName = (verb, element) => {
    const name = accessibleName(element);
    return name ? verb + ' “' + name + '”' : verb + " " + element.tagName.toLowerCase();
  };

  const sensitive = (element) => {
    const type = element.getAttribute("type") || "";
    const autocomplete = element.getAttribute("autocomplete") || "";
    const identity = [type, autocomplete, element.getAttribute("name"), element.getAttribute("id"), accessibleName(element)].join(" ");
    return /(password|current-password|new-password|one-time-code|cc-|credit|card|token|secret)/i.test(identity);
  };

  const flushInput = (element) => {
    const timer = timers.get(element);
    if (timer) clearTimeout(timer);
    timers.delete(element);
    let value = "";
    if (element instanceof HTMLInputElement && element.type === "file") {
      value = [...(element.files || [])].map((file) => file.name).join(", ");
    } else if ("value" in element) value = element.value;
    else value = element.textContent || "";
    emit({ type: "fill", name: actionName("Fill", element), target: describe(element), payload: { value }, sensitive: sensitive(element) });
  };

  document.addEventListener("input", (event) => {
    const element = event.target;
    if (!(element instanceof HTMLElement)) return;
    const prior = timers.get(element);
    if (prior) clearTimeout(prior);
    timers.set(element, setTimeout(() => flushInput(element), 400));
  }, true);

  document.addEventListener("focusout", (event) => {
    const element = event.target;
    if (element instanceof HTMLElement && timers.has(element)) flushInput(element);
  }, true);

  document.addEventListener("change", (event) => {
    const element = event.target;
    if (!(element instanceof HTMLElement)) return;
    if (timers.has(element)) flushInput(element);
    if (element instanceof HTMLSelectElement) {
      const selected = element.selectedOptions[0];
      emit({ type: "select", name: actionName("Select", element), target: describe(element), payload: { value: element.value, label: selected?.textContent || undefined }, sensitive: sensitive(element) });
    } else if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      emit({ type: element.checked ? "check" : "uncheck", name: actionName(element.checked ? "Check" : "Uncheck", element), target: describe(element), sensitive: sensitive(element) });
    } else if (element instanceof HTMLInputElement && element.type === "file") {
      flushInput(element);
    }
  }, true);

  document.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target.closest("a,button,[role='button'],[role='link'],summary,[tabindex],input") : null;
    if (!(element instanceof HTMLElement)) return;
    if (element instanceof HTMLInputElement && ["checkbox", "radio", "file", "submit", "reset"].includes(element.type)) return;
    if (element instanceof HTMLButtonElement && element.type === "submit") return;
    emit({ type: "click", name: actionName("Click", element), target: describe(element), sensitive: false });
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    form.querySelectorAll("input,textarea,[contenteditable='true']").forEach((element) => {
      if (timers.has(element)) flushInput(element);
    });
    emit({ type: "submit", name: actionName("Submit", form), target: describe(form), sensitive: false });
  }, true);

  document.addEventListener("keydown", (event) => {
    const meaningful = event.metaKey || event.ctrlKey || event.altKey || ["Enter", "Escape", "Tab", "Backspace", "Delete"].includes(event.key) || event.key.startsWith("F");
    if (!meaningful) return;
    const element = event.target instanceof HTMLElement ? event.target : document.body;
    const modifiers = [];
    if (event.altKey) modifiers.push("Alt");
    if (event.ctrlKey) modifiers.push("Control");
    if (event.metaKey) modifiers.push("Meta");
    if (event.shiftKey) modifiers.push("Shift");
    emit({ type: "keypress", name: "Press " + [...modifiers, event.key].join("+"), target: describe(element), payload: { key: event.key, modifiers }, sensitive: sensitive(element) });
  }, true);

  const emitNavigation = () => emit({ type: "navigate", name: "Navigate to " + location.href, payload: { url: location.href }, sensitive: false });
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function(...args) {
      const result = original.apply(this, args);
      queueMicrotask(emitNavigation);
      return result;
    };
  });
  addEventListener("popstate", emitNavigation);
  addEventListener("hashchange", emitNavigation);
  if (location.href !== "about:blank") queueMicrotask(emitNavigation);
})();`;
