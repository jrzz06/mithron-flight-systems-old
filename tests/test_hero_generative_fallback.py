"""Unit checks for generative → studio fallback when CUDA/torch cannot run SD."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from wix_ai_pipeline.hero_generative import (  # noqa: E402
    compose_marketing_hero,
    probe_generative_capability,
)


class HeroGenerativeFallbackTests(unittest.TestCase):
    def test_probe_reports_unavailable_without_cuda_unless_force_cpu(self):
        with mock.patch.dict("os.environ", {"FORCE_SD_CPU": ""}, clear=False):
            with mock.patch.dict(sys.modules, {"torch": mock.Mock(cuda=mock.Mock(is_available=mock.Mock(return_value=False)), __version__="2.10.0+cpu")}):
                # Force re-import path through probe by calling after patching import inside probe
                pass

        # Direct structural check: when cuda false and FORCE_SD_CPU unset, probe must be unavailable.
        fake_torch = mock.Mock()
        fake_torch.__version__ = "2.10.0+cpu"
        fake_torch.cuda.is_available.return_value = False
        with mock.patch.dict("os.environ", {"FORCE_SD_CPU": "0"}, clear=False):
            with mock.patch.dict(sys.modules, {"torch": fake_torch}):
                # probe imports torch from sys.modules
                capability = probe_generative_capability()
        self.assertFalse(capability.available)
        self.assertIn("pytorch_cuda_unavailable", capability.reason)
        self.assertIn("studio-composite", capability.reason)

    def test_compose_marketing_hero_degrades_to_studio_without_cuda(self):
        cutout = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        # Opaque product blob in center
        for y in range(80, 176):
            for x in range(80, 176):
                cutout.putpixel((x, y), (40, 120, 200, 255))

        fake_torch = mock.Mock()
        fake_torch.__version__ = "2.10.0+cpu"
        fake_torch.cuda.is_available.return_value = False
        with mock.patch.dict("os.environ", {"FORCE_SD_CPU": "0"}, clear=False):
            with mock.patch.dict(sys.modules, {"torch": fake_torch}):
                result = compose_marketing_hero(cutout, canvas_size=(256, 256), mode="generative")

        self.assertEqual(result.mode_used, "studio_fallback")
        self.assertTrue(any("fell_back_to_studio_composite" in note for note in result.notes))
        self.assertEqual(result.image.size, (256, 256))
        self.assertEqual(result.image.mode, "RGB")


if __name__ == "__main__":
    unittest.main()
