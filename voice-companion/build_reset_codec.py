"""Build the pinned rustymimi 0.4.1 codec with its missing downsampler reset.

Requires Rust/Cargo and uv on PATH. Produces a local wheel; never installs it or
changes a running worker. The upstream model, codec math and weights are unchanged.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import tarfile
import urllib.request

SOURCE_URL = "https://files.pythonhosted.org/packages/04/c3/d9a835c6adc96dead5874bf1d97a4e7a2baed7468bb480e538df7d7fabfd/rustymimi-0.4.1.tar.gz"
SOURCE_SHA256 = "0b7c537f25ba83f43643819761942cc299c6457e01f1dbf139a508f84da263e4"


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / "rustymimi-0.4.1.tar.gz"
    if not archive.exists():
        urllib.request.urlretrieve(SOURCE_URL, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Codec source digest mismatch")
    with tarfile.open(archive) as source:
        source.extractall(directory, filter="data")
    root = directory / "rustymimi-0.4.1"
    mimi = root / "moshi-core/src/mimi.rs"
    text = mimi.read_text()
    before = "        self.upsample.reset_state();\n    }"
    if text.count(before) != 1:
        raise ValueError("Pinned codec reset source does not match")
    mimi.write_text(text.replace(before, "        self.upsample.reset_state();\n        self.downsample.reset_state();\n    }"))
    transformer = root / "moshi-core/src/transformer.rs"
    text = transformer.read_text()
    before = "    pub fn reset_kv_cache(&mut self) {\n        self.kv_cache.reset()\n    }"
    if text.count(before) != 1:
        raise ValueError("Pinned attention cache reset source does not match")
    transformer.write_text(text.replace(before, "    pub fn reset_kv_cache(&mut self) {\n        self.kv_cache.reset();\n        self.pos = 0;\n    }"))
    binding = root / "mimi-pyo3/src/lib.rs"
    text = binding.read_text()
    before = "    fn reset(&mut self) {\n        self.mimi.reset_state()\n    }"
    if text.count(before) != 1:
        raise ValueError("Pinned Python binding source does not match")
    # Explicit capability: an unpatched installed reset() must never accidentally
    # become eligible for reuse merely because its package version matches.
    binding.write_text(text.replace(before, before + "\n\n    fn reset_complete_v2(&mut self) {\n        self.mimi.reset_state()\n    }"))
    project = root / "pyproject.toml"
    project.write_text(project.read_text().replace('dynamic = ["version"]', 'version = "0.4.1+flowreset2"'))
    return root


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "artifacts/voice-latency/reset-codec")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--python", type=Path, default=Path(__file__).resolve().parent / ".venv/bin/python")
    args = parser.parse_args()
    root = prepare(args.output.resolve())
    if not args.prepare_only:
        subprocess.run(["uv", "build", "--python", str(args.python.resolve()), "--wheel", "--out-dir", str(args.output.resolve() / "wheels"), str(root)], check=True)
    print(root)
