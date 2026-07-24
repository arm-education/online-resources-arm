document.addEventListener("DOMContentLoaded", function () {
  const catalog = document.querySelector("[data-resource-catalog]");
  if (!catalog) return;

  const facetDefinitions = [
    { id: "subjects", label: "Subjects", urlKey: "subjects", aliases: ["subjects", "subject"] },
    { id: "level", label: "Level", urlKey: "level", aliases: ["level"] },
    { id: "format", label: "Format", urlKey: "Format", aliases: ["format"] },
    {
      id: "pathways",
      label: "Learning pathways",
      urlKey: "Learning Pathways",
      aliases: ["learning pathways", "learning-pathways", "pathways"]
    }
  ];

  const searchInput = catalog.querySelector("#course-search");
  const clearSearchButton = catalog.querySelector("#clear-search");
  const filterForm = catalog.querySelector("#resource-filters");
  const sidebarHost = catalog.querySelector("#catalog-filter-sidebar-host");
  const sheetHost = catalog.querySelector("#catalog-filter-sheet-host");
  const filterTrigger = catalog.querySelector("#catalog-filter-trigger");
  const filterDialog = catalog.querySelector("#catalog-filter-dialog");

  if (!searchInput || !clearSearchButton || !filterForm) return;

  const checkboxes = Array.from(filterForm.querySelectorAll(".filter-checkbox"));
  const cards = Array.from(catalog.querySelectorAll("[data-resource-card]"));
  const sections = Array.from(catalog.querySelectorAll("[data-resource-section]"));
  const resultCount = catalog.querySelector("#resource-count");
  const activeFilters = catalog.querySelector("#active-filters");
  const activeFilterChips = catalog.querySelector("#active-filter-chips");
  const filterSelectionCounts = Array.from(catalog.querySelectorAll("[data-filter-selection-count]"));
  const sheetResultCounts = Array.from(catalog.querySelectorAll("[data-sheet-result-count]"));
  const emptyState = catalog.querySelector("#no-results");
  const facetCheckboxes = Object.fromEntries(
    facetDefinitions.map((facet) => [
      facet.id,
      checkboxes.filter((checkbox) => checkbox.dataset.facet === facet.id)
    ])
  );

  let searchTimer;
  let state;
  let compactMode = null;
  let lastFocusedElement = null;
  let restoreFocusOnClose = true;
  let fallbackDialogOpen = false;

  const normalise = (value) => String(value || "").trim().toLocaleLowerCase();

  function parseAliases(rawValue) {
    if (!rawValue) return [];

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [];
    }
  }

  function aliasesForCheckbox(checkbox) {
    return [
      ...parseAliases(checkbox.dataset.legacyValues),
      ...parseAliases(checkbox.dataset.valueAliases)
    ];
  }

  const subjectAliasMap = new Map();
  (facetCheckboxes.subjects || []).forEach((checkbox) => {
    const canonicalValue = normalise(checkbox.value);
    subjectAliasMap.set(canonicalValue, canonicalValue);
    aliasesForCheckbox(checkbox).forEach((alias) => {
      if (normalise(alias)) subjectAliasMap.set(normalise(alias), canonicalValue);
    });
  });

  const checkboxByFacetValue = Object.fromEntries(
    facetDefinitions.map((facet) => [
      facet.id,
      new Map(facetCheckboxes[facet.id].map((checkbox) => [normalise(checkbox.value), checkbox]))
    ])
  );

  function canonicaliseFacetValue(facetId, value) {
    const normalisedValue = normalise(value);
    if (facetId === "subjects") {
      return subjectAliasMap.get(normalisedValue) || normalisedValue;
    }
    return normalisedValue;
  }

  function normaliseFacetValues(facetId, values) {
    return Array.from(new Set(
      (values || [])
        .map((value) => canonicaliseFacetValue(facetId, value))
        .filter(Boolean)
    ));
  }

  function emptyStateModel() {
    return {
      q: "",
      filters: Object.fromEntries(facetDefinitions.map((facet) => [facet.id, []]))
    };
  }

  function getFacetDefinitionByUrlKey(key) {
    const normalisedKey = normalise(key);
    return facetDefinitions.find((facet) =>
      facet.aliases.includes(normalisedKey) || normalise(facet.urlKey) === normalisedKey
    );
  }

  function readStateFromURL() {
    const nextState = emptyStateModel();
    const params = new URL(window.location.href).searchParams;

    for (const [key, rawValue] of params.entries()) {
      if (normalise(key) === "q") {
        nextState.q = String(rawValue || "").trim();
        continue;
      }

      const facet = getFacetDefinitionByUrlKey(key);
      if (!facet) continue;

      const value = canonicaliseFacetValue(facet.id, rawValue);
      if (checkboxByFacetValue[facet.id].has(value)) {
        nextState.filters[facet.id].push(value);
      }
    }

    facetDefinitions.forEach((facet) => {
      nextState.filters[facet.id] = normaliseFacetValues(facet.id, nextState.filters[facet.id]);
    });

    return nextState;
  }

  function displayValueFor(facetId, value) {
    const checkbox = checkboxByFacetValue[facetId].get(canonicaliseFacetValue(facetId, value));
    return checkbox ? checkbox.value : value;
  }

  function writeStateToURL(nextState, { replace = false } = {}) {
    const url = new URL(window.location.href);
    const keysToRemove = new Set(
      ["q", ...facetDefinitions.flatMap((facet) => [facet.urlKey, ...facet.aliases])].map(normalise)
    );

    Array.from(url.searchParams.keys()).forEach((key) => {
      if (keysToRemove.has(normalise(key))) url.searchParams.delete(key);
    });

    if (nextState.q) url.searchParams.set("q", nextState.q);

    facetDefinitions.forEach((facet) => {
      normaliseFacetValues(facet.id, nextState.filters[facet.id]).forEach((value) => {
        url.searchParams.append(facet.urlKey, displayValueFor(facet.id, value));
      });
    });

    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  }

  function setControlsFromState(nextState) {
    searchInput.value = nextState.q;
    checkboxes.forEach((checkbox) => {
      const selectedValues = nextState.filters[checkbox.dataset.facet] || [];
      checkbox.checked = selectedValues.includes(
        canonicaliseFacetValue(checkbox.dataset.facet, checkbox.value)
      );
    });
  }

  function getStateFromControls() {
    const nextState = emptyStateModel();
    nextState.q = searchInput.value.trim();

    checkboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        nextState.filters[checkbox.dataset.facet].push(
          canonicaliseFacetValue(checkbox.dataset.facet, checkbox.value)
        );
      }
    });

    facetDefinitions.forEach((facet) => {
      nextState.filters[facet.id] = normaliseFacetValues(facet.id, nextState.filters[facet.id]);
    });

    return nextState;
  }

  function getCardFacets(card) {
    if (card._catalogFacets) return card._catalogFacets;

    let rawFacets = {};
    try {
      rawFacets = JSON.parse(card.dataset.facets || "{}");
    } catch (error) {
      rawFacets = {};
    }

    card._catalogFacets = Object.fromEntries(
      facetDefinitions.map((facet) => [
        facet.id,
        normaliseFacetValues(facet.id, rawFacets[facet.id])
      ])
    );
    return card._catalogFacets;
  }

  function matchesSearch(card, query) {
    const normalisedQuery = normalise(query);
    if (!normalisedQuery) return true;

    return [card.dataset.title, card.dataset.description]
      .map(normalise)
      .some((value) => value.includes(normalisedQuery));
  }

  function matchesFacets(card, nextState, excludedFacetId) {
    const cardFacets = getCardFacets(card);

    return facetDefinitions.every((facet) => {
      if (facet.id === excludedFacetId) return true;
      const selectedValues = nextState.filters[facet.id] || [];
      return selectedValues.length === 0
        || selectedValues.some((value) => cardFacets[facet.id].includes(value));
    });
  }

  function matchesState(card, nextState, excludedFacetId) {
    return matchesSearch(card, nextState.q) && matchesFacets(card, nextState, excludedFacetId);
  }

  function selectedFilterCount(nextState) {
    return facetDefinitions.reduce(
      (total, facet) => total + nextState.filters[facet.id].length,
      0
    );
  }

  function updateFacetOptionCounts(nextState) {
    facetDefinitions.forEach((facet) => {
      const candidateCards = cards.filter((card) => matchesState(card, nextState, facet.id));

      facetCheckboxes[facet.id].forEach((checkbox) => {
        const value = canonicaliseFacetValue(facet.id, checkbox.value);
        const count = candidateCards.filter((card) =>
          getCardFacets(card)[facet.id].includes(value)
        ).length;
        const option = checkbox.closest("[data-filter-option]");
        const countNode = option && option.querySelector("[data-option-count]");

        if (countNode) {
          countNode.textContent = String(count);
          countNode.setAttribute("aria-label", `${count} ${count === 1 ? "resource" : "resources"}`);
        }
        checkbox.disabled = count === 0 && !checkbox.checked;
        if (option) option.classList.toggle("is-unavailable", checkbox.disabled);
      });

      const selectedCountNode = catalog.querySelector(`[data-facet-selected-count="${facet.id}"]`);
      const selectedCount = nextState.filters[facet.id].length;
      if (selectedCountNode) {
        selectedCountNode.hidden = selectedCount === 0;
        selectedCountNode.textContent = selectedCount ? String(selectedCount) : "";
        selectedCountNode.setAttribute(
          "aria-label",
          `${selectedCount} ${selectedCount === 1 ? "filter" : "filters"} selected`
        );
      }
    });
  }

  function updateActiveFilters(nextState) {
    const totalSelected = selectedFilterCount(nextState);
    if (activeFilters) activeFilters.hidden = totalSelected === 0;
    if (activeFilterChips) activeFilterChips.replaceChildren();

    filterSelectionCounts.forEach((countNode) => {
      countNode.hidden = totalSelected === 0;
      countNode.textContent = totalSelected ? String(totalSelected) : "";
      countNode.setAttribute(
        "aria-label",
        `${totalSelected} ${totalSelected === 1 ? "filter" : "filters"} selected`
      );
    });

    if (!activeFilterChips) return;

    facetDefinitions.forEach((facet) => {
      nextState.filters[facet.id].forEach((value) => {
        const chip = document.createElement("button");
        const displayValue = displayValueFor(facet.id, value);
        chip.type = "button";
        chip.className = "resource-catalog__chip";
        chip.dataset.removeFacet = facet.id;
        chip.dataset.removeValue = value;
        chip.setAttribute("aria-label", `Remove ${facet.label}: ${displayValue}`);
        chip.append(`${facet.label}: ${displayValue} `);

        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "\u00d7";
        chip.append(icon);
        activeFilterChips.append(chip);
      });
    });
  }

  function updateResults(nextState) {
    const visibleCards = new Set(cards.filter((card) => matchesState(card, nextState)));
    const visibleCardsBySection = new Map(sections.map((section) => [section, 0]));

    cards.forEach((card) => {
      const isVisible = visibleCards.has(card);
      card.hidden = !isVisible;
      if (isVisible) {
        const section = card.closest("[data-resource-section]");
        visibleCardsBySection.set(section, (visibleCardsBySection.get(section) || 0) + 1);
      }
    });

    sections.forEach((section) => {
      const count = visibleCardsBySection.get(section) || 0;
      section.hidden = count === 0;
      const countNode = section.querySelector("[data-section-count]");
      if (countNode) countNode.textContent = `${count} ${count === 1 ? "resource" : "resources"}`;
    });

    const total = cards.length;
    const visibleTotal = visibleCards.size;
    if (resultCount) {
      resultCount.textContent = visibleTotal === total
        ? `Showing ${total} resources`
        : `Showing ${visibleTotal} of ${total} resources`;
    }
    sheetResultCounts.forEach((countNode) => {
      countNode.textContent = String(visibleTotal);
      countNode.setAttribute(
        "aria-label",
        `${visibleTotal} ${visibleTotal === 1 ? "resource" : "resources"}`
      );

      const suffix = countNode.nextSibling;
      if (suffix && suffix.nodeType === Node.TEXT_NODE) {
        suffix.nodeValue = suffix.nodeValue.replace(
          /\bresources?\b/,
          visibleTotal === 1 ? "resource" : "resources"
        );
      }
    });
    if (emptyState) emptyState.hidden = visibleTotal !== 0;
    clearSearchButton.hidden = !nextState.q;
  }

  function render(nextState) {
    updateResults(nextState);
    updateActiveFilters(nextState);
    updateFacetOptionCounts(nextState);
  }

  function syncFromControls({ replace = false } = {}) {
    state = getStateFromControls();
    writeStateToURL(state, { replace });
    render(state);
  }

  function clearFilters() {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    syncFromControls();
  }

  function clearSearch({ focus = true } = {}) {
    searchInput.value = "";
    syncFromControls();
    if (focus) searchInput.focus();
  }

  function isVisible(element) {
    return Boolean(element && element.isConnected && element.getClientRects().length);
  }

  function getFocusableElements() {
    if (!filterDialog) return [];
    return Array.from(filterDialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
    )).filter(isVisible);
  }

  function setSheetScrollLock(locked) {
    document.documentElement.classList.toggle("catalog-sheet-open", locked);
    document.body.classList.toggle("catalog-sheet-open", locked);
  }

  function cleanupClosedSheet(restoreFocus) {
    setSheetScrollLock(false);
    if (filterTrigger) filterTrigger.setAttribute("aria-expanded", "false");
    fallbackDialogOpen = false;

    if (restoreFocus && isVisible(lastFocusedElement)) {
      lastFocusedElement.focus({ preventScroll: true });
    }
    lastFocusedElement = null;
    restoreFocusOnClose = true;
  }

  function closeFilterSheet({ restoreFocus = true } = {}) {
    if (!filterDialog) return;
    restoreFocusOnClose = restoreFocus;

    if (typeof filterDialog.close === "function" && filterDialog.open) {
      filterDialog.close();
      return;
    }

    if (fallbackDialogOpen || filterDialog.hasAttribute("open")) {
      filterDialog.removeAttribute("open");
      filterDialog.classList.remove("is-fallback-open");
      cleanupClosedSheet(restoreFocusOnClose);
    }
  }

  function openFilterSheet() {
    if (!filterDialog || compactMode !== true) return;
    if (filterDialog.open || fallbackDialogOpen) return;

    lastFocusedElement = document.activeElement;
    restoreFocusOnClose = true;
    setSheetScrollLock(true);
    if (filterTrigger) filterTrigger.setAttribute("aria-expanded", "true");

    if (typeof filterDialog.showModal === "function") {
      filterDialog.showModal();
    } else {
      fallbackDialogOpen = true;
      filterDialog.setAttribute("open", "");
      filterDialog.setAttribute("aria-modal", "true");
      filterDialog.classList.add("is-fallback-open");
    }

    window.requestAnimationFrame(() => {
      const closeButton = filterDialog.querySelector("[data-close-filter-sheet]");
      const firstFocusable = closeButton || getFocusableElements()[0];
      if (firstFocusable) firstFocusable.focus({ preventScroll: true });
    });
  }

  function updateFilterMode() {
    if (!filterTrigger || !sidebarHost || !sheetHost) return;
    const nextCompactMode = window.getComputedStyle(filterTrigger).display !== "none";
    if (nextCompactMode === compactMode) return;

    const activeElement = document.activeElement;
    const focusWasInForm = filterForm.contains(activeElement);
    const focusWasInDialog = filterDialog && filterDialog.contains(activeElement);
    const triggerHadFocus = activeElement === filterTrigger;
    compactMode = nextCompactMode;

    if (compactMode) {
      sheetHost.append(filterForm);
      if (focusWasInForm && isVisible(filterTrigger)) {
        filterTrigger.focus({ preventScroll: true });
      }
      return;
    }

    if (filterDialog && (filterDialog.open || fallbackDialogOpen)) {
      closeFilterSheet({ restoreFocus: false });
    }
    sidebarHost.append(filterForm);

    if (focusWasInForm && activeElement.isConnected) {
      window.requestAnimationFrame(() => activeElement.focus({ preventScroll: true }));
    } else if (focusWasInDialog || triggerHadFocus) {
      window.requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
    }
  }

  filterForm.addEventListener("submit", (event) => event.preventDefault());

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => syncFromControls({ replace: true }), 150);
  });

  clearSearchButton.addEventListener("click", () => clearSearch());

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => syncFromControls());
  });

  catalog.addEventListener("click", (event) => {
    const removeChip = event.target.closest("[data-remove-facet]");
    if (removeChip) {
      const facetId = removeChip.dataset.removeFacet;
      const value = canonicaliseFacetValue(facetId, removeChip.dataset.removeValue);
      const checkbox = checkboxByFacetValue[facetId] && checkboxByFacetValue[facetId].get(value);
      if (checkbox) checkbox.checked = false;
      syncFromControls();
      return;
    }

    if (event.target.closest("[data-clear-filters]")) {
      clearFilters();
      return;
    }

    if (event.target.closest("[data-clear-search]")) {
      clearSearch();
      return;
    }

    if (event.target.closest("[data-close-filter-sheet]")) {
      closeFilterSheet();
    }
  });

  if (filterTrigger) {
    filterTrigger.setAttribute("aria-expanded", "false");
    filterTrigger.addEventListener("click", openFilterSheet);
  }

  if (filterDialog) {
    filterDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeFilterSheet();
    });
    filterDialog.addEventListener("close", () => {
      cleanupClosedSheet(restoreFocusOnClose);
    });
    filterDialog.addEventListener("click", (event) => {
      if (event.target === filterDialog) closeFilterSheet();
    });
    filterDialog.addEventListener("keydown", (event) => {
      if (!fallbackDialogOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeFilterSheet();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (!focusableElements.length) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  window.addEventListener("popstate", () => {
    window.clearTimeout(searchTimer);
    state = readStateFromURL();
    setControlsFromState(state);
    render(state);
  });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(updateFilterMode);
    observer.observe(catalog);
  } else {
    window.addEventListener("resize", updateFilterMode);
  }

  state = readStateFromURL();
  setControlsFromState(state);
  render(state);
  writeStateToURL(state, { replace: true });
  updateFilterMode();
});
