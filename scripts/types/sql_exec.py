# -*- coding: utf-8 -*-
"""Supabase 관리 API 로 SQL 실행 (2026-10-19, 대표가 .env.local 에 SUPABASE_ACCESS_TOKEN — Database 권한만 준 토큰)

  python scripts/types/sql_exec.py <sql 파일>      |   python scripts/types/sql_exec.py -e "select 1"
"""
import os, re, sys, json, requests
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = {}
for l in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', l)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
REF = re.match(r'https://([a-z0-9]+)\.supabase\.co', env['NEXT_PUBLIC_SUPABASE_URL']).group(1)


def run(sql):
    r = requests.post(f'https://api.supabase.com/v1/projects/{REF}/database/query', timeout=120,
                      headers={'Authorization': 'Bearer ' + env['SUPABASE_ACCESS_TOKEN'], 'Content-Type': 'application/json'}, json={'query': sql})
    if r.status_code >= 300: raise RuntimeError(f'{r.status_code} {r.text[:500]}')
    return r.json()


if __name__ == '__main__':
    sql = sys.argv[2] if sys.argv[1] == '-e' else open(sys.argv[1], encoding='utf-8').read()
    print(json.dumps(run(sql), ensure_ascii=False)[:2000])
