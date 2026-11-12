# Quotation workspace

Open **Quotation** on the signed-in workspace home page. Choose the costing
workbook from disk. The browser reads the workbook, form fields and selected
images for the current page session. Download the quote to keep a copy.

The reader recognizes costing sheets with `PART NAME` in A7, `PART QUANTITY`
in A10 and a formula in D69. The editor displays business inputs and formula
results through row 70. Referenced helpers below row 70 are evaluated from
the imported sheet. The quotation cover sheet and drawings do not supply input
values. Enter item details and attach pictures in the quotation grid.

Column B standards initially use the workbook values and formulas. Recognized
external process rates start from their saved numeric results. An edit applies
to every quotation line using that cost sheet. Linked standards recalculate
until explicitly overridden. Restore workbook standards to remove the overrides
for that sheet. Unsupported or active broken references surface a calculation
error with the cell address.

Choose the source cost cell or range for each line. D69 is the default and the
cost basis defaults to one unit. If the chosen amount covers more than one
chargeable unit, enter the corresponding unit count. The quotation quantity
only affects the line amount. The price uses the entered cost markup
(`unit cost × (1 + markup / 100)`). The workbook template uses EUR for its
cost totals. If the quotation uses a different currency, enter its conversion
rate per EUR. Line amounts use the two-decimal quoted price, and the quotation
total is the sum of the line amounts.

The Excel export includes item details, pictures, quantity, cost per unit,
quoted unit price, line amount and total. The cost is a snapshot of the browser
calculation. The workbook formulas let the exported price, line amount and
total follow edits to cost, markup and quantity.
