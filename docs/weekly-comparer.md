# Portable weekly data comparison

`tools/weekly-comparer/` is an independent offline Windows application. It reads only the first worksheet from each selected `.xlsx`, including hidden customer rows. It does not modify workbooks, execute workbook content, access the network, or publish dashboard data. Private inputs, exported reports and binaries stay outside Git. Desktop and HTML copy use the shared bilingual `weeklyComparer.*` keys via `Translator.tr`.

## Data contract

The supported template has row-1 headers A Team, B DEHK/DDC, C External or Group, D Customer (Bill to), J YTD, W Total(FCST), and the existing E:AA layout. Both files need compatible headers except Z (reference week). Template/layout conflicts and duplicate identities stop with a useful message. Total and footer notes are excluded; other worksheets are never comparison sources.

Records match A:D using case/whitespace normalization. Identity changes appear as deletion/addition, without fuzzy matching or inferred aliases. Compare A:X cached data only. Reordering rows, hiding rows, formula-text edits with unchanged values, and reference-column Z/AA rollover do not count as data changes. Distinguish record additions/removals, W amount increases/decreases, unchanged-total monthly shifts and other data changes. Existing zero-to-positive records are increases, not new customers; positive-to-zero records are decreases, not order cancellations.

The UI calls W **Expected amount / 预计金额**, with a source note identifying the original Total(FCST) column. This is a display label only: source amounts, headers and meaning remain preserved internally. No currency conversion, dashboard exclusions, budget calculations or inferred OB status are applied. Comparison uses decimal arithmetic and a 0.000001 numeric tolerance. Missing values remain separate from zero. Missing cached values and source errors are data notes; totals with a missing required component remain unavailable. Independently sum all customer W values instead of trusting footer SUBTOTAL values. Source reconciliation checks are kept separate from changes.

## Visual interface and exports

Version 1.2 places previous/current file pickers and Compare on one row, export buttons in the compact header, and filters on one row. The larger data area opens on an overview: previous/current expected amounts, net change and percentage, change count, increase/decrease totals, clickable top-eight customer ranking, and monthly allocation comparisons. Detail text and table rows use larger fonts. Choosing a customer opens data-only before/after values and original row numbers. Formula text is neither displayed nor exported.

Team, Entity, sales type and search scope both overview and detail. Detail type filters the list only. Monthly charts aggregate supplied allocations using source SUM behavior; unallocated blanks are not plotted and missing caches remain unavailable. Period labels remain exactly sourced. File changes invalidate results and exports; workers return versioned results and only the Tk main thread updates widgets.

HTML is a standalone offline interactive report with the same data overview, scope filters, clickable customer details, a large scrollable data table and collapsed data notes. It loads no external assets and permits no network connections. Source JSON is escaped and rendered as text. CSV is UTF-8-BOM long-form data changes with original precision, filename/sheet/row evidence, and safely escaped formula-like source text. Neither export contains formula evidence or reference-only changes. Export files include all data changes regardless of desktop filters; HTML can then be filtered locally. Atomic writes prevent partial files, source workbooks cannot be overwritten, and native Save dialogs confirm replacement of existing reports.

## Verification and build

```powershell
python -m pip install -r tools/weekly-comparer/requirements-build.txt
python -m unittest discover -s tools/weekly-comparer -p "test_*.py" -v
python tools/weekly-comparer/app.py
python tools/weekly-comparer/app.py --lang en
python tools/weekly-comparer/app.py --old "previous.xlsx" --new "current.xlsx" --html ".local/report.html" --csv ".local/changes.csv" --summary ".local/summary.json"
python tools/weekly-comparer/app.py --ui-smoke-test "previous.xlsx" "current.xlsx" ".local/gui-evidence.json"
powershell -ExecutionPolicy Bypass -File tools/weekly-comparer/build.ps1
```

Build on Windows x64 with Python 3.12. The release in `.local/weekly-comparer-release-v1.2/` bundles Python, Tk, openpyxl, both locales, the report template and the supplied DIAM logo; recipients need no Python or Excel installation. Optional scientific/image packages are excluded from the runtime. `--preview OLD NEW` opens the actual GUI with selected sources; `--ui-smoke-test` verifies filters, chart data, data-only detail, source preservation and export state. Synthetic tests cover matching, visibility, missing values/cache, duplicate keys, layout conflicts, ignoring formula-only edits, chart aggregates and safe exports. Private owner regressions compare CLI and packaged results; browser checks cover chart selection, filters and narrow-screen overflow. The unsigned binary is not committed to Git.
