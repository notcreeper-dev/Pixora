
(() => {
"use strict";

const fileInput = document.getElementById("metadata-file");
const results = document.getElementById("metadata-results");
const errorBox = document.getElementById("metadata-error");
const previewImage = document.getElementById("metadata-preview-image");
const clearButton = document.getElementById("metadata-clear");
const batchSection = document.getElementById("metadata-batch");
const batchRows = document.getElementById("metadata-batch-rows");
let previewURL = null;

function showValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
}

function getAspectRatio(width, height) {
    function gcd(a, b) {
        return b === 0 ? a : gcd(b, a % b);
    }

    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}


function getExifValue(tags, key) {
    const tag = tags?.[key];
    if (!tag) return "—";

    if (tag.description !== undefined && tag.description !== "") {
        return String(tag.description);
    }

    if (tag.value !== undefined && tag.value !== null) {
        const value = tag.value;

        if (Array.isArray(value)) {
            return value.join(", ");
        }

        return String(value);
    }

    return "—";
}

function resetExifFields() {
    const fields = [
        "exif-make",
        "exif-model",
        "exif-date",
        "exif-iso",
        "exif-exposure",
        "exif-aperture",
        "exif-focal-length",
        "exif-gps"
    ];

    fields.forEach(id => showValue(id, "—"));
    showValue("exif-status", "");
}

async function readExifMetadata(file) {
    resetExifFields();

    const status = document.getElementById("exif-status");

    if (status) {
        status.textContent = "Reading photo metadata...";
    }

    try {
        if (!window.ExifReader) {
            throw new Error("EXIF library did not load.");
        }

        const tags = await ExifReader.load(file, {
            expanded: true
        });

        const exif = tags.exif || {};
        const gps = tags.gps || {};

        showValue("exif-make", getExifValue(tags, "Make"));
        showValue("exif-model", getExifValue(tags, "Model"));

        showValue(
            "exif-date",
            getExifValue(tags, "DateTimeOriginal") !== "—"
                ? getExifValue(tags, "DateTimeOriginal")
                : getExifValue(tags, "DateTime")
        );

        showValue("exif-iso", getExifValue(tags, "ISOSpeedRatings"));
        showValue("exif-exposure", getExifValue(tags, "ExposureTime"));
        showValue("exif-aperture", getExifValue(tags, "FNumber"));
        showValue("exif-focal-length", getExifValue(tags, "FocalLength"));

        let gpsText = "—";

        if (
            gps.Latitude !== undefined &&
            gps.Longitude !== undefined
        ) {
            gpsText = `${gps.Latitude}, ${gps.Longitude}`;
        } else {
            const latitude = getExifValue(tags, "GPSLatitude");
            const longitude = getExifValue(tags, "GPSLongitude");

            if (latitude !== "—" && longitude !== "—") {
                gpsText = `${latitude}, ${longitude}`;
            }
        }

        showValue("exif-gps", gpsText);

        const hasMetadata = Object.keys(exif).length > 0 ||
            Object.keys(tags).some(key =>
                !["file", "thumbnail", "exif", "gps", "iptc", "xmp"].includes(key)
            );

        if (status) {
            status.textContent = hasMetadata
                ? "Available metadata is displayed above."
                : "No readable EXIF metadata was found in this image.";
        }
    } catch (error) {
        console.error("EXIF reading failed:", error);

        if (status) {
            status.textContent =
                "EXIF metadata could not be read. The image may not contain supported metadata.";
        }
    }
}


function resetViewer() {
    if (fileInput) fileInput.value = "";
    if (results) results.hidden = true;
    if (batchSection) batchSection.hidden = true;
    if (batchRows) batchRows.replaceChildren();

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    if (errorBox) {
        errorBox.textContent = "";
        errorBox.hidden = true;
    }

    if (previewImage) {
        previewImage.removeAttribute("src");
        previewImage.hidden = true;
    }
}

if (fileInput) {
    fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files || []);
        const file = files[0];

        if (!file) return;

        try {
            PixoraBatch.validateFiles(files);
        } catch (error) {
            resetViewer();
            if (errorBox) {
                errorBox.textContent = error.message;
                errorBox.hidden = false;
            }
            return;
        }

        if (files.some(selected => !selected.type.startsWith("image/"))) {
            resetViewer();
            if (errorBox) {
                errorBox.textContent = "Please select valid image files.";
                errorBox.hidden = false;
            }
            return;
        }

        if (previewURL) URL.revokeObjectURL(previewURL);
        previewURL = URL.createObjectURL(file);
        const image = new Image();

        image.onload = async () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;

            showValue("metadata-format", file.type || "Unknown");
            showValue("metadata-size", formatBytes(file.size));
            showValue("metadata-width", `${width} px`);
            showValue("metadata-height", `${height} px`);
            showValue(
                "metadata-pixels",
                `${(width * height).toLocaleString()} pixels`
            );
            showValue(
                "metadata-ratio",
                getAspectRatio(width, height)
            );
            showValue(
                "metadata-modified",
                file.lastModified
                    ? new Date(file.lastModified).toLocaleString()
                    : "Unavailable"
            );
            showValue(
                "metadata-transparency",
                "Checking..."
            );

            if (previewImage) {
                previewImage.src = previewURL;
                previewImage.hidden = false;
            }

            if (batchSection && files.length > 1) {
                batchSection.hidden = false;
                batchRows.replaceChildren();
                for (const selected of files) {
                    const loaded = await PixoraBatch.loadImage(selected);
                    const row = document.createElement("tr");
                    const cells = [
                        selected.name,
                        `${loaded.image.naturalWidth} × ${loaded.image.naturalHeight} px`,
                        selected.type || "Unknown",
                        formatBytes(selected.size)
                    ];
                    cells.forEach(value => {
                        const cell = document.createElement("td");
                        cell.textContent = value;
                        row.append(cell);
                    });
                    batchRows.append(row);
                    loaded.release();
                }
            } else if (batchSection) {
                batchSection.hidden = true;
                batchRows.replaceChildren();
            }

            if (results) results.hidden = false;

            if (errorBox) {
                errorBox.textContent = "";
                errorBox.hidden = true;
            }

            readExifMetadata(file).then(() => {
                if (files.length > 1) {
                    const status = document.getElementById("exif-status");
                    if (status) status.textContent += " EXIF details shown for the first selected image.";
                }
            });

            // Transparency is checked separately in the next step.
            const supportsTransparency = [
                "image/png",
                "image/webp",
                "image/gif",
                "image/avif",
                "image/tiff"
            ].includes(file.type.toLowerCase());

            if (!supportsTransparency) {
                showValue("metadata-transparency", "No");
            } else {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", {
                    willReadFrequently: true
                });

                canvas.width = width;
                canvas.height = height;

                context.drawImage(image, 0, 0);

                try {
                    const pixels = context.getImageData(
                        0, 0, width, height
                    ).data;

                    let hasTransparency = false;

                    for (let i = 3; i < pixels.length; i += 4) {
                        if (pixels[i] < 255) {
                            hasTransparency = true;
                            break;
                        }
                    }

                    showValue(
                        "metadata-transparency",
                        hasTransparency ? "Yes" : "No"
                    );
                } catch {
                    showValue("metadata-transparency", "Unable to check");
                }
            }
        };

        image.onerror = () => {
            if (previewURL) URL.revokeObjectURL(previewURL);
            previewURL = null;

            if (errorBox) {
                errorBox.textContent =
                    "This image could not be opened. Try another image.";
                errorBox.hidden = false;
            }

            if (results) results.hidden = true;
        };

        image.src = previewURL;
    });
}

if (clearButton) {
    clearButton.addEventListener("click", resetViewer);
}
})();
