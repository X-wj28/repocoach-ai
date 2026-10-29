param(
    [string]$NsisPath = $env:NSIS_MAKENSIS
)
$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$projectRoot = [IO.Path]::GetFullPath((Join-Path $desktopRoot '..\..'))
$outputRoot = Join-Path $projectRoot 'dist\desktop'
$buildRoot = Join-Path $projectRoot 'data\desktop-build'
New-Item -ItemType Directory -Path $outputRoot, $buildRoot -Force | Out-Null

if (-not $NsisPath) {
    $compiler = Get-Command makensis.exe -ErrorAction SilentlyContinue
    if ($compiler) { $NsisPath = $compiler.Source }
}
if (-not $NsisPath) {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'),
        (Join-Path $projectRoot 'data\desktop-tools\nsis-3.13\Bin\makensis.exe')
    )
    $NsisPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $NsisPath -or -not (Test-Path -LiteralPath $NsisPath)) {
    throw 'Install NSIS 3.x or set NSIS_MAKENSIS to the full path of makensis.exe.'
}
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw '.NET Framework 4.x compiler was not found.' }
$version = '1.0.0'
$launcher = Join-Path $buildRoot 'RepoCoach.exe'
$installer = Join-Path $outputRoot "RepoCoach-Setup-$version.exe"

Push-Location $desktopRoot
try {
    & $csc /nologo /target:winexe /platform:anycpu /optimize+ "/win32icon:assets\repocoach.ico" /reference:System.Windows.Forms.dll "/out:$launcher" RepoCoach.cs
    if ($LASTEXITCODE -ne 0) { throw 'RepoCoach launcher compilation failed.' }
    & $NsisPath /V2 /INPUTCHARSET UTF8 "/DAPP_VERSION=$version" "/DBUILD_DIR=$buildRoot" "/DOUTPUT_FILE=$installer" installer.nsi
    if ($LASTEXITCODE -ne 0) { throw 'RepoCoach installer compilation failed.' }
} finally { Pop-Location }
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$line = "$hash  $([IO.Path]::GetFileName($installer))`n"
[IO.File]::WriteAllText((Join-Path $outputRoot 'SHA256SUMS.txt'), $line, (New-Object Text.UTF8Encoding($false)))
Write-Output "Installer: $installer"
Write-Output "SHA256: $hash"
