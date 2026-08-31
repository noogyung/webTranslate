Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Get-ChildItem (Join-Path $projectRoot "assets\store\*.png") | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
    $img = [System.Drawing.Image]::FromStream($ms)
    Write-Host "$($_.Name): $($img.Width) x $($img.Height)"
    $img.Dispose()
    $ms.Dispose()
}
