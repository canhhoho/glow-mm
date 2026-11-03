# Excel import templates

`build.mjs` creates the two download assets in `public/templates/` using the bundled
Spreadsheets `@oai/artifact-tool` runtime. The website does not need that package.
The template field definitions are shared with the reader in
`src/lib/catalog-import-columns.json`.

To regenerate, locate the bundled Node runtime and packages with
`load_workspace_dependencies`. Create an ignored `node_modules` junction in this
directory to that runtime's `node_modules`, then run `build.mjs` with the bundled
Node executable. Inspect the four previews in `outputs/catalog-import/` before
accepting the assets. No database is required.

The input table begins at row 6, followed by 200 blank, formatted entry rows.
Examples are confined to the `Huong dan` sheet. The server reads only `San pham`
or `Ton dau ky` and preserves original Excel line numbers in validation errors.
Re-run `tests/unit/catalog-import-file.test.ts` after changing either template.
