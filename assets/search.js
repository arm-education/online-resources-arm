document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("course-search");
  const clearBtn = document.getElementById("clear-search");
  const checkboxes = document.querySelectorAll(".filter-checkbox");
  const cards = document.querySelectorAll(".course-card");

  function paramsKeys(params) {
    const keys = new Set();
    for (const [k] of params.entries()) keys.add(k);
    return Array.from(keys);
  }

  function readStateFromURL() {
    const url = new URL(window.location);
    const params = url.searchParams;

    const state = {
      q: (params.get("q") || "").trim(),
      filters: {}
    };

    for (const key of paramsKeys(params)) {
      if (key === "q") continue;
      const all = params.getAll(key)
        .map(v => (v || "").trim().toLowerCase())
        .filter(Boolean);
      if (all.length) state.filters[key] = Array.from(new Set(all));
    }
    return state;
  }

  function writeStateToURL({ q, filters }, { replace = true } = {}) {
    const url = new URL(window.location);
    const params = new URLSearchParams();

    if (q) params.set("q", q);

    for (const cat of Object.keys(filters || {})) {
      const vals = Array.from(new Set((filters[cat] || [])
        .map(v => (v || "").trim().toLowerCase())
        .filter(Boolean)));
      for (const v of vals) params.append(cat, v);
    }

    url.search = params.toString();
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", url);
  }

  function setControlsFromState(state, { checkboxes, searchInput }) {
    if (searchInput) searchInput.value = state.q || "";
    const map = state.filters || {};
    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      const cat = cb.dataset.category;
      const val = (cb.value || "").toLowerCase();
      cb.checked = !!(map[cat] && map[cat].includes(val));
    }
  }

  function getStateFromControls({ checkboxes, searchInput }) {
    const filters = {};
    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      if (cb.checked) {
        const cat = cb.dataset.category;
        if (!filters[cat]) filters[cat] = [];
        filters[cat].push((cb.value || "").toLowerCase());
      }
    }
    return {
      q: (searchInput?.value || "").toLowerCase().trim(),
      filters
    };
  }

  function getSelectedFilters() {
    return getStateFromControls({ checkboxes, searchInput }).filters;
  }

  function matchesFilters(card, selectedFilters) {
    const keywords = (card.dataset.keywords || "").toLowerCase();
    for (let category in selectedFilters) {
      const values = selectedFilters[category];
      let match = false;
      for (let i = 0; i < values.length; i++) {
        if (keywords.includes(values[i])) {
          match = true;
          break;
        }
      }
      if (!match) return false;
    }
    return true;
  }

  function matchesSearch(card, query) {
    const title = (card.dataset.title || "").toLowerCase();
    const description = (card.dataset.description || "").toLowerCase();
    return query ? (title.includes(query) || description.includes(query)) : true;
  }

  // ⭐ this is opning section if a perticular format is selected.
  function openCollapsibleForSection(sectionEl) {
    const content = sectionEl.closest(".collapsible-content");
    if (!content) return;
    const container = content.parentElement; 
    if (!container.classList.contains("active")) {
      container.classList.add("active");
      // set height to allow smooth expand
      content.style.height = "auto";
      const h = content.scrollHeight;
      content.style.height = h + "px";
    }
  }

  function filterAndSearchCourses() {
    const query = (searchInput?.value.toLowerCase().trim()) || "";
    const selectedFilters = getSelectedFilters();

    let totalVisible = 0;
    const sectionVisibleCounts = new Map();
    const sectionNodes = new Set();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const passesSearch = matchesSearch(card, query);
      const passesFilter = matchesFilters(card, selectedFilters);
      const show = passesSearch && passesFilter;

      card.style.display = show ? "flex" : "none";

      const section = card.closest(".course-section");
      if (section) {
        sectionNodes.add(section);
        if (show) {
          const prev = sectionVisibleCounts.get(section) || 0;
          sectionVisibleCounts.set(section, prev + 1);
        }
      }

      if (show) totalVisible++;
    }

    // 2) update sections (banners/grids)
    sectionNodes.forEach(section => {
      const grid = section.querySelector(".course-card-grid");
      const message = section.querySelector(".no-results-message");
      const visibleCount = sectionVisibleCounts.get(section) || 0;

      if (message) {
        const empty = visibleCount === 0;
        message.style.display = empty ? "block" : "none";
      }
      if (grid) {
        grid.style.display = (visibleCount === 0) ? "none" : "grid";
      }
    });

   // this is for section open 
    const formatActive =
      (selectedFilters["format"] && selectedFilters["format"].length > 0) ||
      (selectedFilters["Format"] && selectedFilters["Format"].length > 0); 

    if (formatActive) {
      sectionNodes.forEach(section => {
        const visibleCount = sectionVisibleCounts.get(section) || 0;
        if (visibleCount > 0) {
          openCollapsibleForSection(section);
        }
      });
    }


    const noResultsGlobal = document.getElementById("no-results");
    if (noResultsGlobal) {
      noResultsGlobal.style.display = totalVisible === 0 ? "block" : "none";
    }


    document.querySelectorAll(".collapsible-content").forEach(section => {
      const container = section.parentElement;
      if (container.classList.contains("active")) {
        section.style.height = "auto";
        const height = section.scrollHeight;
        section.style.height = height + "px";
      }
    });
  }

  function resetSectionHeight(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const container = section.parentElement;
    if (container.classList.contains("active")) {
      section.style.height = "auto";
      const newHeight = section.scrollHeight;
      section.style.height = newHeight + "px";
    }
  }

  function applyUIAndSyncURL({ push = false } = {}) {
    const state = getStateFromControls({ checkboxes, searchInput });

    // drop empty categories so unticking removes them from URL
    for (const k of Object.keys(state.filters)) {
      if (!state.filters[k] || state.filters[k].length === 0) delete state.filters[k];
    }

    writeStateToURL(state, { replace: !push });
    requestAnimationFrame(filterAndSearchCourses);
  }

  // Initial load: URL -> controls -> filter
  (function initFromURL() {
    const state = readStateFromURL();
    setControlsFromState(state, { checkboxes, searchInput });
    filterAndSearchCourses();
  })();

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => applyUIAndSyncURL({ push: false }), 120);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      applyUIAndSyncURL({ push: true });
    });
  }

  for (let i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener("change", () => {
      applyUIAndSyncURL({ push: true });
    });
  }

  window.addEventListener("popstate", () => {
    const state = readStateFromURL();
    setControlsFromState(state, { checkboxes, searchInput });
    filterAndSearchCourses();
  });
});
