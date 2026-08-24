[CmdletBinding()]
param(
  [switch]$KeepWorkspace
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$supabaseRoot = Join-Path $repoRoot 'supabase'
$migrationRoot = Join-Path $supabaseRoot 'migrations'

# These two historical migrations remain executable at their original versions.
$expectedActiveHistoricalHashes = @{
  '20260806000000_android_business_operational_cycle.sql' = '6B7AB1E37F0A69B318AFA3F17F8A0AD4C46D21D5A4DB5F515AB67EBA8A97F5DF'
  '20260807000000_establishment_client_enrichment.sql' = '5365D76E25AE4A0145276716C8B237EEBCC9850D9A30D0FBF00BAABC543754A6'
}

# These four colliding files are retired from the executable directory. Their
# hashes and source commits remain documented in
# supabase/migration_evidence/duplicate_versions/README.md.
$retiredDuplicateHashes = @{
  '20260806000000_client_discovery_media_and_geo.sql' = 'F9BF2D750BC0C794396E89AEF724533184DC64E73BA7C8EE7394AA8918A91637'
  '20260807000000_client_favorites.sql' = '649D67FCBEF92AB9F614E48ACCEF39ADD5BC7A47E3D4171D147548F444210CEE'
  '20260811000000_access_control_audit_hardening.sql' = '9AB0460D06651FC148040FD121ABA3E95CE4071B466D8780BAD98D14A0950C3B'
  '20260811000000_appointment_price_charged_snapshot.sql' = '8BB2843CF5D93DBB9A66707B7F9FA77EF1104486FDC05E2FA78816D2495C860A'
}

# These files are the executable counterparts of the excluded historical
# collisions and the ordering/security bridges that depend on them. Guard
# their content too: existence alone cannot prove that the disposable replay
# still represents the state recovered from the remote ledgers.
$expectedCanonicalHashes = @{
  '20260808041238_client_discovery_media_and_geo_reconciled.sql' = 'C12F19AEAE50848E156B6E5938396F1612630CDD71C5F18C38CB0A37C9CDDAB2'
  '20260808041243_client_favorites_reconciled.sql' = 'BEF7677244ABB0E63274037890FBA4E8696421E0FE3FBCE6A40E35987A8CF27E'
  '20260808041248_access_control_audit_hardening_reconciled.sql' = '46F736C550574847D5B819262D8AB217C2816ED85CDF6C60E304D917BD042EDF'
  '20260808041253_appointment_price_charged_snapshot_reconciled.sql' = '457DB3D341F265A21164172E5AC2A310FF5E697E7902EB77665FB51D75F398C4'
  '20260819000000_reconcile_android_cycle_schema_order.sql' = 'C52358A9E6DE1182B71C6B08A1E7A8BDD72B2D81847717346633B542A22AE192'
  '20260819001000_harden_mobile_public_surface.sql' = '67E435C2A6334FDE0FD7EF2876C064A84375640A8BC8E7E28B460AB43D04E734'
}

# Versions 13000-21000 already exist in Homolog. They must remain byte-stable;
# corrections are delivered only as a later migration. Version 22000 is the
# local reconciliation hardening that must travel with the recovered chain.
$expectedHomologRecoveredHashes = @{
  '20260824013000_control_access_profiles_and_approvals.sql' = '9C6AB07EE0CBE93D6A523D2DFCC5C6EC0D2B91D7D0ED21B6E288AC8D66B2EEF9'
  '20260824014000_corporate_cases_foundation.sql' = '303C95CE03DF4AD89C1D50368BE9B0009DF9DD38C42BDBE794C095999AD78BE3'
  '20260824015000_corporate_cases_read_models.sql' = '8104BCAEEE3FDEDB9ADE7E76A8B6714CB8555130F37FB75ECD795C47B6CDD67E'
  '20260824016000_corporate_access_case_creation.sql' = 'F999CADAD2A3AF94860CEDA67B1AD1E6846B82FA428FAF7CE8BA7DB9FE8916DA'
  '20260824017000_corporate_case_workflow.sql' = '382C90C042B1FE4A377EBFC86428D4B0670C38A4E773884F8DE18A51A9962D01'
  '20260824018000_corporate_case_approval_decisions.sql' = 'A5FC85152E5DAA3E6DF2CEBE43689A517037292D0D1E198066DF198514D73F80'
  '20260824019000_corporate_case_access_fulfillment.sql' = '9B1A6D8869A09A09F060C31602225999FC05E3008ED7AD1A0D0240456F299CC1'
  '20260824020000_corporate_case_fulfillment_queue.sql' = '7CD147830C0850869FD266D0EB263CC31B415AEB36502B21FDACF937552B9F79'
  '20260824021000_corporate_case_runtime_administration.sql' = '49BE7AA081E8A5F67B46BD49B91906CBC736C4075112574F4C0B0D7FB716FE3A'
}

$expectedReconciliationHashes = @{
  '20260824022000_corporate_case_runtime_hardening.sql' = '81B9B43185EF1C39B1237BF51205B960D21040E2A7F602D1295B6623257B2732'
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

function Get-NormalizedMigrationHash {
  param([Parameter(Mandatory)][string]$Path)

  # Git may materialize CRLF on Windows and LF in CI. Normalize line endings
  # before hashing so the content guard is platform-independent.
  $content = [IO.File]::ReadAllText($Path)
  $normalizedContent = $content.Replace("`r`n", "`n").Replace("`r", "`n")
  $normalizedBytes = [Text.Encoding]::UTF8.GetBytes($normalizedContent)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString(
      $sha256.ComputeHash($normalizedBytes)
    )).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}

function Assert-MigrationHashes {
  param(
    [Parameter(Mandatory)][hashtable]$ExpectedHashes,
    [Parameter(Mandatory)][string]$Kind
  )

  foreach ($entry in $ExpectedHashes.GetEnumerator()) {
    $path = Join-Path $migrationRoot $entry.Key
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "$Kind migration is missing: $($entry.Key)"
    }

    $actualHash = Get-NormalizedMigrationHash -Path $path
    if ($actualHash -cne $entry.Value) {
      throw "$Kind migration changed: $($entry.Key). Expected $($entry.Value), got $actualHash. Reconcile deliberately before resetting."
    }
  }
}

Assert-MigrationHashes -ExpectedHashes $expectedActiveHistoricalHashes -Kind 'Active historical'
Assert-MigrationHashes -ExpectedHashes $expectedCanonicalHashes -Kind 'Canonical reconciled'
Assert-MigrationHashes -ExpectedHashes $expectedHomologRecoveredHashes -Kind 'Homolog recovered'
Assert-MigrationHashes -ExpectedHashes $expectedReconciliationHashes -Kind 'Reconciliation hardening'

foreach ($file in $retiredDuplicateHashes.Keys) {
  $path = Join-Path $migrationRoot $file
  if (Test-Path -LiteralPath $path) {
    throw "Retired duplicate migration returned to the executable directory: $file"
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
    Copy-Item -Destination $tempMigrations

  $duplicateVersions = Get-ChildItem -LiteralPath $tempMigrations -Filter '*.sql' -File |
    Group-Object { $_.Name.Substring(0, 14) } |
    Where-Object Count -gt 1

  if ($duplicateVersions) {
    $versions = ($duplicateVersions.Name | Sort-Object) -join ', '
    throw "Reconciled workspace still contains duplicate migration versions: $versions"
  }

  Write-Host "Resetting the local disposable database with the reconciled migration sequence."
  Write-Host "Retired duplicate evidence is documented under: $supabaseRoot\migration_evidence"

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
