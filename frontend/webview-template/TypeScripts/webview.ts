import {
  type Endpoint,
  type EndpointIndex,
  type MetaData,
  type methodType,
  ENDPOINT_PER_PAGE,
  DEFAULT_CATEGORY,
  FetchEndpointsByIndex,
  FetchEndpointDetail,
  LoadEndpointsIndex,
  LoadMetaData,
  LoadRequestPanelData,
  LoadResponsePanelData,
  LoadSegments,
  LoadAllTags,
} from "./index.js";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let selectedEndpointEid: string = "";
let selectedCategory: string = DEFAULT_CATEGORY;
let currentPage: number = 1;
let totalPages: number = 0;
let visibleEndpointsIndex: EndpointIndex[] = [];
let allEndpointsIndex: EndpointIndex[] = [];
let selectedPathFilters: string[] = [];
let selectedTagFilters: string[] = [];
let _visibleEndpointsBeforeSearch: EndpointIndex[] | null = null;

// ─────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────

const getMethodBadgeClasses = (method: methodType): string => {
  switch (method) {
    case "GET":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "POST":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "PUT":
      return "bg-sky-100 text-sky-700 border border-sky-200";
    case "DELETE":
      return "bg-rose-100 text-rose-700 border border-rose-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
};

const showDetailPlaceholder = (show: boolean): void => {
  const placeholder = document.getElementById("detail-placeholder");
  const content = document.getElementById("detail-content");
  if (placeholder && content) {
    placeholder.classList.toggle("hidden", !show);
    content.classList.toggle("hidden", show);
  }
};

const syncSelectedEndpointStyles = (): void => {
  document.querySelectorAll<HTMLElement>(".endpoint-card").forEach((card) => {
    card.classList.toggle("active", card.dataset["eid"] === selectedEndpointEid);
  });
};

const addStyleForEndpointCard = (
  card: HTMLDivElement,
  endpointID: string,
): void => {
  // remove any existing SQP buttons from other cards
  document
    .querySelectorAll(".endpoint-card .sqp-view-btn")
    .forEach((b) => b.remove());

  if (endpointID === selectedEndpointEid) {
    card.classList.add("active");
    if (!card.querySelector(".sqp-view-btn")) {
      const btn = document.createElement("button");
      btn.className =
        "sqp-view-btn absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-teal-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:from-teal-500 hover:to-emerald-500 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-gray-50";
      btn.type = "button";
      btn.setAttribute("aria-label", `Open single endpoint view for ${endpointID}`);
      btn.innerHTML = `
				<svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<path d="M7.5 4.5H5A1.5 1.5 0 0 0 3.5 6v9A1.5 1.5 0 0 0 5 16.5h9A1.5 1.5 0 0 0 15.5 15v-2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M9 11l7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M11.5 4H16v4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span>SQP view</span>
			`;
      btn.addEventListener("click", () => {
        window.open(`./Single-EQP.html?eid=${endpointID}`, "_blank");
      });
      card.append(btn);
    }
  } else {
    card.classList.remove("active");
    card.querySelector(".sqp-view-btn")?.remove();
  }
};

// ─────────────────────────────────────────────
// DETAIL PANEL LOADERS
// ─────────────────────────────────────────────

const loadResponsePanel = async (eid: string, rqIndex: number): Promise<void> => {
  console.log("Loading response panel for EID:", eid, "RQ Index:", rqIndex + 1);
  const responseD = await LoadResponsePanelData(eid, rqIndex);
  if (!responseD) return;

  const responsePanel = document.getElementById("response-panel");
  if (!responsePanel) {
    console.error("Response panel element not found");
    return;
  }
  responsePanel.innerHTML = `
	 <pre class="text-sm whitespace-pre-wrap break-words">${JSON.stringify(responseD.body, null, 2)}</pre>
	`;
};

const loadRequestPanel = async (eid: string, rqIndex: number): Promise<void> => {
  console.log("Loading request panel for EID:", eid, "RQ Index:", rqIndex + 1);
  const requestD = await LoadRequestPanelData(eid, rqIndex);
  if (!requestD) return;

  const requestPanel = document.getElementById("request-panel");
  if (!requestPanel) {
    console.error("Request panel element not found");
    return;
  }
  requestPanel.innerHTML = `
	 <pre class="text-sm whitespace-pre-wrap break-words">${JSON.stringify(requestD.body, null, 2)}</pre>
	`;

  const sizeEl = document.getElementById("size");
  if (sizeEl) sizeEl.innerText = String(requestD.meta_data.request_size);

  await loadResponsePanel(eid, rqIndex);
};

const loadRQno = (endpoint: Endpoint): void => {
  const RQnoContainer = document.getElementById("rq-number");
  if (!RQnoContainer) {
    console.error("rq-number container not found");
    return;
  }
  RQnoContainer.innerHTML = "";

  const RQnoTitle = document.createElement("h2");
  RQnoTitle.className = "text-lg font-bold text-gray-800 m-10 rotate-90 whitespace-nowrap";
  RQnoTitle.innerText = "QP PAIRS";
  RQnoContainer.appendChild(RQnoTitle);

  for (let i = 0; i < endpoint.qpPairs; i++) {
    const RQno = document.createElement("label");
    RQno.onclick = () => {
      document.querySelectorAll("#rq-number .rqno").forEach((item) => {
        item.classList.remove("active");
      });
      RQno.classList.add("active");
      void loadRequestPanel(endpoint.eid, i);
    };
    RQno.className =
      "p-2 rounded-full border-2 border-gray-300 text-black font-semibold text-lg bg-white cursor-pointer transition rqno";
    RQno.innerText = `QP ${i + 1}`;
    RQnoContainer.appendChild(RQno);
  }
};

const loadAnnotations = (endpoint: Endpoint): void => {
  const method = endpoint.method;
  const methodBadgeClasses = getMethodBadgeClasses(method);

  const eidBox = document.getElementById("eid-box");
  const crudBox = document.getElementById("crud-box");
  const pathBox = document.getElementById("path-box");
  const annotationBox = document.getElementById("annotation-box");

  showDetailPlaceholder(false);
  if (eidBox) eidBox.innerText = endpoint.eid;
  if (crudBox)
    crudBox.innerHTML = `<span class="inline-block ${methodBadgeClasses} px-3 py-1 rounded uppercase font-bold">${method}</span>`;
  if (pathBox) pathBox.innerText = endpoint.path;
  if (annotationBox) annotationBox.innerText = endpoint.annotation;
};

const loadTags = (endpoint: Endpoint): void => {
  const tagsList = document.getElementById("tags-list");
  if (!tagsList) return;
  tagsList.innerHTML = "";

  (endpoint.tags ?? []).forEach((tag) => {
    const tagElement = document.createElement("span");
    tagElement.className =
      "inline-block bg-blue-200 text-blue-800 text-sm px-2 py-1 rounded-lg mr-2";
    tagElement.innerText = tag;
    tagsList.appendChild(tagElement);
  });
};

const loadEndpointDetail = async (eid: string): Promise<void> => {
  try {
    const endpoint = await FetchEndpointDetail(eid);
    if (!endpoint) throw new Error(`No data for eid: ${eid}`);

    selectedEndpointEid = eid;
    loadRQno(endpoint);
    loadAnnotations(endpoint);
    loadTags(endpoint);
    syncSelectedEndpointStyles();
  } catch (error) {
    console.error(`Error loading endpoint ${eid}:`, error);
    selectedEndpointEid = "";
    showDetailPlaceholder(true);
    syncSelectedEndpointStyles();
  }
};

// ─────────────────────────────────────────────
// ENDPOINT LIST RENDERING
// ─────────────────────────────────────────────

const renderEndpoints = (endpointsList: Endpoint[]): void => {
  const endpointsContainer = document.getElementById("endpoints_scroll");
  if (!endpointsContainer) {
    console.error("endpoints_scroll container not found");
    return;
  }
  endpointsContainer.innerHTML = "";
  console.time("rendering_time");

  for (const endpoint of endpointsList) {
    const words = endpoint.annotation.trim().split(/\s+/);
    const shortAnnotation =
      words.length > 4 ? words.slice(0, 4).join(" ") + "..." : words.join(" ");

    const method = endpoint.method;
    const methodBadgeClasses = getMethodBadgeClasses(method);

    const endpointCard = document.createElement("div");
    endpointCard.className =
      "endpoint-card w-full p-4 bg-gray-50 shadow-md border-2 border-gray-200 rounded-lg flex flex-col gap-2 cursor-pointer hover:bg-gray-100 transition";
    endpointCard.dataset["eid"] = endpoint.eid;
    endpointCard.classList.toggle("active", endpoint.eid === selectedEndpointEid);

    endpointCard.innerHTML = `
			<div class="flex justify-between">
				<h1 class="rounded-sm px-2 py-1 uppercase font-bold ${methodBadgeClasses}">${endpoint.method.toLowerCase()}</h1>
				<h2>ID : ${endpoint.eid}</h2>
			</div>
			<h2 class="text-xl">${endpoint.path}</h2>
			<h3 class="text-sm text-gray-600">${shortAnnotation}</h3>
		`;

    endpointCard.addEventListener("click", () => {
      selectedEndpointEid = endpoint.eid;
      addStyleForEndpointCard(endpointCard, endpoint.eid);
      void loadEndpointDetail(endpoint.eid);
    });
    endpointCard.addEventListener("dblclick", () => {
      window.open(`./Single-EQP.html?eid=${endpoint.eid}`, "_blank");
    });

    endpointsContainer.appendChild(endpointCard);
  }

  console.timeEnd("rendering_time");
};

// ─────────────────────────────────────────────
// METHOD COUNT UPDATE
// ─────────────────────────────────────────────

const updateMethodCounts = async (): Promise<void> => {
  const counts: Record<string, number> = {
    GET: 0, POST: 0, PUT: 0, DELETE: 0, OTHER: 0,
  };
  if (!allEndpointsIndex.length) return;

  const start = (currentPage - 1) * ENDPOINT_PER_PAGE;
  const currentPageSlice = allEndpointsIndex.slice(start, start + ENDPOINT_PER_PAGE);
  const details = await FetchEndpointsByIndex(currentPageSlice);

  details.forEach((ep) => {
    const m = ep.method.toUpperCase();
    if (m in counts) counts[m] = (counts[m] ?? 0) + 1;
    else counts["OTHER"] = (counts["OTHER"] ?? 0) + 1;
  });

  const countMap: Record<string, string> = {
    "count-all": String((counts["GET"] ?? 0) + (counts["POST"] ?? 0) + (counts["PUT"] ?? 0) + (counts["DELETE"] ?? 0) + (counts["OTHER"] ?? 0)),
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
// CATEGORY FILTER
// ─────────────────────────────────────────────

const updateCategoryTabStyles = (): void => {
  document.querySelectorAll<HTMLElement>(".search-category-tab").forEach((tab) => {
    const isActive = tab.dataset["category"] === selectedCategory;
    tab.classList.toggle("bg-white", isActive);
    tab.classList.toggle("text-gray-900", isActive);
    tab.classList.toggle("shadow-sm", isActive);
    tab.classList.toggle("text-gray-700", !isActive);
    tab.classList.toggle("hover:bg-gray-200", !isActive);
  });
};

const applyCategoryFilter = async (): Promise<void> => {
  if (selectedCategory === "ALL") {
    visibleEndpointsIndex = [...allEndpointsIndex];
  } else {
    const start = (currentPage - 1) * ENDPOINT_PER_PAGE;
    const currentPageSlice = allEndpointsIndex.slice(start, start + ENDPOINT_PER_PAGE);
    const details = await FetchEndpointsByIndex(currentPageSlice);
    const filtered: EndpointIndex[] = [];
    details.forEach((d, idx) => {
      if (d.method.toUpperCase() === selectedCategory) {
        const entry = allEndpointsIndex[start + idx];
        if (entry) filtered.push(entry);
      }
    });
    visibleEndpointsIndex = filtered;
  }
  currentPage = 1;
  void renderCurrentPage();
};

const searchCategoryChange = (category: string): void => {
  selectedCategory = category;
  updateCategoryTabStyles();
  void applyCategoryFilter();
};

// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────

const searchEndpoints = async (): Promise<void> => {
  const input = document.querySelector<HTMLInputElement>('.search_box input[type="text"]');
  if (!input) return;
  const q = input.value.trim().toLowerCase();

  if (q && _visibleEndpointsBeforeSearch === null) {
    _visibleEndpointsBeforeSearch = [...visibleEndpointsIndex];
  }

  if (!q) {
    if (_visibleEndpointsBeforeSearch !== null) {
      visibleEndpointsIndex = [..._visibleEndpointsBeforeSearch];
      _visibleEndpointsBeforeSearch = null;
    }
    currentPage = 1;
    void renderCurrentPage();
    return;
  }

  const sourceList = _visibleEndpointsBeforeSearch ?? visibleEndpointsIndex;
  const details = await FetchEndpointsByIndex(sourceList);

  const filtered: EndpointIndex[] = [];
  details.forEach((d, idx) => {
    const hay = [d.eid, d.method, d.path, d.annotation, (d.tags ?? []).join(" ")]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) {
      const entry = sourceList[idx];
      if (entry) filtered.push(entry);
    }
  });

  visibleEndpointsIndex = filtered;
  currentPage = 1;
  void renderCurrentPage();
};

// ─────────────────────────────────────────────
// PATH FILTERS (sidebar)
// ─────────────────────────────────────────────

const applySidebarFilters = async (): Promise<void> => {
  let filteredIndex = [...allEndpointsIndex];

  if (selectedPathFilters.length > 0) {
    const EidSegmentsData = await LoadSegments();
    const filteredEids = new Set<string>();
    selectedPathFilters.forEach((filter) => {
      (EidSegmentsData[filter] ?? []).forEach((eid) => filteredEids.add(eid));
    });
    filteredIndex = filteredIndex.filter((entry) => filteredEids.has(entry.eid));
  }

  if (selectedTagFilters.length > 0) {
    const EidTagsData = await LoadAllTags();
    const filteredEids = new Set<string>();
    selectedTagFilters.forEach((filter) => {
      (EidTagsData[filter] ?? []).forEach((eid) => filteredEids.add(eid));
    });
    filteredIndex = filteredIndex.filter((entry) => filteredEids.has(entry.eid));
  }

  visibleEndpointsIndex = filteredIndex;
  currentPage = 1;
  void renderCurrentPage();
};

const toggleSidebarPathFilter = (path: string, isChecked: boolean): void => {
  if (isChecked) {
    if (!selectedPathFilters.includes(path)) {
      selectedPathFilters.push(path);
    }
  } else {
    selectedPathFilters = selectedPathFilters.filter((p) => p !== path);
  }
  void applySidebarFilters();
};

const toggleSidebarTagFilter = (tag: string, isChecked: boolean): void => {
  if (isChecked) {
    if (!selectedTagFilters.includes(tag)) {
      selectedTagFilters.push(tag);
    }
  } else {
    selectedTagFilters = selectedTagFilters.filter((t) => t !== tag);
  }
  void applySidebarFilters();
};

const clearSidebarFilters = (): void => {
  selectedPathFilters = [];
  selectedTagFilters = [];
  document
    .querySelectorAll<HTMLInputElement>('.endpointsTags .content input[type="checkbox"]')
    .forEach((checkbox) => {
      checkbox.checked = false;
    });
};

const clearAllFilters = (): void => {
  selectedPathFilters = [];
  selectedTagFilters = [];
  selectedCategory = "ALL";
  _visibleEndpointsBeforeSearch = null;
  clearSidebarFilters();
  updateCategoryTabStyles();
  visibleEndpointsIndex = [...allEndpointsIndex];
  currentPage = 1;
  void renderCurrentPage();
};

// ─────────────────────────────────────────────
// SIDEBAR LOADERS
// ─────────────────────────────────────────────

const sideSearchBar = document.querySelector<HTMLElement>(".endpointsTags .content");

const loadSegmentsSidebar = async (): Promise<void> => {
  const sidebar_headings = document.querySelector(".left-sidebar-headings");
  if (sidebar_headings) {
    sidebar_headings.children[0]?.classList.add("active");
    sidebar_headings.children[1]?.classList.remove("active");
  }
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
				<span class="text-xs text-muted-foreground">${(segments[path] ?? []).length}</span>`;

      const checkbox = pathElement.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!checkbox) continue;

      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        toggleSidebarPathFilter(path, checkbox.checked);
      });
      pathElement.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        toggleSidebarPathFilter(path, checkbox.checked);
        pathElement.classList.toggle("active", checkbox.checked);
      });

      sideSearchBar.appendChild(pathElement);
    }
  } catch (error) {
    console.error("Error loading segments:", error);
  }
};

const loadAllTagsSidebar = async (): Promise<void> => {
  const sidebar_headings = document.querySelector(".left-sidebar-headings");
  if (sidebar_headings) {
    sidebar_headings.children[1]?.classList.add("active");
    sidebar_headings.children[0]?.classList.remove("active");
  }
  if (!sideSearchBar) return;
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

      const checkbox = pathElement.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!checkbox) continue;

      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        toggleSidebarTagFilter(tag, checkbox.checked);
      });
      pathElement.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        toggleSidebarTagFilter(tag, checkbox.checked);
        pathElement.classList.toggle("active", checkbox.checked);
      });

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
  totalPages = Math.max(1, Math.ceil(visibleEndpointsIndex.length / ENDPOINT_PER_PAGE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
};

const updatePaginationInput = (): void => {
  const pageInput = document.getElementById("page-input") as HTMLInputElement | null;
  const maxPage = document.getElementById("max-page");
  if (!pageInput || !maxPage) return;
  pageInput.value = String(currentPage);
  pageInput.max = String(totalPages);
  maxPage.innerText = String(totalPages);
};

const goToPage = (requestedPage: number): void => {
  currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  void renderCurrentPage();
};

const initPagination = (metaData: MetaData): void => {
  totalPages = Math.ceil(metaData.endpoints / ENDPOINT_PER_PAGE);

  const prevButton = document.getElementById("prev-button");
  const nextButton = document.getElementById("next-button");
  const pageInput = document.getElementById("page-input") as HTMLInputElement | null;
  const maxPage = document.querySelector<HTMLElement>("#max-page");

  if (!prevButton || !nextButton || !pageInput) {
    console.warn("One or more pagination elements are missing");
    return;
  }

  if (maxPage) maxPage.textContent = String(totalPages);

  pageInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const requested = parseInt(pageInput.value.trim(), 10);
    if (Number.isNaN(requested)) {
      updatePaginationInput();
      return;
    }
    goToPage(requested);
  });

  pageInput.addEventListener("blur", () => updatePaginationInput());

  prevButton.addEventListener("click", () => {
    if (currentPage > 1) goToPage(currentPage - 1);
  });

  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages) goToPage(currentPage + 1);
  });
};

// ─────────────────────────────────────────────
// PAGE RENDER
// ─────────────────────────────────────────────

const renderCurrentPage = async (): Promise<void> => {
  syncPaginationState();
  const start = (currentPage - 1) * ENDPOINT_PER_PAGE;
  const pageIndexEntries = visibleEndpointsIndex.slice(start, start + ENDPOINT_PER_PAGE);
  const pageDetails = await FetchEndpointsByIndex(pageIndexEntries);
  void updateMethodCounts();
  renderEndpoints(pageDetails);
  syncSelectedEndpointStyles();
  updatePaginationInput();
};

// ─────────────────────────────────────────────
// VIEW TOGGLE
// ─────────────────────────────────────────────

const toggleView = (): void => {
  const sidebar = document.querySelector(".endpointsTags");
  const mainContent = document.querySelector(".main-content");
  const endpoinDiv = document.getElementById("endpoints_card_container");
  const RRdiv = document.querySelector(".RRpanel");
  const DetailDiv = document.querySelector(".Detail");

  if (!sidebar || !mainContent || !endpoinDiv || !RRdiv || !DetailDiv) return;

  const isCollapsed = sidebar.classList.toggle("hidden");
  sidebar.classList.toggle("col-span-3", !isCollapsed);
  sidebar.classList.toggle("col-span-0", isCollapsed);
  sidebar.classList.toggle("overflow-hidden", isCollapsed);
  mainContent.classList.toggle("grid-cols-16", !isCollapsed);
  mainContent.classList.toggle("grid-cols-13", isCollapsed);
  endpoinDiv.classList.toggle("col-span-5", !isCollapsed);
  endpoinDiv.classList.toggle("col-span-4", isCollapsed);
  RRdiv.classList.toggle("col-span-7", !isCollapsed);
  RRdiv.classList.toggle("col-span-8", isCollapsed);
  DetailDiv.classList.toggle("col-span-7", !isCollapsed);
  DetailDiv.classList.toggle("col-span-8", isCollapsed);

  const toggleButton = document.querySelector(".toggle-view");
  if (toggleButton) {
    toggleButton.classList.toggle("hidden", !isCollapsed);
  }
};

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────

const loadEndpointsIndex = async (): Promise<void> => {
  allEndpointsIndex = await LoadEndpointsIndex();
  visibleEndpointsIndex = [...allEndpointsIndex];
  await updateMethodCounts();
  void renderCurrentPage();
};

LoadMetaData().then((metaData) => {
  if (!metaData) {
    console.error("Failed to load meta data — aborting bootstrap");
    return;
  }
  const totalTagsEl = document.getElementById("total_tags");
  const totalSegmentsEl = document.getElementById("total_segments");
  const totalEndpointsEl = document.getElementById("total_endpoints");
  if (totalTagsEl) totalTagsEl.innerText = String(metaData.tags ?? 0);
  if (totalSegmentsEl) totalSegmentsEl.innerText = String(metaData.segments ?? 0);
  if (totalEndpointsEl) totalEndpointsEl.innerText = String(metaData.endpoints ?? 0);

  initPagination(metaData);
  void loadEndpointsIndex();
});

void loadSegmentsSidebar();

// expose globals needed by inline HTML onclick handlers
(window as unknown as Record<string, unknown>)["searchCategoryChange"] = searchCategoryChange;
(window as unknown as Record<string, unknown>)["searchEndpoints"] = searchEndpoints;
(window as unknown as Record<string, unknown>)["clearAllFilters"] = clearAllFilters;
(window as unknown as Record<string, unknown>)["toggleView"] = toggleView;
(window as unknown as Record<string, unknown>)["loadSegmentsSidebar"] = loadSegmentsSidebar;
(window as unknown as Record<string, unknown>)["loadAllTagsSidebar"] = loadAllTagsSidebar;


