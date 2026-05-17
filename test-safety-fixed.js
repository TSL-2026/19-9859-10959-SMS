require('dotenv').config();
const request = require('supertest');
const express = require('express');
const pool = require('./src/db/pool');

// Mock email before loading routes
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' })
  })
}));

const app = express();
app.use(express.json());
app.use('/api', require('./src/api/routes'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

describe('Safety System Tests', () => {
  let server;
  let authToken;

  beforeAll(async () => {
    server = app.listen(0);
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign({ tenant_id: 'test-tenant-1' }, process.env.JWT_SECRET || 'test-secret');
  });

  afterAll(async () => {
    await pool.end();
    server.close();
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /api/alerts/rules creates HIGH rule', async () => {
    const res = await request(app)
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        rule_name: 'HIGH test',
        severity_threshold: 3,
        probability_threshold: 3,
        alert_level: 'HIGH',
        channels: ['email']
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.rule).toBeDefined();
  });

  test('POST /api/signals inserts signal', async () => {
    const res = await request(app)
      .post('/api/signals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        report_type: 'MOR',
        severity: 4,
        probability: 3,
        description: 'Test signal'
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.signal).toBeDefined();
  });

  test('GET /api/alerts/active returns alerts', async () => {
    const res = await request(app)
      .get('/api/alerts/active')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  test('GET /api/signals lists signals', async () => {
    const res = await request(app)
      .get('/api/signals')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
  });
});

console.log('Tests ready. Run with: npm test');
