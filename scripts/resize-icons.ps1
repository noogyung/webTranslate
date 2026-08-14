Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\icons\icon128.png"
# 먼저 원본 이미지를 메모리로 복사하여 파일 락 방지
$bytes = [System.IO.File]::ReadAllBytes($sourcePath)
$ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
$srcImg = [System.Drawing.Image]::FromStream($ms)

$sizes = @(16, 48, 128)

foreach ($size in $sizes) {
    $destImg = New-Object System.Drawing.Bitmap $size, $size
    $graphic = [System.Drawing.Graphics]::FromImage($destImg)
    $graphic.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphic.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphic.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphic.DrawImage($srcImg, 0, 0, $size, $size)
    
    $outPath = Join-Path $PSScriptRoot "..\icons\icon$size.png"
    $destImg.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImg.Dispose()
    $graphic.Dispose()
    Write-Host "Generated: $outPath ($size x $size)"
}

$srcImg.Dispose()
$ms.Dispose()
