# Portable on-going-DDC project comparison (v2)

The offline tool in `tools/weekly-comparer/` now compares the named `on-going-DDC` sheet, replacing v1's first-sheet summary contract. Its v2 business engine is `lib/weekly_order_comparison.py`. Shared value/export helpers remain in the previous engine module. UI/report copy uses bilingual `weeklyOrders.*` semantic keys, with shared desktop copy falling back to `weeklyComparer.*`. Private sources, reports, binaries and QA evidence stay outside public Git. Nothing is imported or published into the dashboard.

## Source and identity

Row 2 must identify D Team, E Job Number, G Brand, K Project Name, L Quotation Status, N RMB, O USD, P EUR and T Invoice Date. Data starts below the header. Only the named sheet supplies rows; blank/footer-only lines are excluded. Cached values are read without executing formulas or external links, and hidden rows remain included. A missing Job Number is retained for review rather than matched or classified as a new project.

Match normalized Job Number first (case/whitespace only). When either full source has multiple rows for that Job Number, add normalized Project Name to the key. A repeated job with a missing project name is a review item. Remaining repeated job/name rows form one project group, with all original rows retained; no fuzzy matching, row-number pairing, inferred aliases or automatic deduplication occurs. A unique job can still match if its name changes. Team and Brand are presentation filters, never identity keys.

## Compared data

Compare the three monetary columns separately, T Invoice Date and L status. Other metadata and formula text do not create changes. A grouped currency amount is complete only when all selected member values are numeric and usable; otherwise display the known subtotal plus missing/TBC evidence and leave the delta unavailable. Never add currencies together or infer exchange rates. Numeric equality uses a 0.000001 tolerance. Status/date comparisons preserve value multiplicities, normalize case/whitespace only, and retain original text for display. Status spelling and PO labels are never silently mapped. Dates are taken only from T, never neighboring invoice-number or delivery columns.

The owner's clarified continuity request is **same nonblank status in the two selected files**, not a historical-duration claim. Both groups must exist, all statuses must be known, and their status multisets must agree; amounts or dates may still change. No weekly history database or greater-than-two-week inference is introduced. Added/removed counts refer only to this sheet, not project creation/cancellation in the business. Changed source row counts are also noted for grouped records.

## Filters and exports

The desktop retains compact one-row file inputs, large data panes, clickable amount ranking and source-row details. Team and Brand combine to filter the original rows before recomputing each project group. Identity decisions use full-source duplication counts, so filtering does not change the matching contract. A group entering/leaving only the filter scope is labeled separately from a genuine source addition/removal. The currency selector affects only the amount chart. The view selector can show changes, all, amount/date/status changes, added, removed, review, or same-status projects. The same-status shortcut opens its own filtered list.

CSV exports the current Team/Brand/search/view selection, with Team and Brand first, all three currencies' before/after/delta, old/new status/date and source row numbers. CSV is UTF-8-BOM and escapes potentially executable source text. HTML is a self-contained offline interactive report: it retains the complete two-source dataset, opens on the desktop's current selection, allows fresh Team/Brand/view filtering, and can download the displayed CSV. The report uses inert escaped JSON and text nodes, blocks network connections and loads no external assets. HTML and native matching/filter aggregates are cross-checked on multiple scopes. Source-row details show all member lines rather than inferred individual pairings. Exports do not contain formula text. Atomic output writes prohibit overwriting sources.

## Development, packaging and delivery

```powershell
python -m pip install -r tools/weekly-comparer/requirements-build.txt
python -m unittest discover -s tools/weekly-comparer -p "test_*.py" -v
python tools/weekly-comparer/app.py
python tools/weekly-comparer/app.py --old "old.xlsx" --new "new.xlsx" --html ".local/ddc.html" --csv ".local/changed.csv" --summary ".local/stats.json"
python tools/weekly-comparer/app.py --old "old.xlsx" --new "new.xlsx" --mode same --team "Team A" --brand "Brand B" --csv ".local/same.csv"
python tools/weekly-comparer/app.py --ui-smoke-test "old.xlsx" "new.xlsx" ".local/gui.json"
powershell -ExecutionPolicy Bypass -File tools/weekly-comparer/build.ps1
```

Build on Windows x64/Python 3.12. The executable bundles Python, Tk, openpyxl, both locales, the report template and the supplied logo. Runtime does not require Python, Excel or a network. Build output is `.local/weekly-comparer-release-v2/`. Deliverables and reproducible source live in the owner's `Weekly Report Comparison` directory, with v1.2 preserved under `previous-v1.2`. Keep supplied workbooks intact. Synthetic tests cover identity disambiguation, grouping, currency separation, missing values, same-status semantics, filter scope changes and safe exports. Private regression verifies the real files, packaged CLI/GUI and browser filters/downloads without committing workbook details. The executable remains unsigned.
