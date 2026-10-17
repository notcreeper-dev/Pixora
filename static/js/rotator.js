const fileInput = document.getElementById("rotator-file");
const editor = document.getElementById("rotator-editor");
const canvas = document.getElementById("rotator-canvas");
const imageInfo = document.getElementById("rotator-image-info");
const errorBox = document.getElementById("rotator-error");
const formatSelect = document.getElementById("rotator-format");

const rotateLeftBtn = document.getElementById("rotate-left");
const rotateRightBtn = document.getElementById("rotate-right");
const rotateHalfBtn = document.getElementById("rotate-half");
const flipHorizontalBtn = document.getElementById("flip-horizontal");
const flipVerticalBtn = document.getElementById("flip-vertical");
const resetBtn = document.getElementById("rotator-reset");
const downloadBtn = document.getElementById("rotator-download");

const ctx = canvas.getContext("2d");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const SUPPORTED_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp"
];

let sourceImage = null;
let originalFile = null;
let sourceFiles = [];
let rotation = 0;
let flipX = false;
let flipY = false;

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function clearError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
}

function setControlsEnabled(enabled) {
    [
        rotateLeftBtn,
        rotateRightBtn,
        rotateHalfBtn,
        flipHorizontalBtn,
        flipVerticalBtn,
        resetBtn,
        downloadBtn,
        formatSelect
    ].forEach(button => {
        button.disabled = !enabled;
    });
}

function drawPreview() {
    if (!sourceImage) return;

    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;
    const sideways = rotation === 90 || rotation === 270;

    canvas.width = sideways ? height : width;
    canvas.height = sideways ? width : height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

    ctx.drawImage(
        sourceImage,
        -width / 2,
        -height / 2,
        width,
        height
    );

    ctx.restore();

    imageInfo.textContent =
        `${originalFile.name} · ${canvas.width} × ${canvas.height} px`;
}

function resetTransform() {
    rotation = 0;
    flipX = false;
    flipY = false;
    drawPreview();
}

function loadImage(file) {
    clearError();

    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
        showError("This image is larger than 10 MB. Choose a smaller file.");
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();
    const extensionTypes = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp"
    };

    const detectedType = file.type || extensionTypes[extension];

    if (!SUPPORTED_TYPES.includes(detectedType)) {
        showError("Choose a PNG, JPG, JPEG, or WebP image.");
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const pixels = image.naturalWidth * image.naturalHeight;

        if (!image.naturalWidth || !image.naturalHeight) {
            showError("The selected file is not a valid image.");
            return;
        }

        if (pixels > MAX_PIXELS) {
            showError("This image has too many pixels. Choose an image under 20 megapixels.");
            return;
        }

        sourceImage = image;
        originalFile = file;

        rotation = 0;
        flipX = false;
        flipY = false;
        formatSelect.value = "original";

        drawPreview();
        editor.hidden = false;
        setControlsEnabled(true);
        clearError();
    };

    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        showError("Could not open this image. Try another PNG, JPG, or WebP file.");
    };

    image.src = objectUrl;
}

fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    try {
        PixoraBatch.validateFiles(files);
    } catch (error) {
        sourceFiles = [];
        sourceImage = null;
        originalFile = null;
        editor.hidden = true;
        setControlsEnabled(false);
        fileInput.value = "";
        showError(error.message);
        return;
    }
    if (files.some(file => !SUPPORTED_TYPES.includes(file.type))) {
        sourceFiles = [];
        sourceImage = null;
        originalFile = null;
        editor.hidden = true;
        setControlsEnabled(false);
        fileInput.value = "";
        showError("Choose PNG, JPG, JPEG, or WebP images only.");
        return;
    }
    sourceFiles = files;
    loadImage(files[0]);
});

rotateLeftBtn.addEventListener("click", () => {
    rotation = (rotation + 270) % 360;
    drawPreview();
});

rotateRightBtn.addEventListener("click", () => {
    rotation = (rotation + 90) % 360;
    drawPreview();
});

rotateHalfBtn.addEventListener("click", () => {
    rotation = (rotation + 180) % 360;
    drawPreview();
});

flipHorizontalBtn.addEventListener("click", () => {
    flipX = !flipX;
    drawPreview();
});

flipVerticalBtn.addEventListener("click", () => {
    flipY = !flipY;
    drawPreview();
});

resetBtn.addEventListener("click", () => {
    clearError();
    resetTransform();
});

function getOutputType() {
    if (formatSelect.value !== "original") {
        return formatSelect.value;
    }

    if (SUPPORTED_TYPES.includes(originalFile.type)) {
        return originalFile.type;
    }

    const extension = originalFile.name.split(".").pop().toLowerCase();

    if (extension === "jpg" || extension === "jpeg") {
        return "image/jpeg";
    }

    if (extension === "webp") {
        return "image/webp";
    }

    return "image/png";
}

function getSafeBaseName(filename) {
    const withoutExtension = filename.replace(/\.[^.]+$/, "");

    return withoutExtension
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .trim() || "pixora-image";
}

function canvasToBlob(targetCanvas, type) {
    return new Promise(resolve => {
        targetCanvas.toBlob(resolve, type, 0.92);
    });
}

downloadBtn.addEventListener("click", async () => {
    if (!sourceImage || !originalFile) return;

    clearError();
    downloadBtn.disabled = true;
    downloadBtn.textContent = sourceFiles.length > 1 ? "Preparing ZIP…" : "Preparing…";

    try {
        if (sourceFiles.length > 1) {
            const outputs = [];
            for (const [index, file] of sourceFiles.entries()) {
                errorBox.textContent = `Transforming image ${index + 1} of ${sourceFiles.length}...`;
                errorBox.hidden = false;
                const loaded = await PixoraBatch.loadImage(file);
                try {
                    const image = loaded.image;
                    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
                        throw new Error(`${file.name} exceeds the 20 megapixel limit.`);
                    }
                    const sideways = rotation === 90 || rotation === 270;
                    const outputCanvas = document.createElement("canvas");
                    outputCanvas.width = sideways ? image.naturalHeight : image.naturalWidth;
                    outputCanvas.height = sideways ? image.naturalWidth : image.naturalHeight;
                    const context = outputCanvas.getContext("2d");
                    const format = formatSelect.value === "original"
                        ? file.type
                        : formatSelect.value;
                    context.save();
                    context.translate(outputCanvas.width / 2, outputCanvas.height / 2);
                    context.rotate(rotation * Math.PI / 180);
                    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
                    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
                    context.restore();
                    if (format === "image/jpeg") {
                        const flattened = document.createElement("canvas");
                        flattened.width = outputCanvas.width;
                        flattened.height = outputCanvas.height;
                        const flattenedContext = flattened.getContext("2d");
                        flattenedContext.fillStyle = "#ffffff";
                        flattenedContext.fillRect(0, 0, flattened.width, flattened.height);
                        flattenedContext.drawImage(outputCanvas, 0, 0);
                        outputs.push({
                            blob: await PixoraBatch.toBlob(flattened, format),
                            name: PixoraBatch.outputName(file, "rotated", "jpg")
                        });
                    } else {
                        const extension = format === "image/webp" ? "webp" : "png";
                        outputs.push({
                            blob: await PixoraBatch.toBlob(outputCanvas, format),
                            name: PixoraBatch.outputName(file, "rotated", extension)
                        });
                    }
                } finally {
                    loaded.release();
                }
            }
            await PixoraBatch.downloadZip(outputs);
            clearError();
            return;
        }

        const outputType = getOutputType();
        let outputCanvas = canvas;

        // JPEG cannot contain transparency, so use a white background.
        if (outputType === "image/jpeg") {
            outputCanvas = document.createElement("canvas");
            outputCanvas.width = canvas.width;
            outputCanvas.height = canvas.height;

            const outputContext = outputCanvas.getContext("2d");
            outputContext.fillStyle = "#ffffff";
            outputContext.fillRect(
                0,
                0,
                outputCanvas.width,
                outputCanvas.height
            );
            outputContext.drawImage(canvas, 0, 0);
        }

        const blob = await canvasToBlob(outputCanvas, outputType);

        if (!blob) {
            throw new Error("The browser could not export this image.");
        }

        if (blob.type !== outputType) {
            throw new Error(
                "Your browser could not export that format. Try PNG or JPEG."
            );
        }

        const extensions = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp"
        };

        const filename =
            `${getSafeBaseName(originalFile.name)}-rotated.${extensions[blob.type]}`;

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
        showError(error.message || "Something went wrong while exporting the image.");
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download Image";
    }
});

setControlsEnabled(false);