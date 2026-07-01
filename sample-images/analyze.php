<?php
$files = ['img-1.jpeg','img-2.jpeg','img-3.jpeg','img-4.jpeg'];
foreach ($files as $f) {
    $p = __DIR__ . '/' . $f;
    $info = getimagesize($p);
    echo $f . ': ' . $info[0] . 'x' . $info[1] . ' mime=' . $info['mime'] . PHP_EOL;
}
?>