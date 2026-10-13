import {
  type EndpointIndex,
  type MetaData,
  ENDPOINT_PER_PAGE,
  DEFAULT_CATEGORY,
  FetchEndpointsByIndex,
  LoadEndpointsIndex,
  LoadMetaData,
  LoadSegments,
  LoadAllTags,
} from "./index.js";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let totalPages: number = 0; // will be computed from meta-data
let currentPage: number = 1;
let visibleEndpointsIndex: EndpointIndex[] = [];
let allEndpointsIndex: EndpointIndex[] = [];
let selectedPathFilters: string[] = [];
let selectedTagFilters: string[] = [];
let selectedCategory: string = DEFAULT_CATEGORY;
let renderToken: number = 0;

// ─────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────

const getMethodBadgeClasses = (method: string): string => {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-100 text-emerald-700 ";
    case "POST":
      return "bg-amber-100 text-amber-700 ";
    case "PUT":
      return "bg-sky-100 text-sky-700 ";
    case "DELETE":
      return "bg-rose-100 text-rose-700 ";
    default:
      return "bg-gray-100 text-gray-700 ";
  }
};

const updateCategoryTabStyles = (): void => {
  document
    .querySelectorAll<HTMLElement>(".search-category-tab")
    .forEach((tab) => {
      const isActive = tab.dataset["category"] === selectedCategory;
      tab.classList.toggle("bg-white", isActive);
      tab.classList.toggle("text-gray-900", isActive);
      tab.classList.toggle("shadow-sm", isActive);
      tab.classList.toggle("text-gray-700", !isActive);
      tab.classList.toggle("hover:bg-gray-200", !isActive);
    });
};

// ─────────────────────────────────────────────
// ENDPOINT LIST RENDERING
// ─────────────────────────────────────────────

const renderEndpoints = async (
  endpointsList?: EndpointIndex[],
): Promise<void> => {
  const tableBody = document.getElementById("endpointsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  const activeToken = renderToken;

  const start = (currentPage - 1) * ENDPOINT_PER_PAGE;
  const end = start + ENDPOINT_PER_PAGE;

  console.time("rendering_time");

  // get current page EIDs from visible endpoints
  const currentEndpoints = (endpointsList ?? visibleEndpointsIndex).slice(
    start,
    end,
  );

  // fetch ALL in parallel using cache
  const endpointData = await FetchEndpointsByIndex(currentEndpoints);
  if (activeToken !== renderToken) return;

  // use fragment for faster DOM rendering
  const fragment = document.createDocumentFragment();

  endpointData.forEach((endpoint) => {
    if (!endpoint) return;
    const annotation = endpoint.annotation ?? "";
    const words = annotation.trim().split(/\s+/).filter(Boolean);
    const shortAnnotation =
      words.length > 4 ? words.slice(0, 6).join(" ") + "..." : words.join(" ");

    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50 cursor-pointer";

    const eidCell = document.createElement("td");
    eidCell.className =
      "text-gray-500 hover:text-yellow-800 hover:bg-yellow-100";
    eidCell.textContent = endpoint.eid ?? "";

    const methodCell = document.createElement("td");
    methodCell.className = "px-4 py-2";
    const methodBadge = document.createElement("span");
    methodBadge.className = `inline-block px-2 py-1 text-md font-semibold rounded-full ${getMethodBadgeClasses(endpoint.method)}`;
    methodBadge.textContent = endpoint.method ?? "";
    methodCell.appendChild(methodBadge);

    const pathCell = document.createElement("td");
    pathCell.textContent = endpoint.path ?? "";

    const annotationCell = document.createElement("td");
    annotationCell.className = "text-wrap";
    annotationCell.textContent = shortAnnotation;

    const qpCell = document.createElement("td");
    qpCell.textContent = String(endpoint.qpPairs ?? "");

    const tagsCell = document.createElement("td");
    tagsCell.textContent = Array.isArray(endpoint.tags)
      ? endpoint.tags.join(", ")
      : "";

    const statusCell = document.createElement("td");
    statusCell.textContent = String(endpoint.status ?? "");

    row.append(
      eidCell,
      methodCell,
      pathCell,
      annotationCell,
      qpCell,
      tagsCell,
      statusCell,
    );
    fragment.appendChild(row);

    row.addEventListener("click", () => {
      openSQP(endpoint.eid);
    });
  });

  if (activeToken !== renderToken) return;
  tableBody.appendChild(fragment);
  console.timeEnd("rendering_time");
};

const openSQP = (eid: string): void => {
  window.open(`./Single-EQP.html?eid=${eid}`, "_blank");
};

// ─────────────────────────────────────────────
// CATEGORY COUNTS
// ─────────────────────────────────────────────

const updateCategoryCounts = async (
  indexList: EndpointIndex[] = visibleEndpointsIndex,
): Promise<void> => {
  const counts: Record<string, number> = {
    ALL: 0,
    GET: 0,
    POST: 0,
    PUT: 0,
    DELETE: 0,
  };
  const sourceList =
    allEndpointsIndex && allEndpointsIndex.length
      ? allEndpointsIndex
      : indexList;

  if (!sourceList || sourceList.length === 0) {
    const btnIds = [
      "count-all",
      "count-get",
      "count-post",
      "count-put",
      "count-delete",
    ];
    btnIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerText = "0";
    });
    return;
  }

  const details = await FetchEndpointsByIndex(sourceList);
  details.forEach((endpoint) => {
    const method = ((endpoint && endpoint.method) || "").toUpperCase();
    if (counts[method] !== undefined) {
      counts[method] = (counts[method] ?? 0) + 1;
    }
  });
  counts["ALL"] = sourceList.length;

  const countMap: Record<string, string> = {
    "count-all": String(counts["ALL"] ?? 0),
    "count-get": String(counts["GET"] ?? 0),
    "count-post": String(counts["POST"] ?? 0),
    "count-put": String(counts["PUT"] ?? 0),
    "count-delete": String(counts["DELETE"] ?? 0),
  };

  for (const [id, value] of Object.entries(countMap)) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  }
};

// ─────────────────────────────────────────────
// SEARCH & FILTER LOGIC
// ─────────────────────────────────────────────

const getSearchInputValue = (): string => {
  const input = document.querySelector<HTMLInputElement>(
    'main input[type="text"]',
  );
  return (input?.value ?? "").trim().toLowerCase();
};

const applyAllFilters = async (): Promise<void> => {
  let filteredIndex = [...allEndpointsIndex];

  if (selectedPathFilters.length > 0) {
    const segmentsData = await LoadSegments();
    const filteredEids = new Set<string>();
    selectedPathFilters.forEach((filter) => {
      const matchingEids = segmentsData[filter] ?? [];
      matchingEids.forEach((eid: string) => filteredEids.add(eid));
    });
    filteredIndex = filteredIndex.filter((entry) =>
      filteredEids.has(entry.eid),
    );
  }

  if (selectedTagFilters.length > 0) {
    const tagsData = await LoadAllTags();
    const filteredEids = new Set<string>();
    selectedTagFilters.forEach((filter) => {
      const matchingEids = tagsData[filter] ?? [];
      matchingEids.forEach((eid: string) => filteredEids.add(eid));
    });
    filteredIndex = filteredIndex.filter((entry) =>
      filteredEids.has(entry.eid),
    );
  }

  const query = getSearchInputValue();
  const needsDetailMatch = selectedCategory !== "ALL" || query;
  if (needsDetailMatch && filteredIndex.length > 0) {
    const details = await FetchEndpointsByIndex(filteredIndex);
    const refinedIndex: EndpointIndex[] = [];
    for (let i = 0; i < details.length; i++) {
      const endpoint = details[i];
      if (!endpoint) continue;

      const method = (endpoint.method ?? "").toUpperCase();
      if (selectedCategory !== "ALL" && method !== selectedCategory) {
        continue;
      }

      if (query) {
        const haystack = [
          endpoint.eid ?? "",
          endpoint.method ?? "",
          endpoint.path ?? "",
          endpoint.annotation ?? "",
          (endpoint.tags ?? []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          continue;
        }
      }

      const filteredEntry = filteredIndex[i];
      if (filteredEntry) refinedIndex.push(filteredEntry);
    }
    filteredIndex = refinedIndex;
  }

  visibleEndpointsIndex = filteredIndex;
  currentPage = 1;
  updateCategoryTabStyles();
  void updateCategoryCounts(filteredIndex);
  void renderCurrentPage();
};

const searchEndpoints = async (): Promise<void> => {
  await applyAllFilters();
};

const searchCategoryChange = async (category: string): Promise<void> => {
  selectedCategory = category;
  await applyAllFilters();
};

const clearAllFilters = (): void => {
  selectedPathFilters = [];
  selectedTagFilters = [];
  selectedCategory = "ALL";
  clearSidebarPathFilters();
  updateCategoryTabStyles();
  const input = document.querySelector<HTMLInputElement>(
    'main input[type="text"]',
  );
  if (input) input.value = "";
  visibleEndpointsIndex = [...allEndpointsIndex];
  currentPage = 1;
  void updateCategoryCounts(visibleEndpointsIndex);
  void renderCurrentPage();
};

// ─────────────────────────────────────────────
// PATH FILTERS (sidebar)
// ─────────────────────────────────────────────

const toggleSidebarPathFilter = (path: string, isChecked: boolean): void => {
  if (isChecked) {
    if (!selectedPathFilters.includes(path)) {
      selectedPathFilters.push(path);
    }
  } else {
    selectedPathFilters = selectedPathFilters.filter((p) => p !== path);
  }
  void applyAllFilters();
};

const toggleSidebarTagFilter = (tag: string, isChecked: boolean): void => {
  if (isChecked) {
    if (!selectedTagFilters.includes(tag)) {
      selectedTagFilters.push(tag);
    }
  } else {
    selectedTagFilters = selectedTagFilters.filter((t) => t !== tag);
  }
  void applyAllFilters();
};

const clearSidebarPathFilters = (): void => {
  selectedPathFilters = [];
  document
    .querySelectorAll<HTMLInputElement>(
      '.left .endpointsTags .content input[type="checkbox"]',
    )
    .forEach((checkbox) => {
      checkbox.checked = false;
    });
};

// ─────────────────────────────────────────────
// SIDEBAR LOADERS
// ─────────────────────────────────────────────

const loadSegments = async (): Promise<void> => {
  const sidebar_headings = document.querySelector(".left-sidebar-headings");
  if (sidebar_headings) {
    sidebar_headings.children[0]?.classList.add("active");
    sidebar_headings.children[1]?.classList.remove("active");
  }
  const sideSearchBar = document.querySelector(".left .endpointsTags .content");
  if (!sideSearchBar) return;

  sideSearchBar.innerHTML = "";
  try {
    const segments = await LoadSegments();
    for (const path in segments) {
      const pathElement = document.createElement("div");
      pathElement.className =
        "inputGR flex items-center justify-between gap-4 w-full hover:bg-white/30 rounded-lg px-3 py-2 cursor-pointer mb-2 border-2 border-transparent";
      const checkboxId = `path-filter-${path}`;
      pathElement.innerHTML = `
        <div class="flex items-center gap-4">
          <input class="accent-zinc-900 w-4 h-4" type="checkbox" name="path-filter" id="${checkboxId}" /> ${path}
        </div>
        <span class="text-xs text-muted-foreground">
          ${(segments[path] ?? []).length}
        </span>`;

      const checkbox = pathElement.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      if (checkbox) {
        checkbox.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        checkbox.addEventListener("change", () => {
          toggleSidebarPathFilter(path, checkbox.checked);
        });
        pathElement.addEventListener("click", () => {
          checkbox.checked = !checkbox.checked;
          toggleSidebarPathFilter(path, checkbox.checked);
          pathElement.classList.toggle("active", checkbox.checked);
        });
      }
      sideSearchBar.appendChild(pathElement);
    }
  } catch (error) {
    console.error("Error loading segments:", error);
  }
};

const loadAllTags = async (): Promise<void> => {
  const sidebar_headings = document.querySelector(".left-sidebar-headings");
  if (sidebar_headings) {
    sidebar_headings.children[1]?.classList.add("active");
    sidebar_headings.children[0]?.classList.remove("active");
  }
  const sideSearchBar = document.querySelector(".left .endpointsTags .content");
  if (!sideSearchBar) return;
  sideSearchBar.innerHTML = "";

  sideSearchBar.innerHTML = "";
  try {
    const tags = await LoadAllTags();
    for (const tag in tags) {
      const pathElement = document.createElement("div");
      pathElement.className =
        "inputGR flex items-center justify-between gap-4 w-full hover:bg-white/30 rounded-lg px-3 py-2 cursor-pointer border-2 border-transparent mb-2";
      const checkboxId = `path-filter-${tag}`;
      pathElement.innerHTML = `
        <div class="flex items-center gap-4">
          <input class="accent-zinc-900 w-4 h-4" type="checkbox" name="path-filter" id="${checkboxId}" /> ${tag}
        </div>
        <span class="text-xs text-muted-foreground">${(tags[tag] ?? []).length}</span>`;

      const checkbox = pathElement.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      if (checkbox) {
        checkbox.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        checkbox.addEventListener("change", () => {
          toggleSidebarTagFilter(tag, checkbox.checked);
        });
        pathElement.addEventListener("click", () => {
          checkbox.checked = !checkbox.checked;
          toggleSidebarTagFilter(tag, checkbox.checked);
          pathElement.classList.toggle("active", checkbox.checked);
        });
      }
      sideSearchBar.appendChild(pathElement);
    }
  } catch (error) {
    console.error("Error loading tags:", error);
  }
};

// ─────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────

const syncPaginationState = (): void => {
  totalPages = Math.max(
    1,
    Math.ceil(visibleEndpointsIndex.length / ENDPOINT_PER_PAGE),
  );
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
};

const updatePaginationDisplay = (): void => {
  const start = (currentPage - 1) * ENDPOINT_PER_PAGE;
  const end = Math.min(start + ENDPOINT_PER_PAGE, visibleEndpointsIndex.length);
  const paginationContainer = document.querySelector(".pagination");
  if (paginationContainer) {
    paginationContainer.textContent = `showing ${visibleEndpointsIndex.length > 0 ? start + 1 : 0} to ${end} of ${visibleEndpointsIndex.length} results`;
  }
};

const pagination = (metaData: MetaData): void => {
  totalPages = Math.ceil(
    metaData.endpoints ? metaData.endpoints / ENDPOINT_PER_PAGE : 0,
  );

  const prevButton = document.querySelector<HTMLButtonElement>("#prev-button");
  if (prevButton) {
    prevButton.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        void renderCurrentPage();
      }
    };
  }

  const nextButton = document.querySelector<HTMLButtonElement>("#next-button");
  if (nextButton) {
    nextButton.onclick = () => {
      if (currentPage < totalPages) {
        currentPage++;
        void renderCurrentPage();
      }
    };
  }

  const page_input = document.querySelector<HTMLInputElement>("#page-input");
  if (page_input) {
    page_input.value = String(currentPage);
    page_input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const page = parseInt(target.value);
      if (page >= 1 && page <= totalPages) {
        currentPage = page;
        void renderCurrentPage();
      }
    };
  }

  const max_page = document.querySelector("#max-page");
  if (max_page) {
    max_page.textContent = String(totalPages);
  }
};

// ─────────────────────────────────────────────
// PAGE RENDER
// ─────────────────────────────────────────────

const renderCurrentPage = async (): Promise<void> => {
  renderToken += 1;
  syncPaginationState();
  await renderEndpoints(visibleEndpointsIndex);
  updatePaginationDisplay();

  const max_page = document.querySelector("#max-page");
  if (max_page) {
    max_page.textContent = String(totalPages);
  }

  const page_input = document.querySelector<HTMLInputElement>("#page-input");
  if (page_input) {
    page_input.value = String(currentPage);
  }
};

// ─────────────────────────────────────────────
// VIEW TOGGLE
// ─────────────────────────────────────────────

const toggleView = (): void => {
  const sidebar = document.querySelector(".endpointsTags");
  const leftPanel = document.querySelector(".left");
  const rightPanel = document.querySelector(".right");

  if (!sidebar || !leftPanel || !rightPanel) return;

  const isCollapsed = sidebar.classList.toggle("hidden");
  sidebar.classList.toggle("w-0", isCollapsed);
  sidebar.classList.toggle("w-full", !isCollapsed);
  sidebar.classList.toggle("overflow-hidden", isCollapsed);

  leftPanel.classList.toggle("w-1/4", !isCollapsed);
  leftPanel.classList.toggle("w-0", isCollapsed);
  leftPanel.classList.toggle("px-2", !isCollapsed);
  leftPanel.classList.toggle("px-0", isCollapsed);
  leftPanel.classList.toggle("min-w-0", isCollapsed);
  leftPanel.classList.toggle("overflow-hidden", isCollapsed);
  leftPanel.classList.toggle("hidden", isCollapsed);

  rightPanel.classList.toggle("w-3/4", !isCollapsed);
  rightPanel.classList.toggle("w-full", isCollapsed);

  const floatingToggleButton = document.querySelector(".toggle-view.absolute");
  if (floatingToggleButton) {
    floatingToggleButton.classList.toggle("hidden", !isCollapsed);
  }
};

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────

const loadendpointsIndex = async (): Promise<void> => {
  allEndpointsIndex = await LoadEndpointsIndex();
  visibleEndpointsIndex = [...allEndpointsIndex];
  updateCategoryTabStyles();
  void updateCategoryCounts(visibleEndpointsIndex);
  void renderCurrentPage();
};

LoadMetaData().then((metaData) => {
  if (metaData) {
    const totalTagsEl = document.getElementById("total_tags");
    if (totalTagsEl) totalTagsEl.innerText = String(metaData.tags);

    const totalSegmentsEl = document.getElementById("total_segments");
    if (totalSegmentsEl) totalSegmentsEl.innerText = String(metaData.segments);

    const totalEndpointsEl = document.getElementById("total_endpoints");
    if (totalEndpointsEl)
      totalEndpointsEl.innerText = String(metaData.endpoints);

    pagination(metaData);
  }
  void loadendpointsIndex();
});

void loadSegments();

// ─────────────────────────────────────────────
// EXPOSE GLOBALS TO WINDOW
// ─────────────────────────────────────────────

(window as unknown as Record<string, unknown>)["searchEndpoints"] =
  searchEndpoints;
(window as unknown as Record<string, unknown>)["clearAllFilters"] =
  clearAllFilters;
(window as unknown as Record<string, unknown>)["searchCategoryChange"] =
  searchCategoryChange;
(window as unknown as Record<string, unknown>)["toggleView"] = toggleView;
(window as unknown as Record<string, unknown>)["loadSegments"] = loadSegments;
(window as unknown as Record<string, unknown>)["loadAllTags"] = loadAllTags;
