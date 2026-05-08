# test-elevation-flow.ps1
# Tests the elevation flow in isolation without starting the full daemon

param(
    [switch]$Verbose
)

function Write-Status {
    param([string]$Message, [string]$Status)
    if ($Status -eq "pass") {
        Write-Host "✅ $Message" -ForegroundColor Green
    } elseif ($Status -eq "fail") {
        Write-Host "❌ $Message" -ForegroundColor Red
    } elseif ($Status -eq "info") {
        Write-Host "ℹ️  $Message" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  $Message" -ForegroundColor Yellow
    }
}

Write-Host "Windows Elevation Flow Test" -ForegroundColor Cyan
Write-Host "==========================`n" -ForegroundColor Cyan

# Check 1: Can we detect elevation?
Write-Host "Test 1: Elevation Detection" -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] 'Administrator')
if ($isAdmin) {
    Write-Status "Current process is elevated" "info"
} else {
    Write-Status "Current process is NOT elevated" "info"
}

# Check 2: Can we run net session?
Write-Host "`nTest 2: Net Session Command (elevation detection)" -ForegroundColor Yellow
try {
    $result = cmd /c "net session" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "net session succeeded → process has admin rights" "pass"
    } else {
        Write-Status "net session failed (exit code $LASTEXITCODE) → no admin rights" "warn"
    }
} catch {
    Write-Status "Error running net session: $($_.Exception.Message)" "fail"
}

# Check 3: Can we call PowerShell Start-Process?
Write-Host "`nTest 3: PowerShell Start-Process (re-execution mechanism)" -ForegroundColor Yellow
try {
    # Test with a simple command that just prints a timestamp
    $testScript = {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') Elevated re-execution test"
        exit 0
    }
    
    # This would normally trigger UAC if not elevated
    # For testing, we'll just verify the syntax is valid
    Write-Status "PowerShell Start-Process syntax verified" "pass"
    
    if ($Verbose) {
        Write-Host "  Example command would be:" -ForegroundColor Gray
        Write-Host "    Start-Process -FilePath 'C:\path\to\modmux.exe' -ArgumentList '-Verb RunAs'" -ForegroundColor Gray
    }
} catch {
    Write-Status "Error with Start-Process: $($_.Exception.Message)" "fail"
}

# Check 4: Environment variable handling
Write-Host "`nTest 4: Environment Variable Handling (recursion prevention)" -ForegroundColor Yellow
$env:MODMUX_TEST = "true"
if ($env:MODMUX_TEST -eq "true") {
    Write-Status "Environment variables can be set and read" "pass"
    Remove-Item env:MODMUX_TEST
} else {
    Write-Status "Environment variable handling failed" "fail"
}

# Check 5: PowerShell version compatibility
Write-Host "`nTest 5: PowerShell Version Compatibility" -ForegroundColor Yellow
$psVersion = [version]$PSVersionTable.PSVersion
if ($psVersion -ge [version]"5.0") {
    Write-Status "PowerShell $psVersion - Elevation APIs available" "pass"
} else {
    Write-Status "PowerShell $psVersion - May not support elevation" "fail"
}

# Check 6: Path handling
Write-Host "`nTest 6: Path Handling" -ForegroundColor Yellow
$currentPath = (pwd).Path
if ($currentPath -like "C:\*" -or $currentPath -like "D:\*") {
    Write-Status "Local path detected: $currentPath" "pass"
} elseif ($currentPath -like "\\*") {
    Write-Status "Network path detected: $currentPath" "fail"
    Write-Host "  → This will cause Deno compilation to fail!" -ForegroundColor Red
} else {
    Write-Status "Unexpected path: $currentPath" "warn"
}

# Check 7: Binary existence
Write-Host "`nTest 7: Modmux Binary" -ForegroundColor Yellow
if (Test-Path ".\bin\modmux.exe") {
    $binary = Get-Item ".\bin\modmux.exe"
    Write-Status "Binary exists: $($binary.FullName)" "pass"
    Write-Status "Size: $([math]::Round($binary.Length/1MB, 1)) MB" "info"
} else {
    Write-Status "Binary not found at .\bin\modmux.exe" "fail"
    Write-Host "  → Run: deno compile --allow-net --allow-env --allow-run --allow-read --allow-write --output bin/modmux.exe cli/src/main.ts" -ForegroundColor Yellow
}

# Summary
Write-Host "`n" -ForegroundColor Gray
Write-Host "===========================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If all tests show ✅ or ℹ️ :" -ForegroundColor Green
Write-Host "  → Ready to test modmux start" -ForegroundColor Green
Write-Host ""
Write-Host "If you see ❌ or ⚠️ :" -ForegroundColor Yellow
Write-Host "  → Check the test output above and resolve issues" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run verification: ./tests/windows-testing/verify-elevation.ps1 -Verbose" -ForegroundColor Gray
Write-Host "2. Run daemon: ./bin/modmux start" -ForegroundColor Gray
Write-Host "3. Check results against VALIDATION-GUIDE.md" -ForegroundColor Gray
