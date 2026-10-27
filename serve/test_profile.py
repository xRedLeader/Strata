"""Request-boundary expert-profile switching through the local Strata server."""
import io
import json
import queue
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from serve.frontend import ChatTemplate
from serve.server import ByteTokenizer, EngineDied, Service, StrataEngine, serve
from serve.test_lifecycle import ResidentEngine


class ProfileEngine(ResidentEngine):
    def __init__(self, tok):
        super().__init__(tok)
        self.calls = []

    def profile(self, path):
        self.calls.append(path)
        return {"epoch": len(self.calls), "swaps": 7, "one_way_bytes": 8192, "milliseconds": 1.25}


class EngineCommand(unittest.TestCase):
    def engine(self, replies):
        engine = StrataEngine("missing-executable", [], lazy=True)
        engine.proc = mock.Mock()
        engine.proc.poll.return_value = None
        engine.proc.stdin = io.StringIO()
        engine.ended = False
        engine.lines = queue.Queue()
        for reply in replies:
            engine.lines.put(reply)
        return engine

    def test_command_and_measured_result(self):
        engine = self.engine(["PROFILED 3 246 509568000 94.5\n"])
        result = engine.profile("C:/profiles/cpp.bin")
        self.assertEqual(engine.proc.stdin.getvalue(), "PROFILE C:/profiles/cpp.bin\n")
        self.assertEqual(result, {"epoch": 3, "swaps": 246, "one_way_bytes": 509568000,
                                  "milliseconds": 94.5})

    def test_refused_malformed_and_dead(self):
        with self.assertRaisesRegex(ValueError, "one local GPU"):
            self.engine(["ERR PROFILE: runtime switching currently supports one local GPU only\n"]).profile("x")
        with self.assertRaisesRegex(EngineDied, "malformed"):
            self.engine(["PROFILED nope\n"]).profile("x")
        with self.assertRaises(EngineDied):
            self.engine([None]).profile("x")


class Route(unittest.TestCase):
    def setUp(self):
        tok = ByteTokenizer()
        self.engine = ProfileEngine(tok)
        self.svc = Service(self.engine, tok, ChatTemplate(Path(__file__).parent / "chat_template.jinja"))
        self.httpd = serve(self.svc, port=0)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def request(self, body, headers=None):
        request = urllib.request.Request(
            self.base + "/v1/profile",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read().decode())

    def test_switch_and_request_boundary(self):
        self.engine.loaded = True
        code, body = self.request({"path": "C:/profiles/cpp.bin"})
        self.assertEqual(code, 200, body)
        self.assertEqual(body["swaps"], 7)
        self.assertEqual(self.engine.calls, ["C:/profiles/cpp.bin"])

        self.svc.vram_wait_s = 0.2
        with self.svc.fifo:
            self.assertEqual(self.request({"path": "C:/profiles/pooled.bin"})[0], 409)

    def test_rejects_bad_input_and_foreign_page(self):
        self.engine.loaded = True
        for path in (None, "", "bad\npath"):
            self.assertEqual(self.request({"path": path})[0], 400)
        self.assertEqual(self.request({"path": "x"}, {"Origin": "https://other.example"})[0], 403)
        self.assertEqual(self.engine.calls, [])


if __name__ == "__main__":
    unittest.main()
