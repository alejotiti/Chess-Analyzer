# Run this from the repo root in PowerShell after extracting the zip.
# 1) Initialize git and push to your repo.
git init
git branch -M main
git remote add origin https://github.com/alejotiti/Chess-Analyzer
git add -A
git commit -m "Bootstrap: stage scaffolding + Vite React TS"
git push -u origin main
