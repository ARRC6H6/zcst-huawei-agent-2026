# 打包实验助手（Windows exe）
#
#   .\build.ps1              默认：同步前端 + 编译 release exe（不出安装包）
#   .\build.ps1 -Bundle      额外出 NSIS 安装包（需要联网下载 NSIS）
#   .\build.ps1 -SkipSync    跳过前端同步
#
# 产物：src-tauri\target\release\lab-assistant.exe

param(
  [switch]$Bundle,
  [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location $PSScriptRoot

if (-not $SkipSync) {
  Write-Host "同步单文件前端到 dist\index.html ..." -ForegroundColor Cyan
  node tools\sync-frontend.mjs
  if ($LASTEXITCODE -ne 0) { throw "前端同步失败" }
}

Write-Host "编译 Rust / 打包 exe ..." -ForegroundColor Cyan
# Cargo.toml 在 src-tauri\ 下：必须先切进去再编，否则 cargo 报
# “could not find `Cargo.toml` in ... or any parent directory”。
$cargoArgs = @("build", "--release", "--bin", "lab-assistant", "--features", "custom-protocol")
Push-Location "$PSScriptRoot\src-tauri"
try {
  if ($Bundle) {
    # NSIS 安装包由 tauri CLI 负责；没装 CLI 时先 cargo 出 exe，再提示手动 bundle
    cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) { throw "Rust 构建失败" }
    Write-Host "提示：出安装包请执行  npx tauri build（需要联网下载 NSIS）" -ForegroundColor Yellow
  } else {
    cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) { throw "Rust 构建失败" }
  }
} finally {
  Pop-Location
}

$exe = "src-tauri\target\release\lab-assistant.exe"
if (Test-Path $exe) {
  $mb = [math]::Round((Get-Item $exe).Length / 1MB, 2)
  Write-Host "`n✅ 出炉：$((Resolve-Path $exe).Path)  ($mb MB)" -ForegroundColor Green
  Write-Host "   双击打开 → 局域网互传 → 点「成为服务端」即可。" -ForegroundColor Green
} else {
  Write-Host "`n❌ 没找到 exe，检查上面的报错" -ForegroundColor Red
  exit 1
}
