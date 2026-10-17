import unittest

from app import app


class BatchDownloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.testing = True
        cls.client = app.test_client()

    def test_batch_routes_are_disabled(self):
        for path in ("/download-batch", "/compress-batch"):
            with self.subTest(path=path):
                response = self.client.post(path, data={}, content_type="multipart/form-data")
                self.assertEqual(response.status_code, 404)

    def test_image_tool_pages_do_not_offer_multi_select(self):
        for path in ("/converter", "/crop", "/resize", "/compress", "/rotate", "/metadata"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertNotIn(b"multiple", response.data.lower())

    def test_metadata_editor_routes_are_removed(self):
        self.assertEqual(self.client.get("/metadata-editor").status_code, 404)
        self.assertEqual(self.client.post("/api/metadata-editor").status_code, 404)


if __name__ == "__main__":
    unittest.main()