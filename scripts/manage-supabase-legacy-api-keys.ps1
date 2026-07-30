[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)]
  [ValidateSet('sphbbqdgcreowxzjgibj', 'hxoenfnszrrgaqxplzmd')]
  [string]$ProjectRef,

  [Parameter(Mandatory)]
  [ValidateSet('Status', 'Disable', 'Enable')]
  [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not ('CutSync.SupabaseCredentialReader' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CutSync {
  public static class SupabaseCredentialReader {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
      public UInt32 Flags;
      public UInt32 Type;
      public IntPtr TargetName;
      public IntPtr Comment;
      public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
      public UInt32 CredentialBlobSize;
      public IntPtr CredentialBlob;
      public UInt32 Persist;
      public UInt32 AttributeCount;
      public IntPtr Attributes;
      public IntPtr TargetAlias;
      public IntPtr UserName;
    }

    [DllImport(
      "advapi32.dll",
      EntryPoint = "CredReadW",
      CharSet = CharSet.Unicode,
      SetLastError = true
    )]
    public static extern bool CredRead(
      string target,
      UInt32 type,
      UInt32 reserved,
      out IntPtr credential
    );

    [DllImport("advapi32.dll", EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr credential);
  }
}
'@
}

$credentialPointer = [IntPtr]::Zero
$credentialBytes = $null
$accessToken = $null
$client = $null
$request = $null
$response = $null

try {
  $credentialAvailable = [CutSync.SupabaseCredentialReader]::CredRead(
    'Supabase CLI:supabase',
    1,
    0,
    [ref]$credentialPointer
  )

  if (-not $credentialAvailable) {
    throw 'SUPABASE_MANAGEMENT_CREDENTIAL_UNAVAILABLE'
  }

  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
    $credentialPointer,
    [type][CutSync.SupabaseCredentialReader+CREDENTIAL]
  )

  if ($credential.CredentialBlobSize -eq 0) {
    throw 'SUPABASE_MANAGEMENT_CREDENTIAL_EMPTY'
  }

  $credentialBytes = [byte[]]::new($credential.CredentialBlobSize)
  [Runtime.InteropServices.Marshal]::Copy(
    $credential.CredentialBlob,
    $credentialBytes,
    0,
    $credential.CredentialBlobSize
  )
  $accessToken = [Text.Encoding]::UTF8.GetString($credentialBytes)

  if ($accessToken -notmatch '^sbp_(oauth_)?[a-f0-9]{40}$') {
    throw 'SUPABASE_MANAGEMENT_CREDENTIAL_INVALID'
  }

  $enabled = switch ($Mode) {
    'Disable' { $false }
    'Enable' { $true }
    default { $null }
  }

  $uri = "https://api.supabase.com/v1/projects/$ProjectRef/api-keys/legacy"
  $method = [Net.Http.HttpMethod]::Get

  if ($Mode -ne 'Status') {
    if (-not $PSCmdlet.ShouldProcess(
      $ProjectRef,
      "set legacy API keys enabled=$enabled"
    )) {
      return
    }

    $uri += "?enabled=$($enabled.ToString().ToLowerInvariant())"
    $method = [Net.Http.HttpMethod]::Put
  }

  $client = [Net.Http.HttpClient]::new()
  $request = [Net.Http.HttpRequestMessage]::new($method, $uri)
  $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new(
    'Bearer',
    $accessToken
  )

  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  $rawResponse = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

  if (-not $response.IsSuccessStatusCode) {
    throw "SUPABASE_MANAGEMENT_HTTP_$([int]$response.StatusCode)"
  }

  $state = $rawResponse | ConvertFrom-Json
  if ($state.PSObject.Properties.Name -notcontains 'enabled') {
    throw 'SUPABASE_MANAGEMENT_RESPONSE_INVALID'
  }

  [pscustomobject]@{
    ProjectRef = $ProjectRef
    HttpStatus = [int]$response.StatusCode
    LegacyEnabled = [bool]$state.enabled
  }
} finally {
  if ($request) {
    $request.Dispose()
  }
  if ($response) {
    $response.Dispose()
  }
  if ($client) {
    $client.Dispose()
  }
  if ($credentialBytes) {
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
  }

  $accessToken = $null

  if ($credentialPointer -ne [IntPtr]::Zero) {
    [CutSync.SupabaseCredentialReader]::CredFree($credentialPointer)
  }
}
