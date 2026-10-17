const editorFile = document.getElementById("editor-file");
const editorWorkspace = document.getElementById("editor-workspace");
const editorPreview = document.getElementById("editor-preview-image");
const editorFileInfo = document.getElementById("editor-file-info");
const editorError = document.getElementById("editor-error");
const editorReset = document.getElementById("editor-reset");
const editorForm = document.getElementById("metadata-editor-form");
const editorSave = document.getElementById("editor-save");
const editorStatus = document.getElementById("editor-status");
const editorDate = document.getElementById("editor-date");
const editorDatePreview = document.getElementById("editor-date-preview");
const editorDateNow = document.getElementById("editor-date-now");
const editorDateClear = document.getElementById("editor-date-clear");

let selectedFile = null;
let selectedFiles = [];
let previewURL = null;

const queue = new PixoraBatch.Queue({
    input: editorFile,
    dropZone: document.querySelector(".upload-label"),
    allowedTypes: ["image/jpeg"],
    schema: [
        { key: "title", label: "Title", type: "text" },
        { key: "creator", label: "Creator", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "copyright", label: "Copyright", type: "text" },
        { key: "date_created", label: "Date", type: "datetime-local" },
        { key: "keywords", label: "Keywords", type: "text" }
    ],
    defaults: () => Object.fromEntries(
        ["title", "creator", "description", "copyright", "date_created", "keywords"]
            .map(name => [name, editorForm.elements[name].value])
    ),
    processFile: async (file, settings) => {
        const formData = new FormData();
        formData.append("image", file, file.name);
        Object.entries(settings).forEach(([key, value]) => formData.append(key, value));
        const response = await fetch("/api/metadata-editor", { method: "POST", body: formData });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Metadata export failed (HTTP ${response.status}).`);
        }
        return {
            blob: await response.blob(),
            name: PixoraBatch.outputName(file, "edited", "jpg")
        };
    }
});
queue.processButton.textContent = "Export selected row settings";

function updateDatePreview() {
    if (!editorDate.value) {
        editorDatePreview.textContent = "No date set";
        return;
    }

    const date = new Date(editorDate.value);
    editorDatePreview.textContent = Number.isNaN(date.getTime())
        ? "Enter a valid date and time"
        : new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
}

editorDate.addEventListener("input", updateDatePreview);
editorDate.addEventListener("change", updateDatePreview);

editorDateNow.addEventListener("click", () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    editorDate.value = now.toISOString().slice(0, 16);
    updateDatePreview();
});

editorDateClear.addEventListener("click", () => {
    editorDate.value = "";
    updateDatePreview();
    editorDate.focus();
});

editorForm.addEventListener("reset", () => {
    setTimeout(updateDatePreview, 0);
});

function showEditorError(message) {
    editorError.textContent = message;
    editorError.hidden = false;
}

function clearEditorError() {
    editorError.textContent = "";
    editorError.hidden = true;
}

function clearEditorStatus() {
    editorStatus.textContent = "";
}

function resetEditor() {
    selectedFile = null;
    selectedFiles = [];
    editorFile.value = "";

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    editorPreview.removeAttribute("src");
    editorFileInfo.textContent = "";
    editorWorkspace.hidden = true;

    editorForm.reset();
    editorSave.disabled = false;

    clearEditorError();
    clearEditorStatus();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

editorFile.addEventListener("change", () => {
    clearEditorError();
    clearEditorStatus();

    const files = Array.from(editorFile.files || []);
    const file = files[0];

    if (!file) return;

    try {
        PixoraBatch.validateFiles(files);
    } catch (error) {
        resetEditor();
        showEditorError(error.message);
        return;
    }

    if (files.some(selected => !selected.type.startsWith("image/"))) {
        resetEditor();
        showEditorError("Please select valid image files.");
        return;
    }

    if (files.some(selected => !/\.(jpe?g)$/i.test(selected.name))) {
        resetEditor();
        showEditorError("Metadata editing supports JPG and JPEG files only.");
        return;
    }

    selectedFiles = files;
    selectedFile = file;

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
    }

    previewURL = URL.createObjectURL(file);

    const image = new Image();

    image.onload = () => {
        if (selectedFile !== file) return;

        editorPreview.src = previewURL;
        editorFileInfo.textContent =
            `${file.name} • ${image.naturalWidth} × ${image.naturalHeight} px • ${formatFileSize(file.size)}` +
            (files.length > 1 ? ` · ${files.length - 1} more image(s) will receive these values` : "");

        editorWorkspace.hidden = false;
        clearEditorError();
    };

    image.onerror = () => {
        if (selectedFile !== file) return;

        resetEditor();
        showEditorError("The selected image could not be previewed.");
    };

    image.src = previewURL;
});

editorReset.addEventListener("click", () => {
    queue.clear();
    resetEditor();
});


editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = queue.selectedItems();
    if (!selected.length) {
        showEditorError("Select one or more images first.");
        return;
    }
    const sharedSettings = queue.defaults();
    selected.forEach(item => {
        item.settings = { ...sharedSettings };
        item.customSettings = false;
    });
    queue.render();
    await queue.processSelected();
    return;

    if (editorSave.disabled) return;

    if (!selectedFile) {
        showEditorError("Please select an image first.");
        return;
    }

    clearEditorError();
    clearEditorStatus();

    editorSave.disabled = true;
    editorStatus.textContent = selectedFiles.length > 1
        ? `Applying metadata to ${selectedFiles.length} images...`
        : "Applying metadata and preparing download...";

    try {
        if (selectedFiles.length > 1) {
            const outputs = [];
            for (const [index, file] of selectedFiles.entries()) {
                editorStatus.textContent = `Applying metadata to image ${index + 1} of ${selectedFiles.length}...`;
                const response = await requestMetadataExport(file);
                outputs.push({
                    blob: await response.blob(),
                    name: PixoraBatch.outputName(file, "edited", "jpg")
                });
            }
            await PixoraBatch.downloadZip(outputs);
            editorStatus.textContent = `Metadata applied to ${outputs.length} images. Your ZIP download is ready.`;
            return;
        }

        const formData = new FormData();

        formData.append("image", selectedFile);
        formData.append("title", document.getElementById("editor-title").value);
        formData.append("creator", document.getElementById("editor-creator").value);
        formData.append("description", document.getElementById("editor-description").value);
        formData.append("copyright", document.getElementById("editor-copyright").value);
        formData.append("date_created", editorDate.value);
        formData.append("keywords", document.getElementById("editor-keywords").value);

        const response = await fetch("/api/metadata-editor", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const responseText = await response.text();
            let message = "";

            try {
                const data = JSON.parse(responseText);
                message = data.error || data.message || "";
            } catch {
                if (responseText.trim() && !responseText.trim().startsWith("<")) {
                    message = responseText.trim();
                }
            }

            if (!message) {
                message = `Metadata export failed (HTTP ${response.status}).`;
            }
            throw new Error(message);
        }

        const blob = await response.blob();
        const downloadURL = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadURL;
        link.download = "pixora-edited.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadURL), 1000);

        editorStatus.textContent =
            "Metadata saved. Your edited JPEG has been downloaded.";
    } catch (error) {
        console.error("Metadata export error:", error);
        showEditorError(error.message || "Unable to export this image.");
        clearEditorStatus();
    } finally {
        editorSave.disabled = false;
    }
});

async function requestMetadataExport(file) {
    const formData = new FormData();
    formData.append("image", file, file.name);
    formData.append("title", document.getElementById("editor-title").value);
    formData.append("creator", document.getElementById("editor-creator").value);
    formData.append("description", document.getElementById("editor-description").value);
    formData.append("copyright", document.getElementById("editor-copyright").value);
    formData.append("date_created", editorDate.value);
    formData.append("keywords", document.getElementById("editor-keywords").value);
    const response = await fetch("/api/metadata-editor", { method: "POST", body: formData });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`${file.name}: ${data.error || `Metadata export failed (HTTP ${response.status}).`}`);
    }
    return response;
}