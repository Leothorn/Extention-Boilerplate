# PowerShell script to restart the backend server

Write-Output "Finding and stopping any processes using port 5001..."

# Method 1: Using NetTCPConnection (most common way)
$processIds = (Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue).OwningProcess
if ($processIds) {
    foreach ($pid in $processIds) {
        try {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Output "Stopping process: $($process.Name) (PID: $pid)"
                Stop-Process -Id $pid -Force
                Start-Sleep -Seconds 1
            }
        } catch {
            Write-Output "Error stopping process with PID $pid : $_"
        }
    }
    Write-Output "TCP processes on port 5001 have been stopped."
}

# Method 2: Force kill any Python processes that might be our server
$pythonProcesses = Get-Process -Name python -ErrorAction SilentlyContinue | 
                 Where-Object { $_.CommandLine -match "app.py" -or $_.CommandLine -match "5001" }

if ($pythonProcesses) {
    foreach ($process in $pythonProcesses) {
        try {
            Write-Output "Stopping Python process: $($process.Id)"
            Stop-Process -Id $process.Id -Force
        } catch {
            Write-Output "Error stopping Python process: $_"
        }
    }
    Write-Output "Python processes potentially using port 5001 have been stopped."
}

# Make sure port is free
Start-Sleep -Seconds 2

# Check if the port is actually free now
$isPortFree = $null -eq (Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue)
if ($isPortFree) {
    Write-Output "Port 5001 is now free and available."
    $port = 5001
} else {
    Write-Output "Port 5001 is still in use. Looking for an alternative port..."
    
    # Find an available port starting from 5002
    $port = 5002
    while ($null -ne (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)) {
        $port++
        if ($port > 5010) {
            Write-Output "No available ports found in range 5001-5010."
            exit 1
        }
    }
    
    Write-Output "Using alternative port: $port"
    
    # Update the API_BASE_URL in popup.js
    $popupJsPath = "../../extension/popup/popup.js"
    if (Test-Path $popupJsPath) {
        $content = Get-Content $popupJsPath -Raw
        $newContent = $content -replace "const API_BASE_URL = 'http://localhost:5001'", "const API_BASE_URL = 'http://localhost:$port'"
        Set-Content $popupJsPath $newContent
        Write-Output "Updated API_BASE_URL in popup.js to use port $port"
    } else {
        Write-Output "Warning: Could not find popup.js to update API_BASE_URL"
    }
}

# Start the server with the selected port
$currentDir = Get-Location
Write-Output "Starting backend server from $currentDir on port $port..."
python -c "import sys; sys.path.append('.'); from app import app; import uvicorn; uvicorn.run(app, host='0.0.0.0', port=$port)" 