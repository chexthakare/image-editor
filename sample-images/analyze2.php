<?php
function analyze($path, $name) {
    $img = imagecreatefromjpeg($path);
    $w = imagesx($img);
    $h = imagesy($img);
    
    // Sample brightness at center region (document interior)
    $cx = (int)($w/2); $cy = (int)($h/2);
    $r = (int)(min($w,$h)*0.15);
    $sumCenter = 0; $nCenter = 0;
    $sumCornerTL = 0; $nTL = 0;
    $sumCornerBR = 0; $nBR = 0;
    
    for ($y = $cy-$r; $y <= $cy+$r; $y++) {
        for ($x = $cx-$r; $x <= $cx+$r; $x++) {
            if ($x>=0 && $x<$w && $y>=0 && $y<$h) {
                $rgb = imagecolorat($img, $x, $y);
                $b = ($rgb >> 0) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $r2 = ($rgb >> 16) & 0xFF;
                $gray = (int)(0.299*$r2 + 0.587*$g + 0.114*$b);
                $sumCenter += $gray; $nCenter++;
            }
        }
    }
    
    // Sample brightness at corners (background)
    $m = (int)(min($w,$h)*0.05);
    for ($y = 0; $y < $m; $y++) {
        for ($x = 0; $x < $m; $x++) {
            $rgb = imagecolorat($img, $x, $y);
            $b = ($rgb >> 0) & 0xFF; $g = ($rgb >> 8) & 0xFF; $r2 = ($rgb >> 16) & 0xFF;
            $gray = (int)(0.299*$r2 + 0.587*$g + 0.114*$b);
            $sumCornerTL += $gray; $nTL++;
        }
    }
    for ($y = $h-$m; $y < $h; $y++) {
        for ($x = $w-$m; $x < $w; $x++) {
            $rgb = imagecolorat($img, $x, $y);
            $b = ($rgb >> 0) & 0xFF; $g = ($rgb >> 8) & 0xFF; $r2 = ($rgb >> 16) & 0xFF;
            $gray = (int)(0.299*$r2 + 0.587*$g + 0.114*$b);
            $sumCornerBR += $gray; $nBR++;
        }
    }
    
    $avgCenter = $sumCenter / $nCenter;
    $avgTL = $sumCornerTL / $nTL;
    $avgBR = $sumCornerBR / $nBR;
    
    echo "$name ($w x $h): center_avg=$avgCenter tl_avg=$avgTL br_avg=$avgBR diff_center_tl=" . ($avgCenter - $avgTL) . " diff_center_br=" . ($avgCenter - $avgBR) . PHP_EOL;
    imagedestroy($img);
}

$d = __DIR__;
analyze("$d/img-1.jpeg", "img-1");
analyze("$d/img-2.jpeg", "img-2");
analyze("$d/img-3.jpeg", "img-3");
analyze("$d/img-4.jpeg", "img-4");
?>