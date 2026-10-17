
"use strict";

const imageInput = document.getElementById("image-input");
const editor = document.getElementById("editor");
const preview = document.getElementById("image-preview");
const widthInput = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const aspectLock = document.getElementById("aspect-lock");
const outputFormat = document.getElementById("output-format");
const resetButton = document.getElementById("reset-size");
const downloadButton = document.getElementById("download-button");
const originalDimensions = document.getElementById("original-dimensions");
const statusMessage = document.getElementById("status-message");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 10000;
const MAX_OUTPUT_PIXELS = 40000000;

let sourceImage = null;
let sourceUrl = null;
let sourceFiles = [];
let originalFilename = "image";
let originalMimeType = "image/png";
let originalWidth = 0;
let originalHeight = 0;
let aspectRatio = 1;
let ratioLocked = true;
let currentWidth = 0;
let currentHeight = 0;
let updatingDimensions = false;

function setStatus(message) {
    statusMessage.textContent = message;
}

function getExtension(mimeType) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    return "png";
}

function getOutputMimeType() {
    const selected = outputFormat.value;

    if (selected === "original") {
        return originalMimeType;
    }

    return {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp"
    }[selected];
}

function getOutputExtension(mimeType) {
    return getExtension(mimeType);
}

function updateLockButton() {
    aspectLock.setAttribute("aria-pressed", String(ratioLocked));
    aspectLock.textContent = ratioLocked
        ? "🔒 Ratio locked"
        : "🔓 Ratio unlocked";
}

function validateDimensions(width, height) {
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION
    ) {
        return "Width and height must be whole numbers between 1 and 10,000 pixels.";
    }

    if (width * height > MAX_OUTPUT_PIXELS) {
        return "The output would be too large. Choose dimensions with a maximum of 40 megapixels.";
    }

    return null;
}

function showPreview() {
    if (!sourceImage) return;

    const width = Number(widthInput.value);
    const height = Number(heightInput.value);

    const error = validateDimensions(width, height);

    if (error) {
        setStatus(error);
        return false;
    }

    currentWidth = width;
    currentHeight = height;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
        setStatus("Your browser could not create an image preview.");
        return false;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (getOutputMimeType() === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
    }

    context.drawImage(sourceImage, 0, 0, width, height);

    try {
        preview.src = canvas.toDataURL("image/png");
    } catch {
        setStatus("Could not create the preview. Try smaller dimensions.");
        return false;
    }

    setStatus(`Preview updated: ${width} × ${height} pixels.`);
    return true;
}

function updateDimensions(changedField) {
    if (!sourceImage || updatingDimensions) return;

    updatingDimensions = true;

    let width = Number(widthInput.value);
    let height = Number(heightInput.value);

    if (ratioLocked) {
        if (changedField === "width" && Number.isFinite(width) && width > 0) {
            height = Math.round(width / aspectRatio);
            heightInput.value = height;
        } else if (
            changedField === "height" &&
            Number.isFinite(height) &&
            height > 0
        ) {
            width = Math.round(height * aspectRatio);
            widthInput.value = width;
        }
    }

    updatingDimensions = false;

    showPreview();
}

imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []);
    const file = files[0];

    if (!file) return;

    try {
        PixoraBatch.validateFiles(files);
    } catch (error) {
        sourceFiles = [];
        sourceImage = null;
        editor.hidden = true;
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
        imageInput.value = "";
        setStatus(error.message);
        return;
    }

    if (files.some(selected => !["image/png", "image/jpeg", "image/webp"].includes(selected.type))) {
        sourceFiles = [];
        sourceImage = null;
        editor.hidden = true;
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
        imageInput.value = "";
        setStatus("Choose a PNG, JPG, or WebP image.");
        return;
    }

    sourceFiles = files;

    if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
    }

    sourceUrl = URL.createObjectURL(file);
    originalFilename = file.name.replace(/\.[^.]+$/, "") || "image";
    originalMimeType = file.type;

    try {
        const loadedImage = new Image();

        await new Promise((resolve, reject) => {
            loadedImage.onload = resolve;
            loadedImage.onerror = reject;
            loadedImage.src = sourceUrl;
        });

        const width = loadedImage.naturalWidth;
        const height = loadedImage.naturalHeight;

        if (!width || !height || width * height > MAX_OUTPUT_PIXELS) {
            throw new Error(
                "This image is too large to process safely. Choose an image under 40 megapixels."
            );
        }

        sourceImage = loadedImage;
        originalWidth = width;
        originalHeight = height;
        aspectRatio = width / height;

        widthInput.value = width;
        heightInput.value = height;

        originalDimensions.textContent =
            `Original dimensions: ${width} × ${height} px`;

        outputFormat.value = "original";
        editor.hidden = false;

        showPreview();
        setStatus(files.length > 1
            ? `${files.length} images loaded. The selected dimensions will be applied to each image.`
            : "Image loaded. Enter the dimensions you need.");
    } catch (error) {
        sourceImage = null;
        editor.hidden = true;
        setStatus(
            error instanceof Error && error.message
                ? error.message
                : "Could not load this image. Try another file."
        );

        URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
    }
});

widthInput.addEventListener("input", () => updateDimensions("width"));
heightInput.addEventListener("input", () => updateDimensions("height"));

aspectLock.addEventListener("click", () => {
    ratioLocked = !ratioLocked;
    updateLockButton();

    if (ratioLocked && sourceImage) {
        heightInput.value = Math.max(
            1,
            Math.round(Number(widthInput.value) / aspectRatio)
        );

        updateDimensions("width");
    } else {
        setStatus("Aspect ratio unlocked. Width and height can change independently.");
    }
});

outputFormat.addEventListener("change", () => {
    showPreview();
});

resetButton.addEventListener("click", () => {
    if (!sourceImage) return;

    widthInput.value = originalWidth;
    heightInput.value = originalHeight;
    aspectRatio = originalWidth / originalHeight;
    ratioLocked = true;

    updateLockButton();
    showPreview();
    setStatus("Dimensions reset to the original image size.");
});

downloadButton.addEventListener("click", async () => {
    if (!sourceImage) {
        setStatus("Choose an image first.");
        return;
    }

    const width = Number(widthInput.value);
    const height = Number(heightInput.value);
    const error = validateDimensions(width, height);

    if (error) {
        setStatus(error);
        return;
    }

    if (sourceFiles.length > 1) {
        downloadButton.disabled = true;
        downloadButton.textContent = "Preparing ZIP...";
        try {
            const outputs = [];
            for (const [index, file] of sourceFiles.entries()) {
                setStatus(`Resizing image ${index + 1} of ${sourceFiles.length}...`);
                const loaded = await PixoraBatch.loadImage(file);
                try {
                    if (loaded.image.naturalWidth * loaded.image.naturalHeight > MAX_OUTPUT_PIXELS) {
                        throw new Error(`${file.name} exceeds the 40 megapixel processing limit.`);
                    }
                    const mimeType = outputFormat.value === "original"
                        ? file.type
                        : getOutputMimeType();
                    const outputCanvas = document.createElement("canvas");
                    outputCanvas.width = width;
                    outputCanvas.height = height;
                    const context = outputCanvas.getContext("2d");
                    if (!context) throw new Error("Your browser could not process an image.");
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = "high";
                    if (mimeType === "image/jpeg") {
                        context.fillStyle = "#ffffff";
                        context.fillRect(0, 0, width, height);
                    }
                    context.drawImage(loaded.image, 0, 0, width, height);
                    const blob = await PixoraBatch.toBlob(outputCanvas, mimeType);
                    outputs.push({
                        blob,
                        name: PixoraBatch.outputName(file, "resized", getExtension(blob.type || mimeType))
                    });
                } finally {
                    loaded.release();
                }
            }
            await PixoraBatch.downloadZip(outputs);
            setStatus(`Resized ${outputs.length} images. Your ZIP download is ready.`);
        } catch (batchError) {
            setStatus(batchError.message || "Could not resize the selected images.");
        } finally {
            downloadButton.disabled = false;
            downloadButton.textContent = "Resize & Download";
        }
        return;
    }

    const mimeType = getOutputMimeType();
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
        setStatus("Your browser could not process this image.");
        return;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (mimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
    }

    context.drawImage(sourceImage, 0, 0, width, height);

    downloadButton.disabled = true;
    downloadButton.textContent = "Preparing image…";

    canvas.toBlob(blob => {
        downloadButton.disabled = false;
        downloadButton.textContent = "Resize & Download";

        if (!blob) {
            setStatus("Could not export the image. Try smaller dimensions.");
            return;
        }

        // Some browsers may fall back to PNG for unsupported formats.
        const actualMimeType = blob.type || "image/png";
        const extension = getOutputExtension(actualMimeType);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${originalFilename}-resized.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        setStatus(
            `Downloaded ${width} × ${height} px image as ${extension.toUpperCase()}.`
        );
    }, mimeType, mimeType === "image/jpeg" || mimeType === "image/webp"
        ? 0.92
        : undefined);
});

window.addEventListener("beforeunload", () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
});

updateLockButton();
