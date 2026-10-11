import { createButtonIcon, createElement } from "../core.js";

const CAMELOT_KEYS = Array.from({ length: 24 }, (_, index) => `${Math.floor(index / 2) + 1}${index % 2 ? "B" : "A"}`);
const SORTS = [["added", "Recently added"], ["released", "Release date"], ["title", "Title"], ["artist", "Artist"]];

function iconButton(className, label, icon, onClick) {
  const button = createElement("button", className);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createButtonIcon(icon));
  button.addEventListener("click", onClick);
  return button;
}

// Search text and tags share one field, as on Bandcamp Discover: typing
// suggests matching tags, choosing one turns it into a chip, and any other
// text searches titles, artists, labels, tracks and notes. The caller owns the
// query and supplies suggestions; the input itself is never rebuilt, so focus
// and caret survive every update.
export function createTagSearch({ label, placeholder, text = "", tags = [], suggest, onChange, note = () => null }) {
  const state = { text, tags: [...tags], open: false, options: [], rendering: false };
  const element = createElement("div", "bandkit-tag-search");
  const field = createElement("div", "bandkit-tag-search-field");
  const chips = createElement("span", "bandkit-tag-search-chips");
  const input = createElement("input", "bandkit-tag-search-input");
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.value = state.text;
  input.setAttribute("aria-label", label);
  const clear = iconButton("bandkit-tag-search-clear", "Clear search", "icon-close.svg", () => {
    state.text = ""; state.tags = []; input.value = "";
    input.focus(); changed();
  });
  const panel = createElement("div", "bandkit-tag-search-suggestions");
  const options = createElement("div", "bandkit-tag-search-options");
  options.setAttribute("role", "group");
  options.setAttribute("aria-label", "Tags");
  const footer = createElement("div", "bandkit-tag-search-note");
  panel.append(options, footer);
  panel.hidden = true;
  const glyph = createButtonIcon("icon-search.svg");
  glyph.classList.add("bandkit-tag-search-icon");
  field.append(glyph, chips, input, clear);
  element.append(field, panel);

  const renderChips = () => {
    chips.replaceChildren(...state.tags.map((tag) => {
      const chip = createElement("button", "bandkit-tag-chip is-selected");
      chip.type = "button";
      chip.setAttribute("aria-label", `Remove ${tag} tag`);
      chip.append(createElement("span", "", tag), createButtonIcon("icon-close.svg"));
      chip.addEventListener("click", () => { state.tags = state.tags.filter((entry) => entry !== tag); input.focus(); changed(); });
      return chip;
    }));
    clear.hidden = !state.text && !state.tags.length;
    element.classList.toggle("has-value", !clear.hidden);
  };
  // Suggestions and the note are rebuilt as results change underneath, so a
  // focused tag or note action is found again afterwards.
  const renderSuggestions = () => {
    const focused = element.getRootNode().activeElement;
    const focusedTag = options.contains(focused) ? focused.dataset.tag : null;
    const focusedNote = footer.contains(focused);
    state.rendering = true;
    try {
      const scroll = options.scrollLeft;
      state.options = state.open ? suggest({ text: state.text, tags: state.tags }) : [];
      const signature = state.options.map((option) => option.tag).join("|");
      options.replaceChildren(...state.options.map((option, index) => {
        const chip = createElement("button", `bandkit-tag-chip${state.text && index === 0 ? " is-suggested" : ""}`);
        chip.type = "button";
        chip.dataset.tag = option.tag;
        chip.setAttribute("aria-label", `Add ${option.tag} tag, ${option.count} release${option.count === 1 ? "" : "s"}`);
        chip.append(createElement("span", "", option.tag), createElement("span", "bandkit-tag-chip-count", String(option.count)));
        chip.addEventListener("click", () => add(option.tag));
        return chip;
      }));
      options.hidden = !state.options.length;
      // Counts update while tags are read; only a different set of tags
      // returns the row to its start.
      options.scrollLeft = signature === state.signature ? scroll : 0;
      state.signature = signature;
      const extra = state.open ? note({ text: state.text, tags: state.tags, empty: !state.options.length }) : null;
      footer.replaceChildren(...(extra ? [extra] : []));
      footer.hidden = !extra;
      panel.hidden = !state.open || (options.hidden && footer.hidden);
      input.setAttribute("aria-expanded", String(!panel.hidden));
      syncOverflow();
    } finally {
      state.rendering = false;
    }
    if (focusedTag !== null) ([...options.querySelectorAll("button")].find((chip) => chip.dataset.tag === focusedTag) || input).focus();
    else if (focusedNote) (footer.querySelector("button") || input).focus();
  };
  // Where the tags sit on one scrolling line, fade the edge that has more.
  function syncOverflow() {
    options.classList.toggle("has-more", options.scrollLeft + options.clientWidth < options.scrollWidth - 1);
  }
  options.addEventListener("scroll", syncOverflow, { passive: true });
  options.addEventListener("wheel", (event) => {
    if (options.scrollWidth <= options.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    event.preventDefault();
    options.scrollLeft += event.deltaY;
  }, { passive: false });
  function changed() {
    renderChips(); renderSuggestions();
    onChange({ text: state.text, tags: [...state.tags] });
  }
  function add(tag) {
    if (!state.tags.includes(tag)) state.tags.push(tag);
    // Focus moves before the chips are rebuilt so the suggestions stay open.
    state.text = ""; input.value = "";
    input.focus(); changed();
  }
  const setOpen = (open) => {
    if (state.open === open) return;
    state.open = open;
    renderSuggestions();
  };

  input.addEventListener("input", () => {
    state.text = input.value; state.open = true;
    changed();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !options.hidden) {
      event.preventDefault();
      options.querySelector("button")?.focus();
    } else if (event.key === "Enter" && state.text && state.options.length) {
      event.preventDefault();
      add(state.options[0].tag);
    } else if (event.key === "Backspace" && !input.value && state.tags.length && input.selectionStart === 0) {
      state.tags.pop(); changed();
    } else if (event.key === "Escape" && state.open) {
      event.preventDefault(); event.stopPropagation();
      setOpen(false);
    }
  });
  options.addEventListener("keydown", (event) => {
    const buttons = [...options.querySelectorAll("button")];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); buttons[Math.min(buttons.length - 1, index + 1)].focus();
    } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); (index ? buttons[index - 1] : input).focus();
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      input.focus(); setOpen(false);
    }
  });
  field.addEventListener("click", (event) => { if (!event.target.closest("button")) input.focus(); });
  element.addEventListener("focusin", () => setOpen(true));
  element.addEventListener("focusout", (event) => {
    if (!state.rendering && !element.contains(event.relatedTarget)) setOpen(false);
  });
  renderChips();
  return {
    element,
    input,
    // Data changed underneath (a refresh or newly read tags).
    sync: renderSuggestions,
    focus: () => input.focus()
  };
}

function numberField(label, value, { min, max, placeholder }) {
  const input = createElement("input", "bandkit-filter-input is-number");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = String(min);
  input.max = String(max);
  input.placeholder = placeholder;
  input.value = value || "";
  input.setAttribute("aria-label", label);
  return input;
}

function filterRow(label, ...controls) {
  const row = createElement("div", "bandkit-filter-row");
  const name = createElement("span", "bandkit-filter-label", label);
  const body = createElement("div", "bandkit-filter-controls");
  body.append(...controls);
  row.append(name, body);
  return row;
}

function range(label, from, to) {
  const dash = createElement("span", "bandkit-filter-dash", "–");
  dash.setAttribute("aria-hidden", "true");
  return filterRow(label, from, dash, to);
}

function selectInput(label, choices, value, onChange) {
  const select = createElement("select", "bandkit-filter-input");
  select.setAttribute("aria-label", label);
  for (const [id, text] of choices) {
    const option = createElement("option", "", text);
    option.value = id;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

// The refinements that are not search or tags, in one quiet sheet. Saved
// filters sit at the top so reusing one is a single click; saving asks only
// for a name, and saving under an existing name replaces it.
export function createLibraryFilters({ query, crates = [], activeCrateId = "", onChange, onApplyCrate, onDeleteCrate, onSaveCrate, onClear }) {
  const sheet = createElement("div", "bandkit-filter-sheet");
  if (crates.length) {
    const saved = createElement("div", "bandkit-filter-saved");
    saved.setAttribute("role", "group");
    saved.setAttribute("aria-label", "Saved filters");
    for (const crate of crates) {
      const chip = createElement("span", `bandkit-tag-chip is-saved${crate.id === activeCrateId ? " is-selected" : ""}`);
      const apply = createElement("button", "bandkit-filter-saved-apply", crate.name);
      apply.type = "button";
      apply.setAttribute("aria-pressed", String(crate.id === activeCrateId));
      apply.addEventListener("click", () => onApplyCrate(crate));
      const remove = iconButton("bandkit-filter-saved-remove", `Delete saved filter ${crate.name}`, "icon-close.svg", () => onDeleteCrate(crate));
      chip.append(apply, remove);
      saved.append(chip);
    }
    sheet.append(saved);
  }
  const sort = selectInput("Sort by", SORTS, query.sort, (value) => onChange({ sort: value }));
  const year = (key, label, edge) => {
    const input = numberField(label, query[key]?.slice(0, 4), { min: 1900, max: 2100, placeholder: edge === "start" ? "From" : "To" });
    input.addEventListener("input", () => {
      const value = /^\d{4}$/.test(input.value) ? `${input.value}-${edge === "start" ? "01-01" : "12-31"}` : "";
      if (value || !input.value) onChange({ [key]: value });
    });
    return input;
  };
  const bpm = (key, label, placeholder) => {
    const input = numberField(label, query[key] || "", { min: 1, max: 400, placeholder });
    input.addEventListener("input", () => onChange({ [key]: Number(input.value) || 0 }));
    return input;
  };
  const key = selectInput("Key", [["", "Any key"], ...CAMELOT_KEYS.map((value) => [value, value])], query.key || "", (value) => onChange({ key: value }));
  const unheard = createElement("label", "bandkit-filter-check");
  const check = createElement("input");
  check.type = "checkbox";
  check.checked = query.unheard;
  check.addEventListener("change", () => onChange({ unheard: check.checked }));
  unheard.append(check, createElement("span", "", "Not yet played in Bandkit"));
  sheet.append(
    filterRow("Sort by", sort),
    range("Released", year("after", "Released from year", "start"), year("before", "Released up to year", "end")),
    range("BPM", bpm("bpmMin", "Lowest BPM", "Min"), bpm("bpmMax", "Highest BPM", "Max")),
    filterRow("Key", key),
    unheard
  );
  const footer = createElement("div", "bandkit-filter-footer");
  const save = createElement("button", "bandkit-filter-action", "Save filters");
  save.type = "button";
  const form = createElement("form", "bandkit-filter-save");
  form.hidden = true;
  const name = createElement("input", "bandkit-filter-input");
  name.placeholder = "Name";
  name.maxLength = 100;
  name.required = true;
  name.setAttribute("aria-label", "Saved filter name");
  const confirm = createElement("button", "bandkit-filter-action is-accent", "Save");
  confirm.type = "submit";
  form.append(name, confirm);
  const reset = createElement("button", "bandkit-filter-action", "Clear");
  reset.type = "button";
  reset.addEventListener("click", onClear);
  const closeForm = () => { form.hidden = true; save.hidden = false; reset.hidden = false; save.focus(); };
  save.addEventListener("click", () => {
    form.hidden = false; save.hidden = true; reset.hidden = true;
    name.value = crates.find((crate) => crate.id === activeCrateId)?.name || "";
    name.focus(); name.select();
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeForm(); }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = name.value.trim();
    if (value) onSaveCrate(value);
  });
  footer.append(save, form, reset);
  sheet.append(footer);
  return sheet;
}
