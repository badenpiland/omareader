#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Exercise the native host against a fake Omarchy theme directory."""

import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / "host" / "omareader-host"
REAL_STATE = Path.home() / ".local/state/omarchy"


def read_exact(stream, size):
    chunks = []
    remaining = size
    while remaining:
        block = stream.read(remaining)
        if not block:
            raise AssertionError("host closed stdout")
        chunks.append(block)
        remaining -= len(block)
    return b"".join(chunks)


def read_message(stream):
    size = struct.unpack("<I", read_exact(stream, 4))[0]
    return json.loads(read_exact(stream, size))


def write_message(stream, payload):
    data = json.dumps(payload).encode()
    stream.write(struct.pack("<I", len(data)))
    stream.write(data)
    stream.flush()


def write_theme(current, name, background, foreground, mode):
    theme = current / "theme"
    if theme.exists():
        for child in theme.iterdir():
            child.unlink()
        theme.rmdir()
    theme.mkdir()
    (theme / "colors.toml").write_text(
        "\n".join(
            [
                f'mode = "{mode}"',
                f'background = "{background}"',
                f'foreground = "{foreground}"',
                'selection = "#112233"',
                "",
            ]
        ),
        encoding="utf-8",
    )
    (current / "theme.name").write_text(f"{name}\n", encoding="utf-8")


def test_dump_matches_live_theme():
    colors = REAL_STATE / "current" / "theme" / "colors.toml"
    if not colors.is_file():
        print("skip live dump; no current theme")
        return
    with colors.open("rb") as handle:
        parsed = tomllib.load(handle)
    dumped = json.loads(
        subprocess.check_output([str(HOST), "--dump"], text=True)
    )
    assert dumped["background"] == parsed["background"].lower()
    assert dumped["foreground"] == parsed["foreground"].lower()
    assert dumped["mode"] == parsed["mode"]
    print(f"live theme {dumped['theme']} {dumped['mode']} {dumped['background']}")


def test_swap_pushes_a_new_palette():
    with tempfile.TemporaryDirectory() as tmp:
        state = Path(tmp)
        current = state / "current"
        current.mkdir()
        write_theme(current, "paper", "#dfe4c4", "#1c2d28", "light")
        env = os.environ.copy()
        env["OMAREADER_STATE_DIR"] = str(state)
        proc = subprocess.Popen(
            [str(HOST)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            bufsize=0,
        )
        try:
            first = read_message(proc.stdout)
            assert first["theme"] == "paper"
            assert first["mode"] == "light"
            assert first["background"] == "#dfe4c4"
            write_message(proc.stdin, {"type": "hello"})
            again = read_message(proc.stdout)
            assert again["background"] == "#dfe4c4"

            nxt = current / "next-theme"
            nxt.mkdir()
            (nxt / "colors.toml").write_text(
                'mode = "dark"\nbackground = "#1a1b26"\nforeground = "#a9b1d6"\n',
                encoding="utf-8",
            )
            os.replace(current / "theme", current / "old-theme")
            os.replace(nxt, current / "theme")
            (current / "theme.name").write_text("tokyo-night\n", encoding="utf-8")

            deadline = time.monotonic() + 3
            seen = first
            while time.monotonic() < deadline:
                if select_ready(proc.stdout):
                    seen = read_message(proc.stdout)
                    if (
                        seen.get("background") == "#1a1b26"
                        and seen.get("theme") == "tokyo-night"
                    ):
                        break
                else:
                    time.sleep(0.05)
            assert seen["theme"] == "tokyo-night", seen
            assert seen["mode"] == "dark", seen
            assert seen["background"] == "#1a1b26", seen
            assert seen["foreground"] == "#a9b1d6", seen
        finally:
            proc.kill()
            proc.wait(timeout=2)
            err = proc.stderr.read().decode()
            if err:
                print(err, file=sys.stderr)
    print("theme swap published")


def select_ready(stream):
    import select

    ready, _, _ = select.select([stream], [], [], 0)
    return ready


def test_stdin_close_exits():
    with tempfile.TemporaryDirectory() as tmp:
        state = Path(tmp)
        current = state / "current"
        current.mkdir()
        write_theme(current, "paper", "#dfe4c4", "#1c2d28", "light")
        env = os.environ.copy()
        env["OMAREADER_STATE_DIR"] = str(state)
        proc = subprocess.Popen(
            [str(HOST)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            bufsize=0,
        )
        try:
            first = read_message(proc.stdout)
            assert first["type"] == "palette"
            proc.stdin.close()
            started = time.monotonic()
            proc.wait(timeout=1)
            assert time.monotonic() - started < 1
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=2)
    print("stdin close exits")


def main():
    test_dump_matches_live_theme()
    test_swap_pushes_a_new_palette()
    test_stdin_close_exits()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL {error}", file=sys.stderr)
        raise
