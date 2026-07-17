import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "catalog-product-cutout-batch.py"


def load_cutout_module():
    spec = importlib.util.spec_from_file_location("catalog_product_cutout_batch", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CatalogProductCutoutBatchTests(unittest.TestCase):
    def test_studio_composite_uses_fixed_catalog_background_and_preserves_product_pixels(self):
        module = load_cutout_module()
        product = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        draw = ImageDraw.Draw(product)
        draw.rectangle((32, 40, 96, 96), fill=(18, 18, 18, 255))

        studio = module.compose_catalog_studio_image(product)
        pixels = studio.load()

        self.assertEqual(studio.mode, "RGBA")
        self.assertEqual(pixels[0, 0], (250, 250, 250, 255))
        self.assertEqual(pixels[64, 64], (18, 18, 18, 255))
        self.assertEqual(studio.getchannel("A").getextrema(), (255, 255))

    def test_process_item_accepts_edge_cropped_source_after_safe_canvas_padding(self):
        module = load_cutout_module()
        original_remove = module.remove

        def fake_remove(source, **_kwargs):
            rgba = source.convert("RGBA")
            output = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
            source_pixels = rgba.load()
            output_pixels = output.load()

            for y in range(rgba.height):
                for x in range(rgba.width):
                    red, green, blue, alpha = source_pixels[x, y]
                    is_subject = alpha > 0 and red < 40 and green < 40 and blue < 40
                    if is_subject:
                        output_pixels[x, y] = (red, green, blue, 255)

            return output

        module.remove = fake_remove

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                temp = Path(temp_dir)
                source_path = temp / "edge-cropped-source.png"
                output_path = temp / "edge-cropped-output.png"

                source = Image.new("RGBA", (320, 240), (250, 250, 250, 255))
                draw = ImageDraw.Draw(source)
                draw.rectangle((0, 60, 170, 180), fill=(18, 18, 18, 255))
                source.save(source_path)

                result = module.process_item(None, {
                    "slug": "edge-cropped-source",
                    "inputPath": str(source_path),
                    "outputPath": str(output_path),
                })

                self.assertEqual(result["status"], "accepted", result)
                self.assertTrue(output_path.exists())
                self.assertGreater(result["rawMetrics"]["margins"]["left"], 0)
        finally:
            module.remove = original_remove

    def test_defringe_light_halo_reduces_white_edge_contamination(self):
        module = load_cutout_module()
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        pixels = image.load()

        for x in range(30, 66):
            pixels[x, 48] = (20, 20, 20, 255)

        for x in range(28, 30):
            pixels[x, 48] = (245, 245, 245, 90)
        for x in range(66, 68):
            pixels[x, 48] = (248, 248, 248, 80)

        before = module.metrics_for(image)
        defringed = module.defringe_light_halo(image)
        after = module.metrics_for(defringed)
        defringed_pixels = defringed.load()

        self.assertLess(after["haloRatio"], before["haloRatio"])
        self.assertEqual(defringed_pixels[29, 48][3], 0)
        self.assertEqual(defringed_pixels[48, 48][:3], (20, 20, 20))
        self.assertEqual(defringed_pixels[48, 48][3], 255)


if __name__ == "__main__":
    unittest.main()
