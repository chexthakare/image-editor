<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Editor - Crop, Rotate & Transform</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<?php
/* ── Read integration params from URL ── */
$mode     = $_GET['mode']     ?? '';
$fileUrl  = $_GET['fileUrl']  ?? '';
$fileExt  = $_GET['fileExt']  ?? '';
$fileName = $_GET['fileName'] ?? '';
?>
<body>

<div class="app-container">
    <header class="app-header">
        <div class="container-fluid px-4">
            <div class="d-flex align-items-center">
                <i class="bi bi-image fs-3 me-2 text-primary"></i>
                <h1 class="h4 mb-0">Image Editor</h1>
            </div>
        </div>
    </header>

    <div class="editor-wrapper">
        <!-- LEFT PANEL: Image Workspace -->
        <div class="workspace-panel">
            <div class="workspace-inner">
                <div class="upload-placeholder" id="uploadPlaceholder">
                    <div class="text-center">
                        <i class="bi bi-cloud-arrow-up display-1 text-primary"></i>
                        <h3 class="mt-3">Drop an image here</h3>
                        <p class="text-muted">or click to browse</p>
                        <button class="btn btn-primary btn-lg px-5 mt-2" id="btnUploadTrigger">
                            <i class="bi bi-upload me-2"></i>Choose Image
                        </button>
                        <div class="mt-3">
                            <small class="text-muted">Supports JPG, PNG, WEBP</small>
                        </div>
                    </div>
                </div>
                <div class="crop-container d-none" id="cropContainer">
                    <img id="cropImage" src="">
                </div>
                <div class="perspective-overlay d-none" id="perspectiveOverlay">
                    <canvas id="perspectiveCanvas"></canvas>
                </div>
            </div>
        </div>

        <!-- RIGHT PANEL: Controls -->
        <div class="controls-panel">
            <div class="controls-scroll">
                <!-- Image Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-file-image me-1"></i>Image</h5>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-primary btn-sm" id="btnUpload">
                            <i class="bi bi-upload me-1"></i>Upload Image
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" id="btnReplace" disabled>
                            <i class="bi bi-arrow-repeat me-1"></i>Replace Image
                        </button>
                        <button class="btn btn-outline-danger btn-sm" id="btnReset" disabled>
                            <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
                        </button>
                    </div>
                    <div class="mt-2">
                        <label class="form-label small text-muted mb-1">Or load from URL</label>
                        <div class="input-group input-group-sm">
                            <input type="text" class="form-control" id="urlInput" placeholder="https://example.com/image.jpg">
                            <button class="btn btn-outline-primary" type="button" id="btnUrlLoad"><i class="bi bi-link-45deg me-1"></i>Load</button>
                        </div>
                    </div>
                </section>

                <!-- Crop Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-crop me-1"></i>Crop</h5>
                    <div class="btn-group-custom">
                        <button class="btn btn-outline-primary btn-sm crop-ratio active" data-ratio="free">
                            <i class="bi bi-crop"></i> Free
                        </button>
                        <button class="btn btn-outline-primary btn-sm crop-ratio" data-ratio="1">
                            1:1
                        </button>
                        <button class="btn btn-outline-primary btn-sm crop-ratio" data-ratio="4/3">
                            4:3
                        </button>
                        <button class="btn btn-outline-primary btn-sm crop-ratio" data-ratio="16/9">
                            16:9
                        </button>
                        <button class="btn btn-outline-primary btn-sm crop-ratio" data-ratio="original">
                            <i class="bi bi-arrow-up-left-circle"></i> Orig
                        </button>
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-outline-info btn-sm w-100" id="btnAutoDetect" disabled>
                            <i class="bi bi-magic me-1"></i>Auto Detect
                        </button>
                    </div>
                </section>

                <!-- Transform Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-arrow-leftright me-1"></i>Transform</h5>
                    <div class="btn-group-custom">
                        <button class="btn btn-outline-primary btn-sm" id="btnRotateLeft">
                            <i class="bi bi-arrow-counterclockwise"></i> Rotate L
                        </button>
                        <button class="btn btn-outline-primary btn-sm" id="btnRotateRight">
                            <i class="bi bi-arrow-clockwise"></i> Rotate R
                        </button>
                        <button class="btn btn-outline-primary btn-sm" id="btnFlipH">
                            <i class="bi bi-arrow-left-right"></i> Flip H
                        </button>
                        <button class="btn btn-outline-primary btn-sm" id="btnFlipV">
                            <i class="bi bi-arrow-up-down"></i> Flip V
                        </button>
                    </div>
                </section>

                <!-- Zoom Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-zoom-in me-1"></i>Zoom</h5>
                    <div class="btn-group-custom">
                        <button class="btn btn-outline-primary btn-sm" id="btnZoomIn">
                            <i class="bi bi-plus-circle"></i> Zoom In
                        </button>
                        <button class="btn btn-outline-primary btn-sm" id="btnZoomOut">
                            <i class="bi bi-dash-circle"></i> Zoom Out
                        </button>
                    </div>
                </section>

                <!-- Perspective Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-arrows-angle-expand me-1"></i>Perspective</h5>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-warning btn-sm" id="btnDetectCorners" disabled>
                            <i class="bi bi-magic me-1"></i>Detect Corners
                        </button>
                        <div class="d-flex gap-1">
                            <button class="btn btn-success btn-sm flex-fill" id="btnApplyTransform" disabled>
                                <i class="bi bi-check-lg me-1"></i>Apply
                            </button>
                            <button class="btn btn-outline-secondary btn-sm flex-fill d-none" id="btnCancelTransform">
                                <i class="bi bi-x-lg me-1"></i>Cancel
                            </button>
                        </div>
                    </div>
                </section>

                <!-- Enhance Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-sliders me-1"></i>Enhance</h5>
                    <div class="btn-group-custom effect-group">
                        <button class="btn btn-outline-secondary btn-sm filter-btn active" data-filter="none">
                            <i class="bi bi-image me-1"></i>Original
                        </button>
                        <button class="btn btn-outline-secondary btn-sm filter-btn" data-filter="clean">
                            <i class="bi bi-droplet me-1"></i>Auto
                        </button>
                        <button class="btn btn-outline-secondary btn-sm filter-btn" data-filter="gray">
                            <i class="bi bi-circle-half me-1"></i>Gray
                        </button>
                        <button class="btn btn-outline-secondary btn-sm filter-btn" data-filter="binarized">
                            <i class="bi bi-file-text me-1"></i>B&W
                        </button>
                    </div>
                    <div class="slider-group">
                        <div class="slider-row">
                            <label class="slider-label">Brightness</label>
                            <div class="slider-control">
                                <input type="range" class="slider-input" id="brightnessSlider" min="-50" max="50" value="0" step="1">
                                <span class="slider-value" id="brightnessVal">0</span>
                            </div>
                        </div>
                        <div class="slider-row">
                            <label class="slider-label">Contrast</label>
                            <div class="slider-control">
                                <input type="range" class="slider-input" id="contrastSlider" min="-50" max="50" value="0" step="1">
                                <span class="slider-value" id="contrastVal">0</span>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Output Section -->
                <section class="control-section">
                    <h5 class="section-title"><i class="bi bi-download me-1"></i>Output</h5>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-info btn-sm" id="btnPreview" disabled>
                            <i class="bi bi-eye me-1"></i>Preview
                        </button>
                        <button class="btn btn-success btn-sm" id="btnSave" disabled>
                            <i class="bi bi-floppy me-1"></i>Save
                        </button>
                        <button class="btn btn-warning btn-sm d-none" id="btnSaveReplace" disabled>
                            <i class="bi bi-arrow-repeat me-1"></i>Save &amp; Replace
                        </button>
                        <a class="btn btn-primary btn-sm" id="btnDownload" disabled>
                            <i class="bi bi-download me-1"></i>Download
                        </a>
                    </div>
                </section>
            </div>
        </div>
    </div>
</div>

<!-- Hidden file input -->
<input type="file" id="fileInput" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" class="d-none">

<!-- Preview Modal -->
<div class="modal fade" id="previewModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Preview</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center">
                <img id="previewImage" class="img-fluid rounded" src="">
            </div>
        </div>
    </div>
</div>

<!-- Toast container -->
<div class="toast-container position-fixed bottom-0 end-0 p-3">
    <div id="toastMessage" class="toast align-items-center text-bg-primary border-0" role="alert">
        <div class="d-flex">
            <div class="toast-body" id="toastBody"></div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    </div>
</div>

<script async src="https://docs.opencv.org/4.9.0/opencv.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js"></script>
<script>
    /* ── Integration mode passed from PHP ── */
    var INTEGRATION_MODE     = <?php echo json_encode($mode); ?>;
    var INTEGRATION_FILE_URL = <?php echo json_encode($fileUrl); ?>;
    var INTEGRATION_FILE_EXT = <?php echo json_encode($fileExt); ?>;
    var INTEGRATION_FILE_NAME = <?php echo json_encode($fileName); ?>;
</script>
<script src="assets/js/app.js"></script>
</body>
</html>
