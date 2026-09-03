<#
.SYNOPSIS
    Install the FOLDMARK live indexer — the pipeline's primary writer — as an
    always-on Windows scheduled task.

.DESCRIPTION
    The free public RPC keeps roughly 48 blocks of logs — about five seconds at
    this chain's block time — and refuses anything older as an archive request.
    At ~850,000 blocks a day, a job that runs every five minutes does not fall
    behind and catch up; it misses everything in between, permanently. The only
    way to index this chain on a free tier is to follow the head continuously.

    Serverless hosting cannot hold a WebSocket open for that, so the follower
    runs as a process. That makes this machine the primary writer in the
    pipeline:

        Robinhood Chain (RPC + WSS)
            -> this persistent runner
            -> the deployment's /api/cron/index route
            -> Neon Postgres
            -> Vercel (Next.js UI + FOLDMARK API)
            -> users and agents

    The daily Vercel cron calls the same route, so nothing is lost if this
    machine is off — but one pass a day cannot stay inside a five-second log
    window, so it is a fallback, not the pipeline. While this task is stopped,
    chain coverage is reported as gapped rather than quietly interpolated.

    This script registers the follower as a Windows scheduled task that starts
    at boot, restarts if it dies, and writes a rotating log — the three
    properties that separate "running" from "running unattended".

    Nothing here needs administrator rights: the task is registered for the
    current user and runs whether or not that user is logged in only if you
    supply credentials, which this script deliberately does not ask for. See
    -RunOnLogon below for the trade-off.

.PARAMETER BaseUrl
    The FOLDMARK deployment whose /api/cron/index endpoint drives ingestion.
    That deployment holds DATABASE_URL and does the writing; this machine talks
    to it over HTTP only and never opens a database connection of its own.
    Defaults to http://localhost:3000.

.PARAMETER TaskName
    Scheduled task name. Defaults to FOLDMARK-LiveIndexer.

.PARAMETER LogDirectory
    Where to write logs. Defaults to %LOCALAPPDATA%\foldmark\logs.

.PARAMETER RunOnLogon
    Register the trigger at logon instead of at startup. A startup trigger
    without stored credentials only runs when someone is signed in anyway, so
    logon is the honest default on a workstation; startup is correct on a
    machine that stays signed in or runs as a service account.

.PARAMETER Uninstall
    Remove the task and stop the follower.

.EXAMPLE
    .\scripts\install-live-indexer.ps1 -BaseUrl https://foldmark.vercel.app

.NOTES
    SECRETS
    This script never accepts a secret as a parameter, because a parameter ends
    up in your PowerShell history and in the task definition in plain text. The
    follower reads CRON_SECRET from the environment. Set it once, for your user:

        [Environment]::SetEnvironmentVariable('CRON_SECRET', '<value>', 'User')

    then sign out and back in so the scheduled task inherits it. Do not put it
    in a file inside the repository.

    CRON_SECRET is the only secret this machine needs. The database connection
    string belongs to the deployment named by -BaseUrl; it is never set here,
    never passed as a parameter, and never written into the generated wrapper.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$TaskName = "FOLDMARK-LiveIndexer",
    [string]$LogDirectory = "$env:LOCALAPPDATA\foldmark\logs",
    [switch]$RunOnLogon,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repoRoot "scripts\live-indexer.mjs"

# ---------------------------------------------------------------- uninstall
if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "No task named $TaskName is registered. Nothing to remove."
        exit 0
    }
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task $TaskName."
    Write-Host "Logs were left in place at $LogDirectory."
    exit 0
}

# ------------------------------------------------------------ preconditions
if (-not (Test-Path $runner)) {
    throw "Cannot find $runner. Run this script from inside the foldmark repository."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    throw "node was not found on PATH. Install Node.js 20 or newer, then run this again."
}

$nodeVersion = (& $node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
    throw "Node $nodeVersion found, but the follower needs Node 20 or newer."
}

if (-not (Test-Path $LogDirectory)) {
    New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
}

if (-not $env:CRON_SECRET) {
    # A warning, not an error: a local deployment may have no secret set, and
    # refusing to install would be wrong for that case.
    Write-Warning "CRON_SECRET is not set for this user. The follower will call the ingest endpoint unauthenticated, which only works if the deployment allows it. See the NOTES section of this script."
}

# ------------------------------------------------------------------ wrapper
#
# The wrapper exists so the task has one thing to launch that survives a crash
# and leaves a readable trail. Task Scheduler's own restart handling only
# retries a *failed* start; a process that exits cleanly after losing its
# WebSocket would never be restarted by it.
$wrapper = Join-Path $LogDirectory "run-live-indexer.ps1"

$wrapperBody = @"
# Generated by scripts/install-live-indexer.ps1. Edits here are overwritten on
# the next install.
`$ErrorActionPreference = 'Continue'
`$env:FOLDMARK_BASE_URL = '$BaseUrl'

`$logDir = '$LogDirectory'
`$log = Join-Path `$logDir 'live-indexer.log'
`$heartbeat = Join-Path `$logDir 'heartbeat.json'

# Rotate at 8 MB so a long-running follower cannot fill a disk.
if ((Test-Path `$log) -and ((Get-Item `$log).Length -gt 8MB)) {
    Move-Item `$log (Join-Path `$logDir 'live-indexer.1.log') -Force
}

`$backoff = 2
while (`$true) {
    `$started = Get-Date
    "[`$(`$started.ToString('o'))] starting live indexer against $BaseUrl" | Out-File -FilePath `$log -Append -Encoding utf8

    # The heartbeat is what tells you the follower is alive without reading the
    # log. A monitor that only checks whether the process exists cannot tell a
    # working follower from one stuck reconnecting.
    @{
        state      = 'RUNNING'
        started_at = `$started.ToString('o')
        base_url   = '$BaseUrl'
        pid        = `$PID
    } | ConvertTo-Json | Out-File -FilePath `$heartbeat -Encoding utf8

    & '$node' '$runner' *>> `$log

    `$exit = `$LASTEXITCODE
    `$ranFor = (New-TimeSpan -Start `$started -End (Get-Date)).TotalSeconds
    "[`$((Get-Date).ToString('o'))] exited with `$exit after `$([int]`$ranFor)s" | Out-File -FilePath `$log -Append -Encoding utf8

    @{
        state       = 'RESTARTING'
        exited_at   = (Get-Date).ToString('o')
        exit_code   = `$exit
        ran_seconds = [int]`$ranFor
    } | ConvertTo-Json | Out-File -FilePath `$heartbeat -Encoding utf8

    # A process that ran for a while and then died is a transient fault: retry
    # promptly. One that dies immediately is misconfigured, and hammering it
    # every two seconds would bury the reason in log noise, so back off to a
    # minute and let the log be readable.
    if (`$ranFor -gt 60) { `$backoff = 2 } else { `$backoff = [Math]::Min(`$backoff * 2, 60) }
    Start-Sleep -Seconds `$backoff
}
"@

Set-Content -Path $wrapper -Value $wrapperBody -Encoding utf8

# ------------------------------------------------------------------- task
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Host "Replacing the existing $TaskName task."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`"" `
    -WorkingDirectory $repoRoot

if ($RunOnLogon) {
    $trigger = New-ScheduledTaskTrigger -AtLogOn
} else {
    $trigger = New-ScheduledTaskTrigger -AtStartup
}

# ExecutionTimeLimit 0 means "never kill it" — this task is meant to run for
# weeks. RestartCount covers the case where the wrapper itself dies.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Follows the Robinhood Chain head over WebSocket and drives FOLDMARK ingestion into Neon Postgres via the deployment's ingest route. Primary writer; the daily Vercel cron is only a fallback. Installed by scripts/install-live-indexer.ps1." | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installed $TaskName."
Write-Host "  target      $BaseUrl"
Write-Host "  trigger     $(if ($RunOnLogon) { 'at logon' } else { 'at startup' })"
Write-Host "  log         $LogDirectory\live-indexer.log"
Write-Host "  heartbeat   $LogDirectory\heartbeat.json"
Write-Host ""
Write-Host "Check it is alive:"
Write-Host "  Get-Content '$LogDirectory\live-indexer.log' -Tail 20 -Wait"
Write-Host "  Get-Content '$LogDirectory\heartbeat.json' | ConvertFrom-Json"
Write-Host ""
Write-Host "Remove it:"
Write-Host "  .\scripts\install-live-indexer.ps1 -Uninstall"
