<?php
header('Content-Type: application/json');

$url = $_GET['url'] ?? '';

if (empty($url)) {
    echo json_encode(['status' => false, 'message' => 'No URL provided.']);
    exit;
}

if (!filter_var($url, FILTER_VALIDATE_URL)) {
    echo json_encode(['status' => false, 'message' => 'Invalid URL format.']);
    exit;
}

$allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
]);
$data = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($httpCode !== 200 || $data === false) {
    echo json_encode(['status' => false, 'message' => 'Failed to fetch URL (HTTP ' . $httpCode . ').']);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_buffer($finfo, $data);
finfo_close($finfo);

if (!in_array($mime, $allowedMimes)) {
    echo json_encode([
        'status'  => false,
        'message' => 'URL does not point to a valid image. Allowed: JPG, PNG, WEBP. Detected: ' . $mime
    ]);
    exit;
}

$base64 = base64_encode($data);
$dataUri = 'data:' . $mime . ';base64,' . $base64;

echo json_encode([
    'status'  => true,
    'dataUri' => $dataUri,
    'mime'    => $mime
]);
