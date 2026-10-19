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


class ServerSecurityTest(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

    def test_never_downloads_urls(self):
        # TONE3000 models are downloaded by the browser with the user's login: the server
        # refuses any URL (no SSRF surface) and has no HTTP client at all
        for url in ['https://www.tone3000.com/api/v1/models/1/download', 'https://169.254.169.254/latest/meta-data',
                    'file:///etc/passwd', 'http://127.0.0.1:3000/api/health']:
            res = self.client.post('/api/convert-nam', json={'url': url, 'name': 'x'})
            self.assertEqual(res.status_code, 400, url)
        self.assertFalse(hasattr(server, 'requests'))

    def test_keeps_no_model_on_the_server(self):
        # TONE3000 API terms: no caching or hosting of catalog content. A CLO upload is converted
        # and answered without leaving anything in the working folder.
        clo_path = os.path.join(BACKEND, '..', 'frontend', 'test', 'fixtures', 'test_low.clo')
        with open(clo_path, 'rb') as f:
            clo = f.read()
        before = set(os.listdir(server.CACHE_DIR))
        res = self.client.post('/api/convert-nam', data={'file': (io.BytesIO(clo), 'Plexi.clo')}, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2696)
        self.assertEqual(set(os.listdir(server.CACHE_DIR)), before)
        self.assertNotIn('cache_entries', self.client.get('/api/health').get_json())

    def test_rejects_web_pages(self):
        data = {'file': (io.BytesIO(b'<!doctype html><html></html>'), 'page.nam')}
        res = self.client.post('/api/convert-nam', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

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
