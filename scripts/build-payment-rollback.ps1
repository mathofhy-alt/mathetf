param(
    [Parameter(Mandatory=$true)][string]$BaselineDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$baseline = (Resolve-Path -LiteralPath $BaselineDirectory).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Use a new output directory; existing files are never overwritten.' }
foreach ($parent in @($source, $baseline)) {
    if ($output.StartsWith($parent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $parent.StartsWith($output.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or $output -eq $parent) {
        throw 'The output must be separate from both source trees.'
    }
}

# Keep this explicit: the baseline business code is restored, while the payment
# lifecycle and its entitlement/ledger consumers remain compatible with the DB.
$overlays = @(
    'src/app/admin/AdminDashboardClient.tsx',
    'src/app/admin/payment-reviews/page.tsx',
    'src/app/api/admin/payment-reviews/route.ts',
    'src/app/api/cron/payment-reconcile/route.ts',
    'src/app/api/payments/webhook/route.ts',
    'src/app/api/payments/orders/route.ts',
    'src/app/api/payments/complete/route.ts',
    'src/app/api/pdf/[id]/route.ts',
    'src/app/api/predict/hwp/route.ts',
    'src/app/api/print/bundles/route.ts',
    'src/app/cart/page.tsx',
    'src/app/mypage/actions.ts',
    'src/app/mypage/page.tsx',
    'src/app/payments/return/page.tsx',
    'src/app/redesign.css',
    'src/components/MyDbRequests.tsx',
    'src/components/payments/PendingOrderNotice.tsx',
    'src/components/question-bank/PassModal.tsx',
    'src/lib/approveSubmission.ts',
    'src/lib/payments/client.ts',
    'src/lib/payments/complete.ts',
    'src/lib/payments/order.ts',
    'src/lib/payments/reconcile.ts',
    'src/lib/schemaCapabilities.ts',
    'src/lib/planAccess.ts',
    'src/lib/planBundles.ts',
    'src/lib/qbPass.ts',
    'vercel.json'
)
foreach ($relative in $overlays) {
    if (!(Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw "Missing overlay: $relative" }
}
$tracked = @(git -C $baseline -c core.quotepath=false ls-files)
if ($LASTEXITCODE -ne 0 -or !$tracked.Count) { throw 'Could not enumerate the release baseline.' }
$revision = git -C $baseline rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not identify the release baseline.' }
New-Item -ItemType Directory -Path $output | Out-Null
$copied = 0
foreach ($relative in $tracked) {
    # Never package environment files, credentials, repository metadata or build caches.
    if ($relative -match '(^|/)(\.env[^/]*|\.git|\.aws|\.codex|\.agents|node_modules|\.next[^/]*)(/|$)') { continue }
    $origin = Join-Path $baseline $relative
    if (!(Test-Path -LiteralPath $origin -PathType Leaf)) { continue }
    $destination = [IO.Path]::GetFullPath((Join-Path $output $relative))
    if (!$destination.StartsWith($output.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid baseline path.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::Copy($origin, $destination)
    $copied++
}
$entries = foreach ($relative in $overlays) {
    $origin = Join-Path $source $relative
    $destination = Join-Path $output $relative
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::Copy($origin, $destination, $true)
    @{ path=$relative; sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = @{
    format=1; baselineRevision=$revision; baselineFiles=$copied; overlays=@($entries)
    protectedRoutes=@('/api/cron/payment-reconcile','/api/payments/webhook','/api/admin/payment-reviews','/admin/payment-reviews')
    rollbackSql='supabase/rollback/payment_cutover.sql'
}
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $output 'PAYMENT_ROLLBACK_MANIFEST.json'), ($manifest | ConvertTo-Json -Depth 5), $utf8)
[IO.Directory]::CreateDirectory((Join-Path $output 'supabase/rollback')) | Out-Null
[IO.File]::Copy((Join-Path $source 'supabase/rollback/payment_cutover.sql'), (Join-Path $output 'supabase/rollback/payment_cutover.sql'), $true)
Write-Output "Created compatible rollback source: $output ($copied baseline files, $($overlays.Count) payment overlays). No environment files, installation or deployment."
