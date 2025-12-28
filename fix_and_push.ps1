# Complete script to fix Twilio secrets and push
# Run: .\FIX_AND_PUSH.ps1

$ErrorActionPreference = "Continue"

# Disable pager
$env:GIT_PAGER = ""
$env:PAGER = ""

$oldSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$newSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

Write-Host "========================================"
Write-Host "Fixing Twilio Secrets and Pushing"
Write-Host "========================================"
Write-Host ""

Write-Host "Step 1: Starting interactive rebase..."
Write-Host "  -> Notepad will open. Change 'pick' to 'edit' for commit 37f5c1cd"
Write-Host "  -> Save and close Notepad"
Write-Host ""
Write-Host "Press Enter to continue..."
Read-Host

# Start rebase
git -c core.pager="" rebase -i HEAD~2

# Check if rebase stopped
if (Test-Path .git/rebase-merge) {
    Write-Host ""
    Write-Host "Step 2: Rebase stopped. Fixing files..."
    
    # Fix .env.example
    Write-Host "  Fixing .env.example..."
    $content = git show HEAD:.env.example 2>$null
    if ($content) {
        $content | Out-File -Encoding utf8 .env.example
        $fileContent = Get-Content .env.example -Raw
        $fileContent = $fileContent -replace [regex]::Escape($oldSid), $newSid
        Set-Content .env.example -Value $fileContent -NoNewline
        git add .env.example 2>&1 | Out-Null
        Write-Host "    ✓ Fixed"
    }
    
    # Fix markdown files
    $files = @("SMS_OTP_INTEGRATION_SUMMARY.md", "TWILIO_SETUP_QUICK.md", "TWILIO_SMS_SETUP.md")
    foreach ($file in $files) {
        Write-Host "  Fixing $file..."
        $content = git show "HEAD:$file" 2>$null
        if ($content) {
            $content | Out-File -Encoding utf8 $file
            if (Test-Path $file) {
                $fileContent = Get-Content $file -Raw
                $fileContent = $fileContent -replace [regex]::Escape($oldSid), $newSid
                Set-Content $file -Value $fileContent -NoNewline
                git add $file 2>&1 | Out-Null
                Write-Host "    ✓ Fixed"
            }
        }
    }
    
    Write-Host ""
    Write-Host "Step 3: Amending commit..."
    git commit --amend --no-edit 2>&1 | Out-Null
    
    Write-Host "Step 4: Continuing rebase..."
    git rebase --continue 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Step 5: Pushing to main..."
        git push --force-with-lease origin main
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "========================================"
            Write-Host "SUCCESS! Push completed!"
            Write-Host "========================================"
        } else {
            Write-Host ""
            Write-Host "ERROR: Push failed. Check output above."
        }
    } else {
        Write-Host ""
        Write-Host "ERROR: Rebase continue failed. Check: git status"
    }
} else {
    Write-Host ""
    Write-Host "Rebase may have completed or failed. Check: git status"
}

