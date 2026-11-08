"""Run worker cleanup without importing config.json, COM, network, or the main loop."""
import ast
import datetime
import pathlib
import sys
import unittest
import urllib.error
import io


class CleanupTest(unittest.TestCase):
    def test_retention_and_no_delete_on_read_failure(self):
        source = pathlib.Path(__file__).parents[1] / 'tools/pdf_worker/worker.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        cleanup = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'cleanup')
        calls = []

        def http(method, path, body=None, headers=None):
            calls.append((method, path, body))
            return [{'id': 'expired-job'}] if method == 'GET' else None

        scope = {'http': http, 'urllib': urllib, 'datetime': datetime, 'log': lambda *args: None}
        exec(compile(ast.Module(body=[cleanup], type_ignores=[]), '<cleanup>', 'exec'), scope)
        scope['cleanup']()
        self.assertIn('and(retain_until.is.null,created_at.lt.', calls[0][1])
        self.assertIn('retain_until.lte.', calls[0][1])
        self.assertIn('or(done_at.is.null,done_at.lt.', calls[0][1])
        self.assertIn('status.not.in.(pending,working)', calls[0][1])
        self.assertEqual(calls[1][2]['prefixes'], ['expired-job.hml', 'expired-job.pdf', 'expired-job.m.pdf'])
        calls.clear()

        def fail(method, *args, **kwargs):
            calls.append(method)
            raise RuntimeError('offline')

        scope['http'] = fail
        scope['cleanup']()
        self.assertEqual(calls, ['GET'])

    def test_old_schema_falls_back_only_for_missing_retention_column(self):
        tree = ast.parse((pathlib.Path(__file__).parents[1] / 'tools/pdf_worker/worker.py').read_text(encoding='utf-8'))
        cleanup = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'cleanup')
        for detail, expected in [(b'{"code":"42703","message":"column retain_until does not exist"}', True),
                                 (b'{"code":"PGRST204","message":"retain_until missing"}', True),
                                 (b'{"code":"42703","message":"other column missing"}', False)]:
            calls = []
            def http(method, path, body=None, headers=None):
                calls.append((method, path, body))
                if len(calls) == 1:
                    raise urllib.error.HTTPError('offline.invalid', 400, 'missing', {}, io.BytesIO(detail))
                return [{'id': 'legacy-job'}] if method == 'GET' else None
            scope = {'http': http, 'urllib': urllib, 'datetime': datetime, 'log': lambda *a: None}
            exec(compile(ast.Module(body=[cleanup], type_ignores=[]), '<cleanup>', 'exec'), scope)
            self.assertEqual(scope['cleanup'](), expected)
            if expected:
                self.assertIn('created_at=lt.', calls[1][1])
                self.assertNotIn('retain_until', calls[1][1])
                self.assertIn('or=(done_at.is.null,done_at.lt.', calls[1][1])
                self.assertIn('status=not.in.(pending,working)', calls[1][1])
                self.assertEqual(calls[2][2]['prefixes'], ['legacy-job.hml', 'legacy-job.pdf', 'legacy-job.m.pdf'])
            else:
                self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout))
