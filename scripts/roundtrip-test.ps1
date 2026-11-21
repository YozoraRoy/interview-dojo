# 來回驗證：VOICEVOX 合成日文 → faster-whisper 辨識，量測延遲。
# 用法：powershell -File scripts\roundtrip-test.ps1
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$vv = 'http://127.0.0.1:50021'
$stt = 'http://127.0.0.1:8001'
$speaker = 3  # ずんだもん ノーマル。使用時須標示「VOICEVOX:ずんだもん」
$text = 'マイクロサービス化を主導し、レイテンシを四十パーセント削減しました。要件定義から職務経歴書まで担当しました。'
$out = Join-Path $env:TEMP 'dojo-roundtrip.wav'

$sw = [Diagnostics.Stopwatch]::StartNew()
$q = Invoke-RestMethod -Method Post "$vv/audio_query?speaker=$speaker&text=$([uri]::EscapeDataString($text))"
Invoke-RestMethod -Method Post "$vv/synthesis?speaker=$speaker" -Body ($q | ConvertTo-Json -Depth 10) -ContentType 'application/json' -OutFile $out
Write-Host ("TTS: {0:N2}s  wav={1:N0}KB" -f $sw.Elapsed.TotalSeconds, ((Get-Item $out).Length / 1KB))

$sw.Restart()
$json = curl.exe -s -X POST "$stt/transcribe" -F "audio=@$out" -F 'language=ja'
Write-Host ("STT wall: {0:N2}s" -f $sw.Elapsed.TotalSeconds)
$r = $json | ConvertFrom-Json
Write-Host "原文: $text"
Write-Host "辨識: $($r.text)"
Write-Host ("音訊長度 {0}s / 辨識耗時 {1}s" -f $r.audio_sec, $r.elapsed_sec)
Remove-Item $out -Force
