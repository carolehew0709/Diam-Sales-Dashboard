# Interface localization

English (`en`) and Simplified Chinese (`zh-CN`) live in `locales/en.json` and
`locales/zh-CN.json`. Keys are stable semantic identifiers, for example
`nav.overview`, `metric.coverage`, and `import.publish`.

Client components use `useI18n().tr(key, params)`. MessageKey is derived from
the English catalog and both catalogs must contain the same keys and named
parameters. Add new interface copy to both catalogs rather than using inline
language conditionals. Do not concatenate translated words to construct new
sentences; use named interpolation such as `{year}` or `{amount}`.

The provider defaults to English for server rendering, then restores the
browser's `diam.dashboard.locale` preference. Switching updates the HTML lang
attribute without navigating or clearing filters and forms. Storage failure
does not prevent switching. Login and the dashboard header expose the control.

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
