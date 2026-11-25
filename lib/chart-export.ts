import type { ChartTable } from "./chart-workbook-types";

export type ChartImageData = {
  table: ChartTable;
  locale: string;
  heading: string;
};

export function wrapChartText(text: string, width = 100): string[] {
  const lines: string[] = [];
  let line = "",
    size = 0;
  for (const char of text) {
    const weight = char.charCodeAt(0) > 255 ? 2 : 1;
    if (size + weight > width || char === "\n") {
      const space = char !== "\n" ? line.lastIndexOf(" ") : -1;
      if (space > line.length / 2) {
        lines.push(line.slice(0, space + 1));
        line = line.slice(space + 1);
      } else {
        lines.push(line);
        line = "";
      }
      size = Array.from(line).reduce(
        (n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1),
        0,
      );
    }
    if (char !== "\n") {
      line += char;
      size += weight;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function chartExportSvg(
  svg: SVGSVGElement,
  title: string,
  context: string,
  note: string,
  detail?: ChartImageData,
): string {
  const ns = "http://www.w3.org/2000/svg";
  const original = svg.cloneNode(true) as SVGSVGElement;
  // Interaction layers are UI-only; downloads always retain the clean chart.
  original
    .querySelectorAll("[data-chart-hit]")
    .forEach((node) => node.remove());
  original.removeAttribute("data-chart-hover");
  original.querySelectorAll("[data-chart-mark]").forEach((node) => {
    if (node.getAttribute("role") === "button") node.setAttribute("role", "img");
    [
      "data-chart-mark",
      "data-chart-color",
      "data-chart-group",
      "data-chart-active",
      "aria-describedby",
      "aria-haspopup",
      "tabindex",
      "style",
    ].forEach((name) => node.removeAttribute(name));
  });
  const box = svg.viewBox.baseVal;
  const plotWidth = box.width || 800,
    height = box.height || 360;
  const table = detail && layoutTable(detail);
  const width = Math.max(plotWidth, (table?.width ?? 0) + 48);
  const result = document.createElementNS(ns, "svg");
  const headers = wrapChartText(title, 74),
    contexts = wrapChartText(context, 100),
    notes = wrapChartText(note, 106);
  const top = 30 + headers.length * 25 + contexts.length * 18;
  const tableTop = top + height + 24 + notes.length * 18;
  const fullHeight = tableTop + (table ? 37 + table.height : 0);
  result.setAttribute("xmlns", ns);
  result.setAttribute("viewBox", `0 0 ${width} ${fullHeight}`);
  result.setAttribute("width", String(width));
  result.setAttribute("height", String(fullHeight));
  result.setAttribute("font-family", "Arial, 'Microsoft YaHei', sans-serif");
  const background = document.createElementNS(ns, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#fffefa");
  result.append(background);
  const addText = (
    value: string,
    y: number,
    size: number,
    color: string,
    x = 24,
    bold = false,
  ) => {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", String(size));
    t.setAttribute("fill", color);
    if (bold) t.setAttribute("font-weight", "600");
    t.textContent = value;
    result.append(t);
  };
  headers.forEach((line, i) => addText(line, 30 + i * 25, 20, "#171813"));
  contexts.forEach((line, i) =>
    addText(line, 36 + headers.length * 25 + i * 18, 12, "#706f67"),
  );
  original.setAttribute("x", String((width - plotWidth) / 2));
  original.setAttribute("y", String(top));
  original.setAttribute("width", String(plotWidth));
  original.setAttribute("height", String(height));
  result.append(original);
  notes.forEach((line, i) =>
    addText(line, top + height + 12 + i * 18, 12, "#706f67"),
  );
  if (table && detail) {
    addText(detail.heading, tableTop + 13, 15, "#171813", 24, true);
    let y = tableTop + 23;
    table.rows.forEach((row, index) => {
      let x = 24;
      row.cells.forEach((lines, i) => {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(table.widths[i]));
        rect.setAttribute("height", String(row.height));
        rect.setAttribute(
          "fill",
          index === 0
            ? "#262b29"
            : row.summary
              ? "#f1e7d5"
              : index % 2
                ? "#fffefa"
                : "#f5f2eb",
        );
        rect.setAttribute("stroke", "#e5e0d6");
        result.append(rect);
        lines.forEach((line, lineIndex) =>
          addText(
            line,
            y + 16 + lineIndex * 15,
            11,
            index === 0 ? "#fffefa" : "#171813",
            x + 8,
            index === 0 || row.summary,
          ),
        );
        x += table.widths[i];
      });
      y += row.height;
    });
  }
  return new XMLSerializer().serializeToString(result);
}

function layoutTable({ table, locale }: ChartImageData) {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const widthOf = (text: string) =>
    Array.from(text).reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  const raw = [
    table.columns.map((column) => column.label),
    ...table.rows.map((row) =>
      table.columns.map((column, index) => {
        const value = row[index];
        return typeof value === "number"
          ? (column.format?.includes("%") ? percent : number).format(value)
          : (value ?? "—");
      }),
    ),
  ];
  const widths = table.columns.map((_, i) =>
    Math.max(
      96,
      Math.min(390, Math.max(...raw.map((row) => widthOf(row[i]))) * 7 + 16),
    ),
  );
  const rows = raw.map((row, index) => {
    const cells = row.map((value, i) =>
      wrapChartText(value, Math.floor((widths[i] - 16) / 7)),
    );
    return {
      cells,
      height: 10 + Math.max(1, ...cells.map((lines) => lines.length)) * 15,
      summary: table.summaryRows?.includes(index - 1) ?? false,
    };
  });
  return {
    rows,
    widths,
    width: widths.reduce((a, b) => a + b, 0),
    height: rows.reduce((n, row) => n + row.height, 0),
  };
}

export function saveChartFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export async function downloadChart(
  svg: SVGSVGElement,
  format: "png" | "svg",
  title: string,
  context: string,
  note: string,
  detail?: ChartImageData,
) {
  const filename = `DIAM-${title}-${context}`
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .slice(0, 170);
  if (format === "svg") {
    const blob = new Blob([chartExportSvg(svg, title, context, note, detail)], {
      type: "image/svg+xml;charset=utf-8",
    });
    saveChartFile(blob, `${filename}.svg`);
    return;
  }
  const png = await chartPng(svg, title, context, note, detail);
  saveChartFile(png.blob, `${filename}.png`);
}

export async function chartPng(
  svg: SVGSVGElement,
  title: string,
  context: string,
  note: string,
  detail?: ChartImageData,
) {
  const blob = new Blob([chartExportSvg(svg, title, context, note, detail)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      3,
      15000 / Math.max(image.width, image.height),
      Math.sqrt(24_000_000 / (image.width * image.height)),
    );
    canvas.width = Math.ceil(image.width * scale);
    canvas.height = Math.ceil(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG unavailable"))),
        "image/png",
      ),
    );
    return { blob: png, width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
