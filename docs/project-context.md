# Project Context

## Business context

DIAM is consolidating sales budget, forecast, order book, and follow-up reporting for APAC. Existing reporting is largely workbook-driven. The APAC dashboard should give regional users one place to inspect performance, readiness, and exceptions while keeping the source grain understandable to the people who submit the numbers.

## Source package

- `Dashboard/Dashboard 2026 - DDC.xlsx`: 52 weekly tabs plus parameters, synthesis, order analysis, and read-me sheets. Selected entity in the reviewed source: Diam CHINA.
- `Dashboard/Dashboard 2026 - DEHK.xlsx`: same weekly dashboard shape. Selected entity in the reviewed source: DE HONG KONG.
- `Dashboard/DIAM_Global_Follow_Up_2026_W35.xlsx`: Executive Summary, Weekly Review, Data Weekly, Budget Recap, Chart Data, and Management Checks.
- `DIAM-BRANDBOOK (ENG).pdf`: DIAM visual reference.

The demo normalizes the source concepts into APAC entities and weekly records. It uses kEUR as the visible unit, keeps monthly phasing, and exposes source/readiness caveats instead of hiding missing data.

## US parity target

The reviewed US staging dashboard contains Sales Performance navigation, executive overview, analysis, business-unit/entity views, management checks, source readiness, global filters, import, Excel export, and Sales by Brand. The APAC demo includes the same core surfaces, with a deliberately small but replaceable brand seed where APAC brand source data is not yet formalized.

## Demo audience

Superadmins configure access. Regional admins operate APAC submissions. Editors prepare imports. Viewers consume and export dashboard information.
