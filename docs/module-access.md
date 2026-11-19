# Account module and export permissions

An account can optionally specify an `access` object with a `modules` allowlist and an `export` boolean. Supported modules are `overview` (all Sales Performance views), `pipeline`, `sales-operations`, `ar-aging` and `quotation`. Accounts without this object retain their established module and export behavior.

These controls are additional to Entity permissions and roles. Module access does not grant Entity access, editing, publishing or account administration. Read-only finance accounts can view the three China Entities in Sales Performance, Sales Operations and AR while having Pipeline, Quotation and export disabled.

The home cards, global navigation and direct page rendering follow the module policy. Dashboard, customer-analysis, Pipeline and AR data APIs enforce access on the server. Disabled export hides XLSX, chart-image and CSV controls and rejects the data-export APIs. Super Admin account updates validate this configuration and preserve it when an edit does not specify a replacement.

## Super Admin configuration

Open `/{locale}/admin`, select an account or choose **Add account**, then set **Module permissions** and **Allow data exports** before saving. The five module checkboxes control Sales Performance (including its analysis, Entity and management-check views), Pipeline, Sales Operations, AR Aging and Quotation. Home and account administration remain governed by their established rules. Import and publish rights continue to follow role and Entity Edit permissions; a module checkbox does not grant either right.

Existing accounts display their configured policy. Legacy accounts with no `access` object display all modules and exports enabled, preserving their current behavior. Editing only ordinary account fields preserves an existing policy. Disabled accounts display their saved configuration so it can be reviewed before restoration. Turning every module off is supported and leaves an account with Home only.

Save changes explicitly. Drafts survive switching accounts within the page and Reset edits restores the saved values. Successful account updates invalidate existing sessions and record the actor, target and time in the account audit. When updating their own account, the administrator receives a success screen with a link to sign in again. English and Chinese labels are supplied. Permission and interaction tests use isolated synthetic accounts; rollout does not rewrite existing account policies.

Exports are an account-wide switch within the granted modules and Entity scope. It includes local Quotation Excel downloads as well as Sales/AR Excel, CSV and chart downloads. It is not a separate permission per file format.
