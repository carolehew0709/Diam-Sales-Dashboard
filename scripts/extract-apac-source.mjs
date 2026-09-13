import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
const XLSX = xlsx;

const root = process.cwd();
const sourceDir = path.join(root, 'Dashboard');
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const readRows = (file, sheet) => {
  const workbook = XLSX.readFile(path.join(sourceDir, file), { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null });
};

const weeklyFromEntityWorkbook = (file, entityId, entityName, code) => {
  const rows = readRows(file, 'Synth');
  return rows.flatMap((row) => {
    const label = String(row[0] ?? '');
    const match = label.match(/^W(\d+)$/);
    if (!match || Number(match[1]) > 37) return [];
    return [{
      entityId,
      entityName,
      code,
      week: Number(match[1]),
      budget: 0,
      sales: number(row[0] === label ? row[1] : 0),
      orderbook: number(row[3]),
      forecast: number(row[5]),
      p1: 0,
      source: file,
      isSnapshot: true,
    }];
  });
};

const globalWorkbook = 'DIAM_Global_Follow_Up_2026_W35.xlsx';
const globalRows = readRows(globalWorkbook, 'Data Weekly');
const globalHeader = globalRows[0];
const globalData = globalRows.slice(1).filter((row) => row[0] === 'PDA');
const budgetRow = globalData.find((row) => row[3] === 'Budget');
const weeklyPda = globalData.filter((row) => /^W\d+$/.test(String(row[3] ?? '')));
const monthValues = (row) => globalHeader.slice(5, 17).map((_, index) => number(row[index + 5]));

const records = [
  ...weeklyPda.map((row) => ({
    entityId: 'pda', entityName: 'Asia (PDA + PDN + PGC)', code: 'PDA', week: Number(row[4]),
    budget: number(budgetRow?.[17]), sales: number(row[17]), orderbook: 0, forecast: number(row[17]), p1: 0,
    source: `${globalWorkbook} · ${row[20] ?? 'Data Weekly'}`, monthValues: monthValues(row),
    budgetMonthValues: budgetRow ? monthValues(budgetRow) : [], isSnapshot: true,
  })),
  ...weeklyFromEntityWorkbook('Dashboard 2026 - DDC.xlsx', 'ddc', 'Diam CHINA', 'DDC'),
  ...weeklyFromEntityWorkbook('Dashboard 2026 - DEHK.xlsx', 'dehk', 'DE HONG KONG', 'DEHK'),
];

const output = {
  meta: {
    fiscalYear: 2026,
    latestWeek: Math.max(...records.map((record) => record.week)),
    reportingUnit: 'EUR K',
    sourceFiles: ['Dashboard 2026 - DDC.xlsx', 'Dashboard 2026 - DEHK.xlsx', globalWorkbook],
    generatedAt: new Date().toISOString(),
  },
  entities: [
    { id: 'pda', name: 'Asia (PDA + PDN + PGC)', code: 'PDA', region: 'APAC', businessUnit: 'Asia / PDA', source: globalWorkbook, status: 'Ready', budget: number(budgetRow?.[17]) },
    { id: 'ddc', name: 'Diam CHINA', code: 'DDC', region: 'APAC', businessUnit: 'Asia / PDA', source: 'Dashboard 2026 - DDC.xlsx', status: 'Review' },
    { id: 'dehk', name: 'DE HONG KONG', code: 'DEHK', region: 'APAC', businessUnit: 'Asia / PDA', source: 'Dashboard 2026 - DEHK.xlsx', status: 'Review' },
  ],
  records,
  notes: [
    'PDA uses the Global Follow Up W35 weekly snapshot and approved budget.',
    'DDC and DEHK use entity Synth weekly snapshots. Their annual budget is not present in these source workbooks and is intentionally left blank.',
  ],
};

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'apac-dashboard.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Extracted ${records.length} snapshot records from ${output.meta.sourceFiles.length} workbooks.`);
