# Spreadsheet helpers

The product import workbook is no longer a static asset: the website generates it on
download (`src/server/catalog/catalog-workbook.ts`, columns in `src/lib/catalog-sheet.ts`).
Re-run `tests/unit/catalog-sheet.test.ts` after changing either file.

`inspect-vtp.mjs` renders previews of the vendor VTP export template
(`src/server/orders/templates/vtp-myanmar.xlsx`) using the bundled Spreadsheets
`@oai/artifact-tool` runtime. The website does not need that package. To run it,
create an ignored `node_modules` junction in this directory to that runtime's
`node_modules` and run the script with the bundled Node executable. Previews are
written to `outputs/vtp-export/`.
