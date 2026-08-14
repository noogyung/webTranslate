Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class StoreScreenshotGenerator
{
    public static void GenerateAll(string imgDir, string outDir)
    {
        Directory.CreateDirectory(outDir);

        GenerateScreenshot1(Path.Combine(imgDir, "ScreenShot-WebTranslate01.png"), Path.Combine(outDir, "screenshot_1_fullpage_1280x800.png"));
        GenerateScreenshot2(Path.Combine(imgDir, "ScreenShot-WebTranslate01.png"), Path.Combine(imgDir, "ScreenShot-WebTranslate02.png"), Path.Combine(outDir, "screenshot_2_popup_1280x800.png"));
        GenerateScreenshot3(Path.Combine(imgDir, "ScreenShot-WebTranslate03.png"), Path.Combine(imgDir, "ScreenShot-WebTranslate02.png"), Path.Combine(outDir, "screenshot_3_options_1280x800.png"));
    }

    private static Bitmap CreateBaseCanvas()
    {
        Bitmap canvas = new Bitmap(1280, 800, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(canvas))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            using (LinearGradientBrush brush = new LinearGradientBrush(new Point(0, 0), new Point(1280, 800), ColorTranslator.FromHtml("#0b0f19"), ColorTranslator.FromHtml("#141d2e")))
            {
                g.FillRectangle(brush, 0, 0, 1280, 800);
            }

            using (LinearGradientBrush glow = new LinearGradientBrush(new Point(0, 0), new Point(1280, 300), Color.FromArgb(45, 59, 130, 246), Color.FromArgb(0, 59, 130, 246)))
            {
                g.FillRectangle(glow, 0, 0, 1280, 300);
            }
        }
        return canvas;
    }

    private static GraphicsPath CreateRoundedRectanglePath(Rectangle rect, int radius)
    {
        GraphicsPath path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void DrawCard(Graphics g, Image img, Rectangle destRect, int radius)
    {
        // Shadow
        Rectangle shadowRect = new Rectangle(destRect.X - 8, destRect.Y + 10, destRect.Width + 16, destRect.Height + 16);
        using (GraphicsPath shadowPath = CreateRoundedRectanglePath(shadowRect, radius + 2))
        using (SolidBrush shadowBrush = new SolidBrush(Color.FromArgb(120, 0, 0, 0)))
        {
            g.FillPath(shadowBrush, shadowPath);
        }

        // Image Clip
        using (GraphicsPath clipPath = CreateRoundedRectanglePath(destRect, radius))
        {
            GraphicsState state = g.Save();
            g.SetClip(clipPath);
            g.DrawImage(img, destRect);
            g.Restore(state);

            // Border
            using (Pen borderPen = new Pen(Color.FromArgb(50, 255, 255, 255), 1.5f))
            {
                g.DrawPath(borderPen, clipPath);
            }
        }
    }

    private static Bitmap CropImage(Image src, Rectangle cropRect)
    {
        Bitmap bmp = new Bitmap(cropRect.Width, cropRect.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.DrawImage(src, new Rectangle(0, 0, cropRect.Width, cropRect.Height), cropRect, GraphicsUnit.Pixel);
        }
        return bmp;
    }

    private static void GenerateScreenshot1(string srcPath, string outPath)
    {
        using (Bitmap canvas = CreateBaseCanvas())
        using (Graphics g = Graphics.FromImage(canvas))
        using (Image src = Image.FromFile(srcPath))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;

            // Crop upper 820px of Steam translate screenshot
            using (Bitmap cropped = CropImage(src, new Rectangle(0, 0, src.Width, Math.Min(820, src.Height))))
            {
                int targetH = 720;
                int targetW = (int)(cropped.Width * ((double)targetH / cropped.Height));
                int targetX = (1280 - targetW) / 2;
                int targetY = 40;

                DrawCard(g, cropped, new Rectangle(targetX, targetY, targetW, targetH), 14);
            }

            canvas.Save(outPath, ImageFormat.Png);
        }
    }

    private static void GenerateScreenshot2(string bgPath, string popPath, string outPath)
    {
        using (Bitmap canvas = CreateBaseCanvas())
        using (Graphics g = Graphics.FromImage(canvas))
        using (Image bg = Image.FromFile(bgPath))
        using (Image pop = Image.FromFile(popPath))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;

            // Background Webpage
            using (Bitmap croppedBg = CropImage(bg, new Rectangle(0, 0, bg.Width, Math.Min(900, bg.Height))))
            {
                DrawCard(g, croppedBg, new Rectangle(50, 40, 760, 720), 14);
            }

            // Foreground Popup Menu
            double popScale = 660.0 / pop.Height;
            int popW = (int)(pop.Width * popScale);
            int popH = 660;
            int popX = 850;
            int popY = 70;

            DrawCard(g, pop, new Rectangle(popX, popY, popW, popH), 16);

            canvas.Save(outPath, ImageFormat.Png);
        }
    }

    private static void GenerateScreenshot3(string optPath, string popPath, string outPath)
    {
        using (Bitmap canvas = CreateBaseCanvas())
        using (Graphics g = Graphics.FromImage(canvas))
        using (Image opt = Image.FromFile(optPath))
        using (Image pop = Image.FromFile(popPath))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;

            // Left: Options Screen
            using (Bitmap croppedOpt = CropImage(opt, new Rectangle(0, 0, opt.Width, Math.Min(1150, opt.Height))))
            {
                int optH = 720;
                int optW = (int)(croppedOpt.Width * ((double)optH / croppedOpt.Height));
                int optX = 130;
                int optY = 40;

                DrawCard(g, croppedOpt, new Rectangle(optX, optY, optW, optH), 14);

                // Right: Popup Menu
                int popH = 630;
                int popW = (int)(pop.Width * ((double)popH / pop.Height));
                int popX = optX + optW + 60;
                int popY = 85;

                DrawCard(g, pop, new Rectangle(popX, popY, popW, popH), 16);
            }

            canvas.Save(outPath, ImageFormat.Png);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

$imgDir = "D:\Noogs\NextCloud\Projects\WebTranslator\images"
$outDir = "D:\Noogs\NextCloud\Projects\WebTranslator\dist\screenshots"
[StoreScreenshotGenerator]::GenerateAll($imgDir, $outDir)
Write-Host "Done! Screenshots generated in $outDir"
