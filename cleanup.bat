@echo off
echo STARTING CLEANUP > cleanup_log.txt
git add . >> cleanup_log.txt 2>&1
git commit -m "chore: cleanup debug files" >> cleanup_log.txt 2>&1
git push origin master >> cleanup_log.txt 2>&1
echo DONE >> cleanup_log.txt
