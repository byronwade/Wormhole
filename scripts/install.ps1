#Requires -Version 5.1
<#
.SYNOPSIS
    Wormhole Installation Script for Windows

.DESCRIPTION
    This script downloads and installs the Wormhole signal server on Windows.
    Note: Full FUSE functionality requires WinFSP which must be installed separately.

.PARAMETER Version
    Specific version to install. Default is 'latest'.

.PARAMETER InstallDir
    Installation directory. Default is $env:LOCALAPPDATA\Wormhole.

.EXAMPLE
    .\install.ps1

.EXAMPLE
    .\install.ps1 -Version v0.1.0

.EXAMPLE
    irm https://raw.githubusercontent.com/wormhole-team/wormhole/main/scripts/install.ps1 | iex
#>

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\Wormhole"
)

$ErrorActionPreference = "Stop"

# Configuration
$GitHubOwner = "wormhole-team"
$GitHubRepo = "wormhole"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

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
    param(
        [string]$Version,
        [string]$InstallDir
    )

    # Create install directory
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # Download URL
    $artifactName = "wormhole-windows-x86_64.zip"
    $downloadUrl = "https://github.com/$GitHubOwner/$GitHubRepo/releases/download/$Version/$artifactName"

    Write-ColorOutput "Downloading from: $downloadUrl" "INFO"

    $tempDir = Join-Path $env:TEMP "wormhole-install-$(Get-Random)"
    $zipPath = Join-Path $tempDir $artifactName

    try {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

        # Download
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

        # Extract
        Write-ColorOutput "Extracting..." "INFO"
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

        # Move files
        Write-ColorOutput "Installing to $InstallDir..." "INFO"

        Get-ChildItem -Path $tempDir -Filter "*.exe" | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $InstallDir -Force
        }

        Write-ColorOutput "Installation complete!" "SUCCESS"
    }
    finally {
        # Cleanup
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

        $newPath = "$currentPath;$Directory"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")

        # Also update current session
        $env:PATH = "$env:PATH;$Directory"

        Write-ColorOutput "PATH updated. You may need to restart your terminal." "SUCCESS"
    }
    else {
        Write-ColorOutput "Directory already in PATH" "INFO"
    }
}

function Test-Installation {
    param([string]$InstallDir)

    $wormholePath = Join-Path $InstallDir "wormhole-signal.exe"

    if (Test-Path $wormholePath) {
        Write-ColorOutput "Wormhole signal server installed successfully!" "SUCCESS"
        Write-Host ""

        # Show version
        & $wormholePath --version

        Write-Host ""
        Write-ColorOutput "Note: Full filesystem mounting requires WinFSP." "WARN"
        Write-ColorOutput "Install WinFSP from: https://winfsp.dev/rel/" "INFO"
        Write-Host ""
        Write-ColorOutput "Run 'wormhole-signal --help' to get started" "INFO"
    }
    else {
        Write-ColorOutput "Installation verification failed." "ERROR"
        exit 1
    }
}

# Main
function Main {
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "   Wormhole Installation Script" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""

    # Get version
    if ($Version -eq "latest") {
        $Version = Get-LatestVersion
    }

    Write-ColorOutput "Installing version: $Version" "INFO"

    # Install
    Install-Wormhole -Version $Version -InstallDir $InstallDir

    # Add to PATH
    Add-ToPath -Directory $InstallDir

    # Verify
    Test-Installation -InstallDir $InstallDir

    Write-Host ""
    Write-ColorOutput "Done! Enjoy Wormhole!" "SUCCESS"
}

Main
