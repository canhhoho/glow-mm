# VTP Myanmar OMS template

`vtp-myanmar.xlsx` is the user's supplied `OMS_format_order_excel_MM (2).xlsx`.
Preserve its 21 columns, five worksheets, hidden lookup lists and validation rules.
`vtp-options.json` contains the address, service and pickup lists extracted from
those sheets, including exact VTP labels. Do not substitute application codes:
for example, VTP splits Bago and Shan into separate regions.

The exporter changes only data from row 8 in `Order list`. It replaces the old
serial-number formulas with numeric serials and removes their obsolete calc chain.
Other ZIP entries, including styles and the vendor's existing named ranges, stay
unchanged. Tests compare the retained parts and read the resulting workbook.

The application matches full township names within a state, preferring district
names when needed. An ambiguous or unknown address requires explicit selection
from the carrier's own list on the export screen. No fuzzy match is used.

Exports are limited to 200 orders preparing for delivery, and require the
`orders:ship` permission. Weight, recipient name, destination and note can be
reviewed for the shipment. Prices, goods and COD are read again from the database;
exporting does not create a shipment, change order status or issue stock.

Run `node --conditions=react-server --import tsx scripts/vtp-export-demo.ts` to
create a fictional test workbook without using the database. The optional bundled
Spreadsheets renderer is `scripts/catalog-templates/inspect-vtp.mjs`.
