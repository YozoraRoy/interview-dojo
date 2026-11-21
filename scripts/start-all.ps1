# 一鍵啟動 interview-dojo 所需的本地服務（Ollama、STT、VOICEVOX、Web）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
param(
  [string]$ModelsDir = $(if ($env:OLLAMA_MODELS) { $env:OLLAMA_MODELS } else { "D:\PG\AiModel" }),
  [string]$VoicevoxExe = "D:\PG\voicevox\engine\windows-cpu\run.exe"
)

$root = Split-Path -Parent $PSScriptRoot

function Test-Port($port) {
  try { return (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded }
  catch { return $false }
}

if (-not (Test-Port 11434)) {
  Write-Host "啟動 Ollama serve..."
  $env:OLLAMA_MODELS = $ModelsDir
  Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
} else { Write-Host "Ollama (11434) 已在運行" }

if (-not (Test-Port 8001)) {
  Write-Host "啟動 STT 服務 (8001)..."
  $py = Join-Path $root "services\stt\.venv\Scripts\python.exe"
  $srv = Join-Path $root "services\stt\server.py"
  Start-Process $py -ArgumentList $srv -WorkingDirectory (Join-Path $root "services\stt") -WindowStyle Minimized
} else { Write-Host "STT (8001) 已在運行" }

if (-not (Test-Port 50021)) {
  if (Test-Path $VoicevoxExe) {
    Write-Host "啟動 VOICEVOX (50021)..."
    Start-Process $VoicevoxExe -ArgumentList "--host 127.0.0.1 --port 50021" -WindowStyle Minimized
  } else {
    Write-Warning "找不到 VOICEVOX: $VoicevoxExe，請先下載或手動啟動。"
  }
} else { Write-Host "VOICEVOX (50021) 已在運行" }

Write-Host "啟動 interview-dojo Web (http://127.0.0.1:3000)..."
Set-Location $root
node --env-file-if-exists=.env server/index.ts
