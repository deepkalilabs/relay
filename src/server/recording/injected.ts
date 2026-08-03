export const RECORDER_BINDING = "__browserMemoryEmit";

export const RECORDER_SCRIPT = String.raw`(() => {
  if (window.__browserMemoryRecorderInstalled) return;
  window.__browserMemoryRecorderInstalled = true;

  const dirtyFields = new Set();
  let datePickerOpen = false;
  let selectPickerOpen = false;
  let pendingOptionClick = null;
  let suppressKeyboardClick = false;
  let suppressKeyboardClickTimer = null;
  window.__browserMemorySuppressSelectChange = false;
  window.__browserMemoryNativeSelects = window.__browserMemoryNativeSelects === true;
  window.__browserMemoryCaptchaLocked = window.__browserMemoryCaptchaLocked === true;
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const clip = (value, size = 180) => normalize(value).slice(0, size);
  const escapeCss = (value) => window.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  const emit = (payload) => {
    if (window.__browserMemoryCaptchaLocked) return;
    try {
      const result = window.${RECORDER_BINDING}?.(payload);
      if (result?.catch) result.catch(() => undefined);
    } catch {}
  };
  window.__browserMemorySetNativeSelects = (enabled) => {
    window.__browserMemoryNativeSelects = enabled === true;
    if (window.__browserMemoryNativeSelects) selectPickerOpen = false;
  };
  window.__browserMemorySetCaptchaLocked = (locked) => {
    window.__browserMemoryCaptchaLocked = locked === true;
    if (!window.__browserMemoryCaptchaLocked) return;
    dirtyFields.clear();
    datePickerOpen = false;
    selectPickerOpen = false;
    if (pendingOptionClick) clearTimeout(pendingOptionClick.timer);
    pendingOptionClick = null;
    if (suppressKeyboardClickTimer) clearTimeout(suppressKeyboardClickTimer);
    suppressKeyboardClick = false;
    suppressKeyboardClickTimer = null;
  };

  const viewportPosition = () => ({
    x: window.scrollX,
    y: window.scrollY,
    frameUrl: window === window.top ? undefined : location.href,
  });
  const emitAction = (payload) => emit({ ...payload, position: viewportPosition() });

  const eventElement = (event) => {
    const origin = event.composedPath?.().find((item) => item instanceof Element);
    return origin instanceof Element
      ? origin
      : event.target instanceof Element
        ? event.target
        : null;
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

  const labelText = (label) => {
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input,textarea,select,button").forEach((control) => control.remove());
    return clip(copy.textContent || "");
  };

  const displayLabelText = (value) => clip(value, 120).replace(/\s*[*\u2731]+\s*$/, "").trim();

  const labelFor = (element) => {
    if (element.labels?.length) return clip([...element.labels].map(labelText).join(" "));
    const wrapping = element.closest("label");
    return wrapping ? labelText(wrapping) : "";
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

  const isVisible = (element) => {
    if (!(element instanceof HTMLElement) || element.closest('[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };

  const visibleLabelFor = (element) => {
    const labels = new Set(element.labels ? [...element.labels] : []);
    const wrapping = element.closest("label");
    if (wrapping) labels.add(wrapping);
    return displayLabelText([...labels].filter(isVisible).map(labelText).join(" "));
  };

  const labelledByName = (element) => {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (!labelledBy) return "";
    const root = element.getRootNode?.();
    const value = labelledBy.split(/\s+/).map((id) => root?.getElementById?.(id)?.textContent || document.getElementById(id)?.textContent || "").join(" ");
    return displayLabelText(value);
  };

  const isFieldControl = (element) => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    return !["button", "submit", "reset", "image", "file", "hidden"].includes(element.type);
  };

  const isHelperText = (element) => {
    const identity = [element.id, element.className, element.getAttribute("role")].join(" ");
    return element.matches("small,[aria-live],[role='alert'],[role='status'],[role='note']") ||
      /(help|hint|error|invalid|validation|description|message|feedback)/i.test(identity);
  };

  const structuralLabelFor = (field) => {
    const interactive = "input,textarea,select,button,a[href],[role='button'],[contenteditable='true']";
    let branch = field;

    for (let depth = 0; depth < 2; depth++) {
      const container = branch.parentElement;
      if (!container || container === document.body || container === document.documentElement) break;
      const controls = [...container.querySelectorAll("input,textarea,select")].filter(isFieldControl);

      if (controls.length === 1 && controls[0] === field) {
        let sibling = branch.previousElementSibling;
        while (sibling) {
          const labels = sibling.matches("label") ? [sibling] : [...sibling.querySelectorAll("label")].reverse();
          for (const label of labels) {
            if (!isVisible(label) || isHelperText(label) || label.querySelector(interactive)) continue;
            if (label.htmlFor || (label.control && label.control !== field)) continue;
            const text = displayLabelText(labelText(label));
            if (text) return text;
          }
          sibling = sibling.previousElementSibling;
        }
      }

      branch = container;
    }

    return "";
  };

  const inferredLabelAbove = (field) => {
    const fieldRect = field.getBoundingClientRect();
    if (fieldRect.width <= 0 || fieldRect.height <= 0) return "";
    const interactive = "input,textarea,select,button,a[href],[role='button'],[contenteditable='true']";
    let best = null;
    let anchor = field;

    for (let depth = 0; depth < 2; depth++) {
      let sibling = anchor.previousElementSibling;
      while (sibling) {
        const candidates = [sibling, ...sibling.querySelectorAll("label,span,div,p,strong,legend")];
        for (const candidate of candidates) {
          if (!isVisible(candidate) || isHelperText(candidate) || candidate.matches(interactive) || candidate.querySelector(interactive)) continue;
          const text = displayLabelText(candidate.innerText);
          if (!text) continue;
          const rect = candidate.getBoundingClientRect();
          const gap = fieldRect.top - rect.bottom;
          if (gap < 0 || gap > 16) continue;
          const overlap = Math.max(0, Math.min(fieldRect.right, rect.right) - Math.max(fieldRect.left, rect.left));
          const narrowerWidth = Math.min(fieldRect.width, rect.width);
          const overlapRatio = narrowerWidth > 0 ? overlap / narrowerWidth : 0;
          if (overlapRatio < 0.5) continue;
          const area = rect.width * rect.height;
          if (!best || gap < best.gap || (gap === best.gap && overlapRatio > best.overlapRatio) || (gap === best.gap && overlapRatio === best.overlapRatio && area < best.area)) {
            best = { text, gap, overlapRatio, area };
          }
        }
        sibling = sibling.previousElementSibling;
      }
      const parent = anchor.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      anchor = parent;
    }

    return best?.text || "";
  };

  const fieldDisplayName = (element) => {
    if (!isFieldControl(element)) return "";
    const label = visibleLabelFor(element);
    if (label) return label;
    const labelledBy = labelledByName(element);
    if (labelledBy) return labelledBy;
    const aria = clip(element.getAttribute("aria-label") || "");
    if (aria) return aria;
    const structural = structuralLabelFor(element);
    if (structural) return structural;
    const inferred = inferredLabelAbove(element);
    if (inferred) return inferred;
    const hint = clip(element.getAttribute("placeholder") || element.getAttribute("title") || "");
    if (hint) return hint;
    return fieldIdentityName(element);
  };

  const humanizeFieldIdentity = (value) => {
    const raw = normalize(value);
    if (!raw || raw.length > 120 || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(raw)) return "";
    if (/(^|[_.-])(input|textarea|select|field|control)([_.-]|$)/i.test(raw) && /\d/.test(raw)) return "";
    const humanized = normalize(raw
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_.-]+/g, " "));
    if (!humanized || /^(input|textarea|select|field|form field|control|value)$/i.test(humanized)) return "";
    const sentenceCase = humanized.toLowerCase();
    return sentenceCase.charAt(0).toUpperCase() + sentenceCase.slice(1);
  };

  const fieldIdentityName = (element) => {
    const autocomplete = normalize(element.getAttribute("autocomplete") || "").split(/\s+/).filter((token) =>
      token && !["on", "off", "shipping", "billing", "webauthn"].includes(token.toLowerCase()) && !token.toLowerCase().startsWith("section-"),
    ).at(-1) || "";
    for (const value of [autocomplete, element.getAttribute("name"), element.getAttribute("id"), element.getAttribute("formcontrolname")]) {
      const name = humanizeFieldIdentity(value);
      if (name) return name;
    }
    return "";
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

  const targetName = (element) => {
    const fieldName = fieldDisplayName(element);
    if (fieldName) return fieldName;
    const name = accessibleName(element);
    return name || element.tagName.toLowerCase();
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
    "[role='option']",
    "[role='tab']",
    "input[type='button']",
    "input[type='submit']",
    "input[type='reset']",
    "input[type='image']",
    "input[type='checkbox']",
    "input[type='radio']",
  ].join(",");

  const nativeSelectForInteraction = (element) => {
    const direct = element.closest("select");
    if (direct instanceof HTMLSelectElement) return direct;
    const label = element instanceof HTMLLabelElement ? element : element.closest("label");
    return label?.control instanceof HTMLSelectElement ? label.control : null;
  };

  const isFocusOnlyControl = (element) => {
    const control = element.closest("input,textarea,[contenteditable]");
    if (!control) return false;
    if (control instanceof HTMLInputElement) {
      return !["button", "submit", "reset", "image", "checkbox", "radio"].includes(control.type);
    }
    return true;
  };

  const resolveClickTarget = (event) => {
    const origin = eventElement(event);
    if (!origin) return null;

    const select = nativeSelectForInteraction(origin);
    if (select) return select;
    if (isFocusOnlyControl(origin)) return null;

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

  const resolveEnterTarget = (event) => {
    const element = eventElement(event);
    if (!(element instanceof HTMLElement)) return null;
    if (element instanceof HTMLTextAreaElement || element.isContentEditable) return null;
    if (element instanceof HTMLSelectElement) return null;
    if (element instanceof HTMLInputElement && element.type === "date") return null;
    if (isEditableField(element)) return element;
    const target = element.closest(semanticClickSelector);
    return target instanceof HTMLElement ? target : null;
  };

  const flushInput = (element) => {
    if (!dirtyFields.has(element)) return;
    dirtyFields.delete(element);
    let value = "";
    if ("value" in element) value = element.value;
    else value = element.textContent || "";
    emitAction({ type: "fill", name: targetName(element), target: describe(element), payload: { value }, sensitive: sensitive(element) });
  };

  const isOptionLikeClick = (element) =>
    element instanceof HTMLOptionElement ||
    Boolean(element.closest("[role='option'],[role='menuitemradio']"));

  const flushPendingOptionClick = () => {
    if (!pendingOptionClick) return;
    clearTimeout(pendingOptionClick.timer);
    const action = pendingOptionClick.action;
    pendingOptionClick = null;
    emitAction(action);
  };

  const holdOptionClick = (action, label) => {
    flushPendingOptionClick();
    const timer = setTimeout(() => flushPendingOptionClick(), 300);
    pendingOptionClick = { action, label: normalize(label).toLocaleLowerCase(), timer };
  };

  const cancelMatchingOptionClick = (label) => {
    if (!pendingOptionClick) return;
    if (pendingOptionClick.label !== normalize(label).toLocaleLowerCase()) {
      flushPendingOptionClick();
      return;
    }
    clearTimeout(pendingOptionClick.timer);
    pendingOptionClick = null;
  };

  const recordControlChange = (element) => {
    const select = nativeSelectForInteraction(element);
    if (!select || select.multiple) return false;
    selectPickerOpen = false;
    const selectedOption = select.selectedOptions[0];
    const label = selectedOption ? clip(selectedOption.label || selectedOption.textContent || "") : "";
    cancelMatchingOptionClick(label);
    if (window.__browserMemorySuppressSelectChange) return true;
    [...dirtyFields].forEach((field) => flushInput(field));
    emitAction({
      type: "select",
      name: targetName(select),
      target: describe(select),
      payload: { value: select.value, ...(label ? { label } : {}) },
      sensitive: sensitive(select),
    });
    return true;
  };

  window.addEventListener("input", (event) => {
    if (window.__browserMemoryCaptchaLocked) return;
    const element = eventElement(event);
    if (element instanceof HTMLInputElement && element.type === "date") {
      datePickerOpen = false;
      return;
    }
    if (!(element instanceof HTMLElement) || !isEditableField(element)) return;
    dirtyFields.add(element);
  }, true);

  window.addEventListener("focusout", (event) => {
    if (window.__browserMemoryCaptchaLocked) return;
    const element = eventElement(event);
    if (element instanceof HTMLElement) flushInput(element);
  }, true);

  window.addEventListener("change", (event) => {
    if (window.__browserMemoryCaptchaLocked) return;
    const element = eventElement(event);
    if (element instanceof HTMLElement) recordControlChange(element);
  }, true);

  window.addEventListener("click", (event) => {
    if (window.__browserMemoryCaptchaLocked) return;
    if (suppressKeyboardClick && event.detail === 0) {
      suppressKeyboardClick = false;
      if (suppressKeyboardClickTimer) clearTimeout(suppressKeyboardClickTimer);
      suppressKeyboardClickTimer = null;
      return;
    }
    const origin = eventElement(event);
    const select = origin ? nativeSelectForInteraction(origin) : null;
    if (select instanceof HTMLSelectElement && !select.disabled && !select.multiple && select.size <= 1) {
      if (window.__browserMemoryNativeSelects) {
        if (datePickerOpen) {
          datePickerOpen = false;
          emit({ type: "date-picker.dismiss" });
        }
        selectPickerOpen = false;
        return;
      }
      event.preventDefault();
      if (datePickerOpen) {
        datePickerOpen = false;
        emit({ type: "date-picker.dismiss" });
      }
      if (selectPickerOpen) emit({ type: "select-picker.dismiss" });
      selectPickerOpen = true;
      const rect = select.getBoundingClientRect();
      emitAction({
        type: "select-picker.request",
        selector: cssPath(select),
        name: targetName(select),
        target: describe(select),
        value: select.value,
        options: [...select.options].map((option) => ({
          value: option.value,
          label: clip(option.label || option.textContent || ""),
          disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
        })),
        sensitive: sensitive(select),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
      return;
    }
    const dateInput = origin
      ? origin.closest('input[type="date"]')
      : null;
    if (dateInput instanceof HTMLInputElement) {
      event.preventDefault();
      datePickerOpen = true;
      const rect = dateInput.getBoundingClientRect();
      emitAction({
        type: "date-picker.request",
        selector: cssPath(dateInput),
        name: targetName(dateInput),
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
    if (selectPickerOpen) {
      selectPickerOpen = false;
      emit({ type: "select-picker.dismiss" });
    }
    const element = resolveClickTarget(event);
    if (!(element instanceof HTMLElement)) return;
    [...dirtyFields].forEach((field) => flushInput(field));
    const action = { type: "click", name: targetName(element), target: describe(element), sensitive: false };
    if (isOptionLikeClick(element)) {
      holdOptionClick(action, action.name);
      return;
    }
    flushPendingOptionClick();
    emitAction(action);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (window.__browserMemoryCaptchaLocked) return;
    if (event.key === "Escape" && datePickerOpen) {
      datePickerOpen = false;
      emit({ type: "date-picker.dismiss" });
    }
    if (event.key === "Escape" && selectPickerOpen) {
      selectPickerOpen = false;
      emit({ type: "select-picker.dismiss" });
    }
    if (event.key !== "Enter" || event.isComposing) return;
    const element = resolveEnterTarget(event);
    if (!element) return;
    suppressKeyboardClick = true;
    if (suppressKeyboardClickTimer) clearTimeout(suppressKeyboardClickTimer);
    suppressKeyboardClickTimer = setTimeout(() => {
      suppressKeyboardClick = false;
      suppressKeyboardClickTimer = null;
    }, 0);
    if (event.repeat) return;
    flushInput(element);
    const modifiers = [
      event.altKey ? "Alt" : null,
      event.ctrlKey ? "Control" : null,
      event.metaKey ? "Meta" : null,
      event.shiftKey ? "Shift" : null,
    ].filter(Boolean);
    emitAction({
      type: "keypress",
      name: targetName(element),
      target: describe(element),
      payload: { key: "Enter", modifiers },
      sensitive: false,
    });
  }, true);

  window.addEventListener("scroll", () => {
    if (window.__browserMemoryCaptchaLocked) return;
    if (!selectPickerOpen) return;
    selectPickerOpen = false;
    emit({ type: "select-picker.dismiss" });
  }, true);
})();`;
