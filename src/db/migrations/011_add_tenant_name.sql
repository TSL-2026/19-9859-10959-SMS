ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS tenant_name VARCHAR(255);

UPDATE tenant_config SET tenant_name = 'Buddha Air'         WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
UPDATE tenant_config SET tenant_name = 'Yeti Airlines'      WHERE tenant_id = '10000000-0000-0000-0000-000000000002';
UPDATE tenant_config SET tenant_name = 'Shree Airlines'     WHERE tenant_id = '10000000-0000-0000-0000-000000000003';
UPDATE tenant_config SET tenant_name = 'Sita Air'           WHERE tenant_id = '50000000-0000-0000-0000-000000000001';
UPDATE tenant_config SET tenant_name = 'IndiGo'             WHERE tenant_id = '20000000-0000-0000-0000-000000000001';
UPDATE tenant_config SET tenant_name = 'Air India'          WHERE tenant_id = '20000000-0000-0000-0000-000000000002';
UPDATE tenant_config SET tenant_name = 'SpiceJet'           WHERE tenant_id = '20000000-0000-0000-0000-000000000003';
UPDATE tenant_config SET tenant_name = 'Delta Air Lines'    WHERE tenant_id = '30000000-0000-0000-0000-000000000001';
UPDATE tenant_config SET tenant_name = 'American Airlines'  WHERE tenant_id = '30000000-0000-0000-0000-000000000002';
UPDATE tenant_config SET tenant_name = 'United Airlines'    WHERE tenant_id = '30000000-0000-0000-0000-000000000003';
UPDATE tenant_config SET tenant_name = 'Qantas'             WHERE tenant_id = '40000000-0000-0000-0000-000000000001';
UPDATE tenant_config SET tenant_name = 'Virgin Australia'   WHERE tenant_id = '40000000-0000-0000-0000-000000000002';
UPDATE tenant_config SET tenant_name = 'Rex (Regional Express)' WHERE tenant_id = '40000000-0000-0000-0000-000000000003';
