# 一鍵安全停止 interview-dojo 相關本地服務（Next.js Web、STT、VOICEVOX、Ollama）
# 透過監聽 Port 與程序命令列雙重驗證，避免誤殺其他專案的 Node / Python 程序。
# 用法：
#   pnpm stop:all
#   powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1 -KeepOllama
#   powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1 -DryRun
param(
  [switch]$KeepOllama,
  [switch]$DryRun
)

function Stop-ServiceByPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$MatchPattern
  )

  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "${Label} (${Port}): 未在運行"
    return
  }

  $targetPids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $targetPids) {
    if ($procId -le 4) { continue }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }

    $cmd = "$($proc.Name) $($proc.CommandLine)"
    if ($cmd -notmatch $MatchPattern) {
      Write-Warning "${Label} (${Port}): PID ${procId} ($($proc.Name)) 不符合特徵 [$MatchPattern]，已略過以避免誤殺。"
      continue
    }

    if ($DryRun) {
      Write-Host "[DryRun] 將停止 ${Label} (${Port}) -> PID ${procId} ($($proc.Name))"
    } else {
      Write-Host "停止 ${Label} (${Port}) -> PID ${procId} ($($proc.Name))..."
      $null = cmd /c "taskkill /PID $procId /T /F 2>nul"
      if ($LASTEXITCODE -ne 0) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Stop-ServiceByPort -Port 3000 -Label "Next.js Web" -MatchPattern "node|next"
Stop-ServiceByPort -Port 8001 -Label "STT (faster-whisper)" -MatchPattern "server\.py|uvicorn|python"
Stop-ServiceByPort -Port 50021 -Label "VOICEVOX Engine" -MatchPattern "run\.exe|voicevox"

if ($KeepOllama) {
  Write-Host "Ollama (11434): 已指定 -KeepOllama，保留運行"
} else {
  Stop-ServiceByPort -Port 11434 -Label "Ollama" -MatchPattern "ollama"
}
