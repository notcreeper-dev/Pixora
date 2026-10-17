import unittest
from io import BytesIO

import piexif
from PIL import Image

from app import MAX_UPLOAD_BYTES, app


class MetadataEditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.testing = True
        cls.client = app.test_client()

    @staticmethod
    def make_jpeg(exif=None):
        image_data = BytesIO()
        image = Image.new("RGB", (16, 12), "white")
        save_options = {"exif": piexif.dump(exif)} if exif is not None else {}
        image.save(image_data, format="JPEG", **save_options)
        return image_data.getvalue()

    def export(self, image_bytes, filename="sample.jpg", **fields):
        data = {"image": (BytesIO(image_bytes), filename)}
        data.update(fields)
        return self.client.post("/api/metadata-editor", data=data)

    def assert_error(self, response, status):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.mimetype, "application/json")
        self.assertIn("error", response.get_json())

    def test_exports_jpeg_without_existing_exif(self):
        response = self.export(
            self.make_jpeg(),
            title="Pixora Title",
            creator="Test Creator",
            description="A test description",
            copyright="2026 Pixora",
            date_created="2026-10-13T09:45",
            keywords="test, jpeg",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/jpeg")
        self.assertIn("pixora-edited.jpg", response.headers["Content-Disposition"])
        with Image.open(BytesIO(response.data)) as result:
            self.assertEqual(result.format, "JPEG")
            result.verify()

        exif = piexif.load(response.data)
        self.assertEqual(
            exif["0th"][piexif.ImageIFD.ImageDescription].rstrip(b"\x00"),
            b"Pixora Title",
        )
        self.assertEqual(
            exif["0th"][piexif.ImageIFD.Artist].rstrip(b"\x00"),
            b"Test Creator",
        )
        self.assertEqual(
            exif["0th"][piexif.ImageIFD.Copyright].rstrip(b"\x00"),
            b"2026 Pixora",
        )
        self.assertEqual(
            exif["Exif"][piexif.ExifIFD.DateTimeOriginal].rstrip(b"\x00"),
            b"2026:10:13 09:45:00",
        )
        self.assertIn(piexif.ExifIFD.UserComment, exif["Exif"])
        self.assertIn(piexif.ImageIFD.XPKeywords, exif["0th"])

    def test_preserves_existing_exif(self):
        original_exif = {
            "0th": {piexif.ImageIFD.Make: b"Existing Camera\x00"},
            "Exif": {},
            "GPS": {},
            "Interop": {},
            "1st": {},
            "thumbnail": None,
        }
        response = self.export(self.make_jpeg(original_exif), title="New title")

        self.assertEqual(response.status_code, 200)
        exif = piexif.load(response.data)
        self.assertEqual(exif["0th"][piexif.ImageIFD.Make], b"Existing Camera\x00")
        self.assertEqual(
            exif["0th"][piexif.ImageIFD.ImageDescription].rstrip(b"\x00"),
            b"New title",
        )

    def test_recovers_from_malformed_exif(self):
        jpeg = self.make_jpeg()
        segment_data = b"Exif\x00\x00broken-exif-data"
        app1_segment = (
            b"\xff\xe1"
            + (len(segment_data) + 2).to_bytes(2, "big")
            + segment_data
        )
        malformed_jpeg = jpeg[:2] + app1_segment + jpeg[2:]

        response = self.export(malformed_jpeg, title="Recovered")

        self.assertEqual(response.status_code, 200)
        exif = piexif.load(response.data)
        self.assertEqual(
            exif["0th"][piexif.ImageIFD.ImageDescription].rstrip(b"\x00"),
            b"Recovered",
        )

    def test_rejects_corrupt_jpeg_as_validation_error(self):
        self.assert_error(self.export(b"not an image"), 400)

    def test_rejects_png_by_extension_and_actual_format(self):
        png_data = BytesIO()
        Image.new("RGB", (4, 4), "blue").save(png_data, format="PNG")

        self.assert_error(self.export(png_data.getvalue(), "sample.png"), 415)
        self.assert_error(self.export(png_data.getvalue(), "sample.jpg"), 415)

    def test_rejects_missing_file(self):
        response = self.client.post("/api/metadata-editor", data={"title": "Missing"})
        self.assert_error(response, 400)

    def test_rejects_invalid_date(self):
        self.assert_error(
            self.export(self.make_jpeg(), date_created="not-a-date"),
            400,
        )

    def test_rejects_upload_over_limit(self):
        oversized = b"\xff\xd8" + b"x" * MAX_UPLOAD_BYTES
        self.assert_error(self.export(oversized), 413)

    def test_accepts_jpeg_at_file_size_limit(self):
        jpeg = self.make_jpeg()
        at_limit = jpeg + b"\x00" * (MAX_UPLOAD_BYTES - len(jpeg))

        response = self.export(at_limit)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/jpeg")


if __name__ == "__main__":
    unittest.main()