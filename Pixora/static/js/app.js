
const form = document.getElementById("converter-form");
const imageInput = document.getElementById("image-input");
const uploadArea = document.getElementById("upload-area");
const previewSection = document.getElementById("preview-section");
const imagePreview = document.getElementById("image-preview");
const fileName = document.getElementById("file-name");
const fileInfo = document.getElementById("file-info");
const outputFormat = document.getElementById("output-format");
const convertButton = document.getElementById("convert-button");
const statusMessage = document.getElementById("status-message");
const removeButton = document.getElementById("remove-image");

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

let selectedFile = null;
let previewUrl = null;

function showStatus(message) {
    statusMessage.textContent = message;
}

function clearPreview() {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    imagePreview.removeAttribute("src");
    previewSection.hidden = true;
}

function selectImage(fileList) {
    const files = Array.from(fileList || []);
    const file = files[0];
    if (!file) return;

    try {
        PixoraBatch.validateFiles(files);
    } catch (error) {
        selectedFile = null;
        clearPreview();
        imageInput.value = "";
        showStatus(error.message);
        return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
        selectedFile = null;
        clearPreview();
        imageInput.value = "";
        showStatus("Choose a PNG, JPG, JPEG, or WebP image.");
        return;
    }

    selectedFile = file;
    clearPreview();

    previewUrl = URL.createObjectURL(file);
    imagePreview.src = previewUrl;
    fileName.textContent = file.name;
    fileInfo.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    previewSection.hidden = false;
    showStatus("");
}

imageInput.addEventListener("change", () => {
    selectImage(imageInput.files);
});

removeButton.addEventListener("click", () => {
    selectedFile = null;
    imageInput.value = "";
    clearPreview();
    showStatus("");
});

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
    selectImage(event.dataTransfer.files);
});

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedFile) {
        showStatus("Select an image before converting.");
        return;
    }

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("format", outputFormat.value);

    convertButton.disabled = true;
    convertButton.textContent = "Converting...";
    showStatus("Processing your image...");

    try {
        const response = await fetch("/convert", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || "Conversion failed.");
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const extension = outputFormat.value.toLowerCase() === "jpg"
            ? "jpg"
            : outputFormat.value.toLowerCase();

        const link = document.createElement("a");
        link.href = downloadUrl;
        const originalName = selectedFile.name;
        const lastDot = originalName.lastIndexOf(".");
        const originalStem = lastDot > 0
            ? originalName.slice(0, lastDot)
            : originalName;

        link.download = `${originalStem}.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        showStatus("Conversion complete. Your download should begin shortly.");
    } catch (error) {
        showStatus(error.message || "Something went wrong. Please try again.");
    } finally {
        convertButton.disabled = false;
        convertButton.textContent = "Convert image →";
    }
});

window.addEventListener("beforeunload", clearPreview);
