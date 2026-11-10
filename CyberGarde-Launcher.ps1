<#
.SYNOPSIS
    One-click launcher for the Cyber Garde project.

.DESCRIPTION
    Starts the FastAPI backend in an elevated PowerShell window, starts the
    Vite frontend in a second window, then opens the dashboard in the default
    browser.

    All paths are resolved from the location of this script ($PSScriptRoot),
    so no user name or drive letter is hard-coded.

.PARAMETER Mode
    Start    (default) Start both servers and open the browser.
    Backend  Internal use: run the backend in the current window.
    Frontend Internal use: run the frontend in the current window.
    Install  Create a "Cyber Garde" shortcut on the Desktop.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\CyberGarde-Launcher.ps1 -Mode Install

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\CyberGarde-Launcher.ps1
#>

[CmdletBinding()]
param(
    [ValidateSet('Start', 'Backend', 'Frontend', 'Install')]
    [string]$Mode = 'Start'
)

$ErrorActionPreference = 'Stop'

$ScriptPath  = $PSCommandPath
$ProjectRoot = $PSScriptRoot
$BackendDir  = Join-Path -Path $ProjectRoot -ChildPath 'cybergarde-backend'
$FrontendDir = Join-Path -Path $ProjectRoot -ChildPath 'cybergarde-frontend'
$BackendMain = Join-Path -Path $BackendDir -ChildPath 'main.py'
$FrontendPkg = Join-Path -Path $FrontendDir -ChildPath 'package.json'
$DashboardUrl = 'http://localhost:5173'

function Test-ProjectLayout {
    if (-not (Test-Path -LiteralPath $BackendMain -PathType Leaf)) {
        throw "Backend entry point not found: $BackendMain"
    }

    if (-not (Test-Path -LiteralPath $FrontendPkg -PathType Leaf)) {
        throw "Frontend package.json not found: $FrontendPkg"
    }
}

function Find-VenvActivate {
    $candidates = @(
        (Join-Path -Path $BackendDir -ChildPath 'venv\Scripts\Activate.ps1'),
        (Join-Path -Path $BackendDir -ChildPath '.venv\Scripts\Activate.ps1'),
        (Join-Path -Path $BackendDir -ChildPath 'env\Scripts\Activate.ps1'),
        (Join-Path -Path $ProjectRoot -ChildPath 'venv\Scripts\Activate.ps1'),
        (Join-Path -Path $ProjectRoot -ChildPath '.venv\Scripts\Activate.ps1')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    return $null
}

function Find-VenvPython {
    $candidates = @(
        (Join-Path -Path $BackendDir -ChildPath 'venv\Scripts\python.exe'),
        (Join-Path -Path $BackendDir -ChildPath '.venv\Scripts\python.exe'),
        (Join-Path -Path $BackendDir -ChildPath 'env\Scripts\python.exe'),
        (Join-Path -Path $ProjectRoot -ChildPath 'venv\Scripts\python.exe'),
        (Join-Path -Path $ProjectRoot -ChildPath '.venv\Scripts\python.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    return $null
}

function Run-Backend {
    Test-ProjectLayout
    Set-Location -LiteralPath $BackendDir

    $activate   = Find-VenvActivate
    $venvPython = Find-VenvPython

    if ($activate) {
        try {
            . $activate
            Write-Host "Activated virtual environment: $activate" -ForegroundColor Green
        }
        catch {
            Write-Warning "Could not activate the virtual environment: $($_.Exception.Message)"
        }
    }
    else {
        Write-Host "No virtual environment found. Using the system Python." -ForegroundColor Yellow
    }

    if (-not $venvPython -and $activate) {
        $candidate = Join-Path -Path (Split-Path -Parent $activate) -ChildPath 'python.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $venvPython = $candidate
        }
    }

    Write-Host ""
    Write-Host "Starting Cyber Garde backend from:" -ForegroundColor Cyan
    Write-Host "  $BackendDir" -ForegroundColor White
    Write-Host "Keep this window open while using the dashboard." -ForegroundColor DarkGray
    Write-Host ""

    if ($venvPython) {
        & $venvPython 'main.py'
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python 'main.py'
    }
    elseif (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 'main.py'
    }
    else {
        throw "Python was not found in PATH. Install Python or create a virtual environment in cybergarde-backend\venv, then run the launcher again."
    }

    Write-Host ""
    Write-Host "The backend process has stopped." -ForegroundColor Yellow
}

function Run-Frontend {
    Test-ProjectLayout
    Set-Location -LiteralPath $FrontendDir

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found in PATH. Install Node.js, then run the launcher again."
    }

    if (-not (Test-Path -LiteralPath (Join-Path -Path $FrontendDir -ChildPath 'node_modules') -PathType Container)) {
        Write-Warning "node_modules is missing. Run 'npm install' in $FrontendDir once if the frontend fails to start."
    }

    Write-Host ""
    Write-Host "Starting Cyber Garde frontend from:" -ForegroundColor Cyan
    Write-Host "  $FrontendDir" -ForegroundColor White
    Write-Host "Keep this window open while using the dashboard." -ForegroundColor DarkGray
    Write-Host ""

    npm run dev

    Write-Host ""
    Write-Host "The frontend process has stopped." -ForegroundColor Yellow
}

function Start-All {
    Test-ProjectLayout

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found in PATH. Install Node.js, then run the launcher again."
    }

    $powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
    $quotedScript  = '"' + $ScriptPath + '"'

    Write-Host "==============================================" -ForegroundColor DarkCyan
    Write-Host " Cyber Garde launcher" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "The backend needs Administrator rights for packet capture." -ForegroundColor Yellow
    Write-Host "A UAC prompt will appear. Choose Yes." -ForegroundColor Yellow
    Write-Host ""

    $backendArguments = @(
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $quotedScript,
        '-Mode', 'Backend'
    )

    try {
        Start-Process -FilePath $powerShellExe -Verb RunAs -ArgumentList $backendArguments | Out-Null
    }
    catch {
        throw "The elevated backend window could not be started. The UAC prompt may have been cancelled.`n$($_.Exception.Message)"
    }

    Write-Host "Backend window started. Waiting 3 seconds..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 3

    $frontendArguments = @(
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $quotedScript,
        '-Mode', 'Frontend'
    )

    Start-Process -FilePath $powerShellExe -ArgumentList $frontendArguments | Out-Null
    Write-Host "Frontend window started. Waiting 5 seconds..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5

    Write-Host "Opening $DashboardUrl ..." -ForegroundColor Cyan
    Start-Process -FilePath $DashboardUrl

    Write-Host ""
    Write-Host "Done. You can close this launcher window." -ForegroundColor Green
    Start-Sleep -Seconds 2
}

function Install-Shortcut {
    Test-ProjectLayout

    $desktop = [Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)
    if (-not $desktop) {
        throw "Could not locate the Desktop folder."
    }

    $powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
    $shortcutPath  = Join-Path -Path $desktop -ChildPath 'Cyber Garde.lnk'
    $arguments     = '-NoProfile -ExecutionPolicy Bypass -File "' + $ScriptPath + '" -Mode Start'

    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powerShellExe
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $ProjectRoot
    $shortcut.Description = 'Launch the Cyber Garde backend and frontend'
    $shortcut.IconLocation = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"
    $shortcut.WindowStyle = 1
    $shortcut.Save()

    Write-Host ""
    Write-Host "Desktop shortcut created:" -ForegroundColor Green
    Write-Host "  $shortcutPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Double-click it to launch Cyber Garde." -ForegroundColor Green
}

try {
    switch ($Mode) {
        'Start'    { Start-All }
        'Backend'  { Run-Backend }
        'Frontend' { Run-Frontend }
        'Install'  { Install-Shortcut }
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red

    if ($Mode -ne 'Install') {
        Read-Host "Press Enter to close this window"
    }
}
