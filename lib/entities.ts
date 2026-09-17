import type { Entity } from "./types";
export const entities: Entity[] = [
  {
    id: "dhk",
    code: "DHK",
    name: "Hong Kong",
    region: "APAC",
    reportingRegion: "China",
    businessUnit: "DHK",
    description: "香港外销",
    aliases: ["DE HONG KONG", "DEHK", "DHK"],
  },
  {
    id: "ddc",
    code: "DDC",
    name: "Diam China",
    region: "APAC",
    reportingRegion: "China",
    businessUnit: "DDC",
    description: "工厂内销",
    aliases: ["Diam CHINA", "DDC"],
  },
  {
    id: "dcp",
    code: "DCP",
    name: "DCP",
    region: "APAC",
    reportingRegion: "China",
    businessUnit: "DCP",
    description: "即将关闭的工厂",
    aliases: ["DCP", "PDA", "Asia (PDA + PDN + PGC)"],
  },
  ...["DSI", "DDI", "DDJ"].map((code) => ({
    id: code.toLowerCase(),
    code,
    name: code,
    region: "APAC",
    reportingRegion: (
      { DSI: "Singapore", DDI: "India", DDJ: "Japan" } as Record<string, string>
    )[code],
    businessUnit: code,
    description: "Source pending",
    aliases: [code],
  })),
];
entities.sort(
  (a, b) =>
    ["dhk", "dcp", "ddc", "dsi", "ddi", "ddj"].indexOf(a.id) -
    ["dhk", "dcp", "ddc", "dsi", "ddi", "ddj"].indexOf(b.id),
);
export const regions = ["APAC", "China", "Singapore", "India", "Japan"];
export function matchesRegion(entity: Entity, region: string) {
  return (
    region === "all" ||
    region === entity.region ||
    region === entity.reportingRegion
  );
}
export function resolveEntity(name: string) {
  const value = name.trim().toLowerCase();
  return entities.find(
    (e) => e.aliases.some((a) => a.toLowerCase() === value) || e.id === value,
  );
}
