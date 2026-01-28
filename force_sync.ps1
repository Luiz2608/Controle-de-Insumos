$ErrorActionPreference = "Continue"
$logfile = "C:\Users\gutem\OneDrive\Desktop\Insumos\sync_debug_log.txt"
Start-Transcript -Path $logfile -Append

Write-Output "--- START SYNC DEBUG ---"
Get-Date

Write-Output "--- GIT VERSION ---"
git --version

Write-Output "--- REMOTE ---"
git remote -v

Write-Output "--- STATUS ---"
git status

Write-Output "--- ENSURING REMOTE IS CORRECT ---"
git remote remove origin
git remote add origin https://github.com/Luiz2608/Controle-de-Insumos.git
git remote -v

Write-Output "--- FETCHING ---"
git fetch origin

Write-Output "--- PUSHING (FORCE) ---"
git push origin master --force

Write-Output "--- END SYNC DEBUG ---"
Stop-Transcript
