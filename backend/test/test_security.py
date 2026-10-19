"""Limits of the public compiler server (backend/server.py). Run: npm run test:backend"""
import importlib.util
import io
import os
import sys
import unittest
from unittest import mock

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('MAX_MODEL_MB', '1')
spec = importlib.util.spec_from_file_location('sonicake_server', os.path.join(BACKEND, 'server.py'))
server = importlib.util.module_from_spec(spec)
sys.modules['sonicake_server'] = server
spec.loader.exec_module(server)


class FakeResponse:
    def __init__(self, status=200, body=b'', headers=None, redirect=False):
        self.status_code = status
        self.ok = 200 <= status < 300
        self.is_redirect = redirect
        self.headers = headers or {}
        self._body = body

    def iter_content(self, size):
        for i in range(0, len(self._body), size):
            yield self._body[i:i + size]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ServerSecurityTest(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

    def convert_url(self, url):
        return self.client.post('/api/convert-nam', json={'url': url, 'name': 'x'})

    def test_rejects_urls_outside_tone3000(self):
        for url in ['http://api.tone3000.com/m.nam', 'https://evil.example/m.nam',
                    'https://169.254.169.254/latest/meta-data', 'file:///etc/passwd',
                    'https://api.tone3000.com.evil.example/m.nam', 'https://user@127.0.0.1/m.nam']:
            with mock.patch.object(server.requests, 'get') as get:
                res = self.convert_url(url)
                self.assertEqual(res.status_code, 400, url)
                get.assert_not_called()

    def test_does_not_follow_redirects(self):
        with mock.patch.object(server.requests, 'get', return_value=FakeResponse(302, redirect=True)) as get:
            res = self.convert_url('https://api.tone3000.com/storage/v1/object/public/models/a.nam')
        self.assertEqual(res.status_code, 502)
        self.assertFalse(get.call_args.kwargs['allow_redirects'])

    def test_stops_oversized_downloads(self):
        big = b'{' + b'0' * (server.MAX_MODEL_BYTES + 10)
        # Declared size too big
        with mock.patch.object(server.requests, 'get', return_value=FakeResponse(200, b'', {'Content-Length': str(len(big))})):
            self.assertEqual(self.convert_url('https://api.tone3000.com/a.nam').status_code, 413)
        # Size not declared: stopped while streaming
        with mock.patch.object(server.requests, 'get', return_value=FakeResponse(200, big)):
            self.assertEqual(self.convert_url('https://api.tone3000.com/a.nam').status_code, 413)

    def test_rejects_oversized_uploads(self):
        data = {'file': (io.BytesIO(b'0' * (server.MAX_MODEL_BYTES + 100 * 1024)), 'big.nam')}
        res = self.client.post('/api/convert-nam', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 413)

    def test_no_cors_for_foreign_origins(self):
        res = self.client.get('/api/health', headers={'Origin': 'https://evil.example'})
        self.assertNotIn('Access-Control-Allow-Origin', res.headers)
        with mock.patch.object(server, 'CORS_ORIGINS', {'https://ok.example'}):
            res = self.client.get('/api/health', headers={'Origin': 'https://ok.example'})
        self.assertEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://ok.example')

    def test_dev_endpoint_disabled_in_production(self):
        with mock.patch.object(server, 'DEV_ENDPOINTS', False):
            self.assertEqual(self.client.post('/api/active-preset', json={'slot': 1}).status_code, 404)
            self.assertEqual(self.client.get('/api/active-preset').status_code, 404)
        with mock.patch.object(server, 'DEV_ENDPOINTS', True), mock.patch.object(server, 'ACTIVE_PRESET_FILE', os.devnull):
            self.assertEqual(self.client.get('/api/active-preset').status_code, 200)

    def test_health(self):
        res = self.client.get('/api/health')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()['status'], 'ok')


if __name__ == '__main__':
    unittest.main()
