
"use strict";

window.PixoraBatch = (() => {
    const MAX_FILES = 1;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const MAX_TOTAL_SIZE = 10 * 1024 * 1024;

    function validateFiles(files) {
        if (!files.length) {
            throw new Error("Choose an image.");
        }

        if (files.length !== MAX_FILES) {
            throw new Error("Only one image can be processed at a time.");
        }

        if (files.some(file => !file.type.startsWith("image/"))) {
            throw new Error("Select image files only.");
        }

        if (files.some(file => file.size === 0)) {
            throw new Error("One of the selected files is empty.");
        }

        if (files.some(file => file.size > MAX_FILE_SIZE)) {
            throw new Error("Each image must be 10 MB or smaller.");
        }

        if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) {
            throw new Error("The combined size of selected images must be 10 MB or less.");
        }

        return files;
    }

    function loadImage(file) {
        const url = URL.createObjectURL(file);
        const image = new Image();

        return new Promise((resolve, reject) => {
            image.onload = () => resolve({
                image,
                release: () => URL.revokeObjectURL(url)
            });

            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error(`${file.name} could not be opened as an image.`));
            };

            image.src = url;
        });
    }

    function toBlob(canvas, type, quality = 0.92) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error("The browser could not export one of the images."));
                    return;
                }

                resolve(blob);
            }, type, quality);
        });
    }

    function outputName(file, suffix, extension) {
        const stem = file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .trim() || "image";

        return `${stem}-${suffix}.${extension}`;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function createSelection() {
        const items = [];
        const listeners = new Set();
        let nextId = 1;

        function snapshot() {
            return {
                items: items.map(item => ({ ...item })),
                count: items.length,
                selectedCount: items.filter(item => item.selected).length,
                totalSize: items.reduce((sum, item) => sum + item.file.size, 0),
                formattedTotalSize: formatBytes(
                    items.reduce((sum, item) => sum + item.file.size, 0)
                )
            };
        }

        function notify() {
            const state = snapshot();
            listeners.forEach(listener => listener(state));
        }

        function subscribe(listener) {
            listeners.add(listener);
            listener(snapshot());

            return () => listeners.delete(listener);
        }

        function addFiles(fileList) {
            const incoming = Array.from(fileList);
            const accepted = [];
            const rejected = [];

            for (const file of incoming) {
                if (!file.type.startsWith("image/")) {
                    rejected.push({ file, reason: "Not a recognized image file." });
                    continue;
                }

                if (file.size === 0) {
                    rejected.push({ file, reason: "File is empty." });
                    continue;
                }

                if (file.size > MAX_FILE_SIZE) {
                    rejected.push({ file, reason: "Exceeds the 10 MB per-file limit." });
                    continue;
                }

                if (items.length + accepted.length >= MAX_FILES) {
                    rejected.push({ file, reason: "Maximum of 10 images reached." });
                    continue;
                }

                const currentSize = items.reduce(
                    (sum, item) => sum + item.file.size, 0
                );

                const acceptedSize = accepted.reduce(
                    (sum, item) => sum + item.size, 0
                );

                if (currentSize + acceptedSize + file.size > MAX_TOTAL_SIZE) {
                    rejected.push({ file, reason: "Would exceed the 10 MB total limit." });
                    continue;
                }

                accepted.push(file);
            }

            for (const file of accepted) {
                const previewUrl = URL.createObjectURL(file);

                items.push({
                    id: nextId++,
                    file,
                    previewUrl,
                    selected: true
                });
            }

            if (accepted.length) notify();

            return { accepted, rejected };
        }

        function remove(id) {
            const index = items.findIndex(item => item.id === id);
            if (index === -1) return;

            URL.revokeObjectURL(items[index].previewUrl);
            items.splice(index, 1);
            notify();
        }

        function setSelected(id, selected) {
            const item = items.find(item => item.id === id);
            if (!item) return;

            item.selected = Boolean(selected);
            notify();
        }

        function selectAll() {
            items.forEach(item => item.selected = true);
            notify();
        }

        function deselectAll() {
            items.forEach(item => item.selected = false);
            notify();
        }

        function clear() {
            items.forEach(item => URL.revokeObjectURL(item.previewUrl));
            items.length = 0;
            notify();
        }

        function getSelected() {
            return items
                .filter(item => item.selected)
                .map(item => ({ ...item }));
        }

        return {
            subscribe,
            addFiles,
            remove,
            setSelected,
            selectAll,
            deselectAll,
            clear,
            getSelected,
            getState: snapshot
        };
    }

    async function downloadZip(outputs, onProgress = () => {}) {
        if (!outputs.length || outputs.length > MAX_FILES) {
            throw new Error(`A batch must contain between 1 and ${MAX_FILES} images.`);
        }

        const formData = new FormData();

        outputs.forEach(({ blob, name }, index) => {
            if (!blob || !blob.size) {
                throw new Error(`Could not prepare ${name || "an image"}.`);
            }

            formData.append("files", blob, name);
            onProgress(index + 1, outputs.length);
        });

        const response = await fetch("/download-batch", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || "Could not create the ZIP download.");
        }

        const archive = await response.blob();
        const url = URL.createObjectURL(archive);
        const link = document.createElement("a");

        link.href = url;
        link.download = response.headers
            .get("Content-Disposition")
            ?.match(/filename="?([^";]+)"?/i)?.[1] || "pixora-images.zip";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return {
        validateFiles,
        loadImage,
        toBlob,
        outputName,
        downloadZip,
        createSelection,
        formatBytes,
        MAX_FILES,
        MAX_FILE_SIZE,
        MAX_TOTAL_SIZE
    };
})();
