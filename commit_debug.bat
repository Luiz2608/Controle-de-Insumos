@echo off
echo STARTING DEBUG > commit_log.txt
echo GIT STATUS: >> commit_log.txt
git status >> commit_log.txt 2>&1
echo GIT ADD: >> commit_log.txt
git add . >> commit_log.txt 2>&1
echo GIT COMMIT: >> commit_log.txt
git commit -m "chore: force debug sync" >> commit_log.txt 2>&1
echo GIT PUSH: >> commit_log.txt
git push origin master >> commit_log.txt 2>&1
echo DONE >> commit_log.txt
