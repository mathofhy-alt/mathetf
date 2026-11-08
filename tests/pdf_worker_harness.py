"""Execute real worker functions without config.json, COM, or external services."""
import ast
import json
import os
import pathlib
import sys
import tempfile
import time
import traceback
import urllib.parse


def load_worker(http, work, name='test-worker'):
    source = pathlib.Path(os.environ.get('PDF_WORKER_SOURCE',
        pathlib.Path(__file__).parents[1] / 'tools/pdf_worker/worker.py'))
    tree = ast.parse(source.read_text(encoding='utf-8'))
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('patch', 'one')]

    def convert(src, dst):
        pathlib.Path(dst).write_bytes(b'%PDF-test')
        return 2

    scope = dict(http=http, WORK=work, NAME=name, os=os, time=time, traceback=traceback,
                 urllib=urllib, convert=convert, stamp=lambda p: None,
                 reset_hwp=lambda: None, log=lambda *args: None)
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
    return scope


if __name__ == '__main__':
    # One request at a time over stdio; the Node test executes DB requests in PGlite.
    # No listening port, credentials, config file, or network connection is used.
    def http(method, path, body=None, headers=None, **kwargs):
        print(json.dumps(dict(method=method, path=path,
                             body=None if isinstance(body, bytes) else body, headers=headers)), flush=True)
        result = json.loads(sys.stdin.readline())
        if 'error' in result:
            raise RuntimeError(result['error'])
        return b'<HWPML/>' if kwargs.get('raw') else result['data']

    with tempfile.TemporaryDirectory() as work:
        scope = load_worker(http, work)
        print(json.dumps({'result': scope['one']()}), flush=True)
