
"use strict";

const imageInput = document.getElementById("image-input");
const editor = document.getElementById("editor");
const canvas = document.getElementById("crop-canvas");
const ctx = canvas.getContext("2d");
const aspectRatioSelect = document.getElementById("aspect-ratio");
const outputFormatSelect = document.getElementById("output-format");
const resetButton = document.getElementById("reset-crop");
const downloadButton = document.getElementById("download-button");
const dimensionsLabel = document.getElementById("crop-dimensions");
const statusMessage = document.getElementById("status-message");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CANVAS_WIDTH = 900;
const MAX_CANVAS_HEIGHT = 600;
const MIN_CROP_SIZE = 12;
const HANDLE_SIZE = 10;

const image = new Image();

let imageUrl = null;
let originalFilename = "image";
let sourceFiles = [];
let sourceWidth = 0;
let sourceHeight = 0;

let crop = { x: 0, y: 0, width: 0, height: 0 };
let dragStart = null;
let dragMode = null;
let activePointerId = null;

function getAspectRatio() {
    const value = aspectRatioSelect.value;

    if (value === "free") return null;

    const [width, height] = value.split(":").map(Number);
    return width / height;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setStatus(message) {
    statusMessage.textContent = message;
}

function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function getInitialCrop() {
    const ratio = getAspectRatio();

    let width = canvas.width * 0.8;
    let height = canvas.height * 0.8;

    if (ratio !== null) {
        if (width / height > ratio) {
            width = height * ratio;
        } else {
            height = width / ratio;
        }
    }

    crop = {
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        width,
        height
    };
}

function draw() {
    if (!image.complete || !image.naturalWidth) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Darken the area outside the crop selection.
    ctx.fillStyle = "rgba(10, 18, 35, 0.58)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.clearRect(crop.x, crop.y, crop.width, crop.height);
    ctx.drawImage(
        image,
        crop.x * (sourceWidth / canvas.width),
        crop.y * (sourceHeight / canvas.height),
        crop.width * (sourceWidth / canvas.width),
        crop.height * (sourceHeight / canvas.height),
        crop.x,
        crop.y,
        crop.width,
        crop.height
    );

    // Selection border.
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);

    // Thirds grid.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 1; i <= 2; i++) {
        const x = crop.x + (crop.width * i) / 3;
        const y = crop.y + (crop.height * i) / 3;

        ctx.moveTo(x, crop.y);
        ctx.lineTo(x, crop.y + crop.height);

        ctx.moveTo(crop.x, y);
        ctx.lineTo(crop.x + crop.width, y);
    }

    ctx.stroke();

    // Corner handles.
    const corners = [
        [crop.x, crop.y],
        [crop.x + crop.width, crop.y],
        [crop.x, crop.y + crop.height],
        [crop.x + crop.width, crop.y + crop.height]
    ];

    for (const [x, y] of corners) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
            x - HANDLE_SIZE / 2,
            y - HANDLE_SIZE / 2,
            HANDLE_SIZE,
            HANDLE_SIZE
        );

        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 4;
        ctx.strokeRect(
            x - HANDLE_SIZE / 2,
            y - HANDLE_SIZE / 2,
            HANDLE_SIZE,
            HANDLE_SIZE
        );

        ctx.strokeStyle = "#536DFE";
        ctx.lineWidth = 2;
        ctx.strokeRect(
            x - HANDLE_SIZE / 2,
            y - HANDLE_SIZE / 2,
            HANDLE_SIZE,
            HANDLE_SIZE
        );
    }

    updateDimensions();
}

function updateDimensions() {
    const scaleX = sourceWidth / canvas.width;
    const scaleY = sourceHeight / canvas.height;

    const width = Math.max(1, Math.round(crop.width * scaleX));
    const height = Math.max(1, Math.round(crop.height * scaleY));

    dimensionsLabel.textContent = `Crop dimensions: ${width} × ${height} px`;
}

function setupCanvas() {
    const scale = Math.min(
        MAX_CANVAS_WIDTH / sourceWidth,
        MAX_CANVAS_HEIGHT / sourceHeight,
        1
    );

    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    getInitialCrop();
    draw();
}

function getCornerAt(point) {
    const corners = [
        { name: "nw", x: crop.x, y: crop.y },
        { name: "ne", x: crop.x + crop.width, y: crop.y },
        { name: "sw", x: crop.x, y: crop.y + crop.height },
        { name: "se", x: crop.x + crop.width, y: crop.y + crop.height }
    ];

    return corners.find(
        corner =>
            Math.abs(point.x - corner.x) <= HANDLE_SIZE &&
            Math.abs(point.y - corner.y) <= HANDLE_SIZE
    )?.name ?? null;
}

function pointInsideCrop(point) {
    return (
        point.x >= crop.x &&
        point.x <= crop.x + crop.width &&
        point.y >= crop.y &&
        point.y <= crop.y + crop.height
    );
}

function startPointerAction(event) {
    if (!image.naturalWidth) return;

    event.preventDefault();

    const point = getCanvasPoint(event);
    const corner = getCornerAt(point);

    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    dragStart = {
        x: point.x,
        y: point.y,
        crop: { ...crop }
    };

    if (corner) {
        dragMode = corner;
    } else if (pointInsideCrop(point)) {
        dragMode = "move";
    } else {
        dragMode = "draw";
        crop = {
            x: point.x,
            y: point.y,
            width: 0,
            height: 0
        };
    }

    draw();
}

function updateDraw(point) {
    const start = dragStart;
    const ratio = getAspectRatio();

    let dx = point.x - start.x;
    let dy = point.y - start.y;

    if (ratio !== null) {
        const signX = dx < 0 ? -1 : 1;
        const signY = dy < 0 ? -1 : 1;

        let width = Math.abs(dx);
        let height = Math.abs(dy);

        if (width / Math.max(height, 0.001) > ratio) {
            height = width / ratio;
        } else {
            width = height * ratio;
        }

        dx = width * signX;
        dy = height * signY;
    }

    const x1 = clamp(start.x, 0, canvas.width);
    const y1 = clamp(start.y, 0, canvas.height);
    const x2 = clamp(start.x + dx, 0, canvas.width);
    const y2 = clamp(start.y + dy, 0, canvas.height);

    crop = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1)
    };
}

function updateMove(point) {
    const startCrop = dragStart.crop;

    crop.x = clamp(
        startCrop.x + point.x - dragStart.x,
        0,
        canvas.width - crop.width
    );

    crop.y = clamp(
        startCrop.y + point.y - dragStart.y,
        0,
        canvas.height - crop.height
    );
}

function updateResize(point) {
    const startCrop = dragStart.crop;
    const ratio = getAspectRatio();

    const isWest = dragMode.includes("w");
    const isNorth = dragMode.includes("n");

    const anchorX = isWest
        ? startCrop.x + startCrop.width
        : startCrop.x;

    const anchorY = isNorth
        ? startCrop.y + startCrop.height
        : startCrop.y;

    let width = Math.abs(point.x - anchorX);
    let height = Math.abs(point.y - anchorY);

    if (ratio !== null) {
        if (width / Math.max(height, 0.001) > ratio) {
            height = width / ratio;
        } else {
            width = height * ratio;
        }
    }

    width = Math.max(MIN_CROP_SIZE, width);
    height = Math.max(MIN_CROP_SIZE, height);

    const maxWidth = isWest ? anchorX : canvas.width - anchorX;
    const maxHeight = isNorth ? anchorY : canvas.height - anchorY;

    if (ratio !== null) {
        const maxByWidth = maxWidth;
        const maxByHeight = maxHeight * ratio;

        width = Math.min(width, maxByWidth, maxByHeight);
        height = width / ratio;
    } else {
        width = Math.min(width, maxWidth);
        height = Math.min(height, maxHeight);
    }

    crop = {
        x: isWest ? anchorX - width : anchorX,
        y: isNorth ? anchorY - height : anchorY,
        width,
        height
    };
}

function movePointer(event) {
    if (activePointerId !== event.pointerId || !dragStart) return;

    const point = getCanvasPoint(event);

    if (dragMode === "draw") {
        updateDraw(point);
    } else if (dragMode === "move") {
        updateMove(point);
    } else {
        updateResize(point);
    }

    draw();
}

function endPointerAction(event) {
    if (activePointerId !== event.pointerId) return;

    activePointerId = null;
    dragStart = null;
    dragMode = null;

    if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
    }

    draw();
}

imageInput.addEventListener("change", () => {
    const files = Array.from(imageInput.files || []);
    const file = files[0];

    if (!file) return;

    try {
        PixoraBatch.validateFiles(files);
    } catch (error) {
        sourceFiles = [];
        editor.hidden = true;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = null;
        imageInput.value = "";
        setStatus(error.message);
        return;
    }

    if (files.some(selected => !["image/png", "image/jpeg", "image/webp"].includes(selected.type))) {
        sourceFiles = [];
        editor.hidden = true;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = null;
        imageInput.value = "";
        setStatus("Choose a PNG, JPG, or WebP image.");
        return;
    }

    sourceFiles = files;

    if (imageUrl) URL.revokeObjectURL(imageUrl);

    imageUrl = URL.createObjectURL(file);
    originalFilename = file.name.replace(/\.[^.]+$/, "") || "image";

    image.onload = () => {
        sourceWidth = image.naturalWidth;
        sourceHeight = image.naturalHeight;

        // Avoid extremely large source images consuming excessive memory.
        if (sourceWidth * sourceHeight > 20_000_000) {
            setStatus("This image is too large to edit safely. Choose an image under 20 megapixels.");
            editor.hidden = true;
            URL.revokeObjectURL(imageUrl);
            imageUrl = null;
            return;
        }

        setupCanvas();
        editor.hidden = false;
        setStatus(files.length > 1
            ? `${files.length} images loaded. This crop selection will be applied to each image.`
            : "Image loaded. Drag inside the selection to move it, or drag a corner to resize.");
    };

    image.onerror = () => {
        setStatus("Unable to load this image. Try another file.");
        editor.hidden = true;
    };

    image.src = imageUrl;
});

canvas.addEventListener("pointerdown", startPointerAction);
canvas.addEventListener("pointermove", movePointer);
canvas.addEventListener("pointerup", endPointerAction);
canvas.addEventListener("pointercancel", endPointerAction);

aspectRatioSelect.addEventListener("change", () => {
    if (!image.naturalWidth) return;

    getInitialCrop();
    draw();
    setStatus("Aspect ratio updated.");
});

resetButton.addEventListener("click", () => {
    if (!image.naturalWidth) return;

    getInitialCrop();
    draw();
    setStatus("Crop selection reset.");
});

downloadButton.addEventListener("click", async () => {
    if (!image.naturalWidth || crop.width < 1 || crop.height < 1) {
        setStatus("Select a valid crop area first.");
        return;
    }

    if (sourceFiles.length > 1) {
        downloadButton.disabled = true;
        downloadButton.textContent = "Preparing ZIP...";
        try {
            const left = crop.x / canvas.width;
            const top = crop.y / canvas.height;
            const widthRatio = crop.width / canvas.width;
            const heightRatio = crop.height / canvas.height;
            const format = outputFormatSelect.value;
            const mimeType = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[format];
            const outputs = [];

            for (const [index, file] of sourceFiles.entries()) {
                setStatus(`Cropping image ${index + 1} of ${sourceFiles.length}...`);
                const loaded = await PixoraBatch.loadImage(file);
                try {
                    const source = loaded.image;
                    if (source.naturalWidth * source.naturalHeight > 20_000_000) {
                        throw new Error(`${file.name} exceeds the 20 megapixel limit.`);
                    }
                    const x = Math.round(left * source.naturalWidth);
                    const y = Math.round(top * source.naturalHeight);
                    const width = Math.max(1, Math.round(widthRatio * source.naturalWidth));
                    const height = Math.max(1, Math.round(heightRatio * source.naturalHeight));
                    const outputCanvas = document.createElement("canvas");
                    outputCanvas.width = Math.min(width, source.naturalWidth - x);
                    outputCanvas.height = Math.min(height, source.naturalHeight - y);
                    const context = outputCanvas.getContext("2d");
                    if (format === "jpeg") {
                        context.fillStyle = "#ffffff";
                        context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
                    }
                    context.drawImage(source, x, y, outputCanvas.width, outputCanvas.height, 0, 0, outputCanvas.width, outputCanvas.height);
                    outputs.push({
                        blob: await PixoraBatch.toBlob(outputCanvas, mimeType),
                        name: PixoraBatch.outputName(file, "cropped", format === "jpeg" ? "jpg" : format)
                    });
                } finally {
                    loaded.release();
                }
            }
            await PixoraBatch.downloadZip(outputs);
            setStatus(`Crop applied to ${outputs.length} images. Your ZIP download is ready.`);
        } catch (error) {
            setStatus(error.message || "Could not crop the selected images.");
        } finally {
            downloadButton.disabled = false;
            downloadButton.textContent = "Crop & Download";
        }
        return;
    }

    const format = outputFormatSelect.value;
    const mimeType = {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp"
    }[format];

    const scaleX = sourceWidth / canvas.width;
    const scaleY = sourceHeight / canvas.height;

    const x = clamp(Math.round(crop.x * scaleX), 0, sourceWidth - 1);
    const y = clamp(Math.round(crop.y * scaleY), 0, sourceHeight - 1);
    const right = clamp(
        Math.round((crop.x + crop.width) * scaleX),
        x + 1,
        sourceWidth
    );
    const bottom = clamp(
        Math.round((crop.y + crop.height) * scaleY),
        y + 1,
        sourceHeight
    );

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = right - x;
    outputCanvas.height = bottom - y;

    const outputContext = outputCanvas.getContext("2d");

    if (format === "jpeg") {
        outputContext.fillStyle = "#ffffff";
        outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }

    outputContext.drawImage(
        image,
        x, y, outputCanvas.width, outputCanvas.height,
        0, 0, outputCanvas.width, outputCanvas.height
    );

    downloadButton.disabled = true;
    downloadButton.textContent = "Preparing image…";

    outputCanvas.toBlob(blob => {
        downloadButton.disabled = false;
        downloadButton.textContent = "Crop & Download";

        if (!blob) {
            setStatus("Could not export the image. Try another output format.");
            return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = `${originalFilename}-cropped.${format === "jpeg" ? "jpg" : format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

        setStatus(`Cropped image downloaded (${outputCanvas.width} × ${outputCanvas.height} px).`);
    }, mimeType, format === "jpeg" ? 0.92 : undefined);
});

window.addEventListener("beforeunload", () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
});
