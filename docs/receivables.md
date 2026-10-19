# AR aging and sales-team source contract

Owner decisions confirmed on 2026-10-19:

- W42 DCP retains 260.81449 kEUR External YTD despite raw H10 200.091. W40/W41 confirmations remain; do not extend the correction to W43 or later without confirmation.
- Sales Team initially filters source-backed OB only. No team YTD invoices, approved budget, Prospect or attainment allocations are supplied. Those metrics remain blank with a pending-data explanation. All Teams preserves all existing BU reporting formulas.
- AR Due means Not Due. Aging stays at the source snapshot, 2026-09-30; the application does not recompute aging using today's date or infer settlement from free-text follow-up comments.
- Unknown/Advance has no BU allocation and is independent of the BU and invoice-aging controls. Use Summary EUR balances once; Unknown and Advance classify those same receipts. Do not deduct unapplied receipts automatically from invoice AR.

## Sources and grain

`DEHK+DDC OVERDUE.xlsx`: only `DEHK OVERDUE` and `DDC OVERDUE` are active sources. The DEHK sheet explicitly excludes September invoices; do not append `Sept Invoice`, `ALL`, old aging or the October preview. Each row requires invoice date, invoice number, customer and numeric outstanding amount. Subtotals, pivots and footer notes are excluded. Reporting date is O1, invoice date A, customer C, sales team R, PIC S, terms N, overdue days O, supplied aging P and External/Group Q. DEHK amount is K (Divers in EUR); DDC amount is J (CNY, displayed RMB). Signed amounts, including credit balances, remain intact. Source file, sheet and Excel row travel with every record. The initial extract has 383 DEHK and 616 DDC invoices.

`Unknown Payment.xlsx`: Summary has receipt date C, payer D, original currency E, original balance G, EUR balance H, customer K, team L and PIC M. Match Summary records to Unknown/Advance using receipt date, payer, currency and original balance, retaining duplicate-match queues. Never sum Summary and detail sheets together. Ambiguous/unmatched classification blocks publication. The initial extract has 13 unknown and 26 advance receipts. Original currencies/balances remain as evidence, while reporting uses supplied H values. Receipt date is a receipt date, not an invoice date.

Amounts are full EUR/RMB units, not kEUR; display rounds to integers without changing stored precision. Sales Performance remains kEUR. No exchange rate is invented. Currency cards, aging profiles, customer ranks and exports keep EUR/RMB separate. Top 10 means ten customers by signed outstanding AR within each currency after the active invoice filters. Other is its complement and has an additional individual-customer selector. Unclassified aging stays separate so AR = Not Due + Overdue + Unclassified. Payment customer type is resolved only when the permitted invoice data contains one unambiguous classification for that exact normalized customer; otherwise it remains Unclassified and is included only in All sales types.

## Data and permission flow

AR workbooks contain private customer, invoice and payment details. This repository is public: keep `Dashboard/DEHK+DDC OVERDUE.xlsx`, `Dashboard/Unknown Payment.xlsx` and the generated `data/ar-aging.json` out of Git. Retain originals in a restricted local/server source directory and publish through the authenticated import flow. The application reads published AR from PostgreSQL, not a bundled JSON seed. `npm run extract:receivables` requires those private local inputs and creates an ignored review derivative. CI runs synthetic parser, scope and aggregation contracts; additional reconciliation tests run when the private workbooks are available locally.

`lib/receivables-parser.ts` parses cached source values; `lib/receivables.ts` owns scopes, filters and aggregation. `scripts/extract-receivables.ts` produces a reviewable derivative, not a publication. `Store.receivables` and `receivablesUpdatedAt` hold published data in the existing PostgreSQL transaction adapter. Import remains analyze → review → explicit publish, idempotent by batch. Publishing aging replaces the aging dataset; publishing payments replaces only receipts. It does not change sales snapshots, sales-update timestamps, users or approved budgets.

Receivables sources require DEHK/DDC edit scope to submit and their publish permissions to activate. India editors cannot submit, fetch, export or view China AR, including through direct URLs. Single-BU viewers see only permitted invoices; shared receipts require view access to both DEHK and DDC because the source has no BU ownership field. The homepage AR card follows the same scope. Public API and export responses never include other-country records or source metadata outside permission scope.

CSV export uses identical filters and scope, preserves numeric precision and source evidence, and escapes formula-like text cells. Every source upload shows receipt/invoice row counts in review. The new UI follows the existing DIAM home cards, dashboard cards and bilingual catalogs. Missing PIC/team values are visibly unassigned rather than inferred from customer names.

## Sales team dimension

Weekly direct-entity sources have team text in column D alongside order detail starting row 24. `X` is an intercompany marker, not a team; normalize whitespace and retain missing assignments separately. `OrderBookLine.salesTeam` is backward-compatible with historical imports. Aggregate only the latest permitted entity-week, and use the same intercompany and sales-type exclusions as existing reporting. History/export and team OB share the same projection. Do not reuse BU budgets as team budgets, derive invoiced sales from AR balances, or silently distribute unallocated sales among teams.
