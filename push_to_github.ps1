param (
    [string]$RepoUrl = "https://github.com/Varun612/festive-agent.git"
)

$env:Path += ";c:\Users\info\Desktop\mingit\cmd"

Write-Host "Setting up GitHub Remote: $RepoUrl" -ForegroundColor Cyan
git remote remove origin 2>$null
git remote add origin $RepoUrl
git branch -M main

Write-Host "Pushing codebase to GitHub main branch..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "You can now import this repository directly into Vercel and Render!" -ForegroundColor Green
} else {
    Write-Host "Git push failed. If prompted for password, use a GitHub Personal Access Token or sign in via browser." -ForegroundColor Red
}
