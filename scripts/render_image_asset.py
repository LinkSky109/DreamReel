#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_image_asset.py — 用 Pillow 渲染 Mock 图片生成资产 PNG。

输入：stdin 或 argv[1] 为 JSON：
  {
    "prompt": "雨夜霓虹街头",
    "width": 1024,
    "height": 576,
    "aspectRatio": "16:9",
    "style": "cinematic",
    "outputPath": "/abs/path/img.png"
  }

输出：在 outputPath 写出 PNG，并向 stdout 打印 {"ok": true, "textRendered": true}。
Pillow / 字体不可用时退出码非 0，由 Node 侧回退到 ffmpeg 纯色 PNG。
"""

import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print(json.dumps({"ok": False, "error": "Pillow not installed"}), file=sys.stderr)
    sys.exit(2)

STYLE_PALETTES = {
    "cinematic": ((10, 16, 28), (46, 72, 110), (232, 196, 130)),
    "realistic": ((28, 34, 40), (92, 112, 128), (235, 235, 235)),
    "anime": ((42, 22, 54), (236, 132, 180), (255, 238, 170)),
    "watercolor": ((36, 52, 66), (126, 178, 214), (246, 232, 206)),
    "minimal": ((20, 20, 20), (52, 52, 52), (240, 240, 240)),
}

FONT_CANDIDATES = [
    os.environ.get("IMAGE_ASSET_FONT", "").strip(),
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if not path:
            continue
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return None


def wrap_text(text, max_chars):
    lines = []
    current = ""
    for char in text:
        if char == "\n":
            lines.append(current)
            current = ""
            continue
        current += char
        if len(current) >= max_chars:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)
    return lines[:4]


def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    payload = json.loads(raw or "{}")
    prompt = (payload.get("prompt") or "").strip()
    width = int(payload.get("width") or 1024)
    height = int(payload.get("height") or 576)
    style = payload.get("style") or "cinematic"
    output_path = payload.get("outputPath")
    if not output_path:
        raise ValueError("outputPath is required")

    bg, mid, accent = STYLE_PALETTES.get(style, STYLE_PALETTES["cinematic"])
    image = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(image)

    # 对角渐变块 + 底部色带，保证即使无字体也有可辨识画面。
    steps = max(width, height)
    for i in range(steps):
        ratio = i / max(1, steps - 1)
        color = tuple(int(bg[c] + (mid[c] - bg[c]) * ratio) for c in range(3))
        x = int(width * ratio)
        draw.line([(x, 0), (x, height)], fill=color)
    draw.rectangle([0, int(height * 0.72), width, height], fill=tuple(int(c * 0.72) for c in accent))

    text_rendered = False
    font = load_font(max(20, int(height * 0.07)))
    if font and prompt:
        lines = wrap_text(prompt, max(8, int(width / max(14, height * 0.075))))
        y = int(height * 0.18)
        for line in lines:
            draw.text((int(width * 0.08), y), line, fill=(248, 248, 248), font=font)
            y += int(height * 0.11)
        text_rendered = True

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    image.save(output_path, format="PNG")
    print(json.dumps({"ok": True, "textRendered": text_rendered, "width": width, "height": height}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
