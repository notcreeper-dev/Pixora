"use strict";

const form = document.getElementById("compressor-form");
const imageInput = document.getElementById("image-input");
const uploadArea = document.getElementById("upload-area");
const fileDetails = document.getElementById("file-details");
const fileName = document.getElementById("file-name");
const originalSizeLabel = document.getElementById("original-size");
const previewOriginalSize = document.getElementById("preview-original-size");
const originalPreview = document.getElementById("original-preview");
const outputFormat = document.getElementById("output-format");
const qualityControl = document.getElementById("quality-control");
const qualityInput = document.getElementById("quality-input");
const qualityValue = document.getElementById("quality-value");
const formatNote = document.getElementById("format-note");
const pngNote = document.getElementById("png-note");
const previewGrid = document.getElementById("preview-grid");
const compressedPreview = document.getElementById("compressed-preview");
const compressedPlaceholder = document.getElementById("compressed-placeholder");
const compressedSizeLabel = document.getElementById("compressed-size");
const resultSection = document.getElementById("result-section");
const sizeResult = document.getElementById("size-result");
const downloadButton = document.getElementById("download-button");
const compressButton = document.getElementById("compress-button");
const resetButton = document.getElementById("reset-button");
const statusMessage = document.getElementById("status-message");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

let selectedFile = null;
let originalPreviewUrl = null;
let compressedPreviewUrl = null;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("is-error", isError);
}

function clearCompressedResult() {
    if (compressedPreviewUrl) {
        URL.revokeObjectURL(compressedPreviewUrl);
        compressedPreviewUrl = null;
    }
    compressedPreview.removeAttribute("src");
    compressedPreview.hidden = true;
    compressedPlaceholder.hidden = false;
    compressedSizeLabel.textContent = "—";
    resultSection.hidden = true;
    downloadButton.removeAttribute("href");
    downloadButton.removeAttribute("download");
}

function updateFormatControls() {
    const isPng = outputFormat.value === "PNG";
    qualityControl.hidden = isPng;
    pngNote.hidden = !isPng;
    qualityInput.disabled = isPng;
    formatNote.hidden = isPng;
}

function resetTool(clearStatus = true) {
    if (originalPreviewUrl) {
        URL.revokeObjectURL(originalPreviewUrl);
        originalPreviewUrl = null;
    }
    selectedFile = null;
    imageInput.value = "";
    originalPreview.removeAttribute("src");
    fileDetails.hidden = true;
    previewGrid.hidden = true;
    compressButton.disabled = true;
    qualityInput.value = "80";
    qualityValue.value = "80%";
    clearCompressedResult();
    if (clearStatus) setStatus("");
}

function selectImage(file) {
    if (!file) return;
    resetTool();
    if (file.size === 0) return setStatus("The selected file is empty.", true);
    if (file.size > MAX_FILE_SIZE) return setStatus("Each image must be 10 MB or smaller.", true);

    selectedFile = file;
    originalPreviewUrl = URL.createObjectURL(file);
    originalPreview.onload = () => {
        if (selectedFile !== file) return;
        fileDetails.hidden = false;
        previewGrid.hidden = false;
        compressButton.disabled = false;
        setStatus("");
    };
    originalPreview.onerror = () => {
        if (selectedFile !== file) return;
        setStatus("This file is not a valid browser-readable image.", true);
        compressButton.disabled = true;
    };
    originalPreview.src = originalPreviewUrl;
    fileName.textContent = file.name;
    originalSizeLabel.textContent = `Original size: ${formatBytes(file.size)}`;
    previewOriginalSize.textContent = formatBytes(file.size);
    clearCompressedResult();
}

imageInput.addEventListener("change", () => selectImage(imageInput.files[0]));

for (const eventName of ["dragenter", "dragover"]) {
    uploadArea.addEventListener(eventName, event => {
        event.preventDefault();
        uploadArea.classList.add("dragging");
    });
}
for (const eventName of ["dragleave", "drop"]) {
    uploadArea.addEventListener(eventName, event => {
        event.preventDefault();
        uploadArea.classList.remove("dragging");
    });
}
uploadArea.addEventListener("drop", event => {
    selectImage(event.dataTransfer.files[0]);
});

outputFormat.addEventListener("change", updateFormatControls);
qualityInput.addEventListener("input", () => { qualityValue.value = `${qualityInput.value}%`; });
resetButton.addEventListener("click", resetTool);

async function readError(response, fallback) {
    const error = await response.json().catch(() => ({}));
    return error.error || fallback;
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedFile) return setStatus("Choose an image before compressing.", true);
    await compressSingle();
});

async function compressSingle() {
    const formData = new FormData();
    formData.append("image", selectedFile, selectedFile.name);
    formData.append("format", outputFormat.value);
    if (outputFormat.value !== "PNG") formData.append("quality", qualityInput.value);
    compressButton.disabled = true;
    compressButton.textContent = "Compressing…";
    clearCompressedResult();
    setStatus("Processing your image…");
    try {
        const response = await fetch("/compress-image", { method: "POST", body: formData });
        if (!response.ok) throw new Error(await readError(response, "Compression failed. Try another image or format."));
        const blob = await response.blob();
        if (!blob.size) throw new Error("The server returned an empty image.");
        const serverOriginalSize = Number(response.headers.get("X-Original-Size"));
        const originalSize = Number.isFinite(serverOriginalSize) && serverOriginalSize > 0 ? serverOriginalSize : selectedFile.size;
        const downloadName = response.headers.get("X-Download-Filename") || "image-compressed";
        const sizeSaved = ((originalSize - blob.size) / originalSize) * 100;
        compressedPreviewUrl = URL.createObjectURL(blob);
        compressedPreview.src = compressedPreviewUrl;
        compressedPreview.hidden = false;
        compressedPlaceholder.hidden = true;
        compressedSizeLabel.textContent = formatBytes(blob.size);
        originalSizeLabel.textContent = `Original size: ${formatBytes(originalSize)}`;
        previewOriginalSize.textContent = formatBytes(originalSize);
        downloadButton.href = compressedPreviewUrl;
        downloadButton.download = downloadName;
        sizeResult.textContent = sizeSaved > 0
            ? `Saved ${sizeSaved.toFixed(1)}% (${formatBytes(originalSize - blob.size)} smaller).`
            : sizeSaved < 0
                ? `Output is ${Math.abs(sizeSaved).toFixed(1)}% larger.`
                : "No file size change (0.0% saved).";
        downloadButton.textContent = "Download compressed image";
        resultSection.hidden = false;
        setStatus("Compression complete. Your original image has not been changed.");
    } catch (error) {
        setStatus(error.message || "Compression failed. Please try again.", true);
    } finally {
        compressButton.disabled = !selectedFile;
        compressButton.textContent = "Compress image";
    }
}

window.addEventListener("beforeunload", () => {
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    if (compressedPreviewUrl) URL.revokeObjectURL(compressedPreviewUrl);
});

updateFormatControls();
