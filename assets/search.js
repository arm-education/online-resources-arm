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
  const filterPanel = catalog.querySelector("#catalog-filter-panel");
  const filterPanelSummary = filterPanel.querySelector("summary");
  const filterForm = catalog.querySelector("#resource-filters");
  const checkboxes = Array.from(catalog.querySelectorAll(".filter-checkbox"));
  const cards = Array.from(catalog.querySelectorAll("[data-resource-card]"));
  const sections = Array.from(catalog.querySelectorAll("[data-resource-section]"));
  const resultCount = catalog.querySelector("#resource-count");
  const activeFilters = catalog.querySelector("#active-filters");
  const activeFilterChips = catalog.querySelector("#active-filter-chips");
  const filterSelectionCount = catalog.querySelector("#filter-selection-count");
  const emptyState = catalog.querySelector("#no-results");
  const facetById = new Map(facetDefinitions.map((facet) => [facet.id, facet]));
  let searchTimer;
  let previousSidebarMode = null;

  const normalise = (value) => String(value || "").trim().toLocaleLowerCase();

  function emptyStateModel() {
    return {
      q: "",
      filters: Object.fromEntries(facetDefinitions.map((facet) => [facet.id, []]))
    };
  }

  function normaliseValues(values) {
    return Array.from(new Set((values || []).map(normalise).filter(Boolean)));
  }

  function getFacetDefinitionByUrlKey(key) {
    const normalisedKey = normalise(key);
    return facetDefinitions.find((facet) =>
      facet.aliases.includes(normalisedKey) || normalise(facet.urlKey) === normalisedKey
    );
  }

  function readStateFromURL() {
    const state = emptyStateModel();
    const params = new URL(window.location.href).searchParams;

    for (const [key, rawValue] of params.entries()) {
      if (normalise(key) === "q") {
        state.q = String(rawValue || "").trim();
        continue;
      }

      const facet = getFacetDefinitionByUrlKey(key);
      if (facet) state.filters[facet.id].push(normalise(rawValue));
    }

    facetDefinitions.forEach((facet) => {
      state.filters[facet.id] = normaliseValues(state.filters[facet.id]);
    });

    return state;
  }

  function writeStateToURL(state, { replace = false } = {}) {
    const url = new URL(window.location.href);
    const keysToRemove = new Set(["q", ...facetDefinitions.flatMap((facet) => [facet.urlKey, ...facet.aliases])].map(normalise));

    Array.from(url.searchParams.keys()).forEach((key) => {
      if (keysToRemove.has(normalise(key))) url.searchParams.delete(key);
    });

    if (state.q) url.searchParams.set("q", state.q);

    facetDefinitions.forEach((facet) => {
      normaliseValues(state.filters[facet.id]).forEach((value) => {
        url.searchParams.append(facet.urlKey, value);
      });
    });

    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  }

  function setControlsFromState(state) {
    searchInput.value = state.q;
    checkboxes.forEach((checkbox) => {
      const values = state.filters[checkbox.dataset.facet] || [];
      checkbox.checked = values.includes(normalise(checkbox.value));
    });
  }

  function getStateFromControls() {
    const state = emptyStateModel();
    state.q = searchInput.value.trim();

    checkboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        state.filters[checkbox.dataset.facet].push(normalise(checkbox.value));
      }
    });

    facetDefinitions.forEach((facet) => {
      state.filters[facet.id] = normaliseValues(state.filters[facet.id]);
    });

    return state;
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
      facetDefinitions.map((facet) => [facet.id, normaliseValues(rawFacets[facet.id])])
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

  function matchesFacets(card, state, excludedFacetId) {
    const cardFacets = getCardFacets(card);

    return facetDefinitions.every((facet) => {
      if (facet.id === excludedFacetId) return true;
      const selectedValues = state.filters[facet.id] || [];
      return selectedValues.length === 0 || selectedValues.some((value) => cardFacets[facet.id].includes(value));
    });
  }

  function matchesState(card, state, excludedFacetId) {
    return matchesSearch(card, state.q) && matchesFacets(card, state, excludedFacetId);
  }

  function selectedFilterCount(state) {
    return facetDefinitions.reduce((total, facet) => total + state.filters[facet.id].length, 0);
  }

  function displayValueFor(facetId, value) {
    const checkbox = checkboxes.find(
      (item) => item.dataset.facet === facetId && normalise(item.value) === value
    );
    return checkbox ? checkbox.value : value;
  }

  function updateFacetOptionCounts(state) {
    facetDefinitions.forEach((facet) => {
      const candidateCards = cards.filter((card) => matchesState(card, state, facet.id));
      const controls = checkboxes.filter((checkbox) => checkbox.dataset.facet === facet.id);

      controls.forEach((checkbox) => {
        const value = normalise(checkbox.value);
        const count = candidateCards.filter((card) => getCardFacets(card)[facet.id].includes(value)).length;
        const option = checkbox.closest("[data-filter-option]");
        const countNode = option.querySelector("[data-option-count]");

        countNode.textContent = `(${count})`;
        checkbox.disabled = count === 0 && !checkbox.checked;
        option.classList.toggle("is-unavailable", checkbox.disabled);
      });

      const selectedCountNode = catalog.querySelector(`[data-facet-selected-count="${facet.id}"]`);
      const selectedCount = state.filters[facet.id].length;
      selectedCountNode.hidden = selectedCount === 0;
      selectedCountNode.textContent = selectedCount ? `${selectedCount} selected` : "";
    });
  }

  function updateActiveFilters(state) {
    const totalSelected = selectedFilterCount(state);
    activeFilters.hidden = totalSelected === 0;
    activeFilterChips.replaceChildren();
    filterSelectionCount.textContent = totalSelected ? `(${totalSelected})` : "";

    facetDefinitions.forEach((facet) => {
      state.filters[facet.id].forEach((value) => {
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
        icon.textContent = "×";
        chip.append(icon);
        activeFilterChips.append(chip);
      });
    });
  }

  function updateResults(state) {
    const visibleCards = cards.filter((card) => matchesState(card, state));
    const visibleCardsBySection = new Map(sections.map((section) => [section, 0]));

    cards.forEach((card) => {
      const isVisible = visibleCards.includes(card);
      card.hidden = !isVisible;
      if (isVisible) {
        const section = card.closest("[data-resource-section]");
        visibleCardsBySection.set(section, visibleCardsBySection.get(section) + 1);
      }
    });

    sections.forEach((section) => {
      const count = visibleCardsBySection.get(section) || 0;
      section.hidden = count === 0;
      const countNode = section.querySelector("[data-section-count]");
      countNode.textContent = `${count} ${count === 1 ? "resource" : "resources"}`;
    });

    const total = cards.length;
    const visibleTotal = visibleCards.length;
    resultCount.textContent = visibleTotal === total
      ? `Showing ${total} resources`
      : `Showing ${visibleTotal} of ${total} resources`;
    emptyState.hidden = visibleTotal !== 0;
    clearSearchButton.hidden = !state.q;
  }

  function render(state) {
    updateResults(state);
    updateActiveFilters(state);
    updateFacetOptionCounts(state);
  }

  function syncFromControls({ replace = false } = {}) {
    const state = getStateFromControls();
    writeStateToURL(state, { replace });
    render(state);
  }

  function clearFilters() {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    syncFromControls();
  }

  function clearSearch() {
    searchInput.value = "";
    syncFromControls();
    searchInput.focus();
  }

  function updateFilterPanelMode() {
    const isSidebarMode = window.getComputedStyle(filterPanelSummary).display === "none";

    if (isSidebarMode) {
      filterPanel.open = true;
    } else if (previousSidebarMode === true || previousSidebarMode === null) {
      filterPanel.open = false;
    }

    previousSidebarMode = isSidebarMode;
  }

  filterForm.addEventListener("submit", (event) => event.preventDefault());

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => syncFromControls({ replace: true }), 150);
  });

  clearSearchButton.addEventListener("click", clearSearch);

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => syncFromControls());
  });

  catalog.addEventListener("click", (event) => {
    const removeChip = event.target.closest("[data-remove-facet]");
    if (removeChip) {
      const checkbox = checkboxes.find(
        (item) => item.dataset.facet === removeChip.dataset.removeFacet
          && normalise(item.value) === removeChip.dataset.removeValue
      );
      if (checkbox) checkbox.checked = false;
      syncFromControls();
      return;
    }

    if (event.target.closest("[data-clear-filters]")) {
      clearFilters();
      return;
    }

    if (event.target.closest("[data-clear-search]")) clearSearch();
  });

  window.addEventListener("popstate", () => {
    const state = readStateFromURL();
    setControlsFromState(state);
    render(state);
  });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(updateFilterPanelMode);
    observer.observe(catalog);
  } else {
    window.addEventListener("resize", updateFilterPanelMode);
  }

  const initialState = readStateFromURL();
  setControlsFromState(initialState);
  render(initialState);
  updateFilterPanelMode();
});
