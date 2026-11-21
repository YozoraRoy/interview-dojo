# 比較本地模型：日文面試官（即時）情境的速度與品質
# 用法：powershell -File scripts\bench-models.ps1 -Models qwen2.5:7b-instruct,gemma4:e4b
param([string[]]$Models, [int]$NumCtx = 4096)

$sys = 'あなたは日本のIT企業の中途採用面接官（技術部長）です。必ず自然なビジネス敬語（です・ます調）で、質問は1回につき1つ、2文以内で話してください。'
$turns = @(
  '面接を始めてください。',
  'マイクロサービス化を主導しました。モノリスからの分割で、レイテンシを40%削減できました。',
  '8名のチームで、仕様変更が多く、他部署と対立したときは、優先順位を整理して合意を取りました。'
)

foreach ($m in $Models) {
  Write-Host "=== $m ===" -ForegroundColor Cyan
  $msgs = @(@{role='system'; content=$sys})
  foreach ($t in $turns) {
    $msgs += @{role='user'; content=$t}
    $body = @{model=$m; stream=$false; think=$false; options=@{num_ctx=$NumCtx; temperature=0.6}; messages=$msgs} | ConvertTo-Json -Depth 6
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
      $r = Invoke-RestMethod http://127.0.0.1:11434/api/chat -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 300
    } catch { Write-Host "ERR $_" -ForegroundColor Red; break }
    $msgs += @{role='assistant'; content=$r.message.content}
    $tps = if ($r.eval_duration) { $r.eval_count / ($r.eval_duration / 1e9) } else { 0 }
    Write-Host ("[{0:N1}s tok/s={1:N1}] {2}" -f $sw.Elapsed.TotalSeconds, $tps, $r.message.content.Trim())
  }
  Write-Host (ollama ps | Out-String)
}
