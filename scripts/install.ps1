#Requires -Version 5.1
<#
.SYNOPSIS
    Wormhole Installation Script for Windows

.DESCRIPTION
    Downloads and installs the Wormhole CLI from GitHub Releases
    (byronwade/Wormhole). WinFSP is required separately for mounts.

.PARAMETER Version
    Specific version tag (e.g. v0.1.0). Default: latest

.PARAMETER InstallDir
    Install directory. Default: $env:LOCALAPPDATA\Wormhole

.EXAMPLE
    irm https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/install.ps1 | iex
#>

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\Wormhole"
)

$ErrorActionPreference = "Stop"

$GitHubOwner = if ($env:GITHUB_OWNER) { $env:GITHUB_OWNER } else { "byronwade" }
$GitHubRepo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "Wormhole" }

function Write-ColorOutput {
    param([string]$Message, [string]$Level = "INFO")
    $Color = switch ($Level) {
        "INFO"    { "Cyan" }
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    Write-Host "[$Level] " -ForegroundColor $Color -NoNewline
    Write-Host $Message
}

function Get-LatestVersion {
    Write-ColorOutput "Fetching latest version..." "INFO"
    $releaseUrl = "https://api.github.com/repos/$GitHubOwner/$GitHubRepo/releases/latest"
    try {
        $release = Invoke-RestMethod -Uri $releaseUrl -Headers @{ "User-Agent" = "Wormhole-Installer" }
        return $release.tag_name
    }
    catch {
        Write-ColorOutput "Failed to fetch latest version: $_" "ERROR"
        exit 1
    }
}

function Install-Wormhole {
    param([string]$Version, [string]$InstallDir)

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $versionNum = $Version.TrimStart("v")
    # Matches .github/workflows/release.yml Windows CLI artifact naming
    $artifactName = "Wormhole-$versionNum-windows-x64.zip"
    $downloadUrl = "https://github.com/$GitHubOwner/$GitHubRepo/releases/download/$Version/$artifactName"

    Write-ColorOutput "Downloading from: $downloadUrl" "INFO"

    $tempDir = Join-Path $env:TEMP "wormhole-install-$(Get-Random)"
    $zipPath = Join-Path $tempDir $artifactName

    try {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

        Write-ColorOutput "Extracting..." "INFO"
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

        Write-ColorOutput "Installing to $InstallDir..." "INFO"
        Get-ChildItem -Path $tempDir -Include "*.exe","wormhole","wormhole-mount","wormhole-signal" -Recurse |
            Where-Object { -not $_.PSIsContainer } |
            ForEach-Object {
                Copy-Item -Path $_.FullName -Destination $InstallDir -Force
            }

        $cli = Join-Path $InstallDir "wormhole.exe"
        if (-not (Test-Path $cli)) {
            # Some archives may ship without .exe extension in name listing
            $cliAlt = Join-Path $InstallDir "wormhole"
            if (Test-Path $cliAlt) { $cli = $cliAlt }
        }

        if (-not (Test-Path $cli) -and -not (Test-Path (Join-Path $InstallDir "wormhole-signal.exe"))) {
            Write-ColorOutput "Archive did not contain expected binaries." "ERROR"
            Write-ColorOutput "Prefer the desktop installer: Wormhole_${versionNum}_x64-setup.exe" "INFO"
            exit 1
        }

        Write-ColorOutput "Installation complete!" "SUCCESS"
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Add-ToPath {
    param([string]$Directory)
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -notlike "*$Directory*") {
        Write-ColorOutput "Adding $Directory to PATH..." "INFO"
        [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$Directory", "User")
        $env:PATH = "$env:PATH;$Directory"
        Write-ColorOutput "PATH updated. Restart your terminal if needed." "SUCCESS"
    }
}

function Test-Installation {
    param([string]$InstallDir)
    $wormholePath = Join-Path $InstallDir "wormhole.exe"
    if (-not (Test-Path $wormholePath)) {
        $wormholePath = Join-Path $InstallDir "wormhole"
    }
    if (Test-Path $wormholePath) {
        Write-ColorOutput "Wormhole CLI installed successfully!" "SUCCESS"
        Write-Host ""
        & $wormholePath --help | Select-Object -First 8
        Write-Host ""
        Write-ColorOutput "Mounts require WinFSP: https://winfsp.dev/rel/" "WARN"
        Write-ColorOutput "Desktop installer (recommended): https://github.com/$GitHubOwner/$GitHubRepo/releases/latest" "INFO"
    }
    else {
        Write-ColorOutput "CLI binary not found after install." "ERROR"
        exit 1
    }
}

# Main
Write-Host "====================================="
Write-Host "   Wormhole Installation Script"
Write-Host "====================================="
Write-Host ""

if ($Version -eq "latest") {
    $Version = Get-LatestVersion
}

Write-ColorOutput "Installing Wormhole $Version" "INFO"
Install-Wormhole -Version $Version -InstallDir $InstallDir
Add-ToPath -Directory $InstallDir
Test-Installation -InstallDir $InstallDir
Write-ColorOutput "Done!" "SUCCESS"
