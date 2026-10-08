# 开发模式：同步前端后用 cargo run 起应用（带控制台，方便看服务端日志）
#
#   .\dev.ps1
#
# 想改前端：改 原型.html → 重新跑本脚本（会自动同步到 dist）。

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location $PSScriptRoot

Write-Host "同步单文件前端到 dist\index.html ..." -ForegroundColor Cyan
node tools\sync-frontend.mjs
if ($LASTEXITCODE -ne 0) { throw "前端同步失败" }

Write-Host "启动实验助手（cargo run）..." -ForegroundColor Cyan
Set-Location src-tauri
cargo run --bin lab-assistant
