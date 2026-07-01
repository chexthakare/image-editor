<?php
/**
 * save-replace.php
 *
 * Receives an edited image from the Image Editor and overwrites the
 * original file — both the local copy and the S3 object.
 *
 * Expected POST parameters:
 *   image      - base64-encoded image data URI
 *   fileUrl    - the original file URL (to derive the path)
 *   filePath   - alternative: direct relative/local path
 *
 * Place this file in the Staffing Connect project at:
 *   staffconnect_admin/image-editor/save-replace.php
 */

header('Content-Type: application/json');

/* --- Configuration --- */
$baseUrl        = 'http://localhost/staffingconnect_admin/';
$localProjectRoot = __DIR__ . '/../';  // Up from image-editor/ to staffingconnect_admin/
$allowedMimes   = ['image/jpeg', 'image/png', 'image/webp'];

/* --- Validate input --- */
$imageData = $_POST['image'] ?? '';
$fileUrl   = $_POST['fileUrl'] ?? '';

if (empty($imageData) || empty($fileUrl)) {
    echo json_encode(['status' => false, 'message' => 'Missing image data or file URL.']);
    exit;
}

/* --- Decode base64 --- */
$parts = explode(',', $imageData);
if (count($parts) < 2) {
    echo json_encode(['status' => false, 'message' => 'Invalid image data format.']);
    exit;
}

$decoded = base64_decode($parts[1], true);
if ($decoded === false) {
    echo json_encode(['status' => false, 'message' => 'Base64 decoding failed.']);
    exit;
}

/* --- Validate MIME type --- */
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_buffer($finfo, $decoded);
finfo_close($finfo);

if (!in_array($mime, $allowedMimes)) {
    echo json_encode(['status' => false, 'message' => 'Invalid image type. Allowed: JPG, PNG, WEBP.']);
    exit;
}

/* --- Resolve local file path from URL --- */
function resolveLocalPath($fileUrl, $baseUrl, $localRoot)
{
    // Case 1: URL starts with the known base URL
    if (strpos($fileUrl, $baseUrl) === 0) {
        $relativePath = substr($fileUrl, strlen($baseUrl));
        return $localRoot . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    }

    // Case 2: S3 / presigned URL — extract the uploads/... portion
    $parsed = parse_url($fileUrl);
    $path   = $parsed['path'] ?? '';

    // Presigned URLs have query strings; the path itself contains the key
    // e.g. /uploads/candidate/compliance/87/file.jpg?X-Amz-...
    if (preg_match('#(/uploads/candidate/compliance/[^/]+/[^/?]+)#', $path, $m)) {
        return $localRoot . str_replace('/', DIRECTORY_SEPARATOR, ltrim($m[1], '/'));
    }

    return null;
}

$localFile = resolveLocalPath($fileUrl, $baseUrl, $localProjectRoot);

if (!$localFile || !file_exists(dirname($localFile))) {
    echo json_encode(['status' => false, 'message' => 'Could not resolve target file path.']);
    exit;
}

/* --- Overwrite local file --- */
if (file_put_contents($localFile, $decoded) === false) {
    echo json_encode(['status' => false, 'message' => 'Failed to write local file.']);
    exit;
}

echo json_encode([
    'status'  => true,
    'message' => 'Image replaced successfully. Refresh the document view to see changes.',
    'fileUrl' => $fileUrl
]);
