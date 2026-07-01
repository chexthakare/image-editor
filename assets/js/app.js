$(function () {

    /* -------------------------------------------
       State
       ------------------------------------------- */
    let cropper = null;
    let flipX = false;
    let flipY = false;
    let originalWidth = 0;
    let originalHeight = 0;
    let currentFile = null;
    let perspectiveActive = false;
    let perspectiveCorners = null;
    let perspectiveDragIdx = -1;
    let displayImage = null;
    let mlModel = null;
    let mlModelLoaded = false;
    let mlModelLoading = false;
    const ML_MODEL_PATH = 'assets/models/doccornernet/model.json';
    /* Filter / enhancement state */
    let filterBrightness = 0;
    let filterContrast = 0;
    let filterEffect = 'none'; // 'none', 'gray', 'binarized', 'clean'

    /* -------------------------------------------
       DOM refs
       ------------------------------------------- */
    const $fileInput = $('#fileInput');
    const $uploadPlaceholder = $('#uploadPlaceholder');
    const $cropContainer = $('#cropContainer');
    const $cropImage = $('#cropImage');
    const $btnUpload = $('#btnUpload');
    const $btnReplace = $('#btnReplace');
    const $btnReset = $('#btnReset');
    const $btnPreview = $('#btnPreview');
    const $btnSave = $('#btnSave');
    const $btnSaveReplace = $('#btnSaveReplace');
    const $btnDownload = $('#btnDownload');
    const $btnUploadTrigger = $('#btnUploadTrigger');
    const $previewModal = new bootstrap.Modal('#previewModal');
    const $previewImage = $('#previewImage');
    const $toast = $('#toastMessage');
    const $toastBody = $('#toastBody');
    const $perspectiveOverlay = $('#perspectiveOverlay');
    const $perspectiveCanvas = $('#perspectiveCanvas');
    const $btnDetectCorners = $('#btnDetectCorners');
    const $btnApplyTransform = $('#btnApplyTransform');
    const $btnCancelTransform = $('#btnCancelTransform');
    const perspectiveCanvas = $perspectiveCanvas[0];
    const perspectiveCtx = perspectiveCanvas ? perspectiveCanvas.getContext('2d') : null;

    /* -------------------------------------------
       Toast helper
       ------------------------------------------- */
    function showToast(message, type) {
        $toast.removeClass('text-bg-primary text-bg-danger text-bg-success');
        if (type === 'error') $toast.addClass('text-bg-danger');
        else if (type === 'success') $toast.addClass('text-bg-success');
        else $toast.addClass('text-bg-primary');
        $toastBody.text(message);
        bootstrap.Toast.getOrCreateInstance($toast).show();
    }

    /* -------------------------------------------
       Enable / disable controls
       ------------------------------------------- */
    function setControlsEnabled(enabled) {
        const btns = [$btnReplace, $btnReset, $btnPreview, $btnSave, $btnSaveReplace, $btnDownload,
            $('#btnRotateLeft'), $('#btnRotateRight'), $('#btnFlipH'), $('#btnFlipV'),
            $('#btnZoomIn'), $('#btnZoomOut'), $('#btnAutoDetect'),
            $btnDetectCorners
        ];
        btns.forEach(function ($el) {
            $el.prop('disabled', !enabled);
        });
        $('.crop-ratio').prop('disabled', !enabled);
        $('.filter-btn').prop('disabled', !enabled);
        $('.slider-input').prop('disabled', !enabled);
        if (enabled) {
            $btnDownload.attr('href', '#');
        } else {
            $btnDownload.removeAttr('href');
        }
    }

    /* -------------------------------------------
       Load image into Cropper
       ------------------------------------------- */
    function loadImage(file, cropFull) {
        currentFile = file;
        var reader = new FileReader();
        reader.onload = function (e) {
            var url = e.target.result;

            if (cropper) {
                cropper.destroy();
                cropper = null;
            }

            $uploadPlaceholder.addClass('d-none');
            $cropContainer.removeClass('d-none');
            $cropImage.attr('src', url);

            $cropImage.one('load', function () {
                var img = this;
                originalWidth = img.naturalWidth;
                originalHeight = img.naturalHeight;

                // Reset filters on new image load
                filterBrightness = 0;
                filterContrast = 0;
                filterEffect = 'none';
                $('#brightnessSlider').val(0);
                $('#contrastSlider').val(0);
                $('#brightnessVal').text('0');
                $('#contrastVal').text('0');
                $('.filter-btn').removeClass('active');
                $('.filter-btn[data-filter="none"]').addClass('active');
                clearWorkspaceFilter();

                cropper = new Cropper(img, {
                    viewMode: 1,
                    dragMode: 'crop',
                    initialAspectRatio: NaN,
                    autoCropArea: cropFull ? 1 : 0.8,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: true,
                    wheelZoomRatio: 0.1,
                    minCropBoxWidth: 50,
                    minCropBoxHeight: 50,
                    ready: function () {
                        setControlsEnabled(true);
                        flipX = false;
                        flipY = false;
                        showToast(cropFull ? 'Perspective corrected. Crop if desired, then Save.' : 'Image loaded. Start editing!', 'success');
                        if (!cropFull) {
                            setTimeout(function () {
                                autoDetectAndShowPerspective();
                            }, 500);
                        }
                    }
                });

                /* Reset active ratio buttons */
                $('.crop-ratio').removeClass('active');
                $('.crop-ratio[data-ratio="free"]').addClass('active');
            });
        };
        reader.readAsDataURL(file);
    }

    /* -------------------------------------------
       Data URI → Blob helper
       ------------------------------------------- */
    function dataURItoBlob(dataUri) {
        var parts = dataUri.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bytes = atob(parts[1]);
        var ab = new ArrayBuffer(bytes.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
        return new Blob([ab], { type: mime });
    }

    /* -------------------------------------------
       Load image from URL via PHP proxy
       ------------------------------------------- */
    function loadImageFromUrl(url) {
        if (!url || !url.match(/^https?:\/\/.+/i)) {
            showToast('Please enter a valid URL starting with http:// or https://', 'error');
            return;
        }

        $.ajax({
            url: 'proxy.php',
            type: 'GET',
            data: { url: url },
            dataType: 'json',
            beforeSend: function () {
                showToast('Loading image from URL...', 'primary');
            },
            success: function (res) {
                if (res.status) {
                    var blob = dataURItoBlob(res.dataUri);
                    var ext = res.mime.split('/')[1];
                    var file = new File([blob], 'url_image.' + ext, { type: res.mime });
                    loadImage(file);
                } else {
                    showToast(res.message || 'Failed to load image from URL.', 'error');
                }
            },
            error: function () {
                showToast('Server error. Could not fetch image from URL.', 'error');
            }
        });
    }

    /* -------------------------------------------
       Upload handlers
       ------------------------------------------- */
    function openFilePicker() {
        $fileInput.val('');
        $fileInput.trigger('click');
    }

    $btnUpload.on('click', openFilePicker);
    $btnUploadTrigger.on('click', function (e) {
        e.stopPropagation();
        openFilePicker();
    });
    $btnReplace.on('click', openFilePicker);
    $uploadPlaceholder.on('click', openFilePicker);

    $fileInput.on('change', function () {
        var file = this.files[0];
        if (!file) return;
        var type = file.type;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
            showToast('Unsupported format. Use JPG, PNG or WEBP.', 'error');
            return;
        }
        loadImage(file);
    });

    /* -------------------------------------------
       URL load handler
       ------------------------------------------- */
    $('#btnUrlLoad').on('click', function () {
        var url = $('#urlInput').val().trim();
        loadImageFromUrl(url);
    });

    $('#urlInput').on('keydown', function (e) {
        if (e.key === 'Enter') {
            var url = $(this).val().trim();
            loadImageFromUrl(url);
        }
    });

    /* -------------------------------------------
       Crop ratio buttons
       ------------------------------------------- */
    $('.crop-ratio').on('click', function () {
        if (!cropper) return;
        $('.crop-ratio').removeClass('active');
        $(this).addClass('active');
        var ratio = $(this).data('ratio');
        if (ratio === 'free') {
            cropper.setAspectRatio(NaN);
        } else if (ratio === 'original') {
            cropper.setAspectRatio(originalWidth / originalHeight);
        } else {
            cropper.setAspectRatio(eval(ratio));
        }
    });

    /* -------------------------------------------
       Auto-detect document edges
       ------------------------------------------- */
    function detectDocumentEdges(img) {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return null;

        var maxDim = 1200;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var sw = Math.round(w * scale), sh = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, sw, sh);

        var imageData = ctx.getImageData(0, 0, sw, sh);
        var data = imageData.data;
        var pixels = sw * sh;

        // 1. Grayscale
        var gray = new Uint8Array(pixels);
        for (var i = 0; i < pixels; i++) {
            var j = i * 4;
            gray[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
        }

        // 2. 5x5 box blur (separable horizontal + vertical)
        var hblur = new Uint8Array(pixels);
        var r = 2;
        for (var y = 0; y < sh; y++) {
            for (var x = 0; x < sw; x++) {
                var sum = 0, count = 0;
                for (var dx = -r; dx <= r; dx++) {
                    var px = x + dx;
                    if (px >= 0 && px < sw) { sum += gray[y * sw + px]; count++; }
                }
                hblur[y * sw + x] = (sum / count) | 0;
            }
        }
        var blurred = new Uint8Array(pixels);
        for (var x = 0; x < sw; x++) {
            for (var y = 0; y < sh; y++) {
                var sum = 0, count = 0;
                for (var dy = -r; dy <= r; dy++) {
                    var py = y + dy;
                    if (py >= 0 && py < sh) { sum += hblur[py * sw + x]; count++; }
                }
                blurred[y * sw + x] = (sum / count) | 0;
            }
        }

        // 3. Sobel edge detection
        var magnitude = new Uint8Array(pixels);
        var maxMag = 0;
        for (var y = 1; y < sh - 1; y++) {
            for (var x = 1; x < sw - 1; x++) {
                var idx = y * sw + x;
                var gx = -blurred[idx - sw - 1] + blurred[idx - sw + 1]
                        - 2 * blurred[idx - 1] + 2 * blurred[idx + 1]
                        - blurred[idx + sw - 1] + blurred[idx + sw + 1];
                var gy = -blurred[idx - sw - 1] - 2 * blurred[idx - sw] - blurred[idx - sw + 1]
                        + blurred[idx + sw - 1] + 2 * blurred[idx + sw] + blurred[idx + sw + 1];
                var mag = Math.sqrt(gx * gx + gy * gy) | 0;
                magnitude[idx] = mag > 255 ? 255 : mag;
                if (magnitude[idx] > maxMag) maxMag = magnitude[idx];
            }
        }

        // 4. Otsu threshold
        var hist = new Uint32Array(256);
        for (var i = 0; i < pixels; i++) hist[magnitude[i]]++;
        var total = pixels, sum = 0;
        for (var i = 0; i < 256; i++) sum += i * hist[i];
        var sumB = 0, wB = 0, maxVar = 0, threshold = 0;
        for (var i = 0; i < 256; i++) {
            wB += hist[i];
            if (wB === 0) continue;
            var wF = total - wB;
            if (wF === 0) break;
            sumB += i * hist[i];
            var mB = sumB / wB, mF = (sum - sumB) / wF;
            var varB = wB * wF * (mB - mF) * (mB - mF);
            if (varB > maxVar) { maxVar = varB; threshold = i; }
        }

        // 5. Binary edge map
        var binary = new Uint8Array(pixels);
        for (var i = 0; i < pixels; i++) binary[i] = magnitude[i] > threshold ? 255 : 0;

        // 6. Projection analysis
        var margin = Math.max(10, Math.round(Math.min(sw, sh) * 0.02));
        var hProj = new Float64Array(sh);
        for (var y = margin; y < sh - margin; y++) {
            var sum = 0;
            for (var x = margin; x < sw - margin; x++) sum += binary[y * sw + x];
            hProj[y] = sum / 255;
        }
        var vProj = new Float64Array(sw);
        for (var x = margin; x < sw - margin; x++) {
            var sum = 0;
            for (var y = margin; y < sh - margin; y++) sum += binary[y * sw + x];
            vProj[x] = sum / 255;
        }

        var hMax = 0, vMax = 0;
        for (var y = 0; y < sh; y++) if (hProj[y] > hMax) hMax = hProj[y];
        for (var x = 0; x < sw; x++) if (vProj[x] > vMax) vMax = vProj[x];

        var hThresh = hMax * 0.15, vThresh = vMax * 0.15;
        if (hThresh < 1) hThresh = 1;
        if (vThresh < 1) vThresh = 1;

        var top = margin, bottom = sh - margin;
        var left = margin, right = sw - margin;

        for (var y = margin; y < sh - margin; y++)
            if (hProj[y] > hThresh) { top = y; break; }
        for (var y = sh - margin - 1; y >= margin; y--)
            if (hProj[y] > hThresh) { bottom = y; break; }
        for (var x = margin; x < sw - margin; x++)
            if (vProj[x] > vThresh) { left = x; break; }
        for (var x = sw - margin - 1; x >= margin; x--)
            if (vProj[x] > vThresh) { right = x; break; }

        if (top >= bottom || left >= right) return null;

        var padX = Math.max(5, Math.round(sw * 0.015));
        var padY = Math.max(5, Math.round(sh * 0.015));
        left = Math.max(0, left - padX);
        top = Math.max(0, top - padY);
        right = Math.min(sw, right + padX);
        bottom = Math.min(sh, bottom + padY);

        var invScale = 1 / scale;
        return {
            x: Math.round(left * invScale),
            y: Math.round(top * invScale),
            width: Math.round((right - left) * invScale),
            height: Math.round((bottom - top) * invScale)
        };
    }

    $('#btnAutoDetect').on('click', function () {
        if (!cropper) return;
        var $btn = $(this);
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Detecting...');

        setTimeout(function () {
            try {
                var img = $cropImage[0];
                if (!img) {
                    showToast('No image loaded.', 'error');
                    return;
                }
                var result = detectDocumentEdges(img);
                if (result) {
                    cropper.setData(result);
                    showToast('Document edges detected.', 'success');
                } else {
                    showToast('Could not detect document edges. Adjust crop manually.', 'error');
                }
            } catch (e) {
                showToast('Edge detection failed.', 'error');
            } finally {
                $btn.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Auto Detect');
            }
        }, 50);
    });

    /* -------------------------------------------
       Perspective: find 4 corners from binary mask
       ------------------------------------------- */
    /* -------------------------------------------
       Perspective: coordinate helpers
       ------------------------------------------- */
    function getCanvasScale() {
        var cw = perspectiveCanvas.width, ch = perspectiveCanvas.height;
        var iw = displayImage ? displayImage.naturalWidth : 1;
        var ih = displayImage ? displayImage.naturalHeight : 1;
        var scale = Math.min(cw / iw, ch / ih);
        var ow = iw * scale, oh = ih * scale;
        var ox = (cw - ow) / 2, oy = (ch - oh) / 2;
        return { scale: scale, ox: ox, oy: oy, ow: ow, oh: oh };
    }

    function naturalToDisplay(nx, ny) {
        var s = getCanvasScale();
        return { x: nx * s.scale + s.ox, y: ny * s.scale + s.oy };
    }

    function displayToNatural(dx, dy) {
        var s = getCanvasScale();
        return { x: (dx - s.ox) / s.scale, y: (dy - s.oy) / s.scale };
    }

    /* -------------------------------------------
       Perspective: draw overlay
       ------------------------------------------- */
    function drawPerspectiveOverlay() {
        if (!perspectiveCanvas || !displayImage) return;
        var ctx = perspectiveCtx;
        var cw = perspectiveCanvas.width, ch = perspectiveCanvas.height;

        ctx.clearRect(0, 0, cw, ch);

        // Draw image centered and scaled
        var s = getCanvasScale();
        ctx.drawImage(displayImage, s.ox, s.oy, s.ow, s.oh);

        if (!perspectiveCorners) return;

        // Draw filled quadrilateral (semi-transparent overlay)
        var disp = perspectiveCorners.map(function (c) { return naturalToDisplay(c.x, c.y); });
        ctx.beginPath();
        ctx.moveTo(disp[0].x, disp[0].y);
        for (var i = 1; i < 4; i++) ctx.lineTo(disp[i].x, disp[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(13, 110, 253, 0.08)';
        ctx.fill();
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw corner handles
        var radius = 8;
        for (var i = 0; i < 4; i++) {
            var dp = disp[i];
            // Outer glow
            ctx.beginPath();
            ctx.arc(dp.x, dp.y, radius + 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(13, 110, 253, 0.2)';
            ctx.fill();
            // Solid dot
            ctx.beginPath();
            ctx.arc(dp.x, dp.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#0d6efd';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Label
            var labels = ['TL', 'TR', 'BR', 'BL'];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(labels[i], dp.x, dp.y - radius - 4);
        }
    }

    /* -------------------------------------------
       Perspective: enter / exit mode
       ------------------------------------------- */
    function enterPerspectiveMode(corners) {
        perspectiveCorners = corners;
        perspectiveActive = true;

        // Hide cropper, show overlay first so we can measure it
        $cropContainer.addClass('d-none');
        $perspectiveOverlay.removeClass('d-none');

        var rect = perspectiveCanvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        perspectiveCanvas.width = rect.width * dpr;
        perspectiveCanvas.height = rect.height * dpr;
        perspectiveCanvas.style.width = rect.width + 'px';
        perspectiveCanvas.style.height = rect.height + 'px';

        $btnDetectCorners.prop('disabled', true);
        $btnApplyTransform.prop('disabled', false).removeClass('d-none');
        $btnCancelTransform.removeClass('d-none');
        $('.crop-ratio').prop('disabled', true);

        drawPerspectiveOverlay();
    }

    function exitPerspectiveMode() {
        perspectiveActive = false;
        perspectiveCorners = null;
        perspectiveDragIdx = -1;

        $perspectiveOverlay.addClass('d-none');
        $cropContainer.removeClass('d-none');
        $btnDetectCorners.prop('disabled', false);
        $btnApplyTransform.prop('disabled', true).addClass('d-none');
        $btnCancelTransform.addClass('d-none');
        $('.crop-ratio').prop('disabled', false);
    }

    /* -------------------------------------------
       Perspective: mouse drag for corners
       ------------------------------------------- */
    function getCornerHit(mx, my) {
        if (!perspectiveCorners) return -1;
        var threshold = 20;
        for (var i = 0; i < 4; i++) {
            var dp = naturalToDisplay(perspectiveCorners[i].x, perspectiveCorners[i].y);
            var dx = mx - dp.x, dy = my - dp.y;
            if (dx * dx + dy * dy < threshold * threshold) return i;
        }
        return -1;
    }

    $perspectiveCanvas.on('mousedown', function (e) {
        if (!perspectiveCorners) return;
        var rect = this.getBoundingClientRect();
        var mx = (e.clientX - rect.left) * (perspectiveCanvas.width / rect.width);
        var my = (e.clientY - rect.top) * (perspectiveCanvas.height / rect.height);
        var hit = getCornerHit(mx, my);
        if (hit >= 0) {
            perspectiveDragIdx = hit;
            $perspectiveOverlay.addClass('dragging');
            e.preventDefault();
        }
    });

    $(document).on('mousemove', function (e) {
        if (perspectiveDragIdx < 0 || !perspectiveCorners) return;
        var rect = perspectiveCanvas.getBoundingClientRect();
        var mx = (e.clientX - rect.left) * (perspectiveCanvas.width / rect.width);
        var my = (e.clientY - rect.top) * (perspectiveCanvas.height / rect.height);
        var nat = displayToNatural(mx, my);
        nat.x = Math.max(0, Math.min(originalWidth, nat.x));
        nat.y = Math.max(0, Math.min(originalHeight, nat.y));
        perspectiveCorners[perspectiveDragIdx] = nat;
        drawPerspectiveOverlay();
    });

    $(document).on('mouseup', function () {
        if (perspectiveDragIdx >= 0) {
            perspectiveDragIdx = -1;
            $perspectiveOverlay.removeClass('dragging');
        }
    });

    /* -------------------------------------------
       Perspective: homography & warp
       ------------------------------------------- */
    function gaussSolve(A, B, n) {
        var aug = [];
        for (var i = 0; i < n; i++) aug.push(A[i].slice().concat(B[i]));
        for (var col = 0; col < n; col++) {
            var mr = col;
            for (var r = col + 1; r < n; r++)
                if (Math.abs(aug[r][col]) > Math.abs(aug[mr][col])) mr = r;
            var tmp = aug[col]; aug[col] = aug[mr]; aug[mr] = tmp;
            var piv = aug[col][col];
            for (var j = col; j <= n; j++) aug[col][j] /= piv;
            for (var r = 0; r < n; r++) {
                if (r === col) continue;
                var fac = aug[r][col];
                for (var j = col; j <= n; j++) aug[r][j] -= fac * aug[col][j];
            }
        }
        var x = [];
        for (var i = 0; i < n; i++) x.push(aug[i][n]);
        return x;
    }

    function computeHomography(src, dst) {
        var A = [], B = [];
        for (var i = 0; i < 4; i++) {
            var sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
            A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx]);
            A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy]);
            B.push(-dx);
            B.push(-dy);
        }
        var h = gaussSolve(A, B, 8);
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    function perspectiveWarp(srcCanvas, srcCorners, dw, dh) {
        var dstCorners = [
            { x: 0, y: 0 }, { x: dw, y: 0 }, { x: dw, y: dh }, { x: 0, y: dh }
        ];
        var H = computeHomography(dstCorners, srcCorners);

        var sw = srcCanvas.width, sh = srcCanvas.height;
        var srcCtx = srcCanvas.getContext('2d');
        var srcData = srcCtx.getImageData(0, 0, sw, sh);
        var srcPix = srcData.data;

        var dstCanvas = document.createElement('canvas');
        dstCanvas.width = dw;
        dstCanvas.height = dh;
        var dstCtx = dstCanvas.getContext('2d');
        var dstImgData = dstCtx.createImageData(dw, dh);
        var dstPix = dstImgData.data;

        for (var y = 0; y < dh; y++) {
            for (var x = 0; x < dw; x++) {
                var den = H[6] * x + H[7] * y + H[8];
                var sx = (H[0] * x + H[1] * y + H[2]) / den;
                var sy = (H[3] * x + H[4] * y + H[5]) / den;
                var idx = (y * dw + x) * 4;

                if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
                    var ix = Math.floor(sx), iy = Math.floor(sy);
                    var fx = sx - ix, fy = sy - iy;
                    var p00 = (iy * sw + ix) * 4, p01 = p00 + 4;
                    var p10 = ((iy + 1) * sw + ix) * 4, p11 = p10 + 4;
                    for (var c = 0; c < 4; c++) {
                        dstPix[idx + c] = (1 - fx) * (1 - fy) * srcPix[p00 + c]
                            + fx * (1 - fy) * srcPix[p01 + c]
                            + (1 - fx) * fy * srcPix[p10 + c]
                            + fx * fy * srcPix[p11 + c];
                    }
                } else {
                    dstPix[idx + 3] = 255; // black
                }
            }
        }
        dstCtx.putImageData(dstImgData, 0, 0);
        return dstCanvas;
    }

    function applyPerspectiveTransform() {
        if (!perspectiveCorners) return;

        // Get full-res image
        var img = new Image();
        img.onload = function () {
            var srcCanvas = document.createElement('canvas');
            srcCanvas.width = img.naturalWidth;
            srcCanvas.height = img.naturalHeight;
            srcCanvas.getContext('2d').drawImage(img, 0, 0);

            // Scale corners from detection resolution to full resolution
            var scaleX = img.naturalWidth / originalWidth;
            var scaleY = img.naturalHeight / originalHeight;

            // Wait - originalWidth/Height is already at natural resolution
            // The corners are already in natural coordinates from the full-res image
            // So no scaling needed

            var srcCorners = perspectiveCorners.map(function (c) {
                return { x: c.x, y: c.y };
            });

            // Compute output size (use max of projected edges)
            var w = Math.round(Math.max(
                dist(srcCorners[0], srcCorners[1]),
                dist(srcCorners[2], srcCorners[3])
            ));
            var h = Math.round(Math.max(
                dist(srcCorners[0], srcCorners[3]),
                dist(srcCorners[1], srcCorners[2])
            ));

            if (w < 10 || h < 10) {
                showToast('Corners too close together.', 'error');
                return;
            }

            var warped = perspectiveWarp(srcCanvas, srcCorners, w, h);

            warped.toBlob(function (blob) {
                var file = new File([blob], 'warped_' + (currentFile ? currentFile.name : 'image.jpg'), { type: 'image/jpeg' });
                exitPerspectiveMode();
                loadImage(file, true);
            }, 'image/jpeg', 0.95);
        };
        img.src = $cropImage[0].src;
    }

    function dist(a, b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    /* -------------------------------------------
       Document Enhancement Filters
       ------------------------------------------- */
    function pixelFilter(d, w, h) {
        var bright = filterBrightness;
        var contrast = filterContrast;
        var effect = filterEffect;

        if (bright === 0 && contrast === 0 && effect === 'none') return;

        var len = w * h;
        var gray, threshold, sorted, p5, p95, range;
        var i, j, c, r, g, b, v, val;

        // Pre-compute grayscale if needed by any effect
        if (effect === 'clean' || effect === 'gray' || effect === 'binarized') {
            gray = new Uint8Array(len);
            for (i = 0; i < len; i++) {
                j = i * 4;
                gray[i] = (d[j] * 77 + d[j+1] * 150 + d[j+2] * 29) >> 8;
            }
            if (effect === 'clean') {
                sorted = new Uint8Array(gray);
                sorted.sort();
                p5 = sorted[Math.floor(len * 0.02)];
                p95 = sorted[Math.floor(len * 0.98)];
                range = p95 - p5;
                if (range < 5) range = 5;
            }
            if (effect === 'binarized') {
                var sum = 0;
                for (i = 0; i < len; i++) sum += gray[i];
                threshold = sum / len;
            }
        }

        // Apply brightness + contrast + effect in one pass
        var bScale = 1 + contrast / 40;
        var bOff = bright * 2.55;

        for (i = 0; i < len; i++) {
            j = i * 4;
            r = d[j]; g = d[j+1]; b = d[j+2];

            // Brightness + contrast
            if (bright !== 0 || contrast !== 0) {
                r = Math.round((r + bOff - 128) * bScale + 128);
                g = Math.round((g + bOff - 128) * bScale + 128);
                b = Math.round((b + bOff - 128) * bScale + 128);
                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));
            }

            // Effect overlay
            if (effect === 'clean') {
                v = (r * 77 + g * 150 + b * 29) >> 8;
                v = Math.round((v - p5) / range * 255);
                v = Math.min(255, Math.max(0, v));
                r = g = b = v;
            } else if (effect === 'gray') {
                v = (r * 77 + g * 150 + b * 29) >> 8;
                r = g = b = v;
            } else if (effect === 'binarized') {
                val = gray[i] > threshold ? 255 : 0;
                r = g = b = val;
            }

            d[j] = r; d[j+1] = g; d[j+2] = b;
        }
    }

    function getFilteredCanvas() {
        if (!cropper) return null;
        var canvas = cropper.getCroppedCanvas({
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pixelFilter(imageData.data, canvas.width, canvas.height);
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /* -------------------------------------------
       Perspective: corner detection pipeline
       ------------------------------------------- */
    function polygonArea(pts) {
        var area = 0;
        for (var i = 0; i < pts.length; i++) {
            var j = (i + 1) % pts.length;
            area += pts[i].x * pts[j].y;
            area -= pts[j].x * pts[i].y;
        }
        return Math.abs(area) / 2;
    }

    function estimateCornersFromImage(grayMat, scale, sw, sh) {
        // Projection-based fallback: find document edges from Sobel gradient
        var grad = new cv.Mat();
        cv.Sobel(grayMat, grad, cv.CV_64F, 1, 0);
        var absGrad = new cv.Mat();
        cv.convertScaleAbs(grad, absGrad);
        var data8 = new Uint8Array(absGrad.data, absGrad.dataOffset, absGrad.data.length);
        var gradFlat = [];
        for (var y = 0; y < absGrad.rows; y++) {
            var s = 0;
            for (var x = 0; x < absGrad.cols; x++) s += data8[y * absGrad.cols + x];
            gradFlat.push(s);
        }

        var margin = Math.max(10, Math.round(Math.min(sw, sh) * 0.05));
        var hMax = 0;
        for (var i = 0; i < gradFlat.length; i++) if (gradFlat[i] > hMax) hMax = gradFlat[i];
        var hThresh = hMax * 0.3;
        var top = margin, bottom = sh - margin;
        for (var y = margin; y < sh - margin; y++) { if (gradFlat[y] > hThresh) { top = y; break; } }
        for (var y = sh - margin - 1; y >= margin; y--) { if (gradFlat[y] > hThresh) { bottom = y; break; } }

        cv.Sobel(grayMat, grad, cv.CV_64F, 0, 1);
        cv.convertScaleAbs(grad, absGrad);
        var data8v = new Uint8Array(absGrad.data, absGrad.dataOffset, absGrad.data.length);
        var gradVert = [];
        for (var x = 0; x < absGrad.cols; x++) {
            var s = 0;
            for (var y = 0; y < absGrad.rows; y++) s += data8v[y * absGrad.cols + x];
            gradVert.push(s);
        }
        var vMax = 0;
        for (var i = 0; i < gradVert.length; i++) if (gradVert[i] > vMax) vMax = gradVert[i];
        var vThresh = vMax * 0.3;
        var left = margin, right = sw - margin;
        for (var x = margin; x < sw - margin; x++) { if (gradVert[x] > vThresh) { left = x; break; } }
        for (var x = sw - margin - 1; x >= margin; x--) { if (gradVert[x] > vThresh) { right = x; break; } }

        grad.delete(); absGrad.delete();

        if (top >= bottom || left >= right) return null;

        return [
            { x: Math.round(left / scale), y: Math.round(top / scale) },
            { x: Math.round(right / scale), y: Math.round(top / scale) },
            { x: Math.round(right / scale), y: Math.round(bottom / scale) },
            { x: Math.round(left / scale), y: Math.round(bottom / scale) }
        ];
    }

    function detectByConnectedComponents(grayMat, scale, sw, sh) {
        var w = sw, h = sh, cx = Math.floor(w / 2), cy = Math.floor(h / 2);
        var r = Math.round(Math.min(w, h) * 0.1);
        var sum = 0, count = 0;
        for (var y = cy - r; y <= cy + r; y++) {
            for (var x = cx - r; x <= cx + r; x++) {
                sum += grayMat.ucharPtr(y, x)[0]; count++;
            }
        }
        var threshold = Math.max(160, sum / count - 30);
        var bin = new cv.Mat();
        cv.threshold(grayMat, bin, threshold, 255, cv.THRESH_BINARY);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var bestContour = null, bestArea = 0, bestIdx = -1;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a < w * h * 0.03) continue;
            if (cv.pointPolygonTest(contours.get(i), new cv.Point(cx, cy), false) >= 0 && a > bestArea) {
                bestArea = a; bestContour = contours.get(i); bestIdx = i;
            }
        }
        if (!bestContour || bestArea > w * h * 0.95) {
            // If no center-containing contour, or it fills the frame, try largest
            for (var i = 0; i < contours.size(); i++) {
                var a = Math.abs(cv.contourArea(contours.get(i)));
                if (a > bestArea && a < w * h * 0.95) { bestArea = a; bestContour = contours.get(i); }
            }
        }
        bin.delete(); contours.delete(); hierarchy.delete();
        if (!bestContour || bestArea < w * h * 0.03) return null;
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];
        var bestApprox = null;
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(bestContour, approx, epsList[ei] * cv.arcLength(bestContour, true), true);
            if (approx.rows === 4) { bestApprox = approx; break; }
            approx.delete();
        }
        if (!bestApprox) return null;
        var corners = [];
        for (var j = 0; j < bestApprox.rows; j++) {
            corners.push({ x: Math.round(bestApprox.data32S[j * 2] / scale), y: Math.round(bestApprox.data32S[j * 2 + 1] / scale) });
        }
        bestApprox.delete();
        return corners;
    }

    function detectByEdgeScanning(grayMat, scale, sw, sh) {
        var w = sw, h = sh;
        var margin = Math.round(Math.min(w, h) * 0.02);
        var yStep = Math.max(1, Math.round(h / 60));
        var xStep = Math.max(1, Math.round(w / 60));

        function median(arr) {
            if (arr.length === 0) return 0;
            var s = arr.slice().sort(function (a, b) { return a - b; });
            return s[Math.floor(s.length / 2)];
        }

        function removeOutliers(arr) {
            if (arr.length < 5) return arr;
            var s = arr.slice().sort(function (a, b) { return a - b; });
            var q1 = s[Math.floor(s.length * 0.25)];
            var q3 = s[Math.floor(s.length * 0.75)];
            var iqr = q3 - q1;
            var lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
            return arr.filter(function (v) { return v >= lo && v <= hi; });
        }

        // Compute brightness percentile threshold (top 25% brightest = document)
        var hist = new Array(256).fill(0);
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                hist[grayMat.ucharPtr(y, x)[0]]++;
            }
        }
        var total = w * h;
        var cum = 0;
        var brightThreshold = 255;
        for (var i = 255; i >= 0; i--) {
            cum += hist[i];
            if (cum > total * 0.25) { brightThreshold = i; break; }
        }
        // Also compute 5th percentile for dark background
        cum = 0;
        var darkThreshold = 0;
        for (var i = 0; i < 256; i++) {
            cum += hist[i];
            if (cum > total * 0.05) { darkThreshold = i; break; }
        }
        // Require document/background separation
        if (brightThreshold - darkThreshold < 20) return null;

        // Scan for left/right bright region edges (first bright pixel from each side)
        var leftEdges = [], rightEdges = [];
        for (var y = margin; y < h - margin; y += yStep) {
            var leftX = -1;
            for (var x = margin; x < w - margin; x++) {
                if (grayMat.ucharPtr(y, x)[0] > brightThreshold) { leftX = x; break; }
            }
            if (leftX >= 0) leftEdges.push(leftX);
            var rightX = -1;
            for (var x = w - margin - 1; x >= margin; x--) {
                if (grayMat.ucharPtr(y, x)[0] > brightThreshold) { rightX = x; break; }
            }
            if (rightX >= 0) rightEdges.push(rightX);
        }

        // Scan for top/bottom bright region edges
        var topEdges = [], bottomEdges = [];
        for (var x = margin; x < w - margin; x += xStep) {
            var topY = -1;
            for (var y = margin; y < h - margin; y++) {
                if (grayMat.ucharPtr(y, x)[0] > brightThreshold) { topY = y; break; }
            }
            if (topY >= 0) topEdges.push(topY);
            var bottomY = -1;
            for (var y = h - margin - 1; y >= margin; y--) {
                if (grayMat.ucharPtr(y, x)[0] > brightThreshold) { bottomY = y; break; }
            }
            if (bottomY >= 0) bottomEdges.push(bottomY);
        }

        if (leftEdges.length < 3 || rightEdges.length < 3 || topEdges.length < 3 || bottomEdges.length < 3)
            return null;

        var leftClean = removeOutliers(leftEdges);
        var rightClean = removeOutliers(rightEdges);
        var topClean = removeOutliers(topEdges);
        var bottomClean = removeOutliers(bottomEdges);

        if (leftClean.length < 3 || rightClean.length < 3 || topClean.length < 3 || bottomClean.length < 3)
            return null;

        var leftX = median(leftClean);
        var rightX = median(rightClean);
        var topY = median(topClean);
        var bottomY = median(bottomClean);

        if (leftX >= rightX || topY >= bottomY) return null;

        return [
            { x: Math.round(leftX / scale), y: Math.round(topY / scale) },
            { x: Math.round(rightX / scale), y: Math.round(topY / scale) },
            { x: Math.round(rightX / scale), y: Math.round(bottomY / scale) },
            { x: Math.round(leftX / scale), y: Math.round(bottomY / scale) }
        ];
    }

    function detectByExtremeCorners(grayMat, scale, sw, sh) {
        // Find document by threshold + extreme corners (not approxPolyDP)
        var k = Math.max(15, Math.round(Math.min(sw, sh) * 0.03));
        if (k % 2 === 0) k++;
        var blurred = new cv.Mat();
        cv.GaussianBlur(grayMat, blurred, new cv.Size(k, k), 0);
        var bin = new cv.Mat();
        cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        // Dilate slightly to include shadowed edges
        var dilateK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
        cv.dilate(bin, bin, dilateK);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var largest = null, largestArea = 0;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a > largestArea && a < sw * sh * 0.95) { largestArea = a; largest = contours.get(i); }
        }
        blurred.delete(); bin.delete(); dilateK.delete(); contours.delete(); hierarchy.delete();
        if (!largest || largestArea < sw * sh * 0.02) return null;

        // Compute convex hull to get outer boundary
        var hull = new cv.Mat();
        cv.convexHull(largest, hull, false, true);

        // Find 4 extreme corners on the hull
        var best = null, bestPerim = -1;
        var cornerSets = [];
        // Try multiple epsilon values for approxPolyDP
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1];
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(hull, approx, epsList[ei] * cv.arcLength(hull, true), true);
            if (approx.rows >= 4 && approx.rows <= 8) {
                var pts = [];
                for (var j = 0; j < approx.rows; j++) {
                    pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
                }
                // Find 4 extreme corners among these points
                pts.forEach(function (p) { p.sum = p.x + p.y; p.diff = p.x - p.y; });
                var tl = pts.reduce(function (a, b) { return a.sum < b.sum ? a : b; });
                var tr = pts.reduce(function (a, b) { return a.diff > b.diff ? a : b; });
                var br = pts.reduce(function (a, b) { return a.sum > b.sum ? a : b; });
                var bl = pts.reduce(function (a, b) { return a.diff < b.diff ? a : b; });
                var perim = 0;
                var ordered = [tl, tr, br, bl];
                for (var j = 0; j < 4; j++) {
                    var dx = ordered[j].x - ordered[(j + 1) % 4].x;
                    var dy = ordered[j].y - ordered[(j + 1) % 4].y;
                    perim += Math.sqrt(dx * dx + dy * dy);
                }
                if (perim > bestPerim) {
                    bestPerim = perim;
                    best = ordered.map(function (p) { return { x: Math.round(p.x / scale), y: Math.round(p.y / scale) }; });
                }
            }
            approx.delete();
        }
        hull.delete();
        if (!best) return null;
        return { corners: best, score: 1.0 };
    }

    function detectByConvexHull(grayMat, scale, sw, sh) {
        // Use convex hull of Otsu+blur result to find true document boundary
        var k = Math.max(15, Math.round(Math.min(sw, sh) * 0.03));
        if (k % 2 === 0) k++;
        var blurred = new cv.Mat();
        cv.GaussianBlur(grayMat, blurred, new cv.Size(k, k), 0);
        var bin = new cv.Mat();
        cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var largest = null, largestArea = 0;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a > largestArea && a < sw * sh * 0.98) { largestArea = a; largest = contours.get(i); }
        }
        blurred.delete(); bin.delete(); contours.delete(); hierarchy.delete();
        if (!largest || largestArea < sw * sh * 0.02) return null;

        // Compute convex hull
        var hull = new cv.Mat();
        cv.convexHull(largest, hull, false, true);

        // Simplify hull to quadrilateral
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(hull, approx, epsList[ei] * cv.arcLength(hull, true), true);
            if (approx.rows === 4) {
                var corners = [];
                for (var j = 0; j < approx.rows; j++) {
                    corners.push({ x: Math.round(approx.data32S[j * 2] / scale), y: Math.round(approx.data32S[j * 2 + 1] / scale) });
                }
                hull.delete(); approx.delete();
                return { corners: corners, score: 1.0 };
            }
            approx.delete();
        }
        hull.delete();
        return null;
    }

    function detectByHoughLines(grayMat, scale, sw, sh) {
        // Use Hough line transform to find document edges, then intersect them
        var imgW = grayMat.cols, imgH = grayMat.rows;

        // 1. Canny with adaptive thresholds
        var median = 0;
        var pix = grayMat.data;
        var vals = [];
        for (var i = 0; i < pix.length; i += 4) vals.push(pix[i]);
        vals.sort(function (a, b) { return a - b; });
        median = vals[Math.floor(vals.length / 2)];
        var low = Math.max(5, Math.round(median * 0.15));
        var high = Math.max(10, Math.round(median * 0.4));

        var edges = new cv.Mat();
        cv.Canny(grayMat, edges, low, high);
        // Dilate edges slightly to connect broken document boundaries
        var dKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.dilate(edges, edges, dKernel);

        // 2. Hough lines
        var lines = new cv.Mat();
        var minLen = Math.round(Math.min(imgW, imgH) * 0.15);
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 80, minLen, Math.round(minLen * 0.2));

        edges.delete(); dKernel.delete();

        if (lines.rows < 8) { lines.delete(); return null; }

        // 3. Classify lines by angle into 4 groups
        var angleGroups = { h: [], v: [] };
        for (var i = 0; i < lines.rows; i++) {
            var x1 = lines.data32S[i * 4], y1 = lines.data32S[i * 4 + 1];
            var x2 = lines.data32S[i * 4 + 2], y2 = lines.data32S[i * 4 + 3];
            var dx = x2 - x1, dy = y2 - y1;
            var angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
            // Near-horizontal: angle < 30 or > 150; near-vertical: 60-120
            if (angle < 30 || angle > 150) {
                angleGroups.h.push({ x1: x1, y1: y1, x2: x2, y2: y2, len: Math.sqrt(dx * dx + dy * dy) });
            } else if (angle > 60 && angle < 120) {
                angleGroups.v.push({ x1: x1, y1: y1, x2: x2, y2: y2, len: Math.sqrt(dx * dx + dy * dy) });
            }
        }

        lines.delete();

        if (angleGroups.h.length < 2 || angleGroups.v.length < 2) { return null; }

        // 4. Find topmost and bottommost horizontal lines
        angleGroups.h.sort(function (a, b) { return -(a.len - b.len); });
        var topH = angleGroups.h[0], bottomH = angleGroups.h[0];
        var topY = Math.min(angleGroups.h[0].y1, angleGroups.h[0].y2);
        var bottomY = Math.max(angleGroups.h[0].y1, angleGroups.h[0].y2);
        for (var i = 0; i < Math.min(angleGroups.h.length, 10); i++) {
            var l = angleGroups.h[i];
            var ly = (l.y1 + l.y2) / 2;
            if (ly < topY) { topY = ly; topH = l; }
            if (ly > bottomY) { bottomY = ly; bottomH = l; }
        }

        // 5. Find leftmost and rightmost vertical lines
        angleGroups.v.sort(function (a, b) { return -(a.len - b.len); });
        var leftV = angleGroups.v[0], rightV = angleGroups.v[0];
        var leftX = Math.min(angleGroups.v[0].x1, angleGroups.v[0].x2);
        var rightX = Math.max(angleGroups.v[0].x1, angleGroups.v[0].x2);
        for (var i = 0; i < Math.min(angleGroups.v.length, 10); i++) {
            var l = angleGroups.v[i];
            var lx = (l.x1 + l.x2) / 2;
            if (lx < leftX) { leftX = lx; leftV = l; }
            if (lx > rightX) { rightX = lx; rightV = l; }
        }

        // 6. Compute line intersection functions
        function lineFromPoints(x1, y1, x2, y2) {
            var a = y2 - y1, b = x1 - x2, c = a * x1 + b * y1;
            return { a: a, b: b, c: c };
        }
        function intersectLines(l1, l2) {
            var det = l1.a * l2.b - l2.a * l1.b;
            if (Math.abs(det) < 1e-10) return null;
            return { x: (l2.b * l1.c - l1.b * l2.c) / det, y: (l1.a * l2.c - l2.a * l1.c) / det };
        }

        var linesInfo = {
            top: lineFromPoints(topH.x1, topH.y1, topH.x2, topH.y2),
            bottom: lineFromPoints(bottomH.x1, bottomH.y1, bottomH.x2, bottomH.y2),
            left: lineFromPoints(leftV.x1, leftV.y1, leftV.x2, leftV.y2),
            right: lineFromPoints(rightV.x1, rightV.y1, rightV.x2, rightV.y2)
        };

        var corners = [
            intersectLines(linesInfo.top, linesInfo.left),
            intersectLines(linesInfo.top, linesInfo.right),
            intersectLines(linesInfo.bottom, linesInfo.right),
            intersectLines(linesInfo.bottom, linesInfo.left)
        ];
        for (var i = 0; i < 4; i++) {
            if (!corners[i]) { return null; }
            corners[i].x = Math.round(corners[i].x / scale);
            corners[i].y = Math.round(corners[i].y / scale);
        }

        return { corners: corners, score: 0.85 };
    }

    function detectByTextDensity(grayMat, scale, sw, sh) {
        // Documents have text (high local variance), desks don't (smooth)
        // Use local variance to separate document from bright background
        var blockSize = Math.max(3, Math.round(Math.min(sw, sh) * 0.015)) | 1;

        // 1. Local mean
        var mean = new cv.Mat();
        cv.boxFilter(grayMat, mean, cv.CV_32F, new cv.Size(blockSize, blockSize));
        // 2. Local squared mean
        var sq = new cv.Mat();
        cv.multiply(grayMat, grayMat, sq);
        var sqMean = new cv.Mat();
        cv.boxFilter(sq, sqMean, cv.CV_32F, new cv.Size(blockSize, blockSize));
        sq.delete();
        // 3. Variance = sqMean - mean^2
        var meanSq = new cv.Mat();
        cv.multiply(mean, mean, meanSq);
        var variance = new cv.Mat();
        cv.subtract(sqMean, meanSq, variance);
        mean.delete(); sqMean.delete(); meanSq.delete();

        // 4. Normalize to 0-255
        cv.normalize(variance, variance, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        // 5. Threshold to get high-variance (text) regions
        var textMask = new cv.Mat();
        cv.threshold(variance, textMask, 30, 255, cv.THRESH_BINARY);
        variance.delete();

        // 6. Dilate heavily to merge text regions into document blob
        var dilateSize = Math.round(Math.min(sw, sh) * 0.08) | 1;
        var dilateK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(dilateSize, dilateSize));
        cv.dilate(textMask, textMask, dilateK);
        dilateK.delete();

        // 7. Find largest contour (the document blob)
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(textMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        textMask.delete();

        var largest = null, largestArea = 0;
        var totalArea = sw * sh;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a > largestArea && a < totalArea * 0.90) { largestArea = a; largest = contours.get(i); }
        }

        if (!largest || largestArea < totalArea * 0.03) {
            contours.delete(); hierarchy.delete();
            return null;
        }

        // 8. Convex hull to get smooth document boundary
        var hull = new cv.Mat();
        cv.convexHull(largest, hull, false, true);

        // 9. Approximate to quadrilateral
        var hullPts = new cv.MatVector();
        hullPts.push_back(hull);
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1];
        var best = null;
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(hull, approx, epsList[ei] * cv.arcLength(hull, true), true);
            if (approx.rows === 4) {
                var corners = [];
                for (var j = 0; j < approx.rows; j++) {
                    corners.push({
                        x: Math.round(approx.data32S[j * 2] / scale),
                        y: Math.round(approx.data32S[j * 2 + 1] / scale)
                    });
                }
                best = { corners: corners, score: 1.0 };
                approx.delete();
                break;
            }
            approx.delete();
        }
        hull.delete(); contours.delete(); hierarchy.delete();
        return best;
    }

    function detectByHighPass(grayMat, scale, sw, sh) {
        // High-pass filter: img - blurred(img)
        // Removes background (desk), keeps text edges
        // Then dilate text into document shape
        var totalArea = sw * sh;

        var k = Math.max(5, Math.round(Math.min(sw, sh) * 0.025)) | 1;
        var blur = new cv.Mat();
        cv.GaussianBlur(grayMat, blur, new cv.Size(k, k), 0);

        var diff = new cv.Mat();
        cv.absdiff(grayMat, blur, diff);
        blur.delete();

        // Threshold diff to get text edges
        var textMask = new cv.Mat();
        cv.threshold(diff, textMask, 15, 255, cv.THRESH_BINARY);

        // Try multiple dilation sizes
        var dilateSizes = [
            Math.round(Math.min(sw, sh) * 0.04) | 1,
            Math.round(Math.min(sw, sh) * 0.06) | 1,
            Math.round(Math.min(sw, sh) * 0.08) | 1,
            Math.round(Math.min(sw, sh) * 0.12) | 1,
        ];

        var bestResult = null, bestArea2 = 0;

        for (var di = 0; di < dilateSizes.length; di++) {
            var ds = dilateSizes[di];
            if (ds < 3) continue;

            var working = textMask.clone();
            var dk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ds, ds));
            cv.dilate(working, working, dk);
            dk.delete();

            // Morphological close to fill holes
            var ckSize = Math.round(ds * 0.5) | 1;
            if (ckSize < 3) ckSize = 3;
            var ck = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ckSize, ckSize));
            cv.morphologyEx(working, working, cv.MORPH_CLOSE, ck);
            ck.delete();

            var contours = new cv.MatVector();
            var hierarchy = new cv.Mat();
            cv.findContours(working, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            working.delete();

            for (var ci = 0; ci < contours.size(); ci++) {
                var area = Math.abs(cv.contourArea(contours.get(ci)));
                if (area > bestArea2 && area < totalArea * 0.92 && area > totalArea * 0.03) {
                    var largest = contours.get(ci);

                    // getCornerPoints using centroid
                    var cx = 0, cy = 0;
                    var nPts = largest.data32S.length / 2;
                    for (var i = 0; i < largest.data32S.length; i += 2) {
                        cx += largest.data32S[i];
                        cy += largest.data32S[i + 1];
                    }
                    cx /= nPts; cy /= nPts;

                    var tl = null, tr = null, bl = null, br = null;
                    var tlD = 0, trD = 0, blD = 0, brD = 0;
                    for (var i = 0; i < largest.data32S.length; i += 2) {
                        var px = largest.data32S[i], py = largest.data32S[i + 1];
                        var dd = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
                        if (px < cx && py < cy) { if (dd > tlD) { tlD = dd; tl = { x: px, y: py }; } }
                        else if (px > cx && py < cy) { if (dd > trD) { trD = dd; tr = { x: px, y: py }; } }
                        else if (px < cx && py > cy) { if (dd > blD) { blD = dd; bl = { x: px, y: py }; } }
                        else if (px > cx && py > cy) { if (dd > brD) { brD = dd; br = { x: px, y: py }; } }
                    }

                    if (tl && tr && bl && br) {
                        bestArea2 = area;
                        var corners = [tl, tr, br, bl].map(function (p) {
                            return { x: Math.round(p.x / scale), y: Math.round(p.y / scale) };
                        });
                        bestResult = { corners: corners, score: 1.0 };
                    }
                }
            }
            contours.delete(); hierarchy.delete();
        }

        textMask.delete(); diff.delete();
        return bestResult;
    }

    function detectBySobelEdges(grayMat, scale, sw, sh) {
        var dbg = function (msg) { console.log('[SobelDbg] ' + msg); };
        var totalArea = sw * sh;

        var sobelX = new cv.Mat();
        var sobelY = new cv.Mat();
        var grad = new cv.Mat();
        cv.Sobel(grayMat, sobelX, cv.CV_32F, 1, 0, 3);
        cv.Sobel(grayMat, sobelY, cv.CV_32F, 0, 1, 3);
        cv.magnitude(sobelX, sobelY, grad);
        sobelX.delete(); sobelY.delete();
        cv.convertScaleAbs(grad, grad);
        dbg('Sobel computed');

        // Use Otsu on gradient instead of histogram
        var edgeMask = new cv.Mat();
        cv.threshold(grad, edgeMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        grad.delete();
        dbg('Otsu threshold applied');

        // Try multiple erosion/dilation strategies
        var strategies = [
            { erode: 0, dilate: 3 },   // just dilate a bit
            { erode: 3, dilate: 7 },   // erode thin + dilate
            { erode: 0, dilate: 7 },   // dilate more
            { erode: 5, dilate: 9 },   // heavy erode + heavy dilate
        ];

        var bestResult = null, bestArea2 = 0;

        for (var si = 0; si < strategies.length; si++) {
            var s = strategies[si];
            var working = edgeMask.clone();

            if (s.erode > 0) {
                var ek = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(s.erode, s.erode));
                cv.erode(working, working, ek);
                ek.delete();
            }
            if (s.dilate > 0) {
                var dk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(s.dilate, s.dilate));
                cv.dilate(working, working, dk);
                dk.delete();
            }

            var contours = new cv.MatVector();
            var hierarchy = new cv.Mat();
            cv.findContours(working, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
            working.delete();

            for (var ci = 0; ci < contours.size(); ci++) {
                var area = Math.abs(cv.contourArea(contours.get(ci)));
                if (area > bestArea2 && area < totalArea * 0.95 && area > totalArea * 0.03) {
                    var largest = contours.get(ci);

                    // Compute center
                    var cx = 0, cy = 0;
                    var nPts = largest.data32S.length / 2;
                    for (var i = 0; i < largest.data32S.length; i += 2) {
                        cx += largest.data32S[i];
                        cy += largest.data32S[i + 1];
                    }
                    cx /= nPts; cy /= nPts;

                    // Furthest point in each quadrant
                    var tl = null, tr = null, bl = null, br = null;
                    var tlD = 0, trD = 0, blD = 0, brD = 0;
                    for (var i = 0; i < largest.data32S.length; i += 2) {
                        var px = largest.data32S[i], py = largest.data32S[i + 1];
                        var d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
                        if (px < cx && py < cy) { if (d > tlD) { tlD = d; tl = { x: px, y: py }; } }
                        else if (px > cx && py < cy) { if (d > trD) { trD = d; tr = { x: px, y: py }; } }
                        else if (px < cx && py > cy) { if (d > blD) { blD = d; bl = { x: px, y: py }; } }
                        else if (px > cx && py > cy) { if (d > brD) { brD = d; br = { x: px, y: py }; } }
                    }

                    if (tl && tr && bl && br) {
                        bestArea2 = area;
                        var corners = [tl, tr, br, bl].map(function (p) {
                            return { x: Math.round(p.x / scale), y: Math.round(p.y / scale) };
                        });
                        bestResult = { corners: corners, score: 1.0 };
                        dbg('s' + si + ' erode=' + s.erode + ' dilate=' + s.dilate + ' area=' + Math.round(area / totalArea * 100) + '% pts=' + nPts);
                    }
                }
            }
            contours.delete(); hierarchy.delete();
        }

        edgeMask.delete();
        dbg('best found: ' + (bestResult ? 'YES' : 'NO'));
        return bestResult;
    }

    function detectByJscanify(grayMat, scale, sw, sh) {
        // Exact pipeline from jscanify open-source library
        // Canny → Blur → Otsu → findContours(RETR_CCOMP) → largest contour → getCornerPoints

        // 1. Canny edge detection
        var edges = new cv.Mat();
        cv.Canny(grayMat, edges, 50, 200);

        // 2. Light blur
        var blurred = new cv.Mat();
        cv.GaussianBlur(edges, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);

        // 3. Otsu threshold on blurred edges
        var thresh = new cv.Mat();
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

        // 4. Find contours with RETR_CCOMP (includes internal contours)
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

        edges.delete(); blurred.delete(); thresh.delete();

        // 5. Find largest contour
        var maxArea = 0;
        var maxIdx = -1;
        var totalArea = sw * sh;
        for (var i = 0; i < contours.size(); i++) {
            var area = Math.abs(cv.contourArea(contours.get(i)));
            if (area > maxArea && area < totalArea * 0.95) {
                maxArea = area;
                maxIdx = i;
            }
        }

        if (maxIdx < 0 || maxArea < totalArea * 0.02) {
            contours.delete(); hierarchy.delete();
            return null;
        }

        var largest = contours.get(maxIdx);

        // 6. Get corner points: center point + furthest point per quadrant
        var cx = 0, cy = 0;
        var nPts = largest.data32S.length / 2;
        for (var i = 0; i < largest.data32S.length; i += 2) {
            cx += largest.data32S[i];
            cy += largest.data32S[i + 1];
        }
        cx /= nPts;
        cy /= nPts;

        var tl = null, tr = null, bl = null, br = null;
        var tlDist = 0, trDist = 0, blDist = 0, brDist = 0;

        for (var i = 0; i < largest.data32S.length; i += 2) {
            var px = largest.data32S[i], py = largest.data32S[i + 1];
            var d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
            if (px < cx && py < cy) { if (d > tlDist) { tlDist = d; tl = { x: px, y: py }; } }
            else if (px > cx && py < cy) { if (d > trDist) { trDist = d; tr = { x: px, y: py }; } }
            else if (px < cx && py > cy) { if (d > blDist) { blDist = d; bl = { x: px, y: py }; } }
            else if (px > cx && py > cy) { if (d > brDist) { brDist = d; br = { x: px, y: py }; } }
        }

        contours.delete(); hierarchy.delete();

        if (!tl || !tr || !bl || !br) return null;

        var corners = [tl, tr, br, bl].map(function (p) {
            return { x: Math.round(p.x / scale), y: Math.round(p.y / scale) };
        });

        return { corners: corners, score: 1.0 };
    }

    function detectByTextInverse(grayMat, scale, sw, sh) {
        // For bright backgrounds: find dark text, then dilate into document shape
        var totalArea = sw * sh;

        // Try multiple dark thresholds
        var thresholds = [40, 50, 60, 80, 100];
        var best = null, bestArea2 = 0;

        for (var ti = 0; ti < thresholds.length; ti++) {
            var textMask = new cv.Mat();
            cv.threshold(grayMat, textMask, thresholds[ti], 255, cv.THRESH_BINARY_INV);

            // Remove very small noise
            var morphK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            cv.erode(textMask, textMask, morphK);
            cv.dilate(textMask, textMask, morphK);
            morphK.delete();

            // Heavy dilation to merge text into document blob
            var k = Math.round(Math.min(sw, sh) * 0.06) | 1;
            if (k < 5) k = 5;
            var kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
            cv.dilate(textMask, textMask, kernel);
            kernel.delete();

            var contours = new cv.MatVector();
            var hierarchy = new cv.Mat();
            cv.findContours(textMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            textMask.delete();

            for (var ci = 0; ci < contours.size(); ci++) {
                var area = Math.abs(cv.contourArea(contours.get(ci)));
                if (area > bestArea2 && area < totalArea * 0.90 && area > totalArea * 0.03) {
                    // Find convex hull + quad
                    var hull = new cv.Mat();
                    cv.convexHull(contours.get(ci), hull, false, true);
                    var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05];
                    for (var ei = 0; ei < epsList.length; ei++) {
                        var approx = new cv.Mat();
                        cv.approxPolyDP(hull, approx, epsList[ei] * cv.arcLength(hull, true), true);
                        if (approx.rows === 4) {
                            bestArea2 = area;
                            var corners = [];
                            for (var j = 0; j < approx.rows; j++) {
                                corners.push({
                                    x: Math.round(approx.data32S[j * 2] / scale),
                                    y: Math.round(approx.data32S[j * 2 + 1] / scale)
                                });
                            }
                            best = { corners: corners, score: 1.0 };
                            approx.delete();
                            hull.delete();
                            contours.delete(); hierarchy.delete();
                            return best;
                        }
                        approx.delete();
                    }
                    hull.delete();
                }
            }
            contours.delete(); hierarchy.delete();
        }

        return best;
    }

    function detectByInsideOutside(grayMat, scale, sw, sh) {
        // New approach: find quad where inside is much brighter than outside + edges align
        var k = Math.max(25, Math.round(Math.min(sw, sh) * 0.05));
        if (k % 2 === 0) k++;
        var blurred = new cv.Mat();
        cv.GaussianBlur(grayMat, blurred, new cv.Size(k, k), 0);
        var bin = new cv.Mat();
        cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var morphK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
        cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, morphK);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var candidates = [];
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a < sw * sh * 0.02 || a > sw * sh * 0.98) continue;
            var epsList2 = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];
            for (var e = 0; e < epsList2.length; e++) {
                var ap = new cv.Mat();
                cv.approxPolyDP(contours.get(i), ap, epsList2[e] * cv.arcLength(contours.get(i), true), true);
                if (ap.rows === 4) {
                    // Create mask for this quad
                    var mask = cv.Mat.zeros(sh, sw, cv.CV_8U);
                    var pts = new cv.MatVector();
                    pts.push_back(ap);
                    cv.drawContours(mask, pts, 0, new cv.Scalar(255), cv.FILLED);
                    var insideMean = cv.mean(grayMat, mask)[0];
                    // Outside region (dilated mask - original mask)
                    var dk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
                    var dilated = new cv.Mat();
                    cv.dilate(mask, dilated, dk);
                    var outsideMask = new cv.Mat();
                    cv.subtract(dilated, mask, outsideMask);
                    var outsideMean = cv.mean(grayMat, outsideMask)[0];
                    var contrast = Math.max(0, insideMean - outsideMean) / 255;
                    var areaRatio = a / (sw * sh);
                    var totalScore = contrast * 10 + areaRatio;
                    var corners = [];
                    for (var j = 0; j < ap.rows; j++) {
                        corners.push({ x: Math.round(ap.data32S[j * 2] / scale), y: Math.round(ap.data32S[j * 2 + 1] / scale) });
                    }
                    candidates.push({ corners: corners, score: totalScore, contrast: contrast });
                    mask.delete(); pts.delete(); dilated.delete(); outsideMask.delete(); dk.delete();
                    ap.delete();
                    break;
                }
                ap.delete();
            }
        }
        blurred.delete(); bin.delete(); morphK.delete(); contours.delete(); hierarchy.delete();
        if (candidates.length === 0) return null;
        candidates.sort(function (a, b) { return b.score - a.score; });
        console.log('[OpenCV] Inside-outside top candidate: contrast=' + candidates[0].contrast.toFixed(3) + ' score=' + candidates[0].score.toFixed(3));
        if (candidates[0].contrast < 0.05) return null;
        return { corners: candidates[0].corners, score: candidates[0].score };
    }

    function detectByBrightBBox(grayMat, scale, sw, sh) {
        // Simplest possible: threshold, find bounding rect of bright region
        var blurred = new cv.Mat();
        var k = Math.max(15, Math.round(Math.min(sw, sh) * 0.03));
        if (k % 2 === 0) k++;
        cv.GaussianBlur(grayMat, blurred, new cv.Size(k, k), 0);
        var bin = new cv.Mat();
        cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var bestRect = null, bestArea = 0;
        for (var i = 0; i < contours.size(); i++) {
            var rect = cv.boundingRect(contours.get(i));
            var a = rect.width * rect.height;
            if (a > bestArea && a < sw * sh * 0.98) { bestArea = a; bestRect = rect; }
        }
        blurred.delete(); bin.delete(); contours.delete(); hierarchy.delete();
        if (!bestRect || bestArea < sw * sh * 0.01) return null;
        return [
            { x: Math.round(bestRect.x / scale), y: Math.round(bestRect.y / scale) },
            { x: Math.round((bestRect.x + bestRect.width) / scale), y: Math.round(bestRect.y / scale) },
            { x: Math.round((bestRect.x + bestRect.width) / scale), y: Math.round((bestRect.y + bestRect.height) / scale) },
            { x: Math.round(bestRect.x / scale), y: Math.round((bestRect.y + bestRect.height) / scale) }
        ];
    }

    function detectByHeavyBlur(grayMat, scale, sw, sh) {
        // Very aggressive blur to remove all text, keeping only document outline
        var k = Math.max(31, Math.round(Math.min(sw, sh) * 0.08));
        if (k % 2 === 0) k++;
        var blurred = new cv.Mat();
        cv.GaussianBlur(grayMat, blurred, new cv.Size(k, k), 0);
        var bin = new cv.Mat();
        cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var morphK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
        cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, morphK);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var largest = null, largestArea = 0;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a > largestArea && a < sw * sh * 0.98) { largestArea = a; largest = contours.get(i); }
        }
        blurred.delete(); bin.delete(); morphK.delete();
        if (!largest || largestArea < sw * sh * 0.03) {
            contours.delete(); hierarchy.delete();
            return null;
        }
        var mask = new cv.Mat.zeros(sh, sw, cv.CV_8U);
        var fillVec = new cv.MatVector();
        fillVec.push_back(largest);
        cv.drawContours(mask, fillVec, 0, new cv.Scalar(255), cv.FILLED);
        var filledContours = new cv.MatVector();
        var filledHier = new cv.Mat();
        cv.findContours(mask, filledContours, filledHier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var filledLargest = null;
        if (filledContours.size() > 0) filledLargest = filledContours.get(0);
        mask.delete(); fillVec.delete(); filledContours.delete(); filledHier.delete();
        contours.delete(); hierarchy.delete();
        if (!filledLargest) return null;
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(filledLargest, approx, epsList[ei] * cv.arcLength(filledLargest, true), true);
            if (approx.rows === 4) {
                var corners = [];
                for (var j = 0; j < approx.rows; j++) {
                    corners.push({ x: Math.round(approx.data32S[j * 2] / scale), y: Math.round(approx.data32S[j * 2 + 1] / scale) });
                }
                approx.delete();
                return corners;
            }
            approx.delete();
        }
        return null;
    }

    function detectBySegmentation(grayMat, scale, sw, sh) {
        var filtered = new cv.Mat();
        var k = Math.max(15, Math.round(Math.min(sw, sh) * 0.03));
        if (k % 2 === 0) k++;
        cv.medianBlur(grayMat, filtered, k);
        var bin = new cv.Mat();
        cv.threshold(filtered, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var morphK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
        cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, morphK);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var largest = null, largestArea = 0;
        for (var i = 0; i < contours.size(); i++) {
            var a = Math.abs(cv.contourArea(contours.get(i)));
            if (a > largestArea) { largestArea = a; largest = contours.get(i); }
        }
        if (!largest || largestArea < sw * sh * 0.05) {
            filtered.delete(); bin.delete(); morphK.delete(); contours.delete(); hierarchy.delete();
            return null;
        }
        var mask = new cv.Mat.zeros(sh, sw, cv.CV_8U);
        var fillVec = new cv.MatVector();
        fillVec.push_back(largest);
        cv.drawContours(mask, fillVec, 0, new cv.Scalar(255), cv.FILLED);
        var filledContours = new cv.MatVector();
        var filledHier = new cv.Mat();
        cv.findContours(mask, filledContours, filledHier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var filledLargest = null;
        if (filledContours.size() > 0) filledLargest = filledContours.get(0);
        mask.delete(); fillVec.delete(); filledContours.delete(); filledHier.delete();
        filtered.delete(); bin.delete(); morphK.delete(); contours.delete(); hierarchy.delete();
        if (!filledLargest) return null;
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];
        var bestApprox = null;
        for (var ei = 0; ei < epsList.length; ei++) {
            var approx = new cv.Mat();
            cv.approxPolyDP(filledLargest, approx, epsList[ei] * cv.arcLength(filledLargest, true), true);
            if (approx.rows === 4) { bestApprox = approx; break; }
            approx.delete();
        }
        if (!bestApprox) return null;
        var corners = [];
        for (var j = 0; j < bestApprox.rows; j++) {
            corners.push({
                x: Math.round(bestApprox.data32S[j * 2] / scale),
                y: Math.round(bestApprox.data32S[j * 2 + 1] / scale)
            });
        }
        bestApprox.delete();
        return corners;
    }

    function detectByFloodFill(grayMat, scale, sw, sh) {
        var cx = Math.floor(sw / 2), cy = Math.floor(sh / 2);
        var totalArea = sw * sh;
        var bestResult = null, bestArea = 0;

        // Try ascending tolerances and detect leaks
        for (var tol = 5; tol <= 120; tol += 5) {
            var mask = new cv.Mat.zeros(sh + 2, sw + 2, cv.CV_8U);
            var seed = new cv.Point(cx, cy);
            var flags = 4 | (255 << 8) | cv.FLOODFILL_MASK_ONLY | 65536; // 65536 = FLOODFILL_FIXED_RANGE
            var lowDiff = new cv.Scalar(tol, tol, tol, 0);
            var highDiff = new cv.Scalar(tol, tol, tol, 0);
            var rect = new cv.Rect();
            try {
                cv.floodFill(grayMat, mask, seed, new cv.Scalar(255), rect, lowDiff, highDiff, flags);
            } catch (e) {
                mask.delete(); lowDiff.delete(); highDiff.delete();
                continue;
            }
            lowDiff.delete(); highDiff.delete();

            var fillArea = rect.width * rect.height;
            // Leak detected: filled area jumped to >90% of image
            if (fillArea > totalArea * 0.90) {
                mask.delete();
                break; // Stop — previous tolerance was best
            }

            if (fillArea > bestArea && fillArea > totalArea * 0.05) {
                var contours = new cv.MatVector();
                var hierarchy = new cv.Mat();
                cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                var largest = null, la = 0;
                for (var i = 0; i < contours.size(); i++) {
                    var a = Math.abs(cv.contourArea(contours.get(i)));
                    if (a > la) { la = a; largest = contours.get(i); }
                }
                if (largest) {
                    bestArea = fillArea;
                    var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1];
                    for (var ei = 0; ei < epsList.length; ei++) {
                        var approx = new cv.Mat();
                        cv.approxPolyDP(largest, approx, epsList[ei] * cv.arcLength(largest, true), true);
                        if (approx.rows === 4) {
                            var corners = [];
                            for (var j = 0; j < approx.rows; j++) {
                                corners.push({
                                    x: Math.round(approx.data32S[j * 2] / scale),
                                    y: Math.round(approx.data32S[j * 2 + 1] / scale)
                                });
                            }
                            bestResult = corners;
                            approx.delete();
                            break;
                        }
                        approx.delete();
                    }
                }
                contours.delete(); hierarchy.delete();
            }
            mask.delete();
        }

        return bestResult;
    }

    function refineCornersToEdges(grayMat, corners, scale, sw, sh) {
        // grayMat is scaled-down to (sw, sh)
        // corners are in ORIGINAL coordinates — scale them down
        var scaled = corners.map(function (p) {
            return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) };
        });
        var cx = 0, cy = 0;
        for (var i = 0; i < 4; i++) { cx += scaled[i].x; cy += scaled[i].y; }
        cx = Math.round(cx / 4); cy = Math.round(cy / 4);

        var sobelX = new cv.Mat();
        var sobelY = new cv.Mat();
        var grad = new cv.Mat();
        cv.Sobel(grayMat, sobelX, cv.CV_32F, 1, 0, 3);
        cv.Sobel(grayMat, sobelY, cv.CV_32F, 0, 1, 3);
        cv.magnitude(sobelX, sobelY, grad);
        sobelX.delete(); sobelY.delete();

        var refined = [];
        var maxSearch = Math.round(Math.min(sw, sh) * 0.15);

        for (var ci = 0; ci < 4; ci++) {
            var c = scaled[ci];
            var dx = c.x - cx, dy = c.y - cy;
            var len = Math.sqrt(Math.abs(dx) + Math.abs(dy));
            if (len < 1) { dx = ci < 2 ? 1 : -1; dy = ci % 2 === 0 ? -1 : 1; len = 1; }
            var nx = dx / len, ny = dy / len;

            var bestGrad = 0, bestOff = 0;
            for (var off = 1; off <= maxSearch && off <= 100; off++) {
                var px = Math.round(c.x + nx * off);
                var py = Math.round(c.y + ny * off);
                if (px < 1 || px >= sw - 1 || py < 1 || py >= sh - 1) break;
                var g = grad.floatAt(py, px);
                if (g > bestGrad) { bestGrad = g; bestOff = off; }
            }

            refined.push({
                x: Math.round((c.x + nx * bestOff) / scale),
                y: Math.round((c.y + ny * bestOff) / scale)
            });
        }

        grad.delete();
        return refined;
    }

    function scoreCorners(corners, sw, sh) {
        if (!corners || corners.length !== 4) return -1;

        var cx = 0, cy = 0;
        for (var i = 0; i < 4; i++) { cx += corners[i].x; cy += corners[i].y; }
        cx /= 4; cy /= 4;

        var cdx = cx / sw - 0.5, cdy = cy / sh - 0.5;
        var centerScore = Math.max(0, 1 - 2 * Math.sqrt(cdx * cdx + cdy * cdy));

        var area = polygonArea(corners);
        var imgArea = sw * sh;
        var areaRatio = area / imgArea;
        var areaScore = Math.min(areaRatio / 0.5, 1);

        var w1 = Math.sqrt(Math.pow(corners[0].x - corners[1].x, 2) + Math.pow(corners[0].y - corners[1].y, 2));
        var w2 = Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2));
        var h1 = Math.sqrt(Math.pow(corners[0].x - corners[3].x, 2) + Math.pow(corners[0].y - corners[3].y, 2));
        var h2 = Math.sqrt(Math.pow(corners[1].x - corners[2].x, 2) + Math.pow(corners[1].y - corners[2].y, 2));
        var w = Math.max(w1, w2), h = Math.max(h1, h2);
        var ratio = Math.max(w, h) / Math.min(w, h);
        var ratioScore = ratio < 4 ? 1 - (ratio - 1) / 3 : 0;

        var score = centerScore * 0.3 + areaScore * 0.4 + ratioScore * 0.3;

        // Penalty: if quad is the image boundary itself (document fills frame → try harder)
        var marginPx = Math.max(2, Math.round(Math.min(sw, sh) * 0.01));
        var boundaryHits = 0;
        for (var i = 0; i < 4; i++) {
            var atLeft = corners[i].x <= marginPx;
            var atRight = corners[i].x >= sw - marginPx;
            var atTop = corners[i].y <= marginPx;
            var atBottom = corners[i].y >= sh - marginPx;
            if ((atLeft || atRight) || (atTop || atBottom)) boundaryHits++;
        }
        if (boundaryHits >= 3) score *= 0.5;

        return score;
    }

    function findDocumentQuad(binaryMat, scale, strategyName) {
        var imgArea = binaryMat.rows * binaryMat.cols;
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var count = contours.size();
        var epsList = [0.005, 0.008, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15];

        var best = null, bestScore = -1;

        for (var ci = 0; ci < count; ci++) {
            var area = Math.abs(cv.contourArea(contours.get(ci)));
            if (area < imgArea * 0.02) continue;

            var mask = new cv.Mat.zeros(binaryMat.rows, binaryMat.cols, cv.CV_8U);
            var fillVec = new cv.MatVector();
            fillVec.push_back(contours.get(ci));
            cv.drawContours(mask, fillVec, 0, new cv.Scalar(255), cv.FILLED);

            var filledContours = new cv.MatVector();
            var filledHier = new cv.Mat();
            cv.findContours(mask, filledContours, filledHier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            if (filledContours.size() > 0) {
                var filled = filledContours.get(0);
                for (var ei = 0; ei < epsList.length; ei++) {
                    var approx = new cv.Mat();
                    var ep = epsList[ei] * cv.arcLength(filled, true);
                    cv.approxPolyDP(filled, approx, ep, true);
                    if (approx.rows === 4) {
                        // Score at scaled resolution (matching sw/sh)
                        var cornersScaled = [];
                        for (var j = 0; j < approx.rows; j++) {
                            cornersScaled.push({
                                x: approx.data32S[j * 2],
                                y: approx.data32S[j * 2 + 1]
                            });
                        }
                        var sc = scoreCorners(cornersScaled, binaryMat.cols, binaryMat.rows);
                        if (sc > bestScore) {
                            bestScore = sc;
                            // Convert to original coordinates only when saving best
                            var cornersFull = [];
                            for (var j = 0; j < approx.rows; j++) {
                                cornersFull.push({
                                    x: Math.round(cornersScaled[j].x / scale),
                                    y: Math.round(cornersScaled[j].y / scale)
                                });
                            }
                            best = cornersFull;
                        }
                        approx.delete();
                        break;
                    }
                    approx.delete();
                }
            }

            mask.delete(); fillVec.delete(); filledContours.delete(); filledHier.delete();
        }

        if (best && bestScore > 0.15) {
            console.log('[OpenCV] ' + strategyName + ': ' + count + ' contours, score=' + bestScore.toFixed(2) + ' ✓', JSON.stringify(best));
        } else {
            console.log('[OpenCV] ' + strategyName + ': ' + count + ' contours, bestScore=' + (best ? bestScore.toFixed(2) : 'N/A') + ' ✗');
            best = null;
        }

        contours.delete(); hierarchy.delete();
        if (best) return { corners: best, score: bestScore };
        return null;
    }

    function detectCornersOpenCV(img, onSuccess, onFail) {
        var maxDim = 1200;
        var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        var sw = Math.round(img.naturalWidth * scale), sh = Math.round(img.naturalHeight * scale);

        var canvas = document.createElement('canvas');
        canvas.width = sw; canvas.height = sh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, sw, sh);

        try {
            var src = cv.imread(canvas);
            var gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Light blur for Canny
            var lightBlur = new cv.Mat();
            cv.GaussianBlur(gray, lightBlur, new cv.Size(3, 3), 0);

            // Heavy blur for threshold-based methods
            var blurred = new cv.Mat();
            var ksize = Math.max(5, Math.round(Math.min(sw, sh) * 0.015));
            if (ksize % 2 === 0) ksize++;
            cv.GaussianBlur(gray, blurred, new cv.Size(ksize, ksize), 0);

            var bestCorners = null, bestScore2 = -1;
            var blockSize = Math.max(3, Math.round(Math.min(sw, sh) * 0.04)) | 1;

            function tryCandidate(corners, score, strategy) {
                if (score > bestScore2) { bestScore2 = score; bestCorners = corners; }
            }

            // ── Strategy 1: Convex hull (true document boundary) ──
            console.log('[OpenCV] Trying convex hull...');
            var chResult = detectByConvexHull(gray, scale, sw, sh);
            if (chResult) {
                var chScaled = chResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(chScaled, sw, sh);
                console.log('[OpenCV] Convex hull result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(chResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = chResult.corners; }
            } else {
                console.log('[OpenCV] Convex hull: no document found');
            }

            // ── Strategy 2: jscanify pipeline (Canny→Blur→Otsu→RETR_CCOMP→getCornerPoints) ──
            console.log('[OpenCV] Trying jscanify...');
            var jsResult = detectByJscanify(gray, scale, sw, sh);
            if (jsResult) {
                var jsScaled = jsResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(jsScaled, sw, sh);
                console.log('[OpenCV] jscanify result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(jsResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = jsResult.corners; }
            } else {
                console.log('[OpenCV] jscanify: no document found');
            }

            // ── Strategy 3: Sobel edges (adaptive threshold + thin-edge removal) ──
            console.log('[OpenCV] Trying Sobel edges...');
            var seResult = detectBySobelEdges(gray, scale, sw, sh);
            if (seResult) {
                var seScaled = seResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(seScaled, sw, sh);
                console.log('[OpenCV] Sobel edges result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(seResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = seResult.corners; }
            } else {
                console.log('[OpenCV] Sobel edges: no document found');
            }

            // ── Strategy 4: High-pass filter (img − blur → text edges → dilate) ──
            console.log('[OpenCV] Trying high-pass...');
            var hpResult = detectByHighPass(gray, scale, sw, sh);
            if (hpResult) {
                var hpScaled = hpResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(hpScaled, sw, sh);
                console.log('[OpenCV] High-pass result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(hpResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = hpResult.corners; }
            } else {
                console.log('[OpenCV] High-pass: no document found');
            }

            // ── Strategy 5: Text density (local variance) ──
            console.log('[OpenCV] Trying text density...');
            var tdResult = detectByTextDensity(gray, scale, sw, sh);
            if (tdResult) {
                var tdScaled = tdResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(tdScaled, sw, sh);
                console.log('[OpenCV] Text density result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(tdResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = tdResult.corners; }
            } else {
                console.log('[OpenCV] Text density: no document found');
            }

            // ── Strategy 3: Text-inverse (dark text → dilate → document) ──
            console.log('[OpenCV] Trying text-inverse...');
            var tiResult = detectByTextInverse(gray, scale, sw, sh);
            if (tiResult) {
                var tiScaled = tiResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(tiScaled, sw, sh);
                console.log('[OpenCV] Text-inverse result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(tiResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = tiResult.corners; }
            } else {
                console.log('[OpenCV] Text-inverse: no document found');
            }

            // ── Strategy 4: Extreme corners (convex hull + extreme points) ──
            console.log('[OpenCV] Trying extreme corners...');
            var ecResult = detectByExtremeCorners(gray, scale, sw, sh);
            if (ecResult) {
                var ecScaled = ecResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var ecScore = scoreCorners(ecScaled, sw, sh);
                console.log('[OpenCV] Extreme corners result: score=' + ecScore.toFixed(2) + (ecScore > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(ecResult.corners));
                if (ecScore > bestScore2 && ecScore > 0.15) { bestScore2 = ecScore; bestCorners = ecResult.corners; }
            } else {
                console.log('[OpenCV] Extreme corners: no document found');
            }

            // ── Strategy 3: Inside-outside contrast ──
            console.log('[OpenCV] Trying inside-outside...');
            var ioResult = detectByInsideOutside(gray, scale, sw, sh);
            if (ioResult) {
                var ioScaled = ioResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(ioScaled, sw, sh);
                console.log('[OpenCV] Inside-outside result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(ioResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = ioResult.corners; }
            } else {
                console.log('[OpenCV] Inside-outside: no quad with sufficient contrast');
            }

            // ── Strategy 2: Edge scanning (find bright document by row/column scans) ──
            console.log('[OpenCV] Trying edge-scanning...');
            var scanCorners = detectByEdgeScanning(gray, scale, sw, sh);
            if (scanCorners) {
                var scanScaled = scanCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(scanScaled, sw, sh);
                console.log('[OpenCV] Edge-scanning result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(scanCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = scanCorners; }
            } else {
                console.log('[OpenCV] Edge-scanning: no document found');
            }

            // ── Strategy 2: Bright bounding box (simplest: threshold + rect) ──
            console.log('[OpenCV] Trying bright-bbox...');
            var bbCorners = detectByBrightBBox(gray, scale, sw, sh);
            if (bbCorners) {
                var bbScaled = bbCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(bbScaled, sw, sh);
                console.log('[OpenCV] Bright-bbox result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(bbCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = bbCorners; }
            } else {
                console.log('[OpenCV] Bright-bbox: no document found');
            }

            // ── Strategy 3: Heavy blur segmentation (removes all text) ──
            console.log('[OpenCV] Trying heavy-blur...');
            var hvCorners = detectByHeavyBlur(gray, scale, sw, sh);
            if (hvCorners) {
                var hvScaled = hvCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(hvScaled, sw, sh);
                console.log('[OpenCV] Heavy-blur result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(hvCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = hvCorners; }
            } else {
                console.log('[OpenCV] Heavy-blur: no document found');
            }

            // ── Strategy 3: Connected components from center ──
            console.log('[OpenCV] Trying connected-components...');
            var ccCorners = detectByConnectedComponents(gray, scale, sw, sh);
            if (ccCorners) {
                var ccScaled = ccCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(ccScaled, sw, sh);
                console.log('[OpenCV] Connected-components result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(ccCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = ccCorners; }
            } else {
                console.log('[OpenCV] Connected-components: no document found');
            }

            // ── Strategy 3: Intensity segmentation (median blur + Otsu) ──
            console.log('[OpenCV] Trying intensity segmentation...');
            var segCorners = detectBySegmentation(gray, scale, sw, sh);
            if (segCorners) {
                var segScaled = segCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(segScaled, sw, sh);
                console.log('[OpenCV] Segmentation result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(segCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = segCorners; }
            } else {
                console.log('[OpenCV] Segmentation: no document found');
            }

            // ── Strategy 3: Canny (both thresholds) ──
            var cannyThresholds = [[20, 80], [50, 150]];
            for (var ct = 0; ct < cannyThresholds.length; ct++) {
                var edges = new cv.Mat();
                cv.Canny(lightBlur, edges, cannyThresholds[ct][0], cannyThresholds[ct][1]);
                var dilated = new cv.Mat();
                var dilKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
                cv.dilate(edges, dilated, dilKernel);
                var cand = findDocumentQuad(dilated, scale, 'Canny(' + cannyThresholds[ct][0] + ',' + cannyThresholds[ct][1] + ')');
                if (cand) tryCandidate(cand.corners, cand.score, 'Canny');
                edges.delete(); dilated.delete(); dilKernel.delete();
            }

            // ── Strategy 2: Adaptive threshold (both polarities) ──
            var polarities = [cv.THRESH_BINARY, cv.THRESH_BINARY_INV];
            for (var p = 0; p < polarities.length; p++) {
                var binary = new cv.Mat();
                cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                    polarities[p], blockSize, 10);
                var morphSize = Math.max(3, Math.round(Math.min(sw, sh) * 0.008)) | 1;
                var kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(morphSize, morphSize));
                cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
                var cand = findDocumentQuad(binary, scale, 'Adaptive(pol=' + p + ')');
                if (cand) tryCandidate(cand.corners, cand.score, 'Adaptive');
                binary.delete(); kernel.delete();
            }

            // ── Strategy 3: Otsu threshold ──
            var otsuBin = new cv.Mat();
            cv.threshold(blurred, otsuBin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
            var morphSize2 = Math.max(3, Math.round(Math.min(sw, sh) * 0.008)) | 1;
            var kernel2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(morphSize2, morphSize2));
            cv.morphologyEx(otsuBin, otsuBin, cv.MORPH_CLOSE, kernel2);
            var cand = findDocumentQuad(otsuBin, scale, 'Otsu');
            if (cand) tryCandidate(cand.corners, cand.score, 'Otsu');
            otsuBin.delete(); kernel2.delete();

            // ── Strategy: Hough lines ──
            console.log('[OpenCV] Trying Hough lines...');
            var hlResult = detectByHoughLines(gray, scale, sw, sh);
            if (hlResult) {
                var hlScaled = hlResult.corners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(hlScaled, sw, sh);
                console.log('[OpenCV] Hough lines result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(hlResult.corners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = hlResult.corners; }
            } else {
                console.log('[OpenCV] Hough lines: no document found');
            }

            // ── Strategy: Flood-fill from center ──
            console.log('[OpenCV] Trying flood-fill from center...');
            var floodCorners = detectByFloodFill(gray, scale, sw, sh);
            if (floodCorners) {
                var floodScaled = floodCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(floodScaled, sw, sh);
                console.log('[OpenCV] Flood-fill result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(floodCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = floodCorners; }
            } else {
                console.log('[OpenCV] Flood-fill: no document found');
            }

            // ── Strategy 5: Projection-based ──
            console.log('[OpenCV] Trying projection fallback...');
            var projCorners = estimateCornersFromImage(gray, scale, sw, sh);
            if (projCorners) {
                var projScaled = projCorners.map(function (p) { return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) }; });
                var sc = scoreCorners(projScaled, sw, sh);
                console.log('[OpenCV] Projection result: score=' + sc.toFixed(2) + (sc > 0.15 ? ' ✓' : ' ✗') + ' ' + JSON.stringify(projCorners));
                if (sc > bestScore2 && sc > 0.15) { bestScore2 = sc; bestCorners = projCorners; }
            } else {
                console.log('[OpenCV] Projection fallback: no bounds found');
            }

            console.log('[OpenCV] Winner: score=' + (bestScore2 > 0 ? bestScore2.toFixed(2) : 'N/A') + (bestCorners ? ' ✓ ' + JSON.stringify(bestCorners) : ' none'));
            if (!bestCorners) { if (onFail) onFail('Could not find 4 corners'); src.delete(); gray.delete(); lightBlur.delete(); blurred.delete(); return; }

            // Refine corners to document edges using gradient (before deleting gray)
            bestCorners = refineCornersToEdges(gray, bestCorners, scale, sw, sh);
            console.log('[OpenCV] Refined corners: ' + JSON.stringify(bestCorners));

            src.delete(); gray.delete(); lightBlur.delete(); blurred.delete();

            bestCorners.sort(function (a, b) { return a.y - b.y; });
            var tl = bestCorners[0], br = bestCorners[3];
            var tr = bestCorners[1].x > bestCorners[2].x ? bestCorners[1] : bestCorners[2];
            var bl = bestCorners[1].x < bestCorners[2].x ? bestCorners[1] : bestCorners[2];

            if (onSuccess) onSuccess([tl, tr, br, bl]);
        } catch (e) {
            if (onFail) onFail('OpenCV error: ' + e.message);
        }
    }

    function detectCornersJS(img, onSuccess, onFail) {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { if (onFail) onFail('Invalid image'); return; }

        var maxDim = 800;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var sw = Math.round(w * scale), sh = Math.round(h * scale);
        var pixels = sw * sh;

        var cvs = document.createElement('canvas');
        cvs.width = sw; cvs.height = sh;
        var ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0, sw, sh);
        var data = ctx.getImageData(0, 0, sw, sh).data;

        var gray = new Uint8Array(pixels);
        for (var i = 0; i < pixels; i++) gray[i] = (0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]) | 0;

        var radius = Math.max(5, Math.round(Math.min(sw, sh) * 0.015));
        var tmp = new Uint8Array(pixels);
        for (var y = 0; y < sh; y++)
            for (var x = 0; x < sw; x++) {
                var s = 0, c = 0;
                for (var dx = -radius; dx <= radius; dx++) { var px = x + dx; if (px >= 0 && px < sw) { s += gray[y*sw+px]; c++; } }
                tmp[y*sw+x] = (s / c) | 0;
            }
        var blurred = new Uint8Array(pixels);
        for (var x = 0; x < sw; x++)
            for (var y = 0; y < sh; y++) {
                var s = 0, c = 0;
                for (var dy = -radius; dy <= radius; dy++) { var py = y + dy; if (py >= 0 && py < sh) { s += tmp[py*sw+x]; c++; } }
                blurred[y*sw+x] = (s / c) | 0;
            }

        for (var pass = 0; pass < 2; pass++) {
            var binary = new Uint8Array(pixels);
            if (pass === 0) {
                var offset = 18;
                for (var i = 0; i < pixels; i++) binary[i] = gray[i] > (blurred[i] - offset) ? 255 : 0;
            } else {
                var hist = new Uint32Array(256);
                for (var i = 0; i < pixels; i++) hist[blurred[i]]++;
                var total = pixels, sumV = 0;
                for (var i = 0; i < 256; i++) sumV += i * hist[i];
                var sb = 0, wb = 0, maxV = 0, th = 0;
                for (var i = 0; i < 256; i++) {
                    wb += hist[i]; if (wb === 0) continue;
                    var wf = total - wb; if (wf === 0) break;
                    sb += i * hist[i];
                    var mb = sb / wb, mf = (sumV - sb) / wf;
                    var bet = wb * wf * (mb - mf) * (mb - mf);
                    if (bet > maxV) { maxV = bet; th = i; }
                }
                for (var i = 0; i < pixels; i++) binary[i] = blurred[i] > th ? 255 : 0;
            }

            // Ensure document is white
            var cx = sw / 2, cy = sh / 2;
            var cw = 0, ct = 0;
            var r = Math.round(Math.min(sw, sh) * 0.05);
            for (var yy = -r; yy <= r; yy++)
                for (var xx = -r; xx <= r; xx++) {
                    var px = Math.round(cx+xx), py = Math.round(cy+yy);
                    if (px >= 0 && px < sw && py >= 0 && py < sh) { if (binary[py*sw+px] === 255) cw++; ct++; }
                }
            if (cw / ct < 0.5)
                for (var i = 0; i < pixels; i++) binary[i] = binary[i] === 255 ? 0 : 255;

            // Centroid
            var sx = 0, sy = 0, cnt = 0;
            for (var y = 0; y < sh; y++)
                for (var x = 0; x < sw; x++)
                    if (binary[y*sw+x] === 255) { sx += x; sy += y; cnt++; }
            if (cnt < 200) continue;

            var centX = sx / cnt, centY = sy / cnt;

            // Radial scan
            var map = {}, pts = [];
            var maxStep = Math.round(Math.sqrt(sw*sw + sh*sh));
            for (var a = 0; a < 360; a += 3) {
                var rad = a * Math.PI / 180;
                var dx = Math.cos(rad), dy = Math.sin(rad);
                var found = null;
                for (var step = 2; step < maxStep; step++) {
                    var sx2 = Math.round(centX + dx * step);
                    var sy2 = Math.round(centY + dy * step);
                    if (sx2 < 0 || sx2 >= sw || sy2 < 0 || sy2 >= sh) break;
                    if (binary[sy2*sw+sx2] === 0) {
                        var bx = Math.round(centX + dx * (step - 1));
                        var by = Math.round(centY + dy * (step - 1));
                        if (bx >= 0 && bx < sw && by >= 0 && by < sh) found = { x: bx, y: by };
                        break;
                    }
                }
                if (!found) found = { x: Math.max(0, Math.min(sw-1, Math.round(centX + dx * (maxStep-1)))), y: Math.max(0, Math.min(sh-1, Math.round(centY + dy * (maxStep-1)))) };
                var key = Math.round(found.x) + ',' + Math.round(found.y);
                if (!map[key]) { map[key] = true; pts.push({ x: found.x, y: found.y }); }
            }

            if (pts.length < 10) continue;

            // Douglas-Peucker
            function perpDist(p, a, b) {
                var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx*dx + dy*dy);
                if (len < 0.5) return Math.sqrt((p.x-a.x)*(p.x-a.x) + (p.y-a.y)*(p.y-a.y));
                return Math.abs(dy*p.x - dx*p.y + b.x*a.y - b.y*a.x) / len;
            }
            function dp(points, eps) {
                if (points.length <= 2) return points;
                var first = points[0], last = points[points.length-1];
                var maxD = 0, maxI = 0;
                for (var i = 1; i < points.length-1; i++) {
                    var d = perpDist(points[i], first, last);
                    if (d > maxD) { maxD = d; maxI = i; }
                }
                if (maxD > eps) {
                    var left = dp(points.slice(0, maxI+1), eps);
                    var right = dp(points.slice(maxI), eps);
                    return left.slice(0, -1).concat(right);
                }
                return [first, last];
            }

            var eps = Math.min(sw, sh) * 0.025;
            var simple = dp(pts, eps);
            while (simple.length > 6 && eps < Math.min(sw, sh) * 0.12) {
                eps *= 1.4;
                simple = dp(pts, eps);
            }
            if (simple.length < 4) continue;

            var sorted = simple.sort(function(a, b) {
                return Math.atan2(a.y - centY, a.x - centX) - Math.atan2(b.y - centY, b.x - centX);
            });

            var corners;
            if (sorted.length > 4) {
                var quad = [];
                for (var q = 0; q < 4; q++) {
                    var target = -Math.PI + (Math.PI/2)*q + Math.PI/4;
                    var best = null, bestD = Infinity;
                    for (var j = 0; j < sorted.length; j++) {
                        var aj = Math.atan2(sorted[j].y - centY, sorted[j].x - centX);
                        var diff = Math.abs(aj - target);
                        if (diff > Math.PI) diff = 2*Math.PI - diff;
                        if (diff < bestD) { bestD = diff; best = sorted[j]; }
                    }
                    quad.push(best);
                }
                quad.sort(function(a,b) { return a.y - b.y; });
                corners = [quad[0], quad[1].x > quad[2].x ? quad[1] : quad[2], quad[3], quad[1].x < quad[2].x ? quad[1] : quad[2]];
            } else {
                var pts4 = sorted.slice(0, 4);
                pts4.sort(function(a,b) { return a.y - b.y; });
                corners = [pts4[0], pts4[1].x > pts4[2].x ? pts4[1] : pts4[2], pts4[3], pts4[1].x < pts4[2].x ? pts4[1] : pts4[2]];
            }

            corners = corners.map(function(c) { return { x: Math.round(c.x / scale), y: Math.round(c.y / scale) }; });
            if (onSuccess) { onSuccess(corners); return; }
        }

        if (onFail) onFail('Could not detect document corners');
    }

    /* -------------------------------------------
       ML Model (DocCornerNet)
       ------------------------------------------- */
    function loadMLModel() {
        if (mlModelLoaded || mlModelLoading) return;
        if (typeof tf === 'undefined') {
            console.warn('[ML] TensorFlow.js not loaded');
            return;
        }
        mlModelLoading = true;
        console.log('[ML] Loading DocCornerNet graph model from ' + ML_MODEL_PATH);
        tf.loadGraphModel(ML_MODEL_PATH).then(function (model) {
            mlModel = model;
            mlModelLoaded = true;
            mlModelLoading = false;
            var shapes = (model.outputs || []).map(function(t) { return t.shape; });
            console.log('[ML] Graph model loaded. Inputs:', model.inputs.length, 'Outputs:', shapes.length, JSON.stringify(shapes));
        }).catch(function (err) {
            mlModelLoaded = false;
            mlModelLoading = false;
            console.warn('[ML] Model load failed:', err.message, '(falling back to OpenCV)');
        });
    }

    function detectCornersML(img, onSuccess, onFail) {
        if (!mlModelLoaded || !mlModel) {
            if (onFail) onFail('ML model not loaded');
            return;
        }

        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { if (onFail) onFail('Invalid image'); return; }

        var inputSize = 224;
        var canvas = document.createElement('canvas');
        canvas.width = inputSize;
        canvas.height = inputSize;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, inputSize, inputSize);
        var imageData = ctx.getImageData(0, 0, inputSize, inputSize);

        // Normalize: MobileNetV2 standard [-1, 1] range
        var inputTensor = tf.tidy(function () {
            var tensor = tf.browser.fromPixels(imageData, 3);
            tensor = tensor.toFloat();
            tensor = tensor.div(127.5).sub(tf.scalar(1.0));
            tensor = tensor.expandDims(0);
            return tensor;
        });

        try {
            var rawOutputs = mlModel.predict(inputTensor);
            inputTensor.dispose();

            // Graph model predict returns NamedTensorMap; normalize to array
            var outputs = [];
            if (rawOutputs instanceof tf.Tensor) {
                outputs = [rawOutputs];
            } else if (Array.isArray(rawOutputs)) {
                outputs = rawOutputs;
            } else {
                for (var key in rawOutputs) {
                    if (rawOutputs.hasOwnProperty(key)) {
                        rawOutputs[key].name = key;
                        outputs.push(rawOutputs[key]);
                    }
                }
            }

            console.log('[ML] Output tensors:');
            var numBins = 224;
            var scoreLogit = null;
            var coordsData = null;

            for (var i = 0; i < outputs.length; i++) {
                var s = outputs[i].shape;
                var name = outputs[i].name || 'output_' + i;
                console.log('[ML]   [' + i + '] ' + name + ' shape=' + JSON.stringify(s));

                if (s.length === 2 && s[1] === 1) {
                    scoreLogit = outputs[i];
                } else if (s.length === 2 && s[1] === 8) {
                    // coords from SimCCDecode (normalized [0,1])
                    coordsData = outputs[i].dataSync();
                    if (coordsData) console.log('[ML]   coords (normalized):', Array.prototype.slice.call(coordsData).map(function(v) { return v.toFixed(4); }));
                }
            }

            for (var i = 0; i < outputs.length; i++) outputs[i].dispose();

            if (!coordsData) {
                if (onFail) onFail('No SimCCDecode coords output found');
                return;
            }

            // coordsData = [x0, y0, x1, y1, x2, y2, x3, y3] normalized to [0, 1]
            var corners = [];
            for (var c = 0; c < 4; c++) {
                var nx = coordsData[c * 2] * (w - 1);
                var ny = coordsData[c * 2 + 1] * (h - 1);
                corners.push({ x: Math.round(nx), y: Math.round(ny) });
            }

            console.log('[ML] Corners (from SimCCDecode):', JSON.stringify(corners));

            // Sort TL/TR/BR/BL
            corners.sort(function (a, b) { return a.y - b.y; });
            var tl = corners[0], br = corners[3];
            var tr = corners[1];
            var bl = corners[2];
            if (corners[0].x > corners[1].x) { tl = corners[1]; tr = corners[0]; }
            if (corners[2].x > corners[3].x) { bl = corners[3]; br = corners[2]; }

            if (onSuccess) onSuccess([tl, tr, br, bl]);
        } catch (e) {
            console.error('[ML] Inference error:', e);
            if (onFail) onFail('ML error: ' + e.message);
        }
    }

    function transposeData(data, rows, cols) {
        // Transpose [rows, cols] → [cols, rows]
        var result = new Float32Array(data.length);
        for (var r = 0; r < rows; r++)
            for (var c = 0; c < cols; c++)
                result[c * rows + r] = data[r * cols + c];
        return result;
    }

    function runCornerDetection(img, onSuccess, onFail) {
        // Try ML first (if model is loaded)
        var mlAttempted = false;
        var cvAttempted = false;
        var mlFailed = false;

        function tryCV() {
            if (cvAttempted) return;
            cvAttempted = true;
            if (typeof cv !== 'undefined' && cv.Mat) {
                console.log('[CornerDetect] Using OpenCV');
                detectCornersOpenCV(img,
                    function (corners) { if (onSuccess) onSuccess(corners); },
                    function (msg) {
                        if (mlAttempted && mlFailed) {
                            if (onFail) onFail('All methods failed. OpenCV: ' + msg);
                        }
                    }
                );
            } else if (typeof cv !== 'undefined') {
                console.log('[CornerDetect] OpenCV script loaded, waiting for WASM...');
                var waited = false;
                var cvTimer = setInterval(function () {
                    if (typeof cv !== 'undefined' && cv.Mat) {
                        clearInterval(cvTimer);
                        waited = true;
                        console.log('[CornerDetect] OpenCV ready, using OpenCV');
                        detectCornersOpenCV(img,
                            function (corners) { if (onSuccess) onSuccess(corners); },
                            function (msg) {
                                if (mlAttempted && mlFailed) {
                                    if (onFail) onFail('All methods failed. OpenCV: ' + msg);
                                }
                            }
                        );
                    }
                }, 300);
                setTimeout(function () {
                    clearInterval(cvTimer);
                    if (!waited) {
                        console.log('[CornerDetect] OpenCV not ready after 15s, using JS fallback');
                        detectCornersJS(img,
                            function (corners) { if (onSuccess) onSuccess(corners); },
                            function (msg) {
                                if (onFail) onFail('All methods failed. JS: ' + msg);
                            }
                        );
                    }
                }, 15000);
            } else {
                console.log('[CornerDetect] OpenCV not loaded, using JS fallback');
                detectCornersJS(img,
                    function (corners) { if (onSuccess) onSuccess(corners); },
                    function (msg) {
                        if (onFail) onFail('All methods failed. JS: ' + msg);
                    }
                );
            }
        }

        if (mlModelLoaded && mlModel) {
            mlAttempted = true;
            console.log('[CornerDetect] Trying ML first');
            detectCornersML(img,
                function (corners) {
                    console.log('[CornerDetect] ML succeeded');
                    if (onSuccess) onSuccess(corners);
                },
                function (msg) {
                    mlFailed = true;
                    console.log('[CornerDetect] ML failed:', msg, '- falling back to OpenCV');
                    tryCV();
                }
            );
        } else {
            console.log('[CornerDetect] ML not available, using OpenCV');
            tryCV();
        }
    }

    function autoDetectAndShowPerspective() {
        var img = $cropImage[0];
        if (!img) return;
        runCornerDetection(img,
            function (corners) {
                displayImage = new Image();
                displayImage.onload = function () {
                    enterPerspectiveMode(corners);
                };
                displayImage.src = img.src;
            },
            function () {}
        );
    }

    /* -------------------------------------------
       Perspective: Detect Corners button
       ------------------------------------------- */
    $('#btnDetectCorners').on('click', function () {
        if (!cropper) return;
        var $btn = $(this);
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Detecting...');

        setTimeout(function () {
            try {
                var img = $cropImage[0];
                if (!img) { showToast('No image loaded.', 'error'); $btn.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Detect Corners'); return; }

                runCornerDetection(img,
                    function (corners) {
                        displayImage = new Image();
                        displayImage.onload = function () {
                            enterPerspectiveMode(corners);
                            $btn.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Detect Corners');
                        };
                        displayImage.src = img.src;
                    },
                    function (msg) {
                        showToast(msg, 'error');
                        $btn.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Detect Corners');
                    }
                );
            } catch (e) {
                showToast('Corner detection failed.', 'error');
                $btn.prop('disabled', false).html('<i class="bi bi-magic me-1"></i>Detect Corners');
            }
        }, 50);
    });

    /* -------------------------------------------
       Perspective: Apply & Cancel buttons
       ------------------------------------------- */
    $('#btnApplyTransform').on('click', function () {
        var $btn = $(this);
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Warping...');
        setTimeout(function () {
            try {
                applyPerspectiveTransform();
            } catch (e) {
                showToast('Transform failed.', 'error');
            }
            $btn.prop('disabled', false).html('<i class="bi bi-check-lg me-1"></i>Apply');
        }, 50);
    });

    $('#btnCancelTransform').on('click', function () {
        exitPerspectiveMode();
        showToast('Perspective edit cancelled.', 'primary');
    });

    /* -------------------------------------------
       Perspective: re-draw on window resize
       ------------------------------------------- */
    $(window).on('resize', function () {
        if (perspectiveActive && perspectiveCorners) {
            var rect = perspectiveCanvas.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            perspectiveCanvas.width = rect.width * dpr;
            perspectiveCanvas.height = rect.height * dpr;
            perspectiveCanvas.style.width = rect.width + 'px';
            perspectiveCanvas.style.height = rect.height + 'px';
            drawPerspectiveOverlay();
        }
    });

    /* -------------------------------------------
       Enhancement filters
       ------------------------------------------- */
    $(document).on('click', '.filter-btn', function () {
        var effect = $(this).data('filter');
        if (!effect) return;

        $('.filter-btn').removeClass('active');
        $(this).addClass('active');

        filterEffect = effect;

        if (effect === 'original' || effect === 'none') {
            filterEffect = 'none';
            filterBrightness = 0;
            filterContrast = 0;
            $('#brightnessSlider').val(0);
            $('#contrastSlider').val(0);
            $('#brightnessVal').text('0');
            $('#contrastVal').text('0');
        }

        applyFilterToWorkspace();
    });

    function clearWorkspaceFilter() {
        var els = document.querySelectorAll('#cropImage, .cropper-view-box, .cropper-canvas, .cropper-container');
        for (var i = 0; i < els.length; i++) els[i].style.filter = '';
    }

    function applyFilterToWorkspace() {
        var css = '';
        var b = filterBrightness, c = filterContrast;
        var isBinarized = filterEffect === 'binarized';
        var isGray = filterEffect === 'gray' || filterEffect === 'binarized';
        var isClean = filterEffect === 'clean';

        var cb = 1 + (b / 100);
        var cc = 1 + (c / 40);
        if (cb !== 1 || cc !== 1) css += 'brightness(' + cb + ') contrast(' + cc + ')';

        if (isGray || isBinarized) {
            if (css) css += ' ';
            css += 'grayscale(1)';
        }
        if (isBinarized) {
            css += ' contrast(100)';
        }
        if (isClean) {
            if (css) css += ' ';
            css += 'contrast(1.3) saturate(0.85)';
        }
        css = css || 'none';

        // Apply to all Cropper.js layers that render the image
        var els = document.querySelectorAll(
            '#cropImage, .cropper-view-box, .cropper-canvas, .cropper-container'
        );
        for (var i = 0; i < els.length; i++) els[i].style.filter = css;
    }

    /* Brightness / Contrast sliders */
    $('#brightnessSlider, #contrastSlider').on('input change', function () {
        var $this = $(this);
        var val = parseInt($this.val(), 10);
        var isBright = $this.is('#brightnessSlider');
        if (isBright) {
            filterBrightness = val;
            $('#brightnessVal').text(val);
        } else {
            filterContrast = val;
            $('#contrastVal').text(val);
        }
        // Deactivate effect buttons when sliding manually
        if (filterEffect !== 'none') {
            filterEffect = 'none';
            $('.filter-btn').removeClass('active');
            $('.filter-btn[data-filter="none"]').addClass('active');
        }
        applyFilterToWorkspace();
    });

    /* -------------------------------------------
       Rotate
       ------------------------------------------- */
    $('#btnRotateLeft').on('click', function () {
        if (!cropper) return;
        cropper.rotate(-90);
    });

    $('#btnRotateRight').on('click', function () {
        if (!cropper) return;
        cropper.rotate(90);
    });

    /* -------------------------------------------
       Flip
       ------------------------------------------- */
    $('#btnFlipH').on('click', function () {
        if (!cropper) return;
        flipX = !flipX;
        cropper.scaleX(flipX ? -1 : 1);
    });

    $('#btnFlipV').on('click', function () {
        if (!cropper) return;
        flipY = !flipY;
        cropper.scaleY(flipY ? -1 : 1);
    });

    /* -------------------------------------------
       Zoom
       ------------------------------------------- */
    $('#btnZoomIn').on('click', function () {
        if (!cropper) return;
        cropper.zoom(0.1);
    });

    $('#btnZoomOut').on('click', function () {
        if (!cropper) return;
        cropper.zoom(-0.1);
    });

    /* -------------------------------------------
       Reset
       ------------------------------------------- */
    $('#btnReset').on('click', function () {
        if (!cropper) return;
        cropper.reset();
        flipX = false;
        flipY = false;
        cropper.scaleX(1);
        cropper.scaleY(1);
        $('.crop-ratio').removeClass('active');
        $('.crop-ratio[data-ratio="free"]').addClass('active');
        cropper.setAspectRatio(NaN);
        showToast('Image reset to original', 'primary');
    });

    /* -------------------------------------------
       Preview
       ------------------------------------------- */
    $('#btnPreview').on('click', function () {
        if (!cropper) return;
        var canvas = getFilteredCanvas();
        if (!canvas) {
            showToast('Could not generate preview.', 'error');
            return;
        }
        $previewImage.attr('src', canvas.toDataURL());
        $previewModal.show();
    });

    /* -------------------------------------------
       Download
       ------------------------------------------- */
    $('#btnDownload').on('click', function (e) {
        if (!cropper) {
            e.preventDefault();
            return;
        }
        var canvas = getFilteredCanvas();
        if (!canvas) {
            e.preventDefault();
            showToast('Could not generate download.', 'error');
            return;
        }
        var link = document.createElement('a');
        link.download = 'cropped_image.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Image downloaded!', 'success');
    });

    /* -------------------------------------------
       Save (AJAX to PHP)
       ------------------------------------------- */
    $('#btnSave').on('click', function () {
        if (!cropper) return;

        var canvas = getFilteredCanvas();
        if (!canvas) {
            showToast('Could not generate cropped image.', 'error');
            return;
        }

        var dataURL = canvas.toDataURL('image/jpeg', 0.95);
        var $btn = $(this);
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Saving...');

        $.ajax({
            url: 'save.php',
            type: 'POST',
            data: { image: dataURL },
            dataType: 'json',
            success: function (res) {
                if (res.status) {
                    showToast(res.message, 'success');
                    var originalHref = $btnDownload.attr('href');
                    if (originalHref === '#') {
                        $btnDownload.attr('href', res.file);
                        $btnDownload.removeAttr('disabled');
                    }
                } else {
                    showToast(res.message || 'Save failed.', 'error');
                }
            },
            error: function () {
                showToast('Server error. Could not save image.', 'error');
            },
            complete: function () {
                $btn.prop('disabled', false).html('<i class="bi bi-floppy me-1"></i>Save');
            }
        });
    });

    /* -------------------------------------------
       Save & Replace (integration mode)
       ------------------------------------------- */
    $btnSaveReplace.on('click', function () {
        if (!cropper) return;

        var canvas = getFilteredCanvas();
        if (!canvas) {
            showToast('Could not generate cropped image.', 'error');
            return;
        }

        var dataURL = canvas.toDataURL('image/jpeg', 0.95);
        var $btn = $(this);
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Replacing...');

        $.ajax({
            url: 'save-replace.php',
            type: 'POST',
            data: {
                image: dataURL,
                fileUrl: INTEGRATION_FILE_URL
            },
            dataType: 'json',
            success: function (res) {
                if (res.status) {
                    showToast('Image replaced successfully!', 'success');
                    setTimeout(function () {
                        window.close();
                    }, 1500);
                } else {
                    showToast(res.message || 'Replace failed.', 'error');
                }
            },
            error: function () {
                showToast('Server error. Could not replace image.', 'error');
            },
            complete: function () {
                $btn.prop('disabled', false).html('<i class="bi bi-arrow-repeat me-1"></i>Save & Replace');
            }
        });
    });

    /* -------------------------------------------
       Drag & drop on workspace
       ------------------------------------------- */
    $('.workspace-inner').on('dragover dragenter', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('drag-over');
    }).on('dragleave dragend', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('drag-over');
    }).on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('drag-over');
        var files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            var file = files[0];
            var type = file.type;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
                showToast('Unsupported format. Use JPG, PNG or WEBP.', 'error');
                return;
            }
            loadImage(file);
        }
    });

    /* -------------------------------------------
       Integration mode: replace
       ------------------------------------------- */
    if (INTEGRATION_MODE === 'replace' && INTEGRATION_FILE_URL) {
        $btnSaveReplace.removeClass('d-none');
        $('#urlInput').val(INTEGRATION_FILE_URL);
        loadImageFromUrl(INTEGRATION_FILE_URL);
    }

    /* ── Load ML model after TF.js is ready ── */
    setTimeout(function () {
        if (typeof tf !== 'undefined') {
            loadMLModel();
        } else {
            var tfTimer = setInterval(function () {
                if (typeof tf !== 'undefined') {
                    clearInterval(tfTimer);
                    loadMLModel();
                }
            }, 300);
        }
    }, 100);
});
