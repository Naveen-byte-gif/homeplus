# Instructions to Fix Twilio Secrets in Git History

GitHub is blocking your push because commit `37f5c1cd` contains a real Twilio Account SID: `YOUR_TWILIO_ACCOUNT_SID`

## Solution: Use Interactive Rebase

### Step 1: Start Interactive Rebase
```powershell
git rebase -i HEAD~2
```

### Step 2: In the editor that opens
- Find the line with commit `37f5c1cd` (should be the second commit from the top)
- Change `pick` to `edit` for that commit
- Save and close the editor

### Step 3: Fix the files
When the rebase stops, the problematic commit will be checked out. Fix the files:

```powershell
# The Account SID to replace
$oldSid = "YOUR_TWILIO_ACCOUNT_SID"
$newSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Fix .env.example if it exists
if (Test-Path .env.example) {
    (Get-Content .env.example) -replace $oldSid, $newSid | Set-Content .env.example
    git add .env.example
}

# Fix documentation files if they exist
$files = @("SMS_OTP_INTEGRATION_SUMMARY.md", "TWILIO_SETUP_QUICK.md", "TWILIO_SMS_SETUP.md")
foreach ($file in $files) {
    if (Test-Path $file) {
        (Get-Content $file) -replace $oldSid, $newSid | Set-Content $file
        git add $file
    }
}
```

### Step 4: Amend the commit
```powershell
git commit --amend --no-edit
```

### Step 5: Continue the rebase
```powershell
git rebase --continue
```

### Step 6: Force push (since history was rewritten)
```powershell
git push --force-with-lease origin main
```

## Alternative: Use BFG Repo-Cleaner (Easier)

1. Download BFG from: https://rtyley.github.io/bfg-repo-cleaner/
2. Create a file `replacements.txt` with:
   ```
   YOUR_TWILIO_ACCOUNT_SID==>ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. Run:
   ```powershell
   java -jar bfg.jar --replace-text replacements.txt
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force-with-lease origin main
   ```

## After Fixing

Once you've fixed the secrets, you can push again. The placeholder `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` will be safe to push.

