import copy
import pathlib
import sys
import tempfile
import unittest
import urllib.parse

from pdf_worker_harness import load_worker


class WorkerStateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # Only pre-plan schema fields: no retain_until/hwp_ready/pdf_delivered.
        self.row = dict(id='job-a', stamp=False, status='pending', worker=None, started_at=None)
        self.calls, self.files, self.logs = [], set(), []
        self.before_patch = lambda body: None
        self.on_upload = lambda: None
        self.fail_delete = False
        self.scope = load_worker(self.http, self.tmp.name)
        self.scope['log'] = lambda *args: self.logs.append(args)

    def http(self, method, path, body=None, headers=None, **kwargs):
        self.calls.append((method, path, body, headers))
        if path.startswith('/rest/v1/pdf_jobs'):
            if method == 'GET':
                self.assertIn('select=id,stamp', path)
                return [copy.deepcopy(self.row)] if self.row['status'] == 'pending' else []
            self.assertEqual(method, 'PATCH')
            self.assertEqual(headers['Prefer'], 'return=representation')
            self.before_patch(body)
            filters = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
            if not all(str(self.row[k]) == values[0].removeprefix('eq.') for k, values in filters.items()):
                return []
            self.row.update(body)
            if self.row['started_at'] == 'now':
                self.row['started_at'] = '2026-11-08T12:00:00.123456+00:00'
            return [copy.deepcopy(self.row)]
        if method == 'GET':
            return b'<HWPML/>'
        if method == 'POST':
            self.files.add('job-a.pdf')
            self.on_upload()
            return {}
        self.assertEqual(method, 'DELETE')
        self.assertEqual(body, {'prefixes': ['job-a.pdf']})
        if self.fail_delete:
            raise RuntimeError('storage unavailable')
        self.files.difference_update(body['prefixes'])
        return {}

    def run_one(self):
        self.assertTrue(self.scope['one']())
        self.assertEqual(list(pathlib.Path(self.tmp.name).iterdir()), [])
        for method, path, body, _ in self.calls:
            if method == 'PATCH' and body['status'] in ('done', 'error'):
                filters = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
                self.assertEqual(filters['status'], ['eq.working'])
                self.assertEqual(filters['worker'], ['eq.test-worker'])
                self.assertEqual(filters['started_at'], ['eq.2026-11-08T12:00:00.123456+00:00'])

    def test_legacy_schema_success_and_no_work_or_lost_claim(self):
        self.run_one()
        self.assertEqual(self.row['status'], 'done')
        self.assertEqual(self.row['pages'], 2)
        self.assertEqual(self.files, {'job-a.pdf'})
        self.assertTrue(any(line[0] == '완료' for line in self.logs))
        self.assertFalse(self.scope['one']())
        self.row['status'] = 'pending'
        self.before_patch = lambda body: self.row.update(status='working', worker='other')
        self.calls.clear()
        self.run_one()
        self.assertFalse(any(method == 'POST' for method, *_ in self.calls))

    def test_refund_then_retry_never_revives_old_usage(self):
        # Failure happens after upload, immediately before the atomic completion PATCH.
        uses = {'job-a': self.row}
        purchases = 1

        def refund_and_retry(body):
            if body['status'] == 'done':
                self.row['status'] = 'error'
                uses['job-b'] = {'status': 'done'}  # Retry spends the refunded ticket.

        self.before_patch = refund_and_retry
        self.run_one()
        self.assertEqual(self.row['status'], 'error')
        self.assertEqual(self.files, set())
        used = sum(job['status'] != 'error' for job in uses.values())
        self.assertEqual(purchases - used, 0)
        self.assertEqual(purchases + 1 - used, 1)  # Another purchase must remain usable.
        self.assertFalse(any(line[0] == '완료' for line in self.logs))

    def test_lost_worker_or_new_claim_on_same_worker_cannot_complete(self):
        for fields in [dict(worker='other'), dict(started_at='2026-11-08T12:01:00+00:00')]:
            with self.subTest(fields=fields):
                self.row.update(status='pending', worker=None, started_at=None)
                self.before_patch = lambda body: self.row.update(fields) if body['status'] == 'done' else None
                self.run_one()
                self.assertEqual(self.row['status'], 'working')
                self.assertEqual(self.files, set())

    def test_owned_conversion_failure_sets_error(self):
        resets = []
        def fail(*args):
            raise RuntimeError('conversion failed')
        self.scope.update(convert=fail, reset_hwp=lambda: resets.append(True))
        self.run_one()
        self.assertEqual(self.row['status'], 'error')
        self.assertIn('conversion failed', self.row['error'])
        self.assertEqual(len(resets), 2)

    def test_late_failure_cannot_overwrite_refund_done_or_another_claim(self):
        for fields in [dict(status='error'), dict(status='done'), dict(worker='other'),
                       dict(started_at='2026-11-08T12:01:00+00:00')]:
            with self.subTest(fields=fields):
                self.row.update(status='pending', worker=None, started_at=None)
                def fail(*args):
                    self.row.update(fields)
                    raise RuntimeError('conversion failed')
                self.scope['convert'] = fail
                self.run_one()
                for key, value in fields.items():
                    self.assertEqual(self.row[key], value)
                self.assertNotIn('error', self.row)

    def test_pdf_delete_failure_keeps_refund_and_cleans_local_files(self):
        self.before_patch = lambda body: self.row.update(status='error') if body['status'] == 'done' else None
        self.fail_delete = True
        self.run_one()
        self.assertEqual(self.row['status'], 'error')
        self.assertFalse(any(line[0] == '완료' for line in self.logs))


if __name__ == '__main__':
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout))
