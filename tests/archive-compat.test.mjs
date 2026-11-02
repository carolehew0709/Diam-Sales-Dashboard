import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import unzipper from 'unzipper';

test('patched pattern dependency supports Excel export round-trip and archive file matching', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Exact data');
  sheet.addRow(['Amount', 'Missing', 'Zero']);
  sheet.addRow([260.81449, null, 0]);
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.worksheets[0].getCell('A2').value, 260.81449);
  assert.equal(loaded.worksheets[0].getCell('B2').value, null);
  assert.equal(loaded.worksheets[0].getCell('C2').value, 0);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diam-archive-'));
  try {
    await fs.writeFile(path.join(dir, 'source.txt'), 'synthetic content');
    await fs.writeFile(path.join(dir, 'excluded.bin'), 'not selected');
    const archive = archiver('zip');
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    const completed = new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    archive.glob('*.txt', { cwd: dir });
    await archive.finalize();
    await completed;
    const zip = await unzipper.Open.buffer(Buffer.concat(chunks));
    assert.deepEqual(zip.files.map(f => f.path), ['source.txt']);
    assert.equal((await zip.files[0].buffer()).toString(), 'synthetic content');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
