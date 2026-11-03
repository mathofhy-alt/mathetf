# 매일 서치콘솔 색인 요청 10개 (작업 스케줄러 mathetf_request_index)
$ErrorActionPreference = 'Continue'
$log = 'C:\dev\mathetf\scripts\gsc\request_index.log'
try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json/version -TimeoutSec 3 | Out-Null }
catch {
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList '--remote-debugging-port=9222','--user-data-dir=C:\selfmade\chrome_auto_profile','about:blank'
    Start-Sleep 15
}
$env:PYTHONUTF8 = '1'
"=== $(Get-Date -Format s)" | Out-File -Append -Encoding utf8 $log
& 'C:\dev\mathetf\.venv\Scripts\python.exe' -X utf8 'C:\dev\mathetf\scripts\gsc\request_index.py' 10 2>&1 | Out-File -Append -Encoding utf8 $log
# 요청했던 주소들 색인 여부 확인 → 보고서 열기 (11/3 대표 "매일 확인해서 보고")
& 'C:\dev\mathetf\.venv\Scripts\python.exe' -X utf8 'C:\dev\mathetf\scripts\gsc\check_index.py' 2>&1 | Out-File -Append -Encoding utf8 $log
$rep = 'C:\dev\mathetf\scripts\gsc\reports\latest.html'
if (Test-Path $rep) { Start-Process $rep }
