# Integration Guide: Image Editor → Staffing Connect Admin

## Overview

This guide explains how to integrate the Image Editor (Crop, Rotate & Transform) into the Staffing Connect Admin portal so that **existing uploaded document images can be edited and replaced in-place**.

### What the Integration Does

1. User views an uploaded document image in the compliance modal
2. A new **"Edit with Image Editor"** button appears (for image types only)
3. Clicking it opens the Image Editor in a new tab, loading the existing image via URL
4. **Auto corner detection** runs immediately — the document is detected using a lightweight ML model (DocCornerNet, ~2.6MB, runs 100% in-browser via TensorFlow.js). Falls back to OpenCV if ML fails.
5. User adjusts the perspective corners if needed, then clicks **Apply** to flatten the document
6. User enhances the image with **filters** (Auto, Gray, B&W) and **brightness/contrast sliders** — real-time CSS preview on the workspace, pixel-accurate on output
7. User crops, rotates, flips, or zooms the image
8. User clicks **"Save & Replace"** — the edited image is sent back and **overwrites the original file** (both locally and on S3)
9. The editor tab closes and the compliance modal refreshes to show the updated image

---

## Prerequisites

- Both projects run on the same server (same XAMPP/domain)
- Staffing Connect uses **CodeIgniter 3**
- PHP 7.2+ with `curl` and `finfo` extensions enabled
- Write permissions on `uploads/candidate/compliance/` directory
- AWS SDK configured (for S3 re-upload)

---

## Step 1: Deploy Image Editor Files

Copy the entire `image-editor/` folder into the Staffing Connect project root:

```
staffingconnect_admin/
├── image-editor/          ← copy here
│   ├── index.php
│   ├── save.php
│   ├── save-replace.php
│   ├── proxy.php
│   ├── .htaccess
│   ├── assets/
│   │   ├── css/style.css
│   │   ├── js/app.js
│   │   └── models/           ← ML model for auto corner detection
│   │       └── doccornernet/
│   │           ├── model.json
│   │           └── group1-shard1of1.bin
│   └── uploads/
```

The editor will be accessible at:

```
http://localhost/staffingconnect_admin/image-editor/
```

The existing `proxy.php` is already configured to fetch images from any URL (used to load the existing document image into the editor).

> **ML Model Note:** The DocCornerNet model (~2.6MB, MobileNetV2 backbone, 224×224 input) runs 100% client-side via TensorFlow.js 4.21.0 loaded from CDN. No server-side ML processing is needed. If the model files are missing or fail to load, the editor falls back gracefully to 13+ OpenCV strategies (loaded from CDN) for corner detection.

---

## Step 2: Create the Save-&-Replace Endpoint

Create a new file at `staffingconnect_admin/image-editor/save-replace.php`:

```php
<?php
/**
 * save-replace.php
 *
 * Receives an edited image from the Image Editor and overwrites the
 * original file — both the local copy and the S3 object.
 *
 * Expected POST parameters:
 *   image      - base64-encoded image data URI
 *   fileUrl    - the original file URL (to derive the S3/local path)
 *   recordId   - (optional) DB record ID for logging
 *   userId     - (optional) candidate user ID
 *   docType    - (optional) document type key (e.g., 'address1')
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../application/config/constants.php';
require_once __DIR__ . '/../system/core/Common.php';

/* --- Validate --- */
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

/* --- Validate MIME --- */
$finfo   = finfo_open(FILEINFO_MIME_TYPE);
$mime    = finfo_buffer($finfo, $decoded);
finfo_close($finfo);

$allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mime, $allowedMimes)) {
    echo json_encode(['status' => false, 'message' => 'Invalid image type. Allowed: JPG, PNG, WEBP.']);
    exit;
}

/* --- Derive local file path from URL --- */
// Convert URL like http://localhost/staffingconnect_admin/uploads/candidate/compliance/87/filename.jpg
// to local path:   D:\xampp\htdocs\staffingconnect_admin\uploads\candidate\compliance\87\filename.jpg

$baseUrl     = 'http://localhost/staffingconnect_admin/';
$localPrefix = __DIR__ . '/../';  // staffconnect_admin root

if (strpos($fileUrl, $baseUrl) === 0) {
    $relativePath = substr($fileUrl, strlen($baseUrl));
    $localFile    = $localPrefix . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
} else {
    // Could be an S3 URL — extract the key portion
    $parsedUrl = parse_url($fileUrl);
    $pathParts = explode('/', ltrim($parsedUrl['path'] ?? '', '/'));
    // Find 'uploads' in the path and take everything from there
    $uploadsKey = array_search('uploads', $pathParts);
    if ($uploadsKey !== false) {
        $s3RelativePath = implode('/', array_slice($pathParts, $uploadsKey));
        $localFile = $localPrefix . str_replace('/', DIRECTORY_SEPARATOR, $s3RelativePath);
    } else {
        echo json_encode(['status' => false, 'message' => 'Could not determine file path from URL.']);
        exit;
    }
}

/* --- Overwrite local file --- */
$dir = dirname($localFile);
if (!is_dir($dir)) {
    echo json_encode(['status' => false, 'message' => 'Target directory does not exist.']);
    exit;
}

if (file_put_contents($localFile, $decoded) === false) {
    echo json_encode(['status' => false, 'message' => 'Failed to write local file.']);
    exit;
}

/* --- Re-upload to S3 (overwrite) --- */
try {
    // Load CodeIgniter to get AWS library access
    // (Or replicate the S3 upload logic directly)
    $ci = &get_instance();
    if ($ci && isset($ci->aws)) {
        // Derive the S3 key (path relative to bucket root)
        $s3Key = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', substr($localFile, strlen($localPrefix))), '/');
        $ci->aws->uploadToS3($decoded, '', $s3Key, [], $mime);
    }
} catch (Exception $e) {
    // Log but don't fail — local file was already replaced
    error_log('S3 re-upload failed: ' . $e->getMessage());
}

echo json_encode([
    'status'  => true,
    'message' => 'Image replaced successfully.',
    'fileUrl' => $fileUrl
]);
```

> **Note:** If your environment uses S3 URL paths differently, adjust the path extraction logic in the `save-replace.php` file accordingly. The key requirement is that it correctly maps the file URL back to the local filesystem path and the S3 object key.

---

## Step 3: Add "Edit" Button to the Document Viewer

### 3a. Modify `Common.php`

Open `application/controllers/Common.php` and find the `view_uploaded_file()` method (approx line 739).

Add an "Edit" button after the `<img>` tag for image types:

```php
// In view_uploaded_file() method — modify the image branch:
} else {
    echo '<img src="' . $finalArray['fileURL'] . '" class="" style="height: auto;" onload="closeWindow()"></img>';

    // ─── ADD: Edit button for images ────────────────────────────
    $editUrl = base_url() . 'image-editor/index.php?mode=replace'
             . '&fileUrl=' . urlencode($finalArray['fileURL'])
             . '&fileExt=' . urlencode($finalArray['fileExtension'])
             . '&fileName=' . urlencode($finalArray['viewFileName'] ?? 'Document');

    echo '<div class="text-center mt-3 mb-3">';
    echo   '<a href="' . $editUrl . '" target="_blank" class="btn btn-warning btn-sm">';
    echo     '<i class="fa fa-pencil"></i> Edit with Image Editor';
    echo   '</a>';
    echo '</div>';
    // ─── END ────────────────────────────────────────────────────
}
```

> **Important:** Also update the JavaScript `viewUploadedFile()` call in `header.php` to pass the file name. Currently it only passes `fileUrl` and `fileExtension`. Change the AJAX data to include `viewFileName`:

```javascript
// In header.php, viewUploadedFile() function:
$.ajax({
    url: base_url + "viewUploadedFile",
    type: 'POST',
    data: {
        "fileURL": fileUrl,
        "fileExtension": fileExtension,
        "viewFileName": viewFileName   // ← add this
    },
    success: function(data) {
        // ...
    },
});
```

### 3b. Update `Common.php` Controller to accept `viewFileName`

In `view_uploaded_file()`, the POST data already captures all keys via `$finalArray = $_POST;`, so `viewFileName` will be available automatically.

---

## Step 4: Image Editor URL Parameter Handling

The Image Editor's `app.js` already supports loading images from a URL (via `proxy.php`). When opened from the Staffing Connect with `?mode=replace` query params, it needs to detect this mode and show a **"Save & Replace"** button.

The `index.php` reads query parameters from the URL:

```
http://localhost/staffingconnect_admin/image-editor/?mode=replace&fileUrl=...&fileExt=...&fileName=...
```

The editor will:
1. Detect `mode=replace` on page load
2. Auto-load the image from `fileUrl` via `proxy.php`
3. Show a "Save & Replace" button (in addition to the normal Save/Download)
4. When clicked, POST the edited image to `save-replace.php` with the `fileUrl` and other params
5. On success, show a toast and close the tab/window

This logic is already built into the `app.js` and `index.php` files in the image-editor project.

---

## Step 5: Data Flow Summary

```
┌─────────────────────────────┐
│  Compliance Modal (View)    │
│  - Shows image in <img>     │
│  - "Edit with Image Editor" │
└──────────┬──────────────────┘
           │ click — opens new tab with URL params
           ▼
┌───────────────────────────────────┐
│  Image Editor                     │
│  ┌─ Auto step ─────────────────┐  │
│  │ Loads image via proxy.php   │  │
│  │ Auto corner detection (ML)  │  │
│  │ Shows draggable corner pins │  │
│  └─────────────────────────────┘  │
│  ┌─ User steps ───────────────┐  │
│  │ 1. Adjust corners → Apply  │  │
│  │ 2. Enhance (Auto/Gray/B&W) │  │
│  │    + Brightness/Contrast   │  │
│  │ 3. Crop / Rotate / Flip    │  │
│  │ 4. Click "Save & Replace"  │  │
│  └─────────────────────────────┘  │
└──────────┬────────────────────────┘
           │ AJAX POST to save-replace.php
           ▼
┌─────────────────────────────┐
│  save-replace.php           │
│  - Decodes base64           │
│  - Overwrites local file    │
│  - Re-uploads to S3 (same   │
│    key, overwriting)        │
│  - Returns success JSON     │
└──────────┬──────────────────┘
           │ Response received
           ▼
┌─────────────────────────────┐
│  Image Editor               │
│  - Shows "Replaced!" toast  │
│  - Closes tab automatically │
└─────────────────────────────┘
           │ User returns to compliance tab
           ▼
┌─────────────────────────────┐
│  Compliance Modal (refresh) │
│  - Shows updated image      │
└─────────────────────────────┘
```

---

## Security Considerations

1. **Authentication**: The `save-replace.php` endpoint should verify the user is logged in. You can check the CodeIgniter session at the top of the file:
   ```php
   session_start();
   if (empty($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
       echo json_encode(['status' => false, 'message' => 'Unauthorized.']);
       exit;
   }
   ```

2. **File URL validation**: Whitelist allowed base URLs to prevent arbitrary file overwrites:
   ```php
   $allowedPrefixes = [
       'http://localhost/staffingconnect_admin/uploads/candidate/compliance/',
       'https://admin.staffingconnect.co.uk/uploads/candidate/compliance/',
   ];
   $isAllowed = false;
   foreach ($allowedPrefixes as $prefix) {
       if (strpos($fileUrl, $prefix) === 0) { $isAllowed = true; break; }
   }
   if (!$isAllowed) { /* reject */ }
   ```

3. **File size limits**: Add a size check on the decoded base64 data before writing.

4. **MIME validation**: Already implemented in `save-replace.php` using `finfo`.

5. **S3 credentials**: Ensure the CI instance or direct AWS SDK call has proper credentials configured.

---

## Testing the Integration

1. Navigate to `http://localhost/staffingconnect_admin/candidate/documentCompliance/{userId}`
2. Find a row with an image document (JPG/PNG)
3. Click the **View** (eye) button to open the modal
4. Verify the image displays and the **"Edit with Image Editor"** button appears below it
5. Click the edit button — the Image Editor opens in a new tab with the image loaded
6. **Auto corner detection** should fire after ~500ms — check for corner handle pins on the image. If no corners appear, click **"Detect Corners"** manually.
7. Adjust corner handles if needed, then click **"Apply"** — the image is perspective-corrected and reloaded
8. **Test enhancement filters**: click **Auto**, **Gray**, or **B&W** in the Enhance section — see real-time CSS preview on the workspace
9. **Test brightness/contrast sliders**: drag the sliders — the workspace updates in real-time
10. **Verify output accuracy**: click **Preview** to see the pixel-accurate filtered result
11. Perform any additional edits (crop, rotate, etc.)
12. Click **"Save & Replace"** — verify: success toast appears, tab auto-closes
13. Go back to the compliance tab, refresh the modal — the image should reflect all edits (perspective correction + filters)

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| Image won't load in editor | CORS or proxy issue | Check `proxy.php` can reach the file URL. For localhost S3 signed URLs, ensure the signed URL is valid (5-min window). |
| Save fails with "Could not determine path" | URL format doesn't match expected pattern | Update the path extraction logic in `save-replace.php` to match your URL structure. |
| S3 re-upload fails | CI instance not available or AWS credentials missing | Check that `get_instance()` works (run `save-replace.php` via CI router, not direct). Or move the logic into a proper CI controller method. |
| Edit button not appearing | `view_uploaded_file()` not updated | Verify the code changes in Step 3 were applied correctly. |
| "Save & Replace" button missing | Query params not detected | Check the URL params are being passed correctly in the edit button link. |
| Auto corner detection not working | ML model files missing or TF.js CDN blocked | Check browser console for `[ML]` messages. If model load fails, the editor falls back to OpenCV.js (loaded from `cdn.jsdelivr.net`). Ensure the `assets/models/doccornernet/` folder contains both `model.json` and `group1-shard1of1.bin`. |
| Filters have no visible effect on workspace | Cropper.js render layer mismatch | The CSS filter is applied to `.cropper-view-box`, `.cropper-canvas`, and `#cropImage`. If the workspace doesn't update, click **Preview** to see the pixel-accurate result in the modal. |

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| `image-editor/save-replace.php` | **NEW** — Handles overwriting the original file |
| `image-editor/assets/models/doccornernet/model.json` | **NEW** — ML model for auto corner detection (Graph model format) |
| `image-editor/assets/models/doccornernet/group1-shard1of1.bin` | **NEW** — ML model weight shard |
| `application/controllers/Common.php` | **EDIT** — Add Edit button after image in `view_uploaded_file()` |
| `application/views/layout/header.php` | **EDIT** — Add `viewFileName` to AJAX POST data in `viewUploadedFile()` |
| `image-editor/index.php` | **Already updated** — Reads `mode`, `fileUrl`, `fileExt`, `fileName` from URL; loads TF.js 4.21.0 + OpenCV.js 4.9.0 from CDN |
| `image-editor/assets/js/app.js` | **Already updated** — 3100+ lines: ML auto-detect, 13+ OpenCV strategies, perspective overlay, enhancement filters (Auto/Gray/B&W), brightness/contrast sliders, real-time CSS preview, Save & Replace integration |

---

## Alternative: CodeIgniter Controller Approach

If you prefer a cleaner CodeIgniter integration over a standalone `save-replace.php`, you can add a method to `Common.php`:

```php
public function save_replaced_image()
{
    // Same logic as save-replace.php but using CI's
    // $this->load->library('aws') and session validation
}
```

And route it in `config/routes.php`:
```php
$route['image-editor/save-replace'] = 'common/save_replaced_image';
```

Then set the editor's save endpoint to `base_url + 'image-editor/save-replace'` instead.

---

For any questions or issues, refer to the Image Editor project's `README` or contact the development team.
