<?php
/**
 * save.php
 *
 * Receives a base64-encoded cropped image via AJAX POST,
 * saves it to /uploads/ with a unique filename, and returns
 * a JSON response.
 */

header('Content-Type: application/json');

/* --- Configuration --- */
$uploadDir = __DIR__ . '/uploads/';
$allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

/* --- Ensure uploads directory exists --- */
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode([
            'status'  => false,
            'message' => 'Failed to create uploads directory.'
        ]);
        exit;
    }
}

/* --- Validate request --- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        'status'  => false,
        'message' => 'Invalid request method.'
    ]);
    exit;
}

$imageData = $_POST['image'] ?? '';

if (empty($imageData)) {
    echo json_encode([
        'status'  => false,
        'message' => 'No image data received.'
    ]);
    exit;
}

/* --- Decode base64 --- */
$parts = explode(',', $imageData);
if (count($parts) < 2) {
    echo json_encode([
        'status'  => false,
        'message' => 'Invalid image data format.'
    ]);
    exit;
}

$decoded = base64_decode($parts[1], true);
if ($decoded === false) {
    echo json_encode([
        'status'  => false,
        'message' => 'Base64 decoding failed.'
    ]);
    exit;
}

/* --- Validate mime type --- */
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_buffer($finfo, $decoded);
finfo_close($finfo);

if (!in_array($mime, $allowedMimes)) {
    echo json_encode([
        'status'  => false,
        'message' => 'Invalid image type. Allowed: JPG, PNG, WEBP.'
    ]);
    exit;
}

/* --- Determine extension --- */
$extMap = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];
$ext = $extMap[$mime] ?? 'jpg';

/* --- Generate unique filename --- */
$filename = 'image_' . uniqid() . '_' . time() . '.' . $ext;
$filepath = $uploadDir . $filename;

/* --- Save file --- */
if (file_put_contents($filepath, $decoded) === false) {
    echo json_encode([
        'status'  => false,
        'message' => 'Failed to write file to disk.'
    ]);
    exit;
}

/* --- Return success --- */
echo json_encode([
    'status'  => true,
    'message' => 'Image saved successfully',
    'file'    => 'uploads/' . $filename
]);
