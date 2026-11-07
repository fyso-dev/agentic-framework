# Windows adapter for the shared Linux installer. WSL receives request JSON on stdin.
[CmdletBinding()]
param(
    [ValidateSet('Check', 'Install', 'InstallWSL')][string]$Mode = 'Check',
    [string]$Distribution = 'Ubuntu',
    [string]$RequestFile,
    [ValidateSet('es','en')][string]$Language = 'es'
)
$ErrorActionPreference = 'Stop'
$copy = Get-Content -LiteralPath (Join-Path $PSScriptRoot "locales/$Language.json") -Raw | ConvertFrom-Json
function Quote-NativeArgument([string]$Value) {
    # Windows CRT escaping; no PowerShell/shell evaluation of request data.
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Invoke-Wsl([string[]]$Arguments, [string]$InputText = '') {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = 'wsl.exe'
    $info.Arguments = ($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.StandardInputEncoding = New-Object System.Text.UTF8Encoding($false)
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    try {
        $process.StandardInput.WriteLine($InputText)
        $process.StandardInput.Flush()
        $process.WaitForExit()
        return $process.ExitCode
    } finally { $process.StandardInput.Close(); $process.Dispose() }
}
try {
    if ($Distribution -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw $copy.invalid }
    if ($Mode -eq 'InstallWSL') {
        # Explicit UI action: Windows handles UAC. No automatic reboot or distro deletion.
        Start-Process -FilePath 'wsl.exe' -ArgumentList @('--install', '--distribution', $Distribution, '--no-launch') -Verb RunAs -Wait
        Write-Output $copy.wsl_restart
        exit 0
    }
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw $copy.wsl_missing }
    $kernel = & wsl.exe --distribution $Distribution --exec uname -r 2>$null
    if ($LASTEXITCODE -ne 0 -or ($kernel -join '') -notmatch '(?i)WSL2') { throw $copy.wsl_missing }
    & wsl.exe --distribution $Distribution --exec sh -c 'test "$(id -u)" -ne 0 && command -v python3 >/dev/null'
    if ($LASTEXITCODE -ne 0) { throw $copy.wsl_user }
    if ($Mode -eq 'Check') { Write-Output 'WSL2 ready'; exit 0 }
    if (-not $RequestFile -or (Split-Path -Leaf $RequestFile) -ne 'request.json' -or
        (Split-Path -Leaf (Split-Path -Parent $RequestFile)) -notlike 'fyso-request-*') { throw $copy.invalid }
    try { $request = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json }
    finally {
        Remove-Item -LiteralPath $RequestFile -Force
        # Only our empty, uniquely named request directory can be removed.
        $parent = Split-Path -Parent $RequestFile
        if ((Split-Path -Leaf $parent) -like 'fyso-request-*') {
            [System.IO.Directory]::Delete($parent, $false)
        }
    }
    # A port free in WSL can still be occupied by a Windows service. Pass the
    # native listener inventory to the shared Linux block selector.
    $ports = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
    $request | Add-Member -NotePropertyName excluded_ports -NotePropertyValue $ports -Force
    $request | Add-Member -NotePropertyName wsl -NotePropertyValue $true -Force
    $request | Add-Member -NotePropertyName lang -NotePropertyValue $Language -Force
    $linuxSource = (& wsl.exe --distribution $Distribution --exec wslpath -u $PSScriptRoot).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $linuxSource) { throw $copy.invalid }
    # Project paths are Linux paths. Assets can be read from the read-only Windows mount;
    # the project, key, secret handoff and mise tools remain inside the distribution.
    $code = Invoke-Wsl @('--distribution', $Distribution, '--exec', 'python3', "$linuxSource/install.py", '--watch-stdin') ($request | ConvertTo-Json -Compress)
    exit $code
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
