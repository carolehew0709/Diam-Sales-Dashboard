# Interface localization

English (`en`) and Simplified Chinese (`zh-CN`) live in `locales/en.json` and
`locales/zh-CN.json`. Keys are stable semantic identifiers, for example
`nav.overview`, `metric.coverage`, and `import.publish`.

Client components use `useI18n().tr(key, params)`. MessageKey is derived from
the English catalog and both catalogs must contain the same keys and named
parameters. Add new interface copy to both catalogs rather than using inline
language conditionals. Do not concatenate translated words to construct new
sentences; use named interpolation such as `{year}` or `{amount}`.

The URL is authoritative: `/en/overview` and `/zh-CN/overview` select the locale.
The dashboard is one continuous page with `#overview`, `#analysis`,
`#business-units`, and `#management-checks` anchors under `/{locale}/overview`.
Legacy section-only paths redirect to these anchors. `imports`, `admin`, `brand`,
and `login` remain separate pages. The root redirects using the `diam_locale` cookie
(English by default). Language switching retains the page, query and fragment;
the persistent application shell retains filters and form drafts. Refreshing
retains the page but not unsaved drafts. Unknown routes return 404.
Unauthenticated deep links go to login with a validated local return path.
Page visibility is not authorization: API permission checks remain authoritative.

The fixed header separates account/product actions from section navigation.
Its measured height offsets fragment scrolling; reduced-motion users skip the
scroll animation. Manual scrolling highlights the current section without adding
history entries. Coverage and residual gap carry `metric.byYear` labels;
remaining this month carries `metric.byMonth`. Calculation rules are unchanged.

`displayText` is a compatibility boundary for existing API validation messages,
enum labels, months, and entity descriptions. It maps known values to catalog
keys without changing API payloads, stored roles, filter values, or source data.
Unknown source notes, workbook evidence, customer names, and filenames retain
their original text. Newly added API errors should use stable error codes with
parameters rather than expanding English-text matching.

Excel exports retain the existing workbook language and structure; this change
localizes the web interface only. Amounts retain the shared kEUR reporting format.
History timestamps use the selected browser locale.

Run `npm test` for key/parameter parity, message formatting and existing business
logic; run `npm run typecheck` to check translation-key references.
