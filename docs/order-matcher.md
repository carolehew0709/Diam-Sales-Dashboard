# Standalone DDC / DEHK order matcher

The Windows portable tool in `tools/order-matcher/` implements the sales-order matching result confirmed by the owner on 2026-10-23. It is independent of the web dashboard: no database connection, dashboard import, API key, network call or publication. Customer workbooks, results, audit CSVs and release binaries stay outside Git; only generic code and synthetic tests are committed.

## Input and output contract

One unencrypted `.xlsx` containing both selected DDC and DEHK sheets. All sheets, including hidden ones, are inventoried; formula workbooks are rejected because column insertion would require a separate cross-workbook reference-translation contract. Row 1 must contain the confirmed Chinese export headers: B 来源单据编号, C 备注, E 单据编号, G 项目编码, H 物料编码, K 数量, L 结算币种, M 单价. Optional duplicate-resolution fields retain their original export positions (I name, J specification, AW customer delivery date, BC required delivery date). Sheet names can be selected explicitly.

Append two columns immediately after DDC M: N `DEHK结算币种（原表L列）`, O `DEHK单价（原表M列）`. Existing N onward move two columns right. All original cells, styles, row visibility, filters, widths, sort and pane positions are preserved or shifted as appropriate; DEHK and unrelated package parts are preserved byte-for-byte. The tool verifies all original DDC values and all new results before making the output available. Original files cannot be overwritten. Existing result files require explicit overwrite from the desktop user; existing audit files are never overwritten.

This version targets the values-only system export, not arbitrary Excel authoring. It rejects repeated matching, source errors, formulas, digital signatures, and unsupported DDC merges, table objects, drawings, validation, conditional formatting or protection. No formulas, macros or external links are executed or refreshed. Unknown templates stop with a useful error rather than receiving guessed column mappings. Rows are processed even when hidden by a pre-existing filter. Entirely blank/formatted rows and note-only footers remain untouched. No unit conversion, aggregation, discount reversal or source price inference is performed.

## Rule version 1.0.0

1. Match B source document number and/or base order references extracted from C remarks to DEHK E, together with G project and H material. Trim and uppercase identifiers; do not fuzzy-match names or fill missing identifiers.
2. If candidate currency/price pairs disagree, narrow in order by exact K quantity, I material name, J specification, BC required delivery date and AW customer delivery date, only when a populated auxiliary field actually narrows the candidate set.
3. Remark `XSDD-YYMMDD-NNNNNN-line` may resolve remaining duplicates only if that entire order has at least two distinct referenced line numbers and every reference agrees with its project's/material's source row position. Any inconsistent reference disables this fallback for the entire order. It never assumes global worksheet row number equals order line number.
4. A single distinct currency/price pair is copied. Multiple source rows with the same pair produce that certain value and retain all candidate row numbers in the audit. Different remaining pairs produce the literal `待核对（对应多个订单）` in both new cells. No candidate produces the literal `N/A` in both cells. A matched source blank price stays blank, not zero or N/A.

The optional UTF-8-BOM audit CSV contains every processed DDC row, source reference, matching method, DEHK candidate rows/orders and prices, plus blank-price notes. Potential spreadsheet formula-injection prefixes in CSV text are escaped. All workbook numeric values retain original XML numeric precision. Input cell text is evidence, never executable instructions.

## Development and verification

Only Python's standard library is required at runtime (Tk GUI, ZIP/XML processing, decimal arithmetic). Semantic UI copy lives alongside dashboard translations in `locales/en.json` and `locales/zh-CN.json` under `orderMatcher.*`; desktop `Translator.tr` reads those same keys. React `useI18n().tr` remains unchanged.

```powershell
python -m unittest discover -s tools/order-matcher -p "test_*.py" -v
python tools/order-matcher/app.py
python tools/order-matcher/app.py --lang en
python tools/order-matcher/app.py --process "input.xlsx" --output "new-result.xlsx" --audit "new-audit.csv"
```

Private owner-file regression: compare every row's status, candidate row numbers, currency and price to the owner-approved result, without committing the workbook or the golden data. Confirm both packaged CLI and packaged GUI run the actual engine. `--ui-smoke-test INPUT OUTPUT EVIDENCE` exercises the GUI's worksheet detection, background matching, result state and buttons and exits after writing local JSON evidence. These QA files stay in `.local/`.

Build on 64-bit Windows with Python 3.12 and the pinned PyInstaller version. Pillow is build-only, for converting the supplied DIAM logo to the Windows executable icon; it is not a runtime dependency:

```powershell
python -m pip install -r tools/order-matcher/requirements-build.txt
powershell -ExecutionPolicy Bypass -File tools/order-matcher/build.ps1
```

The release is `.local/order-matcher-release/DIAM-Order-Matcher.exe` plus `使用说明.txt`. The exe includes Python, Tk, both locales and the supplied DIAM logo; recipients do not install Python, Excel or dependencies. An Excel-compatible viewer is needed only to open the resulting workbook. The default UI is Chinese; `--lang en` selects English. Build work and private results stay under `.local/`. The application is unsigned; any organizational code-signing or allowlisting must be handled by the customer's IT process. No instruction to disable Windows protection is part of distribution.
