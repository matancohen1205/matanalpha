'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
process.env.RATE_LIMIT_HEAVY = '25';
const app = require('../server');

function post(server, p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request({ port: server.address().port, method: 'POST', path: p, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.write(data); r.end();
  });
}

let server;
test.before(() => { server = app.listen(0); });
test.after(() => server.close());

test('הגבלת קצב על פעולות כבדות', async () => {
  let limited = 0;
  for (let i = 0; i < 120 && !limited; i++) {
    const st = await post(server, '/api/analyze-text', { text: 'שכר נטו 1,000.00' });
    if (st === 429) limited = i + 1;
  }
  assert.ok(limited > 0, 'rate limit never triggered');
});

