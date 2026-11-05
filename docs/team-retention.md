# Team source retained during the W44 update

Owner instruction, 2026-11-02: keep the Sales Team filter, monthly/cumulative charts, contribution and source details visible. Team information in the new workbooks is under review. Continue using the last published team dataset rather than importing new team amounts or hiding the module.

The first subsequent sales publication saves a reporting-only copy of the prior snapshots/order rows as `retainedTeamSource` inside the same storage transaction. Upload/analysis does not activate or capture a source. Subsequent publications preserve that reference until an explicitly authorized resumption. Raw new Excel order rows remain intact in weekly storage; the retained team dataset is independent of the active weekly sales source.

All-teams sales, customer reporting and regional/Entity KPIs follow the newly published weekly data. Team filter options and team charts follow the retained dataset. Selecting a particular team also uses its retained source for supported team-scoped charts, details and data exports, preserving the global filter contract without inventing current-week team amounts. Region, Entity, customer and sales-type restrictions plus account authorization are applied to the retained copy. Other countries retain their own source weeks.

Team charts show their actual retained week/files and a bilingual paused-update note; PNG/SVG and chart workbook exports use those same labels. The ordinary current weekly source label must not be substituted for the retained team's period. Invoice, budget and additional P1 allocations are not inferred from teams.

Synthetic retention tests verify changed global weekly results, unchanged team monthly/annual data, idempotent capture, retained metadata and India/partial scope isolation. Private W44 sources and the production before-image stay outside public Git.

For this update, the analyze API accepts an optional `weeks` form field with an explicit comma-separated sales-week list. All source sheets are parsed first so monthly derivation retains historical evidence; only selected snapshots/order rows enter the review batch. Invalid, absent, duplicate or out-of-range weeks and non-sales workbooks are rejected. Omitting the field preserves the existing import contract. W44 publication selects `44`, preserving all W1–W43 records.

The 2026-11-02 intake contains 57 sheets per workbook and 44 valid DEHK/DDC snapshots, plus 43 populated DCP snapshots (latest W44). DDC W45 has two formula errors in the unused future template; no selected W44 financial values depend on them. Files remain private and unchanged. DCP W44 uses source H10 200.73 kEUR; the previously approved 260.81449 correction expires after W43 and is not extended. FY2026 China All annual Sales + Prospect reconciles to 40,936.6069 kEUR against the unchanged 33,207 annual budget; FY2027 China annual Prospect is 3,979.943 against 35,788. AR, customer-month data, India/Japan/Singapore and historical sales are outside the selected publication scope.

## Reviewed W44 Prospect update (2026-11-05)

The owner subsequently authorizes W44 team Prospect. Weekly templates with an inserted Jan–Oct actuals block have independent left team/product dimensions: the parser detects that block rather than treating the order-table preceding column (October actual amount) as a team. DEHK W44 uses D/E and DDC W44 C/D; financial and delivery columns retain their existing offsets and source amounts. Missing team assignments stay Unassigned. Source column E/its moved equivalent remains the authorized customer brand/product evidence.

An explicitly selected `teamReporting=selected` sales analyze request is retained on the review batch. Publishing that batch atomically updates the corresponding retained Entity/year/week snapshots and rows; approved keys and review time are saved. Old weeks, other Entities, original actual/budget source and approved Entity budgets remain intact. Later ordinary imports still do not automatically advance the team reference. Source metadata/exports distinguish reviewed W44 from paused references. The upload portal exposes this opt-in; non-sales workbooks cannot use it.
