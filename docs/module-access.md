# Account module and export permissions

An account can optionally specify an `access` object with a `modules` allowlist and an `export` boolean. Supported modules are `overview` (all Sales Performance views), `pipeline`, `sales-operations`, `ar-aging` and `quotation`. Accounts without this object retain their established module and export behavior.

These controls are additional to Entity permissions and roles. Module access does not grant Entity access, editing, publishing or account administration. Read-only finance accounts can view the three China Entities in Sales Performance, Sales Operations and AR while having Pipeline, Quotation and export disabled.

The home cards, global navigation and direct page rendering follow the module policy. Dashboard, customer-analysis, Pipeline and AR data APIs enforce access on the server. Disabled export hides XLSX, chart-image and CSV controls and rejects the data-export APIs. Super Admin account updates validate this configuration and preserve it when an edit does not specify a replacement.
