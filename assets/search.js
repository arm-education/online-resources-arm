document.addEventListener("DOMContentLoaded", function () {
  const catalog = document.querySelector("[data-resource-catalog]");
  if (!catalog) return;

  const themeButton=document.querySelector('[data-theme-toggle]');
  const applyTheme=light=>{document.documentElement.dataset.theme=light?'light':'dark';themeButton.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');themeButton.title=themeButton.getAttribute('aria-label');};
  let savedTheme='dark';try{savedTheme=localStorage.getItem('arm-catalog-theme') || 'dark';}catch{}
  applyTheme(savedTheme==='light');
  themeButton.addEventListener('click',()=>{const light=document.documentElement.dataset.theme!=='light';applyTheme(light);try{localStorage.setItem('arm-catalog-theme',light?'light':'dark');}catch{}});
  document.querySelector('[data-header-home]').addEventListener('click',()=>catalog.querySelector('[data-home-return]').click());
  document.querySelector('[data-header-browse]').addEventListener('click',()=>{catalog.querySelector('[data-home-return]').click();catalog.querySelector('[data-home-browse]').click();});
  const pageSize = 24;
  let currentPage = 1;
  const pagination = catalog.querySelector('.catalog-pagination');
  const pageNumbers = catalog.querySelector('.catalog-page-numbers');
  const pageStatus = catalog.querySelector('.catalog-page-status');
  let browseRequested = new URL(location.href).searchParams.get('browse') === '1';
  let guidedTopic = false;
  const formatViews = Array.from(catalog.querySelectorAll('[data-format-view]'));
  const facetDefinitions = [
    { id: 'platform', label: 'Platforms', urlKey: 'platform', aliases: ['platform'] },
    { id: 'os', label: 'Operating systems', urlKey: 'os', aliases: ['os'] },
    { id: 'tools', label: 'Tools & languages', urlKey: 'tools', aliases: ['tools'] },
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

  const audienceButtons = Array.from(catalog.querySelectorAll("button[data-audience]"));
  let audience = new URL(location.href).searchParams.get("audience") || "all";
  if (!["all", "learn", "teach"].includes(audience)) audience = "all";
  audienceButtons.forEach(button => button.addEventListener("click", () => {
    if (button.closest('#catalog-guide')) return;
    audience = button.dataset.audience;
    syncFromControls();
  }));
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

  const levelOrder = ['beginner','intermediate','advanced'];
  function cardLevel(card) { return getCardFacets(card).level.find(level => levelOrder.includes(level)) || ''; }
  cards.sort((a,b) => {
    const left = levelOrder.indexOf(cardLevel(a)); const right = levelOrder.indexOf(cardLevel(b));
    return (left < 0 ? 3 : left) - (right < 0 ? 3 : right) || a.dataset.title.localeCompare(b.dataset.title);
  });
  const cardGrid = catalog.querySelector('.resource-card-grid');
  if (cardGrid) cards.forEach(card => cardGrid.append(card));

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
    const requestedPage = Number(params.get('page') || 1);
    currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

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
    // Local downloaded previews work without a web-server history origin.
    if (window.location.protocol === "file:") return;
    const url = new URL(window.location.href);
    const keysToRemove = new Set(
      ["q", ...facetDefinitions.flatMap((facet) => [facet.urlKey, ...facet.aliases])].map(normalise)
    );

    Array.from(url.searchParams.keys()).forEach((key) => {
      if (keysToRemove.has(normalise(key))) url.searchParams.delete(key);
    });

    url.searchParams.delete('browse');
    if(browseRequested) url.searchParams.set('browse','1');
    url.searchParams.delete('page');
    if (currentPage > 1) url.searchParams.set('page', currentPage);
    url.searchParams.delete("audience");
    if (audience !== "all") url.searchParams.set("audience", audience);
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

  let lastSearchQuery = null;
  let lastSearchPlan = null;
  const searchStopWords = new Set('i im m me my want would like to learn about on the a an and or for with of in how can do you please show some am today resources resource only'.split(' '));
  const searchAliases = {ai: ['ai','machine learning','neural'],ml: ['ml','machine learning'],chip: ['chip','soc'],chips: ['chips','soc'],soc: ['soc','system on chip'],iot: ['iot','embedded','sensors'],microcontrollers: ['microcontrollers','microcontroller','embedded'],rtos: ['rtos','freertos','zephyr'],educator:['educator','educators','teach','teaching'],teaching:['teach','teaching']};
  const searchText = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
  function searchPlan(query) {
    if (query === lastSearchQuery) return lastSearchPlan;
    const lower = searchText(query);
    const level = /\badvanced\b/.test(lower) ? 'advanced' : /\b(intermediate|intermedite)\b/.test(lower) ? 'intermediate' : /\b(beginner|beginning|new)\b/.test(lower) ? 'beginner' : '';
    const format = /\bprojects?\b/.test(lower) && !/project based/.test(lower) ? 'project' : /\bcourses?\b/.test(lower) ? 'course' : /\bbooks?\b/.test(lower) ? 'books' : /\b(teaching materials|education kits?|teaching kits?|kits?)\b/.test(lower) ? 'education kit' : /\blearning paths?\b/.test(lower) ? 'learning path' : '';
    const ignored = new Set([...searchStopWords]);
    if (level) ['beginner','beginning','new','intermediate','intermedite','advanced'].forEach(x => ignored.add(x));
    if (format) ['project','projects','course','courses','book','books','teaching','materials','educator','kit','kits','learning','path','paths'].forEach(x => ignored.add(x));
    const groups = lower.split(/\s+/).filter(x => x && !ignored.has(x)).map(x => searchAliases[x] || [x]);
    lastSearchQuery = query; lastSearchPlan = {level, format, groups};
    return lastSearchPlan;
  }
  function matchesSearch(card, query) {
    if (!normalise(query)) return true;
    const plan = searchPlan(query);
    const facets = getCardFacets(card);
    if (plan.level && !facets.level.includes(plan.level)) return false;
    if (plan.format && !facets.format.includes(plan.format)) return false;
    if (!card._searchText) card._searchText = ' ' + searchText([card.dataset.title,card.dataset.keywords,card.querySelector('.resource-card__summary')?.textContent,...Object.values(facets).flat()].join(' ')) + ' ';
    const text = card._searchText;
    return plan.groups.every(aliases => aliases.some(alias => text.includes(' ' + alias + ' ') || (alias.length >= 3 && !alias.includes(' ') && text.split(' ').some(word => word.startsWith(alias)))));
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
    return (audience === "all" || (card.dataset.audience || "").split(" ").includes(audience)) && matchesSearch(card, nextState.q) && matchesFacets(card, nextState, excludedFacetId);
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
        if (option) {
          option.classList.toggle("is-unavailable", checkbox.disabled);
          if (facet.id === 'format') option.hidden = count === 0 && !checkbox.checked;
        }
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
    const totalSelected = selectedFilterCount(nextState) + (audience === "all" ? 0 : 1);
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
    if (audience !== 'all') {
      const chip=document.createElement('button');chip.type='button';chip.className='resource-catalog__chip';
      const label=audience==='teach'?'Teaching':'Learning';
      chip.textContent=`Audience: ${label} ×`;chip.setAttribute('aria-label',`Remove audience: ${label}`);
      chip.addEventListener('click',()=>{audience='all';syncFromControls();});activeFilterChips.append(chip);
    }


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
    const matchingCards = cards.filter((card) => matchesState(card, nextState));
    const matchingTotal = matchingCards.length;
    const pageCount = Math.max(1, Math.ceil(matchingTotal / pageSize));
    currentPage = Math.min(currentPage, pageCount);
    const offset = (currentPage - 1) * pageSize;
    const visibleCards = new Set(matchingCards.slice(offset, offset + pageSize));
    updatePagination(pageCount, matchingTotal);
    const visibleCardsBySection = new Map(sections.map((section) => [section, 0]));

    cards.forEach((card) => {
      const isVisible = visibleCards.has(card);
      card.hidden = !isVisible;
      if (isVisible) {
        const section = card.closest("[data-resource-section]");
        visibleCardsBySection.set(section, (visibleCardsBySection.get(section) || 0) + 1);
      }
    });

    catalog.querySelectorAll('[data-level-heading]').forEach(heading => heading.remove());
    let previousLevel = null;
    cards.filter(card => visibleCards.has(card)).forEach(card => {
      const level = cardLevel(card);
      if (level !== previousLevel) {
        const heading = document.createElement('h2');
        heading.className = 'resource-level-heading'; heading.dataset.levelHeading = level;
        heading.textContent = level ? level.charAt(0).toUpperCase()+level.slice(1) : 'Other resources';
        card.parentNode.insertBefore(heading,card); previousLevel=level;
      }
    });

    sections.forEach((section) => {
      const count = visibleCardsBySection.get(section) || 0;
      section.hidden = count === 0;
      const countNode = section.querySelector("[data-section-count]");
      if (countNode) countNode.textContent = `${count} ${count === 1 ? "resource" : "resources"}`;
    });

    const total = cards.length;
    const visibleTotal = matchingTotal;
    if (resultCount) {
      resultCount.textContent = visibleTotal === 0
        ? `No matching resources (${total} in catalogue)`
        : `Showing ${offset + 1}–${Math.min(offset + pageSize, visibleTotal)} of ${visibleTotal} ${visibleTotal === 1 ? 'resource' : 'resources'}${visibleTotal === total ? '' : ` · ${total} in catalogue`}`;
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
    catalog.querySelectorAll('[data-clear-search]').forEach(button => {button.hidden = !nextState.q;});
  }

  function updatePagination(pageCount, matchingTotal) {
    if (!pagination) return;
    pagination.hidden = matchingTotal <= pageSize;
    pagination.querySelector('[data-page-prev]').disabled = currentPage <= 1;
    pagination.querySelector('[data-page-next]').disabled = currentPage >= pageCount;
    pageStatus.textContent = `Page ${currentPage} of ${pageCount}`;
    pageNumbers.replaceChildren();
    const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
    for (let page = start; page <= Math.min(pageCount, start + 4); page++) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = String(page); button.dataset.page = String(page);
      button.setAttribute('aria-label', `Page ${page}`);
      if (page === currentPage) button.setAttribute('aria-current', 'page');
      pageNumbers.append(button);
    }
  }

  function render(nextState) {
    const hasSelection = audience !== 'all' || !!nextState.q || Object.values(nextState.filters).some(values=>values.length);
    catalog.classList.toggle('catalog-home-active',!browseRequested && !hasSelection);

    const availableFormatCards = cards.filter(card => matchesState(card,nextState,'format'));
    formatViews.forEach(button => {
      const formats = nextState.filters.format;
      const selected = button.dataset.formatView
        ? formats.length === 1 && formats.includes(normalise(button.dataset.formatView))
        : formats.length === 0;
      button.setAttribute('aria-pressed', String(selected));
      const availableCount = button.dataset.formatView ? availableFormatCards.filter(card => getCardFacets(card).format.includes(normalise(button.dataset.formatView))).length : availableFormatCards.length;
      button.dataset.resultCount = String(availableCount);
      button.hidden = !!button.dataset.formatView && availableCount === 0 && !selected;
    });
    audienceButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.audience === audience)));
    updateResults(nextState);
    updateActiveFilters(nextState);
    updateFacetOptionCounts(nextState);
    catalog.querySelectorAll('[data-guide-level]').forEach(button => {
      const value=normalise(button.dataset.guideLevel);
      const checkbox=facetCheckboxes.level.find(c=>normalise(c.value)===value);
      button.disabled=!!value && !!checkbox?.disabled;
      button.setAttribute('aria-pressed',String(value ? nextState.filters.level.includes(value) : nextState.filters.level.length===0));
    });
    catalog.querySelectorAll('[data-guide-topic]').forEach(button => {
      const value=normalise(button.dataset.guideTopic);
      const checkbox=facetCheckboxes.pathways.find(c=>normalise(c.value)===value);
      button.disabled=!!value && !!checkbox?.disabled;
      button.setAttribute('aria-pressed',String(value ? nextState.filters.pathways.includes(value) : nextState.filters.pathways.length===0));
    });
    const guideSummary=catalog.querySelector('[data-guide-summary]');
    if(guideSummary) guideSummary.textContent=resultCount.textContent.replace(/^Showing \d+–\d+ of /,'Found ');
    const secondaryCount = ['platform','os','tools'].reduce((n,key) => n + nextState.filters[key].length, 0);
    const moreCount = catalog.querySelector('[data-more-filter-count]');
    if (moreCount) { moreCount.hidden = secondaryCount === 0; moreCount.textContent = secondaryCount ? String(secondaryCount) : ''; }
    if (secondaryCount) {
      const more = catalog.querySelector('.catalog-more-filters');
      if (more) more.open = true;
    }
    checkboxes.filter(c => c.checked).forEach(c => { const group=c.closest('.catalog-filter-group'); if (group) group.open=true; });
    catalog.dispatchEvent(new Event('catalog-state-change'));
  }

  function syncFromControls({ replace = false } = {}) {
    currentPage = 1;
    state = getStateFromControls();
    writeStateToURL(state, { replace });
    render(state);
  }

  function clearFilters() {
    audience = "all";
    if (toolSearch) {
      toolSearch.value = '';
      toolSearch.dispatchEvent(new Event('input'));
    }
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

  formatViews.forEach(button => button.addEventListener('click', () => {
    const value = button.getAttribute('aria-pressed') === 'true' ? '' : button.dataset.formatView;
    facetCheckboxes.format.forEach(checkbox => {
      checkbox.checked = !!value && normalise(checkbox.value) === normalise(value);
    });
    syncFromControls();
  }));

  if (pagination) pagination.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-page-prev')) currentPage--;
    else if (button.hasAttribute('data-page-next')) currentPage++;
    else if (button.dataset.page) currentPage = Number(button.dataset.page);
    else return;
    updateResults(state);
    writeStateToURL(state);
    resultCount.scrollIntoView({block: 'start', behavior: 'instant'});
    resultCount.setAttribute('tabindex', '-1');
    resultCount.focus({preventScroll: true});
  });

  const toolSearch = filterForm.querySelector('[data-facet-options-search]');
  if (toolSearch) toolSearch.addEventListener('input', () => {
    const query = normalise(toolSearch.value);
    filterForm.querySelectorAll('[data-options-facet="tools"] [data-filter-option]').forEach(option => {
      option.hidden = !normalise(option.querySelector('input').value).includes(query);
    });
  });

  const mainSearchForm = catalog.querySelector('#catalogue-main-search');
  if (mainSearchForm) mainSearchForm.addEventListener('submit', event => {event.preventDefault();browseRequested=true;catalog.querySelector('#catalog-guide').hidden=true;catalog.querySelector('.catalog-guide-toggle').setAttribute('aria-expanded','false');window.clearTimeout(searchTimer);syncFromControls();});
  catalog.querySelector('[data-home-browse]').addEventListener('click',()=>{browseRequested=true;syncFromControls();resultCount.scrollIntoView({block:'start'});});
  catalog.querySelector('[data-home-return]').addEventListener('click',()=>{window.clearTimeout(searchTimer);browseRequested=false;guidedTopic=false;catalog.querySelector('#catalog-guide').classList.remove('guide-topic-route');audience='all';searchInput.value='';checkboxes.forEach(c=>{c.checked=false;});syncFromControls();catalog.querySelector('#catalog-guide').hidden=true;catalog.querySelector('.catalog-guide-recap').hidden=true;catalog.querySelector('.catalog-guide-toggle').setAttribute('aria-expanded','false');catalog.scrollIntoView({block:'start'});});
  catalog.querySelector('[data-nav-home]').addEventListener('click',()=>catalog.querySelector('[data-home-return]').click());
  const guide = catalog.querySelector('#catalog-guide');
  const guideToggle = catalog.querySelector('.catalog-guide-toggle');
  if (guide && guideToggle) {
    const recap=catalog.querySelector('.catalog-guide-recap');
    const openGuide=()=>{guide.hidden=false;recap.hidden=true;guideToggle.setAttribute('aria-expanded','true');
      guide.querySelector('[data-guide-step="level"]').hidden=false;
      guide.querySelector('[data-guide-step="topic"]').hidden=guidedTopic;
      guide.setAttribute('tabindex','-1');guide.focus({preventScroll:true});};
    const updateOrientation=()=>{
      const picking=!guide.hidden;catalog.classList.toggle('catalog-choosing',picking);
      const home=catalog.classList.contains('catalog-home-active');
      const topics=state.filters.pathways.map(v=>facetCheckboxes.pathways.find(c=>normalise(c.value)===v)?.value || v);
      const levels=state.filters.level.map(v=>v.charAt(0).toUpperCase()+v.slice(1));
      const label=[audience==='teach'?'Teaching':audience==='learn'?'Learning':'',...topics,...levels].filter(Boolean).join(' · ');
      catalog.querySelector('[data-guide-recap]').textContent=label;
      catalog.querySelector('[data-nav-location]').textContent=picking?'Choose resources':home?'Explore resources':label || (state.q?'Search results':'All resources');
      catalog.querySelector('[data-nav-choices]').hidden=home || picking;
      guide.querySelector('[data-guide-location]').textContent=label || 'Choose what you need, then your level and topic.';
    };
    new MutationObserver(updateOrientation).observe(guide,{attributes:true,attributeFilter:['hidden']});
    catalog.addEventListener('catalog-state-change',updateOrientation);
    catalog.querySelector('[data-nav-choices]').addEventListener('click',()=>{openGuide();guide.scrollIntoView({block:'start'});});
    guide.querySelector('[data-guide-start-over]').addEventListener('click',()=>{
      catalog.querySelector('[data-home-return]').click();
      guide.querySelector('[data-guide-step="level"]').hidden=true;guide.querySelector('[data-guide-step="topic"]').hidden=true;guide.querySelector('.catalog-guide-finish').hidden=true;
      guide.hidden=false;guideToggle.setAttribute('aria-expanded','true');
    });
    catalog.querySelector('[data-guide-edit]').addEventListener('click',openGuide);
    guideToggle.addEventListener('click', () => {
      recap.hidden=true;
      guide.hidden = !guide.hidden;
      guideToggle.setAttribute('aria-expanded', String(!guide.hidden));
    });
    audienceButtons.forEach(button => button.addEventListener('click', () => {
      guidedTopic=false;guide.classList.remove('guide-topic-route');
      guide.querySelector('[data-guide-level-label]').textContent=button.dataset.audience==='teach'?'2. What level of resource do you need?':'2. What is your experience level?';
      audience=button.dataset.audience;window.clearTimeout(searchTimer);searchInput.value='';
      checkboxes.forEach(c=>{c.checked=false;});
      syncFromControls();
      guide.querySelector('[data-guide-step="topic"]').hidden=true;
      guide.querySelector('.catalog-guide-finish').hidden=true;
      guide.querySelector('[data-guide-step="level"]').hidden = false;
    }));
    catalog.querySelectorAll('[data-home-topic]').forEach(button=>button.addEventListener('click',()=>{
      guidedTopic=true;guide.classList.add('guide-topic-route');audience='learn';searchInput.value='';checkboxes.forEach(c=>{c.checked=false;});
      facetCheckboxes.pathways.forEach(c=>{c.checked=normalise(c.value)===normalise(button.dataset.homeTopic);});
      syncFromControls();openGuide();guide.querySelector('[data-guide-level-label]').textContent='Choose your experience level';guide.querySelector('[data-guide-step="level"]').hidden=false;guide.querySelector('[data-guide-step="topic"]').hidden=true;guide.querySelector('.catalog-guide-finish').hidden=true;guide.scrollIntoView({block:'start'});
    }));
    catalog.querySelector('[data-home-teach]').addEventListener('click',()=>{audienceButtons.find(b=>b.dataset.audience==='teach').click();openGuide();guide.scrollIntoView({block:'start'});});
    guide.querySelectorAll('[data-guide-level]').forEach(button => button.addEventListener('click', () => {
      window.clearTimeout(searchTimer);searchInput.value='';
      facetCheckboxes.level.forEach(c => {c.checked = !!button.dataset.guideLevel && normalise(c.value) === normalise(button.dataset.guideLevel);});
      syncFromControls();guide.querySelector('[data-guide-step="topic"]').hidden=guidedTopic;
      if(guidedTopic) guide.querySelector('.catalog-guide-finish').hidden=false;
    }));
    guide.querySelectorAll('[data-guide-topic]').forEach(button => button.addEventListener('click', () => {
      window.clearTimeout(searchTimer);searchInput.value='';
      facetCheckboxes.pathways.forEach(c => {c.checked=!!button.dataset.guideTopic && normalise(c.value)===normalise(button.dataset.guideTopic);});
      syncFromControls();guide.querySelector('.catalog-guide-finish').hidden=false;
    }));
    guide.querySelector('[data-guide-results]').addEventListener('click', () => {
      const selected=[audience==='teach'?'Teaching':audience==='learn'?'Learning':'All audiences',...state.filters.level.map(v=>v.charAt(0).toUpperCase()+v.slice(1)),...state.filters.pathways.map(v=>facetCheckboxes.pathways.find(c=>normalise(c.value)===v)?.value || v)];
      catalog.querySelector('[data-guide-recap]').textContent=selected.join(' · ');
      guide.hidden=true;recap.hidden=false;guideToggle.setAttribute('aria-expanded','false');
      resultCount.scrollIntoView({block:'start',behavior:'instant'});resultCount.setAttribute('tabindex','-1');resultCount.focus({preventScroll:true});
    });
  }

  window.addEventListener("popstate", () => {
    browseRequested=new URL(location.href).searchParams.get("browse")==="1";
    window.clearTimeout(searchTimer);
    audience = new URL(location.href).searchParams.get("audience") || "all";
    if (!["all", "learn", "teach"].includes(audience)) audience = "all";
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
