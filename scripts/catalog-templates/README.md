# Excel import templates

`build.mjs` creates the three download assets in `public/templates/` using the bundled
Spreadsheets `@oai/artifact-tool` runtime. The website does not need that package.
The template field definitions are shared with the reader in
`src/lib/catalog-import-columns.json`.

To regenerate, locate the bundled Node runtime and packages with
`load_workspace_dependencies`. Create an ignored `node_modules` junction in this
directory to that runtime's `node_modules`, then run `build.mjs` with the bundled
Node executable. Inspect the previews in `outputs/catalog-import/` before
accepting the assets. No database is required.

The input table begins at row 6, followed by 200 blank, formatted entry rows.
Examples are confined to the `Huong dan` sheet. The server reads only `San pham`
or `Ton dau ky` and preserves original Excel line numbers in validation errors.
Re-run `tests/unit/catalog-import-file.test.ts` after changing either template.

`opening.xlsx` combines `San pham` and `Ton dau ky`, with one guide for each.
This workflow only creates new products and supports a default warehouse for
blank warehouse cells. The stock date is conditional: DATED needs a date;
NONE applies only to products without expiry tracking; UNKNOWN is not sellable.
Purchase and inbound unit costs are separate; estimated selling fees are only
used in the web preview. PAO months never replace a batch expiry date.
