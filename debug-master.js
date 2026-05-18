const XLSX = require('xlsx');
const fs = require('fs');

const fileBuffer = fs.readFileSync('./Master Logsheet-2023.xlsx');
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

const sheet = workbook.Sheets['Master logsheet 2023 working'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('Total rows:', data.length);
console.log('\nHeaders (row 5, index 4):', data[4]);

// Check first 10 data rows for checkmarks
console.log('\nChecking rows 6-15 for checkmarks:');
for (let i = 5; i < Math.min(15, data.length); i++) {
  const row = data[i];
  if (row && row.length > 0) {
    console.log(`\nRow ${i+1}:`);
    console.log(`  Column F (index 5): "${row[5]}"`); // Occurrence
    console.log(`  Column G (index 6): "${row[6]}"`); // Hazard
    console.log(`  Column H (index 7): "${row[7]}"`); // Safety deficiency
    console.log(`  Column I (index 8): "${row[8]}"`); // Diversion
    console.log(`  Description: "${row[4]?.substring(0, 50)}"`);
  }
}
