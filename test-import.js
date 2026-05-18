const { parseExcelFile } = require('./src/services/excelParser');
const fs = require('fs');

async function test() {
  try {
    console.log('📂 Reading Excel file...');
    const fileBuffer = fs.readFileSync('./Master Logsheet-2023.xlsx');
    
    console.log('🔄 Parsing sheets...');
    const result = await parseExcelFile(fileBuffer, 'test-tenant');
    
    console.log('\n✅ Success!');
    console.log('📊 Sheets processed:', result.sheets_processed);
    console.log('📈 Total signals:', result.total_signals_imported);
    console.log('📋 By type:', result.by_type);
    
    if (result.errors.length > 0) {
      console.log('⚠️ Errors:', result.errors);
    }
    
    // Show first 5 signals
    if (result.signals && result.signals.length > 0) {
      console.log('\n📝 Sample signals (first 5):');
      result.signals.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i+1}. [${s.report_type}] ${s.description_raw?.substring(0, 70)}...`);
      });
    } else {
      console.log('\n⚠️ No signals extracted. Check sheet structure.');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

test();
