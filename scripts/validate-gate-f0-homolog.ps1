[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$OwnerEmail,

  [Parameter(Mandatory = $true)]
  [string]$OwnerPassword,

  [Parameter(Mandatory = $true)]
  [string]$ProfessionalEmail,

  [Parameter(Mandatory = $true)]
  [string]$ProfessionalPassword
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectUrl = "https://$ProjectRef.supabase.co"
$serverUserAgent = 'cutsync-f0-server-validation/1.0'
$technicalUsers = [System.Collections.Generic.List[string]]::new()
$createdAppointmentIds = [System.Collections.Generic.List[string]]::new()
$testEstablishmentId = $null
$cleanupErrors = [System.Collections.Generic.List[string]]::new()
$technicalSlug = $null

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [object]$Body,
    [switch]$AllowFailure
  )

  $request = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $request.ContentType = 'application/json'
    $request.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }

  $response = Invoke-WebRequest @request
  $parsed = $null
  if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
    try { $parsed = $response.Content | ConvertFrom-Json -Depth 30 } catch { $parsed = $response.Content }
  }

  if (-not $AllowFailure -and $response.StatusCode -ge 400) {
    $safeMessage = if ($parsed -is [string]) { $parsed } else { $parsed.message }
    throw "HTTP $($response.StatusCode) em $Method $Uri`: $safeMessage"
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Data = $parsed
  }
}

function New-AuthenticatedHeaders {
  param([string]$ApiKey, [string]$AccessToken)
  return @{
    apikey = $ApiKey
    Authorization = "Bearer $AccessToken"
    Prefer = 'return=representation'
  }
}

function New-ServiceHeaders {
  param([string]$ApiKey)
  return @{
    apikey = $ApiKey
    'User-Agent' = $serverUserAgent
    Prefer = 'return=representation'
  }
}

function Invoke-Login {
  param([string]$ApiKey, [string]$Email, [string]$Password)
  $response = Invoke-JsonRequest -Method POST -Uri "$projectUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $ApiKey
    'User-Agent' = $serverUserAgent
  } -Body @{ email = $Email; password = $Password }
  if ([string]::IsNullOrWhiteSpace($response.Data.access_token)) {
    throw 'Login não retornou access_token.'
  }
  return $response.Data
}

function New-TechnicalUser {
  param([hashtable]$Headers, [string]$Kind)
  $nonce = [guid]::NewGuid().ToString('N')
  $password = "F0-$([guid]::NewGuid().ToString('N'))-aA9!"
  $response = Invoke-JsonRequest -Method POST -Uri "$projectUrl/auth/v1/admin/users" -Headers $Headers -Body @{
    email = "cutsync-f0-$Kind-$nonce@example.invalid"
    password = $password
    email_confirm = $true
    user_metadata = @{ name = "F0 technical $Kind" }
  }
  $technicalUsers.Add([string]$response.Data.id)
  return [pscustomobject]@{
    Id = [string]$response.Data.id
    Email = [string]$response.Data.email
    Password = $password
  }
}

function Invoke-Rpc {
  param([string]$FunctionName, [hashtable]$Headers, [hashtable]$Body, [switch]$AllowFailure)
  return Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/rpc/$FunctionName" -Headers $Headers -Body $Body -AllowFailure:$AllowFailure
}

function Invoke-LinkedSql {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $normalizedSql = ($Sql -replace '\s+', ' ').Trim()
  $output = (& npx --yes supabase@latest db query --linked $normalizedSql 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase db query falhou: $output"
  }
}

try {
  $keyJson = (& npx --yes supabase@latest projects api-keys --project-ref $ProjectRef --reveal --output json 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível obter as chaves do projeto pelo Supabase CLI.' }
  $keys = $keyJson | ConvertFrom-Json -Depth 10
  $serviceKey = @($keys | Where-Object { $_.api_key -like 'sb_secret_*' } | Select-Object -First 1).api_key
  $publicKey = @($keys | Where-Object { $_.api_key -like 'sb_publishable_*' } | Select-Object -First 1).api_key
  if ([string]::IsNullOrWhiteSpace($publicKey)) {
    $publicKey = @($keys | Where-Object { $_.name -match 'anon|publishable' } | Select-Object -First 1).api_key
  }
  if ([string]::IsNullOrWhiteSpace($serviceKey) -or [string]::IsNullOrWhiteSpace($publicKey)) {
    throw 'Chave secret ou publishable/anon não encontrada.'
  }

  $serviceHeaders = New-ServiceHeaders -ApiKey $serviceKey
  $ownerLogin = Invoke-Login -ApiKey $publicKey -Email $OwnerEmail -Password $OwnerPassword
  $professionalLogin = Invoke-Login -ApiKey $publicKey -Email $ProfessionalEmail -Password $ProfessionalPassword
  $ownerHeaders = New-AuthenticatedHeaders -ApiKey $publicKey -AccessToken $ownerLogin.access_token
  $professionalHeaders = New-AuthenticatedHeaders -ApiKey $publicKey -AccessToken $professionalLogin.access_token

  $client = New-TechnicalUser -Headers $serviceHeaders -Kind 'client'
  $professionalA = New-TechnicalUser -Headers $serviceHeaders -Kind 'professional-a'
  $professionalB = New-TechnicalUser -Headers $serviceHeaders -Kind 'professional-b'
  $clientLogin = Invoke-Login -ApiKey $publicKey -Email $client.Email -Password $client.Password
  $clientHeaders = New-AuthenticatedHeaders -ApiKey $publicKey -AccessToken $clientLogin.access_token

  $schedule = @(
    @{ day = 0; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 1; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 2; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 3; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 4; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 5; isOpen = $true; open = '09:00'; close = '18:00' },
    @{ day = 6; isOpen = $true; open = '09:00'; close = '18:00' }
  )
  $scheduleJson = $schedule | ConvertTo-Json -Compress
  $technicalSlug = "f0-technical-$([guid]::NewGuid().ToString('N'))"
  $establishment = Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/establishments" -Headers $serviceHeaders -Body @{
    name = 'F0 technical validation'
    slug = $technicalSlug
    timezone = 'America/Sao_Paulo'
    opening_hours = $scheduleJson
    account_status = 'active'
    instant_booking_enabled = $true
  }
  $testEstablishmentId = [string]@($establishment.Data)[0].id
  if ([string]::IsNullOrWhiteSpace($testEstablishmentId)) { throw 'Unidade técnica não foi criada.' }

  foreach ($membership in @(
    @{ profile_id = [string]$ownerLogin.user.id; role = 'admin' },
    @{ profile_id = [string]$professionalLogin.user.id; role = 'professional' },
    @{ profile_id = $professionalA.Id; role = 'professional' },
    @{ profile_id = $professionalB.Id; role = 'professional' }
  )) {
    Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/memberships" -Headers $serviceHeaders -Body @{
      profile_id = $membership.profile_id
      establishment_id = $testEstablishmentId
      role = $membership.role
      status = 'active'
    } | Out-Null
  }

  foreach ($technicalProfessionalId in @($professionalA.Id, $professionalB.Id)) {
    Invoke-JsonRequest -Method PATCH -Uri "$projectUrl/rest/v1/profiles?id=eq.$technicalProfessionalId" -Headers $serviceHeaders -Body @{
      role = 'professional'
      establishment_id = $testEstablishmentId
      work_hours = $scheduleJson
    } | Out-Null
  }

  $service = Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/services" -Headers $serviceHeaders -Body @{
    establishment_id = $testEstablishmentId
    name = 'F0 technical service'
    price = 10.00
    duration_minutes = 30
    is_active = $true
  }
  $serviceId = [string]@($service.Data)[0].id

  $selectedSlots = @()
  foreach ($offset in 1..31) {
    $targetDate = (Get-Date).Date.AddDays($offset).ToString('yyyy-MM-dd')
    $slotsA = (Invoke-Rpc -FunctionName 'compute_available_slots' -Headers $serviceHeaders -Body @{
      target_establishment_id = $testEstablishmentId
      target_professional_id = $professionalA.Id
      target_service_id = $serviceId
      target_local_date = $targetDate
      ignored_appointment_id = $null
    }).Data
    $slotsB = (Invoke-Rpc -FunctionName 'compute_available_slots' -Headers $serviceHeaders -Body @{
      target_establishment_id = $testEstablishmentId
      target_professional_id = $professionalB.Id
      target_service_id = $serviceId
      target_local_date = $targetDate
      ignored_appointment_id = $null
    }).Data
    $availableB = @($slotsB | Where-Object { $_.available } | ForEach-Object { [string]$_.starts_at })
    $selectedSlots = @($slotsA | Where-Object { $_.available -and $availableB -contains [string]$_.starts_at } | Select-Object -First 2)
    if ($selectedSlots.Count -ge 2) { break }
  }
  if ($selectedSlots.Count -lt 2) { throw 'Dois slots técnicos comuns não foram encontrados em 31 dias.' }

  $slotStart = [DateTimeOffset]::Parse([string]$selectedSlots[0].starts_at)
  $slotEnd = $slotStart.AddMinutes(30)
  $linkedAppointment = Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/appointments" -Headers $serviceHeaders -Body @{
    establishment_id = $testEstablishmentId
    client_id = $client.Id
    client_name = 'F0 technical client'
    professional_id = $professionalA.Id
    service_id = $serviceId
    date_time = $slotStart.ToString('o')
    duration_minutes = 30
    ends_at = $slotEnd.ToString('o')
    status = 'confirmed'
  }
  $linkedAppointmentId = [string]@($linkedAppointment.Data)[0].id
  $createdAppointmentIds.Add($linkedAppointmentId)

  $clientReassignment = Invoke-Rpc -FunctionName 'reschedule_appointment' -Headers $clientHeaders -AllowFailure -Body @{
    target_appointment_id = $linkedAppointmentId
    requested_date_time = $slotStart.ToString('o')
    requested_professional_id = $professionalB.Id
    requested_service_id = $serviceId
  }
  if ($clientReassignment.StatusCode -lt 400 -or [string]$clientReassignment.Data.message -notmatch 'appointment_reassignment_requires_workflow') {
    throw 'Cliente conseguiu trocar diretamente o profissional vinculado.'
  }

  $absenceResponse = Invoke-Rpc -FunctionName 'transfer_professional_absence' -Headers $ownerHeaders -Body @{
    target_professional_id = $professionalA.Id
    range_start = $slotStart.AddMinutes(-30).ToString('o')
    range_end = $slotEnd.AddMinutes(30).ToString('o')
    transfers = @(@{
      appointment_id = $linkedAppointmentId
      action = 'transfer'
      to_professional_id = $professionalB.Id
      reason_code = 'professional_unavailable'
      request_id = [guid]::NewGuid().ToString()
    })
  }
  $absenceItem = @($absenceResponse.Data.results)[0]
  if ($absenceItem.ok -ne $false -or [string]$absenceItem.error -notmatch 'appointment_reassignment_requires_workflow') {
    throw 'Modo ausência não bloqueou a transferência vinculada ao cliente.'
  }

  $walkInSlotStart = [DateTimeOffset]::Parse([string]$selectedSlots[1].starts_at)
  $walkInSlotEnd = $walkInSlotStart.AddMinutes(30)
  $walkInAppointment = Invoke-JsonRequest -Method POST -Uri "$projectUrl/rest/v1/appointments" -Headers $serviceHeaders -Body @{
    establishment_id = $testEstablishmentId
    client_id = $null
    client_name = 'F0 technical walk-in'
    professional_id = $professionalA.Id
    service_id = $serviceId
    date_time = $walkInSlotStart.ToString('o')
    duration_minutes = 30
    ends_at = $walkInSlotEnd.ToString('o')
    status = 'confirmed'
  }
  $walkInAppointmentId = [string]@($walkInAppointment.Data)[0].id
  $createdAppointmentIds.Add($walkInAppointmentId)
  $requestId = [guid]::NewGuid().ToString()

  $professionalAttempt = Invoke-Rpc -FunctionName 'transfer_unlinked_walk_in_professional' -Headers $professionalHeaders -AllowFailure -Body @{
    target_appointment_id = $walkInAppointmentId
    target_professional_id = $professionalB.Id
    target_reason = 'professional_unavailable'
    target_request_id = $requestId
  }
  if ($professionalAttempt.StatusCode -lt 400 -or [string]$professionalAttempt.Data.message -notmatch 'forbidden') {
    throw 'Profissional conseguiu aplicar transferência direta de walk-in.'
  }

  $ownerRequestId = [guid]::NewGuid().ToString()
  $ownerTransfer = Invoke-Rpc -FunctionName 'transfer_unlinked_walk_in_professional' -Headers $ownerHeaders -Body @{
    target_appointment_id = $walkInAppointmentId
    target_professional_id = $professionalB.Id
    target_reason = 'professional_unavailable'
    target_request_id = $ownerRequestId
  }
  $ownerReplay = Invoke-Rpc -FunctionName 'transfer_unlinked_walk_in_professional' -Headers $ownerHeaders -Body @{
    target_appointment_id = $walkInAppointmentId
    target_professional_id = $professionalB.Id
    target_reason = 'professional_unavailable'
    target_request_id = $ownerRequestId
  }
  if ($ownerTransfer.Data.applied -ne $true -or ($ownerTransfer.Data | ConvertTo-Json -Compress) -ne ($ownerReplay.Data | ConvertTo-Json -Compress)) {
    throw 'Transferência de walk-in por admin não foi aplicada de forma idempotente.'
  }

  $appointmentProjection = Invoke-JsonRequest -Method GET -Uri "$projectUrl/rest/v1/appointments?id=eq.$walkInAppointmentId&select=professional_id,transferred_from_professional_id,transfer_reason" -Headers $serviceHeaders
  $projected = @($appointmentProjection.Data)[0]
  if ([string]$projected.professional_id -ne $professionalB.Id -or [string]$projected.transferred_from_professional_id -ne $professionalA.Id -or [string]$projected.transfer_reason -ne 'professional_unavailable') {
    throw 'Projeção legada da transferência de walk-in está inconsistente.'
  }

  $flagWrite = Invoke-JsonRequest -Method PATCH -Uri "$projectUrl/rest/v1/establishments?id=eq.$testEstablishmentId" -Headers $ownerHeaders -Body @{
    appointment_reassignment_enabled = $true
  } -AllowFailure
  $flagRead = Invoke-JsonRequest -Method GET -Uri "$projectUrl/rest/v1/establishments?id=eq.$testEstablishmentId&select=appointment_reassignment_enabled" -Headers $serviceHeaders
  if (@($flagRead.Data)[0].appointment_reassignment_enabled -ne $false) {
    throw 'Flag de reatribuição não permaneceu desligada.'
  }
  # Depending on PostgREST/RLS response shaping, a denied PATCH can be returned
  # as an error or as a representation without exposing the protected column.
  # The authoritative assertion is the service-role read above: the value must
  # remain false after the authenticated write attempt.

  [pscustomobject]@{
    Gate = 'F0'
    Environment = 'Homolog'
    OwnerJwt = 'PASS'
    ProfessionalJwt = 'PASS'
    ClientJwt = 'PASS'
    LinkedClientReassignmentBlocked = 'PASS'
    AbsenceTransferBlockedPerItem = 'PASS'
    ProfessionalWalkInApplyDenied = 'PASS'
    AdminWalkInApply = 'PASS'
    IdempotentReplay = 'PASS'
    LegacyProjection = 'PASS'
    ReassignmentFlagDefaultOff = 'PASS'
    ReassignmentFlagAppWriteBlocked = 'PASS'
    FixtureCleanup = 'PENDING'
  } | Format-List
}
finally {
  if ($null -ne $serviceHeaders) {
    if (-not [string]::IsNullOrWhiteSpace($technicalSlug)) {
      try {
        $cleanupSql = @"
begin;
alter table public.appointment_events disable trigger appointment_events_immutable;
delete from public.appointment_events
where establishment_id in (select id from public.establishments where slug = '$technicalSlug');
alter table public.appointment_events enable trigger appointment_events_immutable;
delete from public.appointments
where establishment_id in (select id from public.establishments where slug = '$technicalSlug');
delete from public.billing_coverage_assignments
where establishment_id in (select id from public.establishments where slug = '$technicalSlug')
   or billing_account_id in (
     select id from public.billing_accounts
     where establishment_id in (select id from public.establishments where slug = '$technicalSlug')
   );
delete from public.billing_accounts
where establishment_id in (select id from public.establishments where slug = '$technicalSlug');
delete from public.establishments where slug = '$technicalSlug';
commit;
"@
        Invoke-LinkedSql -Sql $cleanupSql
        $remaining = Invoke-JsonRequest -Method GET -Uri "$projectUrl/rest/v1/establishments?slug=eq.$technicalSlug&select=id" -Headers $serviceHeaders
        if (@($remaining.Data).Count -ne 0) { $cleanupErrors.Add('establishment') }
      } catch {
        $cleanupErrors.Add('establishment')
      }
    }
    foreach ($userId in @($technicalUsers)) {
      try {
        $deletedUser = Invoke-JsonRequest -Method DELETE -Uri "$projectUrl/auth/v1/admin/users/$userId" -Headers $serviceHeaders -AllowFailure
        if ($deletedUser.StatusCode -ge 400 -and $deletedUser.StatusCode -ne 404) {
          $cleanupErrors.Add('auth_user')
        }
      } catch { $cleanupErrors.Add('auth_user') }
    }
  }

  if ($cleanupErrors.Count -eq 0) {
    Write-Output 'FIXTURE_CLEANUP=PASS'
  } else {
    Write-Output "FIXTURE_CLEANUP=FAIL ($($cleanupErrors -join ','))"
  }
}
