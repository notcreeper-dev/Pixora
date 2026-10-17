from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from flask import Flask, Request, jsonify, render_template, request, send_file
from PIL import Image, UnidentifiedImageError, features
from io import BytesIO
from datetime import datetime
import warnings
import piexif
from piexif import helper

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MULTIPART_OVERHEAD_BYTES = 64 * 1024


class PixoraRequest(Request):
    @property
    def max_content_length(self):
        if self.path in {"/api/metadata-editor"}:
            return MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES
        return super().max_content_length


app = Flask(__name__)
app.request_class = PixoraRequest

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

MAX_IMAGE_PIXELS = 20_000_000
WEBP_SUPPORTED = features.check("webp")
MAX_METADATA_FIELD_LENGTHS = {
    "title": 300,
    "creator": 300,
    "description": 3000,
    "copyright": 500,
    "keywords": 1000,
}

SUPPORTED_FORMATS = {
    "PNG": "PNG",
    "JPG": "JPEG",
    "JPEG": "JPEG",
    "WEBP": "WEBP",
}


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/converter")
def converter():
    return render_template("converter.html")


@app.post("/convert")
def convert_image():
    uploaded_file = request.files.get("image")
    output_format = request.form.get("format", "").upper()

    if not uploaded_file or not uploaded_file.filename:
        return {"error": "Please select an image."}, 400

    if output_format not in SUPPORTED_FORMATS:
        return {"error": "Unsupported output format."}, 400

    try:
        with Image.open(uploaded_file.stream) as image:
            image.load()

            # Limit dimensions to reduce resource-exhaustion risk.
            if image.width * image.height > MAX_IMAGE_PIXELS:
                return {"error": "Image dimensions are too large."}, 400

            target_format = SUPPORTED_FORMATS[output_format]

            if target_format == "JPEG":
                # JPEG does not support transparency.
                if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                    image = image.convert("RGBA")
                    background = Image.new("RGB", image.size, "white")
                    background.paste(image, mask=image.getchannel("A"))
                    image = background
                else:
                    image = image.convert("RGB")
            elif target_format == "PNG":
                if image.mode not in ("RGB", "RGBA", "L", "LA", "P"):
                    image = image.convert("RGBA")
            elif target_format == "WEBP":
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA")

            output = BytesIO()
            image.save(output, format=target_format)
            output.seek(0)

            original_name = uploaded_file.filename
            original_stem = original_name.rsplit(".", 1)[0]
            safe_stem = secure_filename(original_stem) or "converted"

            extension = "jpg" if target_format == "JPEG" else target_format.lower()
            download_name = f"{safe_stem}.{extension}"
            
            return send_file(
                output,
                mimetype=f"image/{'jpeg' if target_format == 'JPEG' else extension}",
                as_attachment=True,
                download_name=download_name,
            )

    except (UnidentifiedImageError, OSError, ValueError):
        return {"error": "This file is not a valid or supported image."}, 400


@app.get("/crop")
def cropper():
    return render_template("cropper.html")

@app.get("/resize")
def resizer():
    return render_template("resizer.html")


@app.get("/compress")
def compressor():
    return render_template("compressor.html", webp_supported=WEBP_SUPPORTED)


@app.post("/compress-image")
def compress_image():
    uploaded_file = request.files.get("image")
    output_format = request.form.get("format", "").upper()

    if not uploaded_file or not uploaded_file.filename:
        return {"error": "Please select an image."}, 400

    if output_format not in {"JPEG", "PNG", "WEBP"}:
        return {"error": "Choose JPEG, PNG, or WebP as the output format."}, 400

    if output_format == "WEBP" and not WEBP_SUPPORTED:
        return {"error": "WebP compression is not supported by this server."}, 400

    quality = None
    quality_value = request.form.get("quality")
    if output_format == "PNG":
        if quality_value:
            return {"error": "PNG compression is lossless; quality does not apply."}, 400
    else:
        if not quality_value or not quality_value.isascii() or not quality_value.isdecimal():
            return {"error": "Choose a compression quality from 1 to 95."}, 400

        quality = int(quality_value)
        if not 1 <= quality <= 95:
            return {"error": "Choose a compression quality from 1 to 95."}, 400

    try:
        uploaded_file.stream.seek(0, 2)
        original_size = uploaded_file.stream.tell()
        uploaded_file.stream.seek(0)
    except (OSError, ValueError):
        return {"error": "Could not read the uploaded image."}, 400

    if original_size < 1:
        return {"error": "The selected file is empty."}, 400

    output = BytesIO()
    output_settings = {
        "JPEG": ("JPEG", "jpg", "image/jpeg"),
        "PNG": ("PNG", "png", "image/png"),
        "WEBP": ("WEBP", "webp", "image/webp"),
    }
    target_format, extension, mime_type = output_settings[output_format]

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)

            uploaded_file.stream.seek(0)
            with Image.open(uploaded_file.stream) as source:
                source_format = source.format
                if source_format not in {"JPEG", "PNG", "WEBP"}:
                    return {"error": "Upload a valid JPEG, PNG, or WebP image."}, 400

                if source.width * source.height > MAX_IMAGE_PIXELS:
                    return {"error": "Image dimensions are too large. Maximum is 20 megapixels."}, 400

                source.verify()

            uploaded_file.stream.seek(0)
            with Image.open(uploaded_file.stream) as image:
                if image.format != source_format:
                    return {"error": "The uploaded image could not be validated."}, 400

                if image.width * image.height > MAX_IMAGE_PIXELS:
                    return {"error": "Image dimensions are too large. Maximum is 20 megapixels."}, 400

                image.load()
                has_transparency = (
                    image.mode in ("RGBA", "LA", "PA")
                    or "transparency" in image.info
                )

                if target_format == "JPEG":
                    if has_transparency:
                        rgba_image = image.convert("RGBA")
                        try:
                            output_image = Image.new("RGB", rgba_image.size, "white")
                            output_image.paste(rgba_image, mask=rgba_image.getchannel("A"))
                        finally:
                            rgba_image.close()
                    else:
                        output_image = image.convert("RGB")

                    save_options = {"quality": quality, "optimize": True}
                elif target_format == "PNG":
                    if image.mode in ("1", "L", "LA", "P", "RGB", "RGBA"):
                        output_image = image.copy()
                    else:
                        output_image = image.convert("RGBA")

                    save_options = {"optimize": True, "compress_level": 9}
                else:
                    output_mode = "RGBA" if has_transparency else "RGB"
                    output_image = image.copy() if image.mode == output_mode else image.convert(output_mode)
                    save_options = {"quality": quality, "method": 6}

                try:
                    output_image.save(output, format=target_format, **save_options)
                finally:
                    output_image.close()

        output.seek(0)
        safe_name = secure_filename(uploaded_file.filename)
        original_stem = safe_name.rsplit(".", 1)[0] if "." in safe_name else safe_name
        download_name = f"{original_stem or 'image'}-compressed.{extension}"

        response = send_file(
            output,
            mimetype=mime_type,
            as_attachment=True,
            download_name=download_name,
            max_age=0,
        )
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Original-Size"] = str(original_size)
        response.headers["X-Download-Filename"] = download_name
        return response

    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return {"error": "Image dimensions are too large to process safely."}, 400



@app.get("/rotate")
def rotator():
    return render_template("rotator.html")

@app.get("/metadata")
def metadata_viewer():
    return render_template("metadata.html")

@app.get("/metadata-editor")
def metadata_editor():
    return render_template("metadata_editor.html")


@app.post("/api/metadata-editor")
def save_image_metadata():
    uploaded = request.files.get("image")

    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Please select an image."}), 400

    if not uploaded.filename.lower().endswith((".jpg", ".jpeg")):
        return jsonify({
            "error": "Metadata editing currently supports JPG and JPEG only."
        }), 415

    try:
        image_bytes = uploaded.stream.read(MAX_UPLOAD_BYTES + 1)

        if not image_bytes:
            return jsonify({"error": "The selected image is empty."}), 400

        if len(image_bytes) > MAX_UPLOAD_BYTES:
            return jsonify({
                "error": "The image exceeds the 10 MB upload limit."
            }), 413

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(image_bytes)) as image:
                    if image.format != "JPEG":
                        return jsonify({
                            "error": "Upload a valid JPEG image."
                        }), 415

                    image.verify()
        except (UnidentifiedImageError, OSError, ValueError, EOFError, SyntaxError,
                Image.DecompressionBombError, Image.DecompressionBombWarning):
            return jsonify({
                "error": "The uploaded file is not a valid JPEG image."
            }), 400

        try:
            exif_dict = piexif.load(image_bytes)
        except Exception:
            app.logger.warning(
                "Ignoring malformed EXIF metadata in uploaded JPEG.",
                exc_info=True,
            )
            exif_dict = None

        if exif_dict is not None:
            try:
                piexif.dump(exif_dict)
            except Exception:
                app.logger.warning(
                    "Ignoring unsupported or malformed EXIF metadata in uploaded JPEG.",
                    exc_info=True,
                )
                exif_dict = None

        if exif_dict is None:
            exif_dict = {
                "0th": {}, "Exif": {}, "GPS": {}, "Interop": {},
                "1st": {}, "thumbnail": None,
            }

        form = request.form

        for field_name, max_length in MAX_METADATA_FIELD_LENGTHS.items():
            value = form.get(field_name, "")
            if value and len(value) > max_length:
                return jsonify({
                    "error": f"{field_name.replace('_', ' ').title()} exceeds the {max_length}-character limit."
                }), 400

        def set_text_if_present(ifd, tag, value):
            value = value.strip()
            if value:
                exif_dict[ifd][tag] = value.encode("ascii", "replace") + b"\x00"

        def set_windows_text_if_present(tag, value):
            value = value.strip()
            if value:
                exif_dict["0th"][tag] = value.encode("utf-16le") + b"\x00\x00"

        set_text_if_present(
            "0th", piexif.ImageIFD.ImageDescription,
            form.get("title", "")
        )
        set_windows_text_if_present(
            piexif.ImageIFD.XPTitle, form.get("title", "")
        )
        set_text_if_present(
            "0th", piexif.ImageIFD.Artist,
            form.get("creator", "")
        )
        set_windows_text_if_present(
            piexif.ImageIFD.XPAuthor, form.get("creator", "")
        )
        set_text_if_present(
            "0th", piexif.ImageIFD.Copyright,
            form.get("copyright", "")
        )
        description = form.get("description", "").strip()
        if description:
            exif_dict["Exif"][piexif.ExifIFD.UserComment] = helper.UserComment.dump(
                description, encoding="unicode"
            )
            set_windows_text_if_present(piexif.ImageIFD.XPComment, description)

        keywords = form.get("keywords", "").strip()
        if keywords:
            set_windows_text_if_present(piexif.ImageIFD.XPKeywords, keywords)

        date_value = form.get("date_created", "").strip()

        if date_value:
            try:
                parsed_date = datetime.fromisoformat(date_value)
                exif_date = parsed_date.strftime("%Y:%m:%d %H:%M:%S")
                date_bytes = exif_date.encode("ascii") + b"\x00"
                exif_dict["0th"][piexif.ImageIFD.DateTime] = date_bytes
                exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = date_bytes
                exif_dict["Exif"][piexif.ExifIFD.DateTimeDigitized] = date_bytes
            except ValueError:
                return jsonify({
                    "error": "The date format is invalid."
                }), 400

        output_exif = piexif.dump(exif_dict)
        output = BytesIO()
        piexif.insert(output_exif, image_bytes, output)

        return send_file(
            output,
            mimetype="image/jpeg",
            as_attachment=True,
            download_name="pixora-edited.jpg"
        )

    except Exception:
        app.logger.exception("Metadata export failed")
        return jsonify({
            "error": "Could not edit this image's metadata."
        }), 500


@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(_error):
    return jsonify({"error": "The upload exceeds the 10 MB limit."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=False)
