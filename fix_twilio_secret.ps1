# Automated script to fix Twilio Account SID in git history
# Run this from the apartment-sync-backend directory

$ErrorActionPreference = "Stop"

$oldSid = "YOUR_TWILIO_ACCOUNT_SID"
$newSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

Write-Host "========================================"
Write-Host "Fixing Twilio Account SID in Git History"
Write-Host "========================================"
Write-Host "Old SID: $oldSid"
Write-Host "New SID: $newSid"
Write-Host ""

# Check if we're in a git repo
if (-not (Test-Path .git)) {
    Write-Host "ERROR: Not in a git repository!"
    exit 1
}

# Check current branch
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "Current branch: $currentBranch"
Write-Host ""

# Check if there are uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "ERROR: You have uncommitted changes. Please commit or stash them first."
    exit 1
}

Write-Host "Starting interactive rebase..."
Write-Host "When the editor opens:"
Write-Host "  1. Find commit 37f5c1cd"
Write-Host "  2. Change 'pick' to 'edit'"
Write-Host "  3. Save and close"
Write-Host ""
Write-Host "Press Enter to continue, or Ctrl+C to cancel..."
$null = Read-Host

# Set editor to notepad for Windows
$env:GIT_EDITOR = "notepad"
$env:GIT_SEQUENCE_EDITOR = "notepad"

# Start interactive rebase
Write-Host ""
Write-Host "Starting rebase... (editor will open)"
git rebase -i HEAD~2

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Rebase may have stopped for editing, or there was an error."
    Write-Host "Check the status and continue manually if needed."
    exit 1
}

# Check if we're in a rebase state
if (Test-Path .git/rebase-merge -PathType Container) {
    Write-Host ""
    Write-Host "Rebase stopped for editing. Fixing files..."
    
    # Fix .env.example
    if (Test-Path .env.example) {
        Write-Host "Fixing .env.example..."
        $content = Get-Content .env.example -Raw
        $content = $content -replace [regex]::Escape($oldSid), $newSid
        Set-Content .env.example -Value $content -NoNewline
        git add .env.example
    }
    
    # Fix documentation files
    $docs = @("SMS_OTP_INTEGRATION_SUMMARY.md", "TWILIO_SETUP_QUICK.md", "TWILIO_SMS_SETUP.md")
    foreach ($doc in $docs) {
        if (Test-Path $doc) {
            Write-Host "Fixing $doc..."
            $content = Get-Content $doc -Raw
            $content = $content -replace [regex]::Escape($oldSid), $newSid
            Set-Content $doc -Value $content -NoNewline
            git add $doc
        }
    }
    
    Write-Host ""
    Write-Host "Amending commit..."
    git commit --amend --no-edit
    
    Write-Host ""
    Write-Host "Continuing rebase..."
    git rebase --continue
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================"
        Write-Host "SUCCESS! Secrets have been fixed."
        Write-Host "========================================"
        Write-Host ""
        Write-Host "Now you can push with:"
        Write-Host "  git push --force-with-lease origin $currentBranch"
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "Rebase may have conflicts. Resolve them and run 'git rebase --continue'"
    }
} else {
    Write-Host ""
    Write-Host "Rebase completed or not in rebase state."
    Write-Host "Please check the git status."
}

