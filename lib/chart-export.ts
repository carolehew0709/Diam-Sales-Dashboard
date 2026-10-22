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
): string {
  const ns = "http://www.w3.org/2000/svg";
  const original = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.viewBox.baseVal;
  const width = box.width || 800,
    height = box.height || 360;
  const result = document.createElementNS(ns, "svg");
  const headers = wrapChartText(title, 74),
    contexts = wrapChartText(context, 100),
    notes = wrapChartText(note, 106);
  const top = 30 + headers.length * 25 + contexts.length * 18;
  const fullHeight = top + height + 24 + notes.length * 18;
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
  const addText = (value: string, y: number, size: number, color: string) => {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", "24");
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", String(size));
    t.setAttribute("fill", color);
    t.textContent = value;
    result.append(t);
  };
  headers.forEach((line, i) => addText(line, 30 + i * 25, 20, "#171813"));
  contexts.forEach((line, i) =>
    addText(line, 36 + headers.length * 25 + i * 18, 12, "#706f67"),
  );
  original.setAttribute("x", "0");
  original.setAttribute("y", String(top));
  original.setAttribute("width", String(width));
  original.setAttribute("height", String(height));
  result.append(original);
  notes.forEach((line, i) =>
    addText(line, top + height + 12 + i * 18, 12, "#706f67"),
  );
  return new XMLSerializer().serializeToString(result);
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
) {
  const source = chartExportSvg(svg, title, context, note);
  const filename = `DIAM-${title}-${context}`
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .slice(0, 170);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  if (format === "svg") {
    saveChartFile(blob, `${filename}.svg`);
    return;
  }
  const png = await chartPng(svg, title, context, note);
  saveChartFile(png.blob, `${filename}.png`);
}

export async function chartPng(
  svg: SVGSVGElement,
  title: string,
  context: string,
  note: string,
) {
  const blob = new Blob([chartExportSvg(svg, title, context, note)], {
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
    canvas.width = image.width * 3;
    canvas.height = image.height * 3;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.scale(3, 3);
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
