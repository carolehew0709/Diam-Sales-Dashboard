import type { WorkBook, WorkSheet } from "xlsx";

type CellValue = string | number | boolean | null;
type Cell = { value: CellValue; formula?: string; error?: boolean };
type Expression =
  | { kind: "value"; value: CellValue }
  | { kind: "reference"; address: string }
  | { kind: "operator"; symbol: string; left: Expression; right: Expression }
  | { kind: "call"; name: string; args: Expression[] };

export type CostSheet = { name: string; cells: Record<string, Cell> };
export type CostInputs = Record<string, string>;
export type QuoteLine = {
  id: number;
  item: string;
  description: string;
  picture: { data: string; width: number; height: number } | null;
  size: string;
  quantity: string;
  sheet: string;
  source: string;
  costUnits: string;
  inputs: CostInputs;
};

const addressPattern = /^[A-Z]{1,3}[1-9]\d*$/;
const externalPattern = /^\[\d+\][\w ]+![A-Z]{1,3}[1-9]\d*$/i;
const externalRateFormula = /^IF\(\$S\$6="P",#REF!,\[\d+\]Data!\$?B\$?\d+\)$/i;
const precedence: Record<string, number> = { "=": 1, "<>": 1, "+": 2, "-": 2, "*": 3, "/": 3 };
const cellToken = /\s+|\[\d+\][\w ]+!\$?[A-Z]{1,3}\$?\d+|"(?:[^"]|"")*"|#[A-Z0-9/?!]+|\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\d+(?:\.\d*)?(?:E[+-]?\d+)?|\.\d+|[A-Z_][A-Z_0-9.]*|<>|[+*/=,()-]/giy;

function parseFormula(formula: string): Expression {
  const text = formula.replace(/^=/, "");
  const tokens: string[] = [];
  for (let offset = 0; offset < text.length;) {
    cellToken.lastIndex = offset;
    const match = cellToken.exec(text);
    if (!match) throw new Error("Unsupported formula");
    offset = cellToken.lastIndex;
    if (match[0].trim()) tokens.push(match[0]);
  }
  let index = 0;
  function take(expected: string) {
    if (tokens[index++] !== expected) throw new Error("Invalid formula");
  }
  function term(): Expression {
    const token = tokens[index++];
    if (!token) throw new Error("Incomplete formula");
    if (token === "(") {
      const inner = expression(0);
      take(")");
      return inner;
    }
    if (token === "-" || token === "+") {
      return { kind: "operator", symbol: token, left: { kind: "value", value: 0 }, right: term() };
    }
    if (token.startsWith('"')) return { kind: "value", value: token.slice(1, -1).replace(/""/g, '"') };
    if (Number.isFinite(Number(token))) return { kind: "value", value: Number(token) };
    if (tokens[index] === "(") {
      index++;
      const args: Expression[] = [];
      if (tokens[index] !== ")") {
        args.push(expression(0));
        while (tokens[index] === ",") {
          index++;
          args.push(expression(0));
        }
      }
      take(")");
      return { kind: "call", name: token.toUpperCase(), args };
    }
    return { kind: "reference", address: token.replace(/\$/g, "").toUpperCase() };
  }
  function expression(minimum: number): Expression {
    let left = term();
    while ((precedence[tokens[index]] ?? -1) >= minimum) {
      const symbol = tokens[index++];
      left = { kind: "operator", symbol, left, right: expression(precedence[symbol] + 1) };
    }
    return left;
  }
  const result = expression(0);
  if (index !== tokens.length) throw new Error("Unsupported formula");
  return result;
}

function isCostSheet(sheet: WorkSheet) {
  return /^PART NAME$/i.test(String(sheet.A7?.v).trim()) &&
    /^PART QUANTITY$/i.test(String(sheet.A10?.v).trim()) &&
    typeof sheet.D69?.f === "string";
}

export function readCostSheets(workbook: WorkBook): CostSheet[] {
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet || !isCostSheet(sheet)) return [];
    const cells: CostSheet["cells"] = {};
    for (const [address, cell] of Object.entries(sheet)) {
      if (!addressPattern.test(address)) continue;
      const { f, t, v } = cell;
      if (f || (t !== "z" && v != null)) cells[address] = { value: v ?? null, formula: f, error: t === "e" };
    }
    return [{ name, cells }];
  });
}

function isExternalRate(cell: Cell | undefined) {
  return !!cell?.formula && externalRateFormula.test(cell.formula);
}

export function processStandardAddresses(sheet: CostSheet) {
  return Object.keys(sheet.cells).filter((address) =>
    /^B(?:[1-9]|[1-6]\d|70)$/.test(address) &&
    (typeof sheet.cells[address].value === "number" || !!sheet.cells[address].formula),
  ).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function decodeAddress(address: string) {
  const [, column, row] = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address) ?? [];
  if (!column) throw new Error("Invalid reference");
  return { column: [...column].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row: Number(row) };
}

function columnName(index: number): string {
  if (index <= 26) return String.fromCharCode(64 + index);
  return columnName(Math.floor((index - 1) / 26)) + columnName((index - 1) % 26 + 1);
}

function rangeAddresses(range: string, limit: number): string[] {
  const [first, last = first] = range.split(":");
  const start = decodeAddress(first);
  const end = decodeAddress(last);
  const width = end.column - start.column + 1;
  const height = end.row - start.row + 1;
  if (width <= 0 || height <= 0 || width * height > limit || end.row > 1048576 || end.column > 16384)
    throw new Error("Invalid reference range");
  return Array.from({ length: width * height }, (_, i) =>
    `${columnName(start.column + i % width)}${start.row + Math.floor(i / width)}`);
}

function toNumber(value: CellValue) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("#VALUE!");
  return number;
}

export function calculateCosts(sheet: CostSheet, inputs: CostInputs = {}, standards: CostInputs = {}, now = Date.now()) {
  const memo = new Map<string, CellValue>();
  const visiting = new Set<string>();
  const standardAddresses = new Set(processStandardAddresses(sheet));
  function value(address: string): CellValue {
    if (memo.has(address)) return memo.get(address) ?? null;
    if (visiting.has(address)) throw new Error(`${address} #CYCLE!`);
    const cell = sheet.cells[address];
    const override = standardAddresses.has(address) ? standards[address] : undefined;
    if (override !== undefined) {
      const rate = Number(override);
      if (!override.trim() || !Number.isFinite(rate) || rate < 0) throw new Error(`${address} #VALUE!`);
      return rate;
    }
    if (!cell?.formula) {
      if (cell?.error) throw new Error(`${address} #VALUE!`);
      const input = inputs[address];
      if (input === undefined) return cell?.value ?? null;
      if (!input.trim()) return null;
      return Number.isFinite(Number(input)) ? Number(input) : input;
    }
    visiting.add(address);
    try {
      const result = scalar(parseFormula(cell.formula), address);
      memo.set(address, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "#VALUE!";
      throw new Error(message.includes(" ") ? message : `${address} ${message}`);
    } finally {
      visiting.delete(address);
    }
  }
  function values(node: Expression, origin: string): CellValue[] {
    return node.kind === "reference" && node.address.includes(":") && !node.address.startsWith("#")
      ? rangeAddresses(node.address, 10000).map(value)
      : [scalar(node, origin)];
  }
  function scalar(node: Expression, origin: string): CellValue {
    if (node.kind === "value") return node.value;
    if (node.kind === "reference") {
      const { address } = node;
      if (address.startsWith("#")) throw new Error(address);
      if (externalPattern.test(address)) {
        const cell = sheet.cells[origin];
        const rate = cell.error ? null : cell.value;
        if (!isExternalRate(cell) || rate === null) throw new Error("#REF!");
        return toNumber(rate);
      }
      if (!addressPattern.test(address)) throw new Error("#REF!");
      return value(address);
    }
    if (node.kind === "operator") {
      const left = scalar(node.left, origin);
      const right = scalar(node.right, origin);
      if (node.symbol === "=" || node.symbol === "<>") {
        const equal = String(left ?? "").toUpperCase() === String(right ?? "").toUpperCase();
        return node.symbol === "=" ? equal : !equal;
      }
      const a = toNumber(left);
      const b = toNumber(right);
      if (node.symbol === "+") return a + b;
      if (node.symbol === "-") return a - b;
      if (node.symbol === "*") return a * b;
      if (b === 0) throw new Error("#DIV/0!");
      return a / b;
    }
    const { name, args } = node;
    if (name === "IF" && args.length === 3) return scalar(args[scalar(args[0], origin) ? 1 : 2], origin);
    if (name === "NOW" && args.length === 0) return now / 86400000 + 25569;
    if (name === "LEN" && args.length === 1) return String(scalar(args[0], origin) ?? "").length;
    if (name === "INT" && args.length === 1) return Math.floor(toNumber(scalar(args[0], origin)));
    if (name === "SUM" || name === "MAX") {
      const numbers = args.flatMap((arg) => values(arg, origin))
        .filter((x) => x !== null && x !== "" && Number.isFinite(Number(x))).map(Number);
      return name === "MAX" ? (numbers.length ? Math.max(...numbers) : 0) : numbers.reduce((sum, n) => sum + n, 0);
    }
    throw new Error("#NAME?");
  }
  return { value };
}

export function quoteAmounts(sheet: CostSheet, line: QuoteLine, markup: string, exchange: string, standards: CostInputs = {}) {
  const source = line.source.trim().replace(/\$/g, "").toUpperCase();
  if (!/^[A-U](?:[1-9]|[1-6]\d|70)(?::[A-U](?:[1-9]|[1-6]\d|70))?$/.test(source))
    throw new Error("costSource");
  let addresses: string[];
  try {
    addresses = rangeAddresses(source, 300);
  } catch {
    throw new Error("costSource");
  }
  if (!addresses.some((address) => sheet.cells[address]?.formula))
    throw new Error("costSource");
  const count = Number(line.costUnits);
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("costUnits");
  const fx = Number(exchange);
  if (!Number.isFinite(fx) || fx <= 0) throw new Error("exchange");
  const calc = calculateCosts(sheet, line.inputs, standards);
  const cost = addresses.reduce((sum, address) => sum + toNumber(calc.value(address)), 0) * fx / count;
  if (!Number.isFinite(cost) || cost < 0) throw new Error("costSource");
  const margin = Number(markup);
  const candidate = cost * (1 + margin / 100);
  const unit = markup.trim() !== "" && margin >= 0 && Number.isFinite(candidate) ? candidate : null;
  const unitCents = unit === null ? null : Math.round((unit + Number.EPSILON * unit) * 100);
  const quantity = Number(line.quantity);
  const amount = unitCents !== null && Number.isSafeInteger(quantity) && quantity > 0 ? unitCents * quantity : null;
  return {
    cost,
    unit: unitCents !== null && Number.isSafeInteger(unitCents) ? unitCents / 100 : null,
    cents: amount !== null && Number.isSafeInteger(amount) ? amount : null,
  };
}
