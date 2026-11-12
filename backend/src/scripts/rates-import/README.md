# Re-importing "Media Rates Nigeria" (the rates spreadsheet)

The spreadsheet's rates live in `src/data/rateCardsSheet2024.js` (generated).
To refresh them from a new copy of the spreadsheet:

1. Unzip the .xlsx into a folder (an .xlsx is a zip), e.g. `rates-xlsx/`.
2. `node src/scripts/rates-import/xlsxRows.cjs rates-xlsx > rates.txt`
3. `node src/scripts/rates-import/importSheet.cjs rates.txt src/data/rateCardsSheet2024.js import-report.txt`
4. Read `import-report.txt` (skipped rows and anything marked CHECK).
5. Load into the database: `node src/scripts/createRateCardStations.js --yes`

Stations that also have their own newer PDF (Channels, Cool FM Lagos/Abuja,
Wazobia Lagos) are skipped by the importer; their PDF rates are in
`src/data/rateCards.js` and `src/data/rateCardsRadio.js`.
