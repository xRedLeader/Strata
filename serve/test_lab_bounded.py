"""Synthetic bounded-server tests; no model files or native engine."""
import json
import threading
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from serve.frontend import ChatTemplate
from serve.server import ByteTokenizer, EngineDied, EngineNonFinite, Service, serve
from serve.test_lifecycle import ResidentEngine
from serve.test_server import NonFiniteEngine
from serve import server


class LabBounded(unittest.TestCase):
    def service(self, engine=None):
        tok = ByteTokenizer()
        engine = engine or ResidentEngine(tok)
        svc = Service(engine, tok, ChatTemplate(Path(__file__).parent / "chat_template.jinja"))
        svc.lab_bounded = True
        return svc, engine

    def test_dead_or_unloaded_engine_is_never_restarted(self):
        svc, engine = self.service()
        with self.assertRaises(EngineDied): svc.ensure_loaded()
        self.assertEqual(engine.starts, 0)
        engine.loaded = True
        svc.ensure_loaded()
        self.assertEqual(engine.starts, 0)

    def test_standalone_reload_behavior_is_preserved(self):
        svc, engine = self.service()
        svc.lab_bounded = False
        svc.ensure_loaded()
        self.assertEqual(engine.starts, 1)

    def test_rendered_input_bound_includes_template(self):
        svc, _ = self.service()
        # ByteTokenizer counts bytes, so use an explicitly small synthetic template.
        svc.render_prompt = lambda messages, tools, kwargs: "<user>" + messages[0]["content"] + "<assistant>"
        ids = svc.encode_prompt([{"role": "user", "content": "hi"}], None, {})
        self.assertGreater(len(ids), 2)
        self.assertLessEqual(len(ids), 128)
        with self.assertRaisesRegex(ValueError, "128 tokens"):
            svc.encode_prompt([{"role": "user", "content": "x" * 128}], None, {})

    def test_http_oversized_rendering_never_reaches_engine(self):
        svc, engine = self.service()
        engine.loaded = True
        engine.generate = lambda *a, **kw: self.fail("oversized input must not generate")
        httpd = serve(svc, port=0)
        try:
            request = urllib.request.Request(f"http://127.0.0.1:{httpd.server_port}/v1/chat/completions",
                data=json.dumps({"messages": [{"role": "user", "content": "x" * 128}], "max_tokens": 16}).encode(),
                headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(caught.exception.code, 400)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_nonfinite_output_is_not_retried_or_relabelled_length(self):
        for cut in (0, 3):
            with self.subTest(cut=cut):
                engine = NonFiniteEngine(ByteTokenizer(), "hello", max_context=4096, plan=[cut])
                svc, _ = self.service(engine)
                with self.assertRaises(EngineNonFinite):
                    list(svc.run([1, 2], False, None, 16, {}, threading.Event()))
                self.assertEqual(len(engine.calls), 1)

    def test_cli_selects_native_startup_in_both_managed_and_standalone_modes(self):
        class NativeEntryReached(Exception):
            pass
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, text in {"vocab.json": '{"x":0}', "token_type.json": '[1]', "merges.txt": ''}.items():
                (root / name).write_text(text, encoding="utf-8")
            config = root / "fixture-config.json"
            config.write_text(json.dumps({"exe": str(root / "never-executed.exe"), "cwd": str(root),
                                         "args": [], "tokenizer": str(root), "model_name": "synthetic"}))
            for bounded in (False, True):
                with self.subTest(bounded=bounded):
                    argv = ["server.py", "--engine", "strata", "--config", str(config), "--host", "127.0.0.1",
                            "--port", "0", "--offline", "--parallel", "1", "--max-queue", "0"]
                    if bounded: argv.append("--lab-bounded")
                    with mock.patch("sys.argv", argv), mock.patch("strata_tokenizer.Tokenizer", return_value=ByteTokenizer()), \
                         mock.patch.object(server, "effort_end_args", return_value=[]), \
                         mock.patch.object(server, "StrataEngine", side_effect=NativeEntryReached) as native:
                        with self.assertRaises(NativeEntryReached): server.main()
                        native.assert_called_once()
                        self.assertEqual(native.call_args.args[0], str(root / "never-executed.exe"))
                        self.assertEqual(native.call_args.kwargs.get("allow_start_retry", True), not bounded)

    def test_auxiliary_models_and_fallback_are_rejected_before_native_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, text in {"vocab.json": '{"x":0}', "token_type.json": '[1]', "merges.txt": ''}.items():
                (root / name).write_text(text, encoding="utf-8")
            config = root / "fixture-config.json"
            for key in ("vision", "images", "split_fallback"):
                with self.subTest(key=key):
                    config.write_text(json.dumps({"exe": str(root / "never-executed.exe"), "cwd": str(root),
                        "args": [], "tokenizer": str(root), key: {"exe": str(root / "unapproved.exe")}}))
                    argv = ["server.py", "--engine", "strata", "--config", str(config), "--offline", "--lab-bounded"]
                    with mock.patch("sys.argv", argv), mock.patch("strata_tokenizer.Tokenizer", return_value=ByteTokenizer()), \
                         mock.patch.object(server, "StrataEngine") as native, \
                         mock.patch.object(server, "apply_vision_defaults", side_effect=lambda cfg: cfg):
                        with self.assertRaisesRegex(SystemExit, "forbids auxiliary models and engine fallback"):
                            server.main()
                        native.assert_not_called()


if __name__ == "__main__":
    unittest.main()
