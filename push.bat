@echo off
set PATH=%PATH%;c:\Users\info\Desktop\mingit\cmd
echo Setting up GitHub remote...
git remote remove origin 2>nul
git remote add origin https://github.com/Varun612/festive-agent.git
git branch -M main
echo Pushing codebase to GitHub...
git push -u origin main
pause
