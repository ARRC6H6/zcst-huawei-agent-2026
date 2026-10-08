# 验证「单文件前端是否真的按当前 HTML 嵌进了产物」
#   .\verify-embedded.ps1 -Binary <exe|so> [-Html <原型.html>]
# 原理与 build-apk.ps1 的内嵌自检一致：在产物原始字节里搜 HTML 特征串。
# （Tauri 的内嵌资源在 release 下仍保留了原始字节，所以这个方法可用。）
param(
  [Parameter(Mandatory = $true)][string]$Binary,
  [string]$Html
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $Html) { $Html = Join-Path $root "原型.html" }

function Test-Needle([byte[]]$bytes, [string]$text) {
  $needle = [System.Text.Encoding]::UTF8.GetBytes($text)
  if ($needle.Length -eq 0 -or $bytes.Length -lt $needle.Length) { return $false }
  for ($k = 0; $k -le $bytes.Length - $needle.Length; $k++) {
    if ($bytes[$k] -eq $needle[0]) {
      $ok = $true
      for ($j = 1; $j -lt $needle.Length; $j++) { if ($bytes[$k + $j] -ne $needle[$j]) { $ok = $false; break } }
      if ($ok) { return $true }
    }
  }
  return $false
}

$bin = (Resolve-Path $Binary).Path
$html = (Resolve-Path $Html).Path
$bytes = [System.IO.File]::ReadAllBytes($bin)
$htmlText = Get-Content $html -Raw -Encoding UTF8

Write-Host "产物 : $bin  ($([math]::Round($bytes.Length / 1MB, 2)) MB, $((Get-Item $bin).LastWriteTime))"
Write-Host "前端 : $html  ($([math]::Round((Get-Item $html).Length / 1KB)) KB, $((Get-Item $html).LastWriteTime))"
Write-Host ""
Write-Host "--- 必须存在（本次改动新增） ---"
$must = @('data-timer-host', 'function refreshTimer', '计时器预设',
          'const keep = toTop ? 0 : main.scrollTop', 'main.scrollTop = keep')
foreach ($s in $must) { Write-Host ("  {0,-44} {1}" -f $s, (Test-Needle $bytes $s)) }

Write-Host "--- 必须不存在（仪器摆放已删除） ---"
# 注意：**不要**用「仪器摆放」这个词做判据 —— 它现在仍出现在「已移除」的说明注释里，
# 属于正常文案。这里只用「删干净之后不可能再出现的标识符 / 类名 / 节点」。
$mustNot = @('data-act="cv-add"', 'data-canvas-host', '.cv-item', '.canvas-scroll',
             'INST_LIB', 'INST_CATS', 'instPanelHTML', 'renderInstIcon', 'canvasAct', 'refreshCanvas')
foreach ($s in $mustNot) { Write-Host ("  {0,-24} {1}" -f $s, (Test-Needle $bytes $s)) }

Write-Host ""
Write-Host "--- 判定 ---"
$bad = @()
foreach ($s in $must) { if (-not (Test-Needle $bytes $s)) { $bad += "缺少特征串：$s" } }
foreach ($s in $mustNot) { if (Test-Needle $bytes $s) { $bad += "仍残留旧特征串：$s" } }
# 另外对照 build-apk.ps1 用的那个历史特征串（确认搜索方法本身有效）
$marker = '<details class="card card-fold">'
if ($htmlText.Contains($marker) -and -not (Test-Needle $bytes $marker)) { $bad += "对照特征串未命中，搜索方法可能失效" }
if ($bad.Count -eq 0) { Write-Host "PASS：内嵌前端与当前 HTML 一致（旧功能已消失）" -ForegroundColor Green; exit 0 }
$bad | ForEach-Object { Write-Host "FAIL：$_" -ForegroundColor Red }
exit 1
