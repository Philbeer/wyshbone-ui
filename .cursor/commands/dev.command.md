# yaml-language-server: $schema=https://raw.githubusercontent.com/cursor-ai/commands/main/command.schema.json

name: dev
description: Start Wyshbone backend + UI and auto-open preview.

run: |
  Write-Host ">>> Starting Wyshbone backend..."
  Set-Location "C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui"
  Start-Process powershell -WindowStyle Minimized -ArgumentList "npm run dev"

  Write-Host ">>> Starting Wyshbone UI..."
  Set-Location "C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui\client"
  Start-Process powershell -WindowStyle Minimized -ArgumentList "npm run dev"

  Write-Host ">>> Waiting for frontend (http://localhost:5173) to be ready..."

  $maxTries = 60      # wait up to ~60 seconds
  $ready = $false

  for ($i = 0; $i -lt $maxTries -and -not $ready; $i++) {
    try {
      $response = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if ($ready) {
    Write-Host ">>> Frontend is up. Opening Cursor preview..."
    cursor browser open http://localhost:5173
  }
  else {
    Write-Host ">>> Frontend never became ready on http://localhost:5173 (check frontend dev server)."
  }
