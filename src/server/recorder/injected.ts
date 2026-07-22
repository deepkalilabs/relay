export const RECORDER_BINDING = "__browserMemoryEmit";

export const RECORDER_SCRIPT = String.raw`(() => {
  if (window.__browserMemoryRecorderInstalled) return;
  window.__browserMemoryRecorderInstalled = true;

  const dirtyFields = new Set();
  let datePickerOpen = false;
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
      frameUrl: window === window.top ? undefined : location.href,
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

  const isEditableField = (element) => {
    if (element instanceof HTMLTextAreaElement || element.isContentEditable) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    return !["button", "submit", "reset", "image", "checkbox", "radio", "file", "hidden", "date"].includes(element.type);
  };

  const semanticClickSelector = [
    "button",
    "a[href]",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='menuitemcheckbox']",
    "[role='menuitemradio']",
    "[role='tab']",
    "input[type='button']",
    "input[type='submit']",
    "input[type='reset']",
    "input[type='image']",
    "input[type='checkbox']",
    "input[type='radio']",
  ].join(",");

  const isFocusOnlyControl = (element) => {
    const control = element.closest("input,textarea,select,option,[contenteditable]");
    if (!control) return false;
    if (control instanceof HTMLInputElement) {
      return !["button", "submit", "reset", "image", "checkbox", "radio"].includes(control.type);
    }
    return true;
  };

  const resolveClickTarget = (event) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin || isFocusOnlyControl(origin)) return null;

    const semantic = origin.closest(semanticClickSelector);
    if (semantic instanceof HTMLElement) return semantic;

    const path = event.composedPath().filter((item) => item instanceof HTMLElement);
    const content = path.filter((element) =>
      element !== document.body &&
      element !== document.documentElement &&
      !isFocusOnlyControl(element)
    );
    const signaled = content.find((element) =>
      typeof element.onclick === "function" ||
      element.hasAttribute("onclick") ||
      element.tabIndex >= 0 ||
      getComputedStyle(element).cursor === "pointer"
    );
    return signaled || content[0] || null;
  };

  const flushInput = (element) => {
    if (!dirtyFields.has(element)) return;
    dirtyFields.delete(element);
    let value = "";
    if ("value" in element) value = element.value;
    else value = element.textContent || "";
    emit({ type: "fill", name: actionName("Fill", element), target: describe(element), payload: { value }, sensitive: sensitive(element) });
  };

  document.addEventListener("input", (event) => {
    const element = event.target;
    if (element instanceof HTMLInputElement && element.type === "date") {
      datePickerOpen = false;
      return;
    }
    if (!(element instanceof HTMLElement) || !isEditableField(element)) return;
    dirtyFields.add(element);
  }, true);

  document.addEventListener("focusout", (event) => {
    const element = event.target;
    if (element instanceof HTMLElement) flushInput(element);
  }, true);

  document.addEventListener("click", (event) => {
    const dateInput = event.target instanceof Element
      ? event.target.closest('input[type="date"]')
      : null;
    if (dateInput instanceof HTMLInputElement) {
      event.preventDefault();
      datePickerOpen = true;
      const rect = dateInput.getBoundingClientRect();
      emit({
        type: "date-picker.request",
        selector: cssPath(dateInput),
        name: actionName("Set date", dateInput),
        target: describe(dateInput),
        value: dateInput.value,
        min: dateInput.min,
        max: dateInput.max,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
      return;
    }

    if (datePickerOpen) {
      datePickerOpen = false;
      emit({ type: "date-picker.dismiss" });
    }
    const element = resolveClickTarget(event);
    if (!(element instanceof HTMLElement)) return;
    [...dirtyFields].forEach((field) => flushInput(field));
    emit({ type: "click", name: actionName("Click", element), target: describe(element), sensitive: false });
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && datePickerOpen) {
      datePickerOpen = false;
      emit({ type: "date-picker.dismiss" });
    }
  }, true);
})();`;
