[CmdletBinding()]
param(
  [switch]$KeepWorkspace
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$supabaseRoot = Join-Path $repoRoot 'supabase'
$migrationRoot = Join-Path $supabaseRoot 'migrations'

# These files are preserved in the repository as historical evidence, but their
# version prefixes collide. The recovered 20260808041238-20260808041253
# migrations carry the corresponding remote reconciliation in canonical order.
$excludedDuplicateFiles = @(
  '20260806000000_client_discovery_media_and_geo.sql',
  '20260807000000_client_favorites.sql',
  '20260811000000_access_control_audit_hardening.sql',
  '20260811000000_appointment_price_charged_snapshot.sql'
)

$expectedDuplicateHashes = @{
  '20260806000000_android_business_operational_cycle.sql' = '6B7AB1E37F0A69B318AFA3F17F8A0AD4C46D21D5A4DB5F515AB67EBA8A97F5DF'
  '20260806000000_client_discovery_media_and_geo.sql' = 'F9BF2D750BC0C794396E89AEF724533184DC64E73BA7C8EE7394AA8918A91637'
  '20260807000000_client_favorites.sql' = '649D67FCBEF92AB9F614E48ACCEF39ADD5BC7A47E3D4171D147548F444210CEE'
  '20260807000000_establishment_client_enrichment.sql' = '5365D76E25AE4A0145276716C8B237EEBCC9850D9A30D0FBF00BAABC543754A6'
  '20260811000000_access_control_audit_hardening.sql' = '9AB0460D06651FC148040FD121ABA3E95CE4071B466D8780BAD98D14A0950C3B'
  '20260811000000_appointment_price_charged_snapshot.sql' = '8BB2843CF5D93DBB9A66707B7F9FA77EF1104486FDC05E2FA78816D2495C860A'
}

$requiredRecoveredFiles = @(
  '20260101000000_base_schema.sql',
  '20260808041238_client_discovery_media_and_geo_reconciled.sql',
  '20260808041243_client_favorites_reconciled.sql',
  '20260808041248_access_control_audit_hardening_reconciled.sql',
  '20260808041253_appointment_price_charged_snapshot_reconciled.sql',
  '20260819000000_reconcile_android_cycle_schema_order.sql',
  '20260819001000_harden_mobile_public_surface.sql'
)

foreach ($entry in $expectedDuplicateHashes.GetEnumerator()) {
  $path = Join-Path $migrationRoot $entry.Key
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Historical migration is missing: $($entry.Key)"
  }

  # Git may materialize CRLF on Windows and LF in CI. Normalize line endings
  # before hashing so the historical-content guard is platform-independent.
  $content = [IO.File]::ReadAllText($path)
  $normalizedContent = $content.Replace("`r`n", "`n").Replace("`r", "`n")
  $normalizedBytes = [Text.Encoding]::UTF8.GetBytes($normalizedContent)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $actualHash = ([BitConverter]::ToString(
      $sha256.ComputeHash($normalizedBytes)
    )).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
  if ($actualHash -cne $entry.Value) {
    throw "Historical migration changed: $($entry.Key). Expected $($entry.Value), got $actualHash. Reconcile deliberately before resetting."
  }
}

foreach ($file in $requiredRecoveredFiles) {
  $path = Join-Path $migrationRoot $file
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Recovered remote migration is missing: $file"
  }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workspacePath = [IO.Path]::GetFullPath(
  (Join-Path $tempBase ("cutsync-reconciled-reset-{0}" -f [guid]::NewGuid().ToString('N')))
)
$workspaceLeaf = Split-Path -Leaf $workspacePath

if (
  -not $workspacePath.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
  -not $workspaceLeaf.StartsWith('cutsync-reconciled-reset-', [StringComparison]::Ordinal)
) {
  throw "Refusing to use an unsafe temporary path: $workspacePath"
}

try {
  $tempSupabase = Join-Path $workspacePath 'supabase'
  $tempMigrations = Join-Path $tempSupabase 'migrations'
  New-Item -ItemType Directory -Path $tempMigrations -Force | Out-Null

  Copy-Item -LiteralPath (Join-Path $supabaseRoot 'config.toml') -Destination $tempSupabase

  # config.toml references local Edge Function configuration. Keep the
  # disposable project self-contained without changing the historical files.
  $functionsRoot = Join-Path $supabaseRoot 'functions'
  if (Test-Path -LiteralPath $functionsRoot -PathType Container) {
    Copy-Item -LiteralPath $functionsRoot -Destination $tempSupabase -Recurse
  }

  Get-ChildItem -LiteralPath $migrationRoot -Filter '*.sql' -File |
    Where-Object { $excludedDuplicateFiles -notcontains $_.Name } |
    Copy-Item -Destination $tempMigrations

  $duplicateVersions = Get-ChildItem -LiteralPath $tempMigrations -Filter '*.sql' -File |
    Group-Object { $_.Name.Substring(0, 14) } |
    Where-Object Count -gt 1

  if ($duplicateVersions) {
    $versions = ($duplicateVersions.Name | Sort-Object) -join ', '
    throw "Reconciled workspace still contains duplicate migration versions: $versions"
  }

  Write-Host "Resetting the local disposable database with the reconciled migration sequence."
  Write-Host "Historical files remain unchanged in: $migrationRoot"

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & npx supabase status --workdir $workspacePath 1>$null 2>$null
  $statusExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($statusExitCode -ne 0) {
    Write-Host 'Starting the reconciled local Supabase stack.'
    & npx supabase start --workdir $workspacePath 1>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase reconciled start failed with exit code $LASTEXITCODE."
    }
  }

  & npx supabase db reset --local --no-seed --workdir $workspacePath --yes
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase reconciled reset failed with exit code $LASTEXITCODE."
  }

  Write-Host 'Reconciled local reset completed successfully.'
}
finally {
  if ($KeepWorkspace) {
    Write-Host "Reconciled workspace retained at: $workspacePath"
  }
  elseif (Test-Path -LiteralPath $workspacePath) {
    $resolvedCleanupPath = [IO.Path]::GetFullPath($workspacePath)
    if (
      $resolvedCleanupPath.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedCleanupPath).StartsWith('cutsync-reconciled-reset-', [StringComparison]::Ordinal)
    ) {
      Remove-Item -LiteralPath $resolvedCleanupPath -Recurse -Force
    }
    else {
      Write-Warning "Temporary workspace was not removed because its path failed the safety check: $resolvedCleanupPath"
    }
  }
}
