const request = require('supertest');
const app = require('../src/app');

describe('Health Check Flow: Validation -> Route -> Controller -> Service', () => {
  it('GET /health should return 200 with basic health info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /health?detailed=true should trigger DB service query and return database status', async () => {
    const res = await request(app).get('/health?detailed=true');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /health?detailed=invalid should fail validation and return 400', async () => {
    const res = await request(app).get('/health?detailed=invalid');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('Validation failed');
  });
});
