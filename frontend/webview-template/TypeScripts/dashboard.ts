import {
  type Endpoint,
  LoadSegments,
  LoadEndpointsIndex,
  FetchEndpointsByIndex,
} from "./index.js";

// ─────────────────────────────────────────────
// STATE & DATA CACHE
// ─────────────────────────────────────────────

let data: Endpoint[] = [];

const loadData = async (): Promise<void> => {
  const indexes = await LoadEndpointsIndex();
  data = await FetchEndpointsByIndex(indexes);
};

const qpPairsCounts: Record<string, number> = {
  TOTAL: 0,
  GET: 0,
  POST: 0,
  DELETE: 0,
  PUT: 0,
};

const EndpointCounts: Record<string, number> = {
  TOTAL: 0,
  GET: 0,
  POST: 0,
  DELETE: 0,
  PUT: 0,
};

const TagsCounts: Record<string, number> = {
  TOTAL: 0,
  GET: 0,
  POST: 0,
  DELETE: 0,
  PUT: 0,
};

// ─────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────

const getPercent = (count: number, total: number) => 
  total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";

const getRatio = (count: number, total: number) => 
  total > 0 ? (count / total).toFixed(2) : "0.00";

const setActiveRow = (clickedTr: HTMLElement) => {
  const rows = document.querySelectorAll("tbody tr.cursor-pointer");
  rows.forEach(row => row.classList.remove("bg-gray-100"));
  clickedTr.classList.add("bg-gray-100");
};

// ─────────────────────────────────────────────
// TABLE RENDERERS
// ─────────────────────────────────────────────

const renderEnpointsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");

  data.forEach((endpoint) => {
    EndpointCounts["TOTAL"] = (EndpointCounts["TOTAL"] ?? 0) + 1;
    const method = (endpoint.method || "").toUpperCase();
    if (method in EndpointCounts) {
      EndpointCounts[method] = (EndpointCounts[method] ?? 0) + 1;
    }
  });

  tr.addEventListener("click", () => {
    setActiveRow(tr);
    renderChart(EndpointCounts);
  });
  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100 cursor-pointer";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">Endpoints</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${EndpointCounts["TOTAL"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(EndpointCounts["GET"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${EndpointCounts["GET"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(EndpointCounts["POST"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${EndpointCounts["POST"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(EndpointCounts["DELETE"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${EndpointCounts["DELETE"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(EndpointCounts["PUT"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${EndpointCounts["PUT"]!.toLocaleString()}
    </td>
  `;
  tableBody.appendChild(tr);
};

const renderEnpointsSegmentsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");
  
  const segments = await LoadSegments();
  const totalSegments = Object.keys(segments).length;
  
  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">Endpoints Segments</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${totalSegments}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">-</td>
  `;
  tableBody.appendChild(tr);
};

const renderEnpointsQPpairsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");
  tr.onclick = () => {
    setActiveRow(tr);
    renderChart(qpPairsCounts);
  };

  data.forEach((endpoint) => {
    qpPairsCounts["TOTAL"] = (qpPairsCounts["TOTAL"] ?? 0) + (endpoint.qpPairs || 0);
    const method = (endpoint.method || "").toUpperCase();
    if (method in qpPairsCounts) {
      qpPairsCounts[method] = (qpPairsCounts[method] ?? 0) + (endpoint.qpPairs || 0);
    }
  });

  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100 cursor-pointer";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">QP Pairs</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${qpPairsCounts["TOTAL"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(qpPairsCounts["GET"]!, qpPairsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${qpPairsCounts["GET"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(qpPairsCounts["POST"]!, qpPairsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${qpPairsCounts["POST"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(qpPairsCounts["DELETE"]!, qpPairsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${qpPairsCounts["DELETE"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(qpPairsCounts["PUT"]!, qpPairsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${qpPairsCounts["PUT"]!.toLocaleString()}
    </td>
  `;
  tableBody.appendChild(tr);
};

const renderEnpointstagsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");
  tr.onclick = () => {
    setActiveRow(tr);
    renderChart(TagsCounts);
  };
  
  data.forEach((endpoint) => {
    const tagCount = Array.isArray(endpoint.tags) ? endpoint.tags.length : 0;
    TagsCounts["TOTAL"] = (TagsCounts["TOTAL"] ?? 0) + tagCount;
    const method = (endpoint.method || "").toUpperCase();
    if (method in TagsCounts) {
      TagsCounts[method] = (TagsCounts[method] ?? 0) + tagCount;
    }
  });

  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100 cursor-pointer";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">Tags</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${TagsCounts["TOTAL"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(TagsCounts["GET"]!, TagsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${TagsCounts["GET"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(TagsCounts["POST"]!, TagsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${TagsCounts["POST"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(TagsCounts["DELETE"]!, TagsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${TagsCounts["DELETE"]!.toLocaleString()}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">
      ${getPercent(TagsCounts["PUT"]!, TagsCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right">
      ${TagsCounts["PUT"]!.toLocaleString()}
    </td>
  `;
  tableBody.appendChild(tr);
};

const renderRatioEnpointsQPpairsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");

  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">QP Pairs / Endpoints</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${getRatio(qpPairsCounts["TOTAL"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#1d1d1f]-variant text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(qpPairsCounts["GET"]!, EndpointCounts["GET"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(qpPairsCounts["POST"]!, EndpointCounts["POST"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(qpPairsCounts["DELETE"]!, EndpointCounts["DELETE"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(qpPairsCounts["PUT"]!, EndpointCounts["PUT"]!)}
    </td>
  `;
  tableBody.appendChild(tr);
};

const renderRatioEnpointsTagsData = async (): Promise<void> => {
  const tableBody = document.querySelector("tbody");
  if (!tableBody) return;
  const tr = document.createElement("tr");

  tr.className =
    "hover:bg-gray-50/70 transition-colors border-t border-gray-100";
  tr.innerHTML = `
    <td class="py-3 px-4 font-medium text-[#1d1d1f]" colspan="2">Tags / Endpoints</td>
    <td class="py-3 px-4 font-mono font-medium text-right text-[#1d1d1f]" colspan="2">
      ${getRatio(TagsCounts["TOTAL"]!, EndpointCounts["TOTAL"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(TagsCounts["GET"]!, EndpointCounts["GET"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(TagsCounts["POST"]!, EndpointCounts["POST"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(TagsCounts["DELETE"]!, EndpointCounts["DELETE"]!)}
    </td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right border-l border-gray-100">-</td>
    <td class="py-3 px-4 font-mono text-[#707070] text-right">
      ${getRatio(TagsCounts["PUT"]!, EndpointCounts["PUT"]!)}
    </td>
  `;
  tableBody.appendChild(tr);
};

// ─────────────────────────────────────────────
// CHART IMPLEMENTATION
// ─────────────────────────────────────────────

class BarChart {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  labels: string[];
  datasets: any[];
  padding: any;
  maxTicks: number;
  labelColor: string;
  axisColor: string;
  gridColor: string;
  barGap: number;
  barRadius: number;
  height: number;
  width: number | null;
  valuePadding: number;
  minBarHeight: number;
  legendColor: string;
  displayWidth: number = 0;
  displayHeight: number = 0;

  constructor(canvas: HTMLCanvasElement | string, config: any = {}) {
    this.canvas =
      typeof canvas === "string" ? (document.querySelector(canvas) as HTMLCanvasElement) : canvas;
    this.ctx = this.canvas.getContext("2d")!;
    this.labels = config.labels ?? [];
    this.datasets = this.normalizeDatasets(config);
    this.padding = config.padding ?? {
      top: 56,
      right: 56,
      bottom: 56,
      left: 64,
    };
    this.maxTicks = config.maxTicks ?? 5;
    this.labelColor = config.labelColor ?? "#6b7280";
    this.axisColor = config.axisColor ?? "rgba(0, 0, 0, 0.25)";
    this.gridColor = config.gridColor ?? "rgba(0, 0, 0, 0.08)";
    this.barGap = config.barGap ?? 0.2;
    this.barRadius = config.barRadius ?? 6;
    this.height = config.height ?? 420;
    this.width = config.width ?? null;
    this.valuePadding = config.valuePadding ?? 0.12;
    this.minBarHeight = config.minBarHeight ?? 2;
    this.legendColor = config.legendColor ?? "#111827";

    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = `${this.height}px`;
    this.resize();
  }

  normalizeDatasets(config: any) {
    if (Array.isArray(config.datasets) && config.datasets.length > 0) {
      return config.datasets.map((dataset: any, index: number) => ({
        label: dataset.label ?? `Series ${index + 1}`,
        data: dataset.data ?? [],
        colors: dataset.colors ?? [dataset.color ?? "rgb(54, 162, 235)"],
        scaleMax: dataset.scaleMax ?? null,
        axis: dataset.axis ?? "left",
        formatter:
          dataset.formatter ??
          ((value: number) =>
            Number.isInteger(value)
              ? value.toLocaleString()
              : value.toFixed(1)),
      }));
    }

    if (Array.isArray(config.data)) {
      return [
        {
          label: config.datasetLabel ?? "Series 1",
          data: config.data,
          colors: config.colors ?? ["rgb(54, 162, 235)"],
          scaleMax: config.scaleMax ?? null,
          axis: config.axis ?? "left",
          formatter:
            config.formatter ??
            ((value: number) =>
              Number.isInteger(value)
                ? value.toLocaleString()
                : value.toFixed(1)),
        },
      ];
    }

    return [];
  }

  resize() {
    const parentRect = this.canvas.parentElement?.getBoundingClientRect();
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = this.width ?? parentRect?.width ?? rect.width ?? 640;
    const displayHeight =
      this.height ?? parentRect?.height ?? rect.height ?? 360;

    this.canvas.width = displayWidth * ratio;
    this.canvas.height = displayHeight * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  getSeriesScaleMax(series: any) {
    const dataMax = Math.max(...(series.data ?? []), 0);
    if (series.scaleMax && series.scaleMax > 0) {
      return series.scaleMax;
    }

    return dataMax > 0 ? dataMax * (1 + this.valuePadding) : 1;
  }

  formatAxisValue(value: number, isPercentage = false) {
    if (isPercentage) {
      return `${Math.round(value)}%`;
    }

    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  }

  draw() {
    const width =
      this.displayWidth ?? this.canvas.getBoundingClientRect().width;
    const height =
      this.displayHeight ?? this.canvas.getBoundingClientRect().height;
    const { top, right, bottom, left } = this.padding;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const tickCount = Math.max(1, this.maxTicks);
    const hasRightAxis = this.datasets.length > 1;
    const leftSeries =
      this.datasets.find((dataset) => dataset.axis === "left") ??
      this.datasets[0];
    const rightSeries =
      this.datasets.find((dataset) => dataset.axis === "right") ??
      this.datasets[1] ??
      null;
    const leftScaleMax = this.getSeriesScaleMax(leftSeries);
    const rightScaleMax = rightSeries
      ? this.getSeriesScaleMax(rightSeries)
      : null;

    this.clear();
    this.ctx.font = "12px sans-serif";
    this.ctx.textBaseline = "middle";
    this.ctx.lineWidth = 1;
    this.ctx.lineJoin = "round";

    if (this.datasets.length > 0) {
      const legendX = left;
      const legendY = Math.max(18, top - 28);
      let legendOffset = 0;

      this.datasets.forEach((dataset, _index) => {
        const color = dataset.colors[0] ?? "rgb(54, 162, 235)";
        const textWidth = this.ctx.measureText(dataset.label).width;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(legendX + legendOffset, legendY - 8, 14, 14);
        this.ctx.fillStyle = this.legendColor;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(dataset.label, legendX + legendOffset + 20, legendY);
        legendOffset += textWidth + 48;
      });
    }

    for (let i = 0; i <= tickCount; i += 1) {
      const tickRatio = i / tickCount;
      const leftTickValue = leftScaleMax * tickRatio;
      const rightTickValue = rightScaleMax ? rightScaleMax * tickRatio : null;
      const y = top + chartHeight - (chartHeight / tickCount) * i;

      this.ctx.strokeStyle = this.gridColor;
      this.ctx.beginPath();
      this.ctx.moveTo(left, y);
      this.ctx.lineTo(width - right, y);
      this.ctx.stroke();

      this.ctx.fillStyle = this.labelColor;
      this.ctx.textAlign = "right";
      this.ctx.fillText(this.formatAxisValue(leftTickValue), left - 10, y);

      if (hasRightAxis && rightTickValue !== null) {
        this.ctx.textAlign = "left";
        this.ctx.fillText(
          this.formatAxisValue(rightTickValue, true),
          width - right + 10,
          y,
        );
      }
    }

    this.ctx.strokeStyle = this.axisColor;
    this.ctx.beginPath();
    this.ctx.moveTo(left, top);
    this.ctx.lineTo(left, top + chartHeight);
    this.ctx.lineTo(width - right, top + chartHeight);
    if (hasRightAxis) {
      this.ctx.moveTo(width - right, top);
      this.ctx.lineTo(width - right, top + chartHeight);
    }
    this.ctx.stroke();

    if (!this.labels.length || !this.datasets.length) {
      return;
    }

    const slotWidth = chartWidth / this.labels.length;
    const groupWidth = slotWidth * 0.82;
    const gapWidth = Math.min(12, groupWidth * 0.12);
    const seriesCount = this.datasets.length;
    const barWidth =
      (seriesCount > 1
        ? (groupWidth - gapWidth * (seriesCount - 1)) / seriesCount
        : groupWidth) || 1;
    const baseline = top + chartHeight;

    this.labels.forEach((label, labelIndex) => {
      const groupStartX =
        left + labelIndex * slotWidth + (slotWidth - groupWidth) / 2;

      this.datasets.forEach((dataset, datasetIndex) => {
        const value = dataset.data[labelIndex] ?? 0;
        const seriesScaleMax = this.getSeriesScaleMax(dataset);
        const barHeight =
          value <= 0
            ? 0
            : Math.max(
                (value / seriesScaleMax) * chartHeight,
                this.minBarHeight,
              );
        const barX = groupStartX + datasetIndex * (barWidth + gapWidth);
        const barY = baseline - barHeight;
        const barColor = dataset.colors[labelIndex] ?? dataset.colors[0];

        this.ctx.fillStyle = barColor;
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        this.ctx.fillStyle = this.labelColor;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "bottom";
        this.ctx.fillText(
          dataset.formatter(value),
          barX + barWidth / 2,
          Math.max(barY - 6, top + 10),
        );
      });

      this.ctx.fillStyle = this.labelColor;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "top";
      this.ctx.fillText(
        label,
        left + labelIndex * slotWidth + slotWidth / 2,
        baseline + 12,
      );
    });
  }

  render() {
    this.resize();
    this.draw();
  }
}

const renderChart = (selectedCategory: any) => {
  const canvas = document.getElementById("myChart") as HTMLCanvasElement;
  if (!canvas) return;

  const counts = [
    selectedCategory.GET || 0,
    selectedCategory.POST || 0,
    selectedCategory.DELETE || 0,
    selectedCategory.PUT || 0,
  ];
  const total = selectedCategory.TOTAL || 1;
  const percentages = counts.map((value) => (value / total) * 100);
  const chartV = new BarChart(canvas, {
    labels: ["GET", "POST", "DELETE", "PUT"],
    datasets: [
      {
        label: "Counts",
        axis: "left",
        data: counts,
        scaleMax: Math.max(...counts, 1) * 1.15,
        colors: ["#40a02b", "#1e66f5", "#d20f39", "#fe640b"],
        formatter: (value: number) => value.toLocaleString(),
      },
      {
        label: "Percentage",
        axis: "right",
        data: percentages,
        scaleMax: 100,
        colors: ["#a6da95", "#8aadf4", "#ed8796", "#f5a97f"],
        formatter: (value: number) => `${value.toFixed(1)}%`,
      },
    ],
    height: 620,
    padding: {
      top: 60,
      right: 64,
      bottom: 58,
      left: 68,
    },
    barGap: 0.18,
  });

  chartV.render();
};

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────

loadData().then(async () => {
  await renderEnpointsData();
  await renderEnpointsSegmentsData();
  await renderEnpointsQPpairsData();
  await renderEnpointstagsData();
  await renderRatioEnpointsQPpairsData();
  await renderRatioEnpointsTagsData();

  const firstClickableRow = document.querySelector("tbody tr.cursor-pointer") as HTMLElement;
  if (firstClickableRow) {
    firstClickableRow.classList.add("bg-gray-100");
  }

  renderChart(EndpointCounts);
});
