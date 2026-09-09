param([Parameter(Mandatory=$true)][string]$Config, [ValidateSet('preflight','build')][string]$Mode)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$c = Get-Content $Config -Raw | ConvertFrom-Json
$work = $c.work.Replace('/', '\')
$root = [IO.Path]::GetPathRoot($work)
$disk = Get-PSDrive -Name $root.Substring(0,1)
if ($disk.Free -lt ($c.minFreeGB * 1GB)) { throw "Windows build drive needs $($c.minFreeGB) GB free; available $([math]::Round($disk.Free/1GB,2)) GB. No files were deleted." }
if (-not (Test-Path $c.key)) { throw 'Updater key is missing on Windows' }
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw 'MSVC Build Tools vcvars64.bat is missing' }
# Process-scoped proxy only; the existing host-only CONNECT proxy must be running.
if ($c.proxy) { $env:npm_config_proxy=$c.proxy; $env:npm_config_https_proxy=$c.proxy }
& npm.cmd ping --fetch-timeout=15000 --fetch-retries=0
if ($LASTEXITCODE -ne 0) { throw 'Windows npm cannot reach the registry; check the host CONNECT proxy' }
if ($Mode -eq 'preflight') { Write-Output 'Windows preflight passed'; exit 0 }
$archive = "$work.tar.gz"
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $c.archiveSha256) { throw 'Uploaded source hash mismatch' }
if (-not (Test-Path $work)) {
  $extraction = "$work.extract-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory $extraction | Out-Null
  & tar.exe -xzf $archive -C $extraction
  if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed; inspect incomplete extraction directory' }
  Move-Item $extraction $work
}
$id = Get-Content "$work\BUILD-IDENTITY.json" -Raw | ConvertFrom-Json
if ($id.distribution -ne $c.distribution -or $id.upstream -ne $c.upstream -or $id.version -ne $c.version) { throw 'Mixed source identity' }
Write-Output "Building $($id.distribution), upstream $($id.upstream)"
$environment = & $env:ComSpec /d /s /c ('"' + $vcvars + '" >nul && set')
if ($LASTEXITCODE -ne 0) { throw 'MSVC environment failed' }
foreach ($line in $environment) { $sep=$line.IndexOf('='); if($sep -gt 0){ Set-Item -Path "Env:$($line.Substring(0,$sep))" -Value $line.Substring($sep+1) } }
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:OFFICE_UPDATER_SIGNING_PRIVATE_KEY = $c.key
$env:NODE_OPTIONS = '--max-old-space-size=6144'
$env:CARGO_BUILD_JOBS = '3'
$env:TASK_CONCURRENCY = '2'
$target = "$work\als-office\apps\desktop\src-tauri\target"
$cacheLock = $null
try {
  if ($c.cache) {
    $cache = $c.cache.Replace('/', '\')
    New-Item -ItemType Directory -Force $cache | Out-Null
    $cacheLock = [IO.File]::Open("$cache.cubeoffice.lock",'OpenOrCreate','ReadWrite','None')
    if (Test-Path $target) {
      if ((Get-Item $target).Target -notcontains $cache) { throw 'Target points at an unexpected build cache' }
    } else { New-Item -ItemType Junction -Path $target -Target $cache | Out-Null }
  }
  Set-Location $work
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  # Native stderr is redirected by cmd, not PowerShell 5.1's ErrorActionPreference.
  $js = "process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD='';const r=require('child_process').spawnSync('npm.cmd',['run','desktop:build:win-x64'],{shell:true,stdio:'inherit',env:process.env});process.exit(r.status??1)"
  Set-Content -Encoding UTF8 "$work\run-release.cjs" $js
  & $env:ComSpec /d /s /c "node.exe run-release.cjs 2>&1"
  if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
  $installer = "$target\x86_64-pc-windows-msvc\release\bundle\nsis\CubeOffice_$($c.version)_x64-setup.exe"
  if ((Get-Item $installer).VersionInfo.FileVersion -notmatch ('^'+[regex]::Escape($c.version)+'(?:\.0)?$')) { throw 'Installer version mismatch' }
  if ((Get-Item "$installer.sig").Length -lt 1) { throw 'Missing updater signature' }
  $binaries = @("$target\x86_64-pc-windows-msvc\release\cubeoffice-app.exe", "$work\als-office\apps\desktop\src-tauri\binaries\cubeoffice-x86_64-pc-windows-msvc.exe")
  foreach ($path in $binaries) {
    $bytes=[IO.File]::ReadAllBytes($path); $offset=[BitConverter]::ToInt32($bytes,0x3c)
    if([BitConverter]::ToUInt16($bytes,$offset+4) -ne 0x8664){ throw "Wrong architecture: $path" }
  }
  & $binaries[1] help
  if ($LASTEXITCODE -ne 0) { throw 'CLI smoke check failed' }
  New-Item -ItemType Directory -Force "$work\out" | Out-Null
  Copy-Item $installer, "$installer.sig" -Destination "$work\out"
  @{distribution=$id.distribution;upstream=$id.upstream;version=$c.version;machine='0x8664';sha256=(Get-FileHash $installer -Algorithm SHA256).Hash.ToLower()} | ConvertTo-Json | Set-Content -Encoding UTF8 "$work\out\verification.json"
} finally { if($cacheLock){$cacheLock.Dispose()} }
exit 0
