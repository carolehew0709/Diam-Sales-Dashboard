"""Offline DDC -> DEHK order matching, rule version 1.0 (owner-verified export).

Only the values-only sales-order export contract is accepted. No Excel automation,
formula execution, network access, currency conversion, or dashboard publication.
"""
from __future__ import annotations

import collections
import copy
import csv
import io
import os
from pathlib import Path
import re
import tempfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Callable
import xml.etree.ElementTree as ET
import zipfile
from xml.sax.saxutils import escape
import posixpath

VERSION = "1.0.0"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = ("DEHK结算币种（原表L列）", "DEHK单价（原表M列）")
PENDING = "待核对（对应多个订单）"
ORDER_RE = re.compile(r"XSDD-[A-Z0-9]+(?:-\d{6})?")
LINE_RE = re.compile(r"(XSDD-\d{6}-\d{6})-(\d+)")
METHODS = ((10, "quantity"), (8, "item-name"), (9, "specification"),
           (54, "required-delivery-date"), (48, "customer-delivery-date"))


class MatchError(ValueError):
    def __init__(self, key: str, **params):
        self.key, self.params = key, params
        super().__init__(f"{key}: {params}")


@dataclass(frozen=True)
class Cell:
    value: object = None
    kind: str = "n"
    raw: str | None = None


@dataclass
class Row:
    number: int
    cells: dict[int, Cell]

    def get(self, index: int):
        return self.cells.get(index, Cell()).value


@dataclass
class Match:
    row: Row
    sources: list[Row]
    status: str
    method: str
    orders: list[str]


def norm(value) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value).strip().upper()


def column_number(value: str) -> int:
    number = 0
    for char in value:
        number = number * 26 + ord(char) - 64
    return number


def column_name(number: int) -> str:
    name = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        name = chr(65 + remainder) + name
    return name


def shift_address(match) -> str:
    column, row = match.group(1), match.group(2)
    number = column_number(column.replace("$", ""))
    return ("$" if column.startswith("$") else "") + column_name(
        number + 2 if number >= 14 else number) + row


def shift_range(value: str) -> str:
    return re.sub(r"(\$?[A-Z]+)(\$?\d+)", shift_address, value)


class SourceBook:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        if self.path.suffix.lower() != ".xlsx":
            raise MatchError("xlsxOnly")
        try:
            self.zip = zipfile.ZipFile(self.path)
            entries = self.zip.infolist()
            if len(entries) > 10000 or sum(x.file_size for x in entries) > 512 * 1024**2:
                raise MatchError("tooLarge")
            if any(x.file_size > 256 * 1024**2 for x in entries):
                raise MatchError("tooLarge")
            if len({x.filename for x in entries}) != len(entries):
                raise MatchError("invalidWorkbook")
            if any(x.filename.startswith("_xmlsignatures/") for x in entries):
                raise MatchError("unsupportedFeature", feature="digital signature")
            root = ET.fromstring(self.zip.read("xl/workbook.xml"))
            rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
            targets = {r.get("Id"): r.get("Target") for r in rels
                       if r.get("TargetMode") != "External"}
            self.sheets = {}
            for sheet in root.find("m:sheets", NS):
                target = targets[sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")]
                part = posixpath.normpath(target.lstrip("/") if target.startswith("/")
                                         else posixpath.join("xl", target))
                if not part.startswith("xl/"):
                    raise MatchError("invalidWorkbook")
                self.sheets[sheet.get("name")] = part
            self.strings = []
            if "xl/sharedStrings.xml" in self.zip.namelist():
                for _, node in ET.iterparse(io.BytesIO(self.zip.read("xl/sharedStrings.xml"))):
                    if node.tag == f'{{{NS["m"]}}}si':
                        self.strings.append("".join(t.text or "" for t in node.findall(".//m:t", NS)))
                        node.clear()
        except Exception:
            if hasattr(self, "zip"):
                self.zip.close()
            raise

    def close(self):
        self.zip.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def rows(self, sheet: str) -> list[Row]:
        if sheet not in self.sheets:
            raise MatchError("sheetMissing", sheet=sheet)
        rows = []
        for _, node in ET.iterparse(io.BytesIO(self.zip.read(self.sheets[sheet]))):
            if node.tag != f'{{{NS["m"]}}}row':
                continue
            cells = {}
            for element in node.findall("m:c", NS):
                col = column_number(re.match(r"[A-Z]+", element.get("r"))[0]) - 1
                kind = element.get("t", "n")
                raw = element.find("m:v", NS)
                raw = raw.text if raw is not None else None
                if kind == "s":
                    value = self.strings[int(raw)] if raw is not None else None
                elif kind == "inlineStr":
                    value = "".join(t.text or "" for t in element.findall(".//m:t", NS))
                elif kind in ("str", "e", "d"):
                    value = raw
                elif kind == "b":
                    value = raw == "1"
                else:
                    try:
                        value = Decimal(raw) if raw is not None else None
                        if value is not None and not value.is_finite():
                            raise InvalidOperation
                    except InvalidOperation:
                        raise MatchError("invalidCell", cell=element.get("r"))
                cells[col] = Cell(value, kind, raw)
            rows.append(Row(int(node.get("r")), cells))
            node.clear()
        return rows

    def validate(self, ddc: str, dehk: str) -> tuple[list[Row], list[Row]]:
        if ddc == dehk:
            raise MatchError("differentSheets")
        for name, part in self.sheets.items():
            text = self.zip.read(part).decode("utf-8-sig")
            # Inserting columns into formula workbooks requires reference translation
            # across all sheets. Fail explicitly rather than corrupting the workbook.
            if re.search(r"<(?:\w+:)?f(?:\s|>)", text):
                raise MatchError("formulaWorkbook", sheet=name)
        text = self.zip.read(self.sheets[ddc]).decode("utf-8-sig")
        unsupported = r"<(mergeCells|tableParts|drawing|legacyDrawing|conditionalFormatting|dataValidations|sheetProtection|extLst)(?:\s|>)"
        # WPS exports include an empty extLst in the autoFilter; that is safe.
        cleaned = re.sub(r"<extLst\s*/>", "", text)
        hit = re.search(unsupported, cleaned)
        if hit:
            raise MatchError("unsupportedFeature", feature=hit[1])
        ddc_rows, dehk_rows = self.rows(ddc), self.rows(dehk)
        for name, rows in [(ddc, ddc_rows), (dehk, dehk_rows)]:
            if not rows or rows[0].number != 1:
                raise MatchError("headerRow", sheet=name)
            required = {1: "来源单据编号", 2: "备注", 4: "单据编号", 6: "项目编码",
                        7: "物料编码", 10: "数量", 11: "结算币种", 12: "单价"}
            for index, label in required.items():
                if norm(rows[0].get(index)) != norm(label):
                    raise MatchError("headerMismatch", sheet=name, column=column_name(index + 1), expected=label)
            if any(norm(cell.value) in {norm(x) for x in HEADERS} for cell in rows[0].cells.values()):
                raise MatchError("alreadyMatched")
        # Do not turn a pre-existing Excel error or absent numeric cache into a match.
        for rows in (ddc_rows, dehk_rows):
            for row in rows[1:]:
                for index in (1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 48, 54):
                    if row.cells.get(index, Cell()).kind == "e":
                        raise MatchError("invalidCell", cell=f"{column_name(index+1)}{row.number}")
        return ddc_rows, dehk_rows


def match_rows(ddc_rows: list[Row], dehk_rows: list[Row]) -> list[Match]:
    index, orders = collections.defaultdict(list), collections.defaultdict(list)
    for row in dehk_rows[1:]:
        key = tuple(norm(row.get(i)) for i in (4, 6, 7))
        if all(key):
            index[key].append(row)
        if key[0]:
            orders[key[0]].append(row)
    line_checks = collections.defaultdict(list)
    for row in ddc_rows[1:]:
        for order, line in LINE_RE.findall(norm(row.get(2))):
            lines, position = orders.get(order, []), int(line) - 1
            valid = 0 <= position < len(lines) and tuple(norm(lines[position].get(i)) for i in (6, 7)) == tuple(norm(row.get(i)) for i in (6, 7))
            line_checks[order].append((line, valid))
    reliable = {order for order, checks in line_checks.items()
                if len({c[0] for c in checks}) >= 2 and all(c[1] for c in checks)}
    matches = []
    for row in ddc_rows[1:]:
        # Skip completely empty/formatted/footer rows; preserve them in the original.
        if not any(row.get(i) is not None for i in (0, 1, 4, 6, 7)) and not ORDER_RE.search(norm(row.get(2))):
            continue
        b, c = norm(row.get(1)), norm(row.get(2))
        refs = list(dict.fromkeys(([b] if b else []) + ORDER_RE.findall(c)))
        candidates = {r.number: r for order in refs for r in index.get(
            (order, norm(row.get(6)), norm(row.get(7))), [])}
        method = "order+project+material"
        def pairs():
            return {(r.get(11), r.get(12)) for r in candidates.values()}
        for col, label in METHODS:
            if len(pairs()) > 1 and row.get(col) is not None:
                exact = {n: r for n, r in candidates.items() if norm(r.get(col)) == norm(row.get(col))}
                if exact and len(exact) < len(candidates):
                    candidates = exact
                    method += "+" + label
        if len(pairs()) > 1:
            exact = {}
            for order, line in LINE_RE.findall(c):
                if order in reliable:
                    r = orders[order][int(line) - 1]
                    if r.number in candidates:
                        exact[r.number] = r
            if exact:
                candidates = exact
                method += "+validated-remark-line"
        status = "matched" if len(pairs()) == 1 else "ambiguous" if candidates else "unmatched"
        matches.append(Match(row, list(candidates.values()), status, method, refs))
    return matches


def _literal_cell(address: str, value: str | None, style: int) -> str:
    if value is None:
        return f'<c r="{address}" s="{style}"/>'
    return f'<c r="{address}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'


def _copied_cell(address: str, cell: Cell, style: int) -> str:
    if cell.value is None:
        return _literal_cell(address, None, style)
    if cell.kind in ("n", "b"):
        return f'<c r="{address}" s="{style}" t="{cell.kind}"><v>{escape(cell.raw)}</v></c>'
    return _literal_cell(address, str(cell.value), style)


def _extend_styles(text: str, originals: list[int]) -> tuple[str, dict[int, int]]:
    fills = re.search(r'<fills\b[^>]*count="(\d+)"[^>]*>(.*?)</fills>', text, re.S)
    xfs = re.search(r'<cellXfs\b[^>]*count="(\d+)"[^>]*>(.*?)</cellXfs>', text, re.S)
    if not fills or not xfs:
        raise MatchError("unsupportedFeature", feature="styles")
    fillid = int(fills[1])
    fill = '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>'
    replacement = f'<fills count="{fillid+1}">' + fills[2] + fill + '</fills>'
    text = text[:fills.start()] + replacement + text[fills.end():]
    xfs = re.search(r'<cellXfs\b[^>]*count="(\d+)"[^>]*>(.*?)</cellXfs>', text, re.S)
    entries = re.findall(r'<xf\b[^>]*(?:/>|>.*?</xf>)', xfs[2], re.S)
    mapping, additions = {}, []
    for old in dict.fromkeys(originals):
        if old >= len(entries):
            raise MatchError("invalidWorkbook")
        mapping[old] = len(entries) + len(additions)
        entry = re.sub(r'fillId="\d+"', f'fillId="{fillid}"', entries[old])
        if 'fillId=' not in entry:
            entry = entry.replace('<xf', f'<xf fillId="{fillid}"', 1)
        entry = re.sub(r'applyFill="[^"]*"', '', entry).replace('<xf', '<xf applyFill="1"', 1)
        additions.append(entry)
    text = text[:xfs.start()] + f'<cellXfs count="{len(entries)+len(additions)}">' + xfs[2] + ''.join(additions) + '</cellXfs>' + text[xfs.end():]
    return text, mapping


def _patch_sheet(text: str, matches: list[Match], styles: dict[int, int]) -> str:
    by_row = {m.row.number: m for m in matches}
    def edit_row(found):
        row = found[0]
        n = int(re.search(r'\br="(\d+)"', row)[1])
        cells = re.findall(r'<c\b[^>]*(?:/>|>.*?</c>)', row, re.S)
        oldstyles = {re.search(r'\br="([A-Z]+)\d+"', cell)[1]: int(re.search(r'\bs="(\d+)"', cell)[1]) if re.search(r'\bs="(\d+)"', cell) else 0 for cell in cells}
        cells = [re.sub(r'\br="([A-Z]+)(\d+)"', lambda m: 'r="' + shift_address(m) + '"', cell, count=1) for cell in cells]
        result = by_row.get(n)
        for j, letter in enumerate(('N', 'O')):
            style = styles[oldstyles.get(('L', 'M')[j], 0)]
            if n == 1:
                cell = _literal_cell(f'{letter}{n}', HEADERS[j], style)
            elif result is None:
                continue
            elif result.status == 'matched':
                cell = _copied_cell(f'{letter}{n}', result.sources[0].cells.get(11+j, Cell()), style)
            else:
                cell = _literal_cell(f'{letter}{n}', PENDING if result.status == 'ambiguous' else 'N/A', style)
            cells.append(cell)
        cells.sort(key=lambda c: column_number(re.search(r'\br="([A-Z]+)', c)[1]))
        opening = row[:row.index('>') + 1]
        opening = re.sub(r'spans="(\d+):(\d+)"', lambda m: f'spans="{m[1]}:{int(m[2])+2}"', opening)
        return opening + ''.join(cells) + '</row>'
    text = re.sub(r'<row\b[^>]*>.*?</row>', edit_row, text, flags=re.S)
    def edit_col(found):
        col = found[0]
        low, high = int(re.search(r'min="(\d+)"', col)[1]), int(re.search(r'max="(\d+)"', col)[1])
        if low <= 13 < high:
            left = re.sub(r'max="\d+"', 'max="13"', col)
            right = re.sub(r'min="\d+"', 'min="16"', col)
            right = re.sub(r'max="\d+"', f'max="{min(high+2,16384)}"', right)
            return left + right
        if low >= 14:
            col = re.sub(r'min="\d+"', f'min="{min(low+2,16384)}"', col)
            col = re.sub(r'max="\d+"', f'max="{min(high+2,16384)}"', col)
        return col
    text = re.sub(r'<col\b[^>]*/>', edit_col, text)
    added = '<col min="14" max="15" width="42" customWidth="1"/>'
    if '<cols>' in text:
        text = text.replace('</cols>', added + '</cols>')
        text = re.sub(r'<cols>(.*?)</cols>', lambda m: '<cols>' + ''.join(sorted(re.findall(r'<col\b[^>]*/>', m[1]), key=lambda c: int(re.search(r'min="(\d+)"', c)[1]))) + '</cols>', text, flags=re.S)
    else:
        text = text.replace('<sheetData>', '<cols>' + added + '</cols><sheetData>', 1)
    text = re.sub(r'\b(ref|sqref|activeCell)="([^"]+)"', lambda m: m[1] + '="' + shift_range(m[2]) + '"', text)
    text = re.sub(r'colId="(\d+)"', lambda m: f'colId="{int(m[1])+2 if int(m[1])>=13 else int(m[1])}"', text)
    # Existing frozen panes/scroll positions follow the shifted columns.
    text = re.sub(r'topLeftCell="([^"]+)"', lambda m: 'topLeftCell="' + shift_range(m[1]) + '"', text)
    text = re.sub(r'xSplit="(\d+)"', lambda m: f'xSplit="{int(m[1])+2 if int(m[1])>=13 else int(m[1])}"', text)
    return text


def _csv_value(value):
    text = '' if value is None else str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@', '\t', '\r', '\n') else text


AUDIT_ZH = ['DDC行号', 'DDC订单号', '来源单据编号', '备注', '项目编码', '物料编码',
            '数量', '匹配状态', '匹配依据', 'DEHK候选行号', 'DEHK订单号', 'DEHK结算币种',
            'DEHK单价', 'DEHK候选币种/单价', '说明']
AUDIT_EN = ['DDC row', 'DDC order', 'Source order', 'Remark', 'Project', 'Material',
            'Quantity', 'Status', 'Method', 'DEHK candidate rows', 'DEHK orders',
            'DEHK currency', 'DEHK unit price', 'DEHK candidate currency / price', 'Note']


def write_audit(path: Path, matches: list[Match], lang: str):
    statuses = {'matched': '已匹配', 'unmatched': 'N/A', 'ambiguous': PENDING} if lang == 'zh-CN' else {'matched': 'Matched', 'unmatched': 'N/A', 'ambiguous': 'Review: multiple orders'}
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(AUDIT_ZH if lang == 'zh-CN' else AUDIT_EN)
        for m in matches:
            source = m.sources[0] if m.status == 'matched' else None
            note = ('DEHK原始单价为空，保留空白' if lang == 'zh-CN' else 'DEHK source price is blank; preserved') if source and source.get(12) is None else ''
            values = [m.row.number, m.row.get(4), m.row.get(1), m.row.get(2), m.row.get(6), m.row.get(7), m.row.get(10), statuses[m.status], m.method,
                      '; '.join(str(r.number) for r in m.sources), '; '.join(dict.fromkeys(str(r.get(4)) for r in m.sources)),
                      source.get(11) if source else '', source.get(12) if source else '',
                      '; '.join(f'{r.number}: {r.get(11)} / {r.get(12) if r.get(12) is not None else "(blank)"}' for r in m.sources), note]
            writer.writerow([_csv_value(v) for v in values])


def process_workbook(source: Path | str, output: Path | str, ddc: str, dehk: str,
                     audit: Path | str | None = None, lang: str = 'zh-CN',
                     overwrite: bool = False, progress: Callable[[str], None] = lambda _: None) -> dict:
    source, output = Path(source).resolve(), Path(output).resolve()
    audit = Path(audit).resolve() if audit else None
    if output.suffix.lower() != '.xlsx':
        raise MatchError('xlsxOnly')
    if output == source or (audit and audit in (source, output)):
        raise MatchError('originalProtected')
    if output.exists() and (not overwrite or os.path.samefile(source, output)):
        raise MatchError('outputExists', path=str(output))
    if audit and audit.exists():
        raise MatchError('outputExists', path=str(audit))
    temps = []
    try:
        progress('reading')
        with SourceBook(source) as book:
            if ddc not in book.sheets or dehk not in book.sheets:
                raise MatchError('sheetMissing', sheet=ddc if ddc not in book.sheets else dehk)
            ddc_rows, dehk_rows = book.validate(ddc, dehk)
            progress('matching')
            matches = match_rows(ddc_rows, dehk_rows)
            if not matches:
                raise MatchError('noRows')
            raw = book.zip.read(book.sheets[ddc]).decode('utf-8-sig')
            if any(column_number(x) > 16382 for x in re.findall(r'<c\b[^>]*\br="([A-Z]+)\d+"', raw)):
                raise MatchError('tooManyColumns')
            originals = [0] + [int(style) for style in re.findall(r'<c\b[^>]*\br="[LM]\d+"[^>]*\bs="(\d+)"', raw)]
            styles_text, styles = _extend_styles(book.zip.read('xl/styles.xml').decode('utf-8-sig'), originals)
            patched = _patch_sheet(raw, matches, styles)
            workbook_text = book.zip.read('xl/workbook.xml').decode('utf-8-sig')
            # Defined names can depend on the inserted columns. Support the normal
            # filter range; reject custom formulas/names rather than leaving stale refs.
            for dn in ET.fromstring(workbook_text).findall('m:definedNames/m:definedName', NS):
                expression = dn.text or ''
                if f"'{ddc.replace(chr(39), chr(39)*2)}'!" in expression or f'{ddc}!' in expression:
                    if dn.get('name') != '_xlnm._FilterDatabase':
                        raise MatchError('unsupportedFeature', feature='defined name: ' + dn.get('name', ''))
                    prefix, separator, reference = expression.rpartition('!')
                    if not separator or not re.fullmatch(r'\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+', reference):
                        raise MatchError('unsupportedFeature', feature='filter defined name')
                    workbook_text = workbook_text.replace(escape(expression), escape(prefix + '!' + shift_range(reference)))
            progress('writing')
            handle, temp = tempfile.mkstemp(prefix='.diam-match-', suffix='.xlsx', dir=output.parent)
            os.close(handle); temp = Path(temp); temps.append(temp)
            changed = {book.sheets[ddc]: patched.encode('utf8'), 'xl/styles.xml': styles_text.encode('utf8')}
            if workbook_text != book.zip.read('xl/workbook.xml').decode('utf-8-sig'):
                changed['xl/workbook.xml'] = workbook_text.encode('utf8')
            with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as target:
                for entry in book.zip.infolist():
                    target.writestr(copy.copy(entry), changed.get(entry.filename, book.zip.read(entry.filename)))
            progress('verifying')
            with SourceBook(temp) as result:
                for entry in book.zip.infolist():
                    if entry.filename not in changed and result.zip.read(entry.filename) != book.zip.read(entry.filename):
                        raise MatchError('verificationFailed')
                actual = {r.number: r for r in result.rows(ddc)}
                for row in ddc_rows:
                    output_row = actual.get(row.number)
                    if output_row is None:
                        raise MatchError('verificationFailed')
                    for col, cell in row.cells.items():
                        if output_row.cells.get(col + 2 if col >= 13 else col, Cell()).value != cell.value:
                            raise MatchError('verificationFailed')
                for m in matches:
                    expected = tuple(m.sources[0].get(i) for i in (11, 12)) if m.status == 'matched' else (PENDING, PENDING) if m.status == 'ambiguous' else ('N/A', 'N/A')
                    if tuple(actual[m.row.number].get(i) for i in (13, 14)) != expected:
                        raise MatchError('verificationFailed')
            audit_temp = None
            if audit:
                handle, name = tempfile.mkstemp(prefix='.diam-match-', suffix='.csv', dir=audit.parent)
                os.close(handle); audit_temp = Path(name); temps.append(audit_temp)
                write_audit(audit_temp, matches, lang)
            # Windows rename is atomic and refuses an existing target. Unlike hard
            # links, it also works on USB drives and ordinary network shares.
            if overwrite:
                os.replace(temp, output)
            elif os.name == 'nt':
                os.rename(temp, output)
            else:
                os.link(temp, output)
            if audit_temp:
                try:
                    if os.name == 'nt':
                        os.rename(audit_temp, audit)
                    else:
                        os.link(audit_temp, audit)
                except Exception:
                    # The valid result workbook remains available even if audit output
                    # fails. Return its path explicitly instead of hiding that outcome.
                    raise MatchError('auditWriteFailed', output=str(output))
        counts = collections.Counter(m.status for m in matches)
        return {'version': VERSION, 'source': str(source), 'output': str(output), 'audit': str(audit) if audit else None,
                'ddc_sheet': ddc, 'dehk_sheet': dehk, 'total': len(matches),
                'matched': counts['matched'], 'unmatched': counts['unmatched'], 'ambiguous': counts['ambiguous'],
                'blank_source_prices': sum(m.status == 'matched' and m.sources[0].get(12) is None for m in matches)}
    finally:
        for path in temps:
            path.unlink(missing_ok=True)
