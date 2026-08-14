Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\noogs\.gemini\antigravity\brain\12a59714-c6f5-483b-9049-a4df31cecf2a\translator_app_icon_1786716041731.jpg"
$destDir = "D:\Noogs\NextCloud\Projects\WebTranslator\icons"

$bytes = [System.IO.File]::ReadAllBytes($srcPath)
$ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
$srcBitmap = New-Object System.Drawing.Bitmap($ms)

$width = $srcBitmap.Width
$height = $srcBitmap.Height

# 중앙 아이콘 영역 추출 (약 13% 여백 제거)
$cropX = [int]($width * 0.13)
$cropY = [int]($height * 0.13)
$cropWidth = [int]($width * 0.74)
$cropHeight = [int]($height * 0.74)

$cropRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropWidth, $cropHeight
$croppedBitmap = $srcBitmap.Clone($cropRect, $srcBitmap.PixelFormat)

function Create-RoundedIcon($source, $size, $radiusRatio = 0.22) {
    $result = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($result)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $r = [int]($size * $radiusRatio)
    $d = $r * 2
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.SetClip($path)
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.ResetClip()

    $path.Dispose()
    $g.Dispose()
    return $result
}

$sizes = @(16, 48, 128)

foreach ($size in $sizes) {
    $icon = Create-RoundedIcon $croppedBitmap $size 0.22
    $outPath = Join-Path $destDir "icon$size.png"
    $icon.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()
    Write-Host "Generated Clean Rounded Icon: $outPath ($size x $size)"
}

$croppedBitmap.Dispose()
$srcBitmap.Dispose()
$ms.Dispose()
