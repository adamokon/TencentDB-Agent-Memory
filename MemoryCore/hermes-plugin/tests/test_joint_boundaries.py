"""Real HTTP checks across transport, provider privacy and recall accounting."""
import contextlib
import http.server
import json
import threading
import unittest
from test_provider_error_privacy import provider

TOKEN = 'synthetic-joint-credential'
PRIVATE = 'synthetic-joint-private-message'

@contextlib.contextmanager
def backend(partial=False):
    requests = []
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            requests.append((self.path, self.headers.get('Authorization'), self.headers.get('x-tdai-service-id'), body))
            success = partial and self.path != '/v3/atomic/search'
            data = {'content': 'synthetic persona'} if self.path == '/v3/core/read' else {'entries': []}
            payload = {'code': 0, 'data': data} if success else {'message': PRIVATE}
            encoded = json.dumps(payload).encode()
            self.send_response(200 if success else 401, PRIVATE)
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:' + str(server.server_port), requests
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=3)

class JointBoundaryTests(unittest.TestCase):
    def instance(self, url):
        instance = provider.MemoryTencentdbProvider()
        instance._gateway_available = True
        instance._initialized = True
        instance._team_id = 'synthetic-team'
        instance._agent_id = 'synthetic-agent'
        instance._user_id = 'synthetic-user'
        instance._client = provider.MemoryTencentdbSdkClient(url, api_key=TOKEN, service_id='synthetic-service', timeout=1)
        return instance

    def assert_selectors(self, requests):
        for path, auth, service, body in requests:
            self.assertEqual(auth, 'Bearer ' + TOKEN)
            self.assertEqual(service, 'synthetic-service')
            for name, value in [('team_id', 'synthetic-team'), ('agent_id', 'synthetic-agent'), ('user_id', 'synthetic-user')]:
                self.assertEqual(body[name], value)

    def test_real_http_failure_opens_breaker_without_private_diagnostics_or_extra_requests(self):
        with backend() as (url, requests):
            instance = self.instance(url)
            with self.assertLogs(provider.logger, level='DEBUG') as captured:
                for attempt in range(1, provider._BREAKER_THRESHOLD + 1):
                    self.assertEqual(instance.prefetch('synthetic query'), '')
                    self.assertEqual(instance._consecutive_failures, attempt)
                self.assertTrue(instance._is_breaker_open())
                self.assertEqual(len(requests), 3 * provider._BREAKER_THRESHOLD)
                count = len(requests)
                self.assertEqual(instance.prefetch('synthetic query'), '')
                instance.sync_turn('synthetic user turn', 'synthetic assistant turn')
                self.assertEqual(len(requests), count)
                self.assertEqual(instance._active_syncs, [])
            text = '\n'.join(captured.output)
            self.assertNotIn(PRIVATE, text)
            self.assertNotIn(TOKEN, text)
            self.assertIn('HTTPError', text)
            self.assert_selectors(requests)

    def test_real_http_partial_success_keeps_context_and_safe_errors(self):
        with backend(partial=True) as (url, requests):
            instance = self.instance(url)
            instance._consecutive_failures = 2
            with self.assertLogs(provider.logger, level='DEBUG') as captured:
                recalled = instance.prefetch('synthetic query')
            self.assertIn('synthetic persona', recalled)
            self.assertEqual(instance._consecutive_failures, 0)
            self.assertEqual(len(requests), 3)
            text = '\n'.join(captured.output)
            self.assertNotIn(PRIVATE, text)
            self.assertNotIn(TOKEN, text)
            self.assert_selectors(requests)

if __name__ == '__main__':
    unittest.main()
