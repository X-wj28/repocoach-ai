$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$installer = Join-Path $projectRoot 'dist\desktop\RepoCoach-Setup-1.0.0.exe'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\RepoCoach'
if (Test-Path -LiteralPath $uninstallKey) { throw 'Use a clean account for installer acceptance; RepoCoach is already installed.' }
if (-not (Test-Path -LiteralPath $installer)) { throw 'Build the installer first.' }
$testRoot = Join-Path $projectRoot ('data\desktop-acceptance-' + [Guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $testRoot 'installed app'
if (-not $installRoot.StartsWith((Join-Path $projectRoot 'data\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Test path must be inside workspace data.' }
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

function Install-TestApp {
    $process = Start-Process -FilePath $installer -ArgumentList @('/S', '/NOSHORTCUTS', "/D=$installRoot") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
}
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }

$uninstallCopy = Join-Path $testRoot 'test-uninstall.exe'
$installed = $false
try {
    Install-TestApp
    $installed = $true
    $launcher = Join-Path $installRoot 'RepoCoach.exe'
    Assert-True (Test-Path -LiteralPath $launcher) 'Launcher was not installed.'
    Assert-True (Test-Path -LiteralPath (Join-Path $installRoot 'repocoach.ico')) 'Icon was not installed.'
    Assert-True (Test-Path -LiteralPath (Join-Path $installRoot 'LICENSE.txt')) 'License was not installed.'
    $metadata = Get-ItemProperty -LiteralPath $uninstallKey
    Assert-True ($metadata.DisplayName -eq 'RepoCoach') 'Wrong Windows app name.'
    Assert-True ($metadata.DisplayVersion -eq '1.0.0') 'Wrong app version.'
    Assert-True ($metadata.InstallLocation -eq $installRoot) 'Wrong install path.'
    Assert-True ($metadata.UninstallString -eq ('"' + $installRoot + '\Uninstall.exe"')) 'Uninstall path was not quoted.'
    Assert-True ((Get-Item -LiteralPath $launcher).VersionInfo.ProductName -eq 'RepoCoach') 'Wrong executable product name.'
    $stdout = Join-Path $testRoot 'launcher-diagnostics.txt'
    $p = Start-Process -FilePath $launcher -ArgumentList '--diagnose' -RedirectStandardOutput $stdout -WindowStyle Hidden -Wait -PassThru
    Assert-True ($p.ExitCode -eq 0) 'Launcher diagnostics failed.'
    $diagnostics = Get-Content -LiteralPath $stdout -Raw
    Assert-True ($diagnostics -match 'name=RepoCoach') 'Launcher branding is wrong.'
    Assert-True ($diagnostics -match 'url=https://repocoach-web.onrender.com/') 'Launcher target is wrong.'
    Assert-True ($diagnostics -match 'mode=app-window') 'Installed Edge/Chrome was not found.'
    $hash = (Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash
    Install-TestApp
    Assert-True ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -eq $hash) 'Reinstallation changed the launcher unexpectedly.'
    $userFile = Join-Path $installRoot 'user-file.txt'
    Set-Content -LiteralPath $userFile -Value 'Preserve user files on uninstall.' -Encoding ASCII
    Copy-Item -LiteralPath (Join-Path $installRoot 'Uninstall.exe') -Destination $uninstallCopy
    $uninstall = Start-Process -FilePath $uninstallCopy -ArgumentList @('/S', "_?=$installRoot") -WindowStyle Hidden -Wait -PassThru
    Assert-True ($uninstall.ExitCode -eq 0) 'Uninstaller failed.'
    Assert-True (-not (Test-Path -LiteralPath $launcher)) 'Uninstall did not remove the launcher.'
    Assert-True (-not (Test-Path -LiteralPath $uninstallKey)) 'Uninstall left the Windows app registration.'
    Assert-True (-not (Test-Path -LiteralPath 'HKCU:\Software\RepoCoach')) 'Uninstall left the install path registration.'
    Assert-True (Test-Path -LiteralPath $userFile) 'Uninstall removed a user-created file.'
    $installed = $false
    $result = [ordered]@{ silentInstall=$true; pathWithSpaces=$true; branding=$true; icon=$true; browserDetected=$true; correctOnlineURL=$true; reinstall=$true; uninstall=$true; userFilesPreserved=$true; requiresAdmin=$false; checkedAt=[DateTime]::UtcNow.ToString('o') }
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'checks.json') -Encoding UTF8
    $result | ConvertTo-Json -Compress
    Write-Output "Artifacts: $testRoot"
} finally {
    if ($installed -and (Test-Path -LiteralPath (Join-Path $installRoot 'Uninstall.exe'))) {
        Copy-Item -LiteralPath (Join-Path $installRoot 'Uninstall.exe') -Destination $uninstallCopy -Force
        Start-Process -FilePath $uninstallCopy -ArgumentList @('/S', "_?=$installRoot") -WindowStyle Hidden -Wait | Out-Null
    }
}
