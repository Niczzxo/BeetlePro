/**
 * Local test double for the SSLCommerz session endpoint.
 *
 * This is NOT the gateway and is never used by the application
 * unless SSLCOMMERZ_API_BASE_URL points at it. It exists so the
 * adapter's real request/response mapping can be exercised in
 * local verification without merchant credentials: the API posts
 * the real session form here and receives the documented session
 * response shape back.
 *
 * Run: node scripts/demo-gateway-stub.mjs (port 4555)
 */
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    if (req.url === '/gwprocess/v4/api.php' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      console.log(
        `[stub] session request: store_id=${form.get('store_id')} tran_id=${form.get('tran_id')} total_amount=${form.get('total_amount')}`,
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'SUCCESS',
          sessionkey: 'DEMO-SESSION-KEY',
          GatewayPageURL:
            'https://demo-gateway.local/gwprocess/v4/gateway.php?Q=DEMO',
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'FAILED', failedreason: 'unknown path' }));
  });
});

server.listen(4555, '127.0.0.1', () => {
  console.log('[stub] SSLCommerz test double listening on 127.0.0.1:4555');
});
