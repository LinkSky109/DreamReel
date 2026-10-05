#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_title_card.py — 用 Pillow 渲染创意片头标题卡 PNG。

输入：argv[1] 或 stdin 为 JSON：
  {
    "templateId": "classic-gold|glitch-cyber|ink-wash|neon-retro",
    "title": "梦卷开篇",
    "subtitle": "E01",
    "width": 1280,
    "height": 720,
    "outputPath": "/abs/path/card.png"
  }

输出：在 outputPath 写出 PNG，并向 stdout 打印 {"ok": true, ...}。
失败时退出码非 0，错误信息写入 stderr（由 Node 侧捕获后回退）。
"""

import io
import json
import math
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    print(json.dumps({"ok": False, "error": "Pillow not installed"}), file=sys.stderr)
    sys.exit(2)

# 字体候选：优先 macOS 系统字体，其次 Linux（Noto CJK），最后 ASCII 兜底。
# 可用 TITLE_CARD_FONT 环境变量显式指定字体文件路径。
MAC_SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"
MAC_HEITI = "/System/Library/Fonts/STHeiti Medium.ttc"
MAC_ARIAL_UNICODE = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

LINUX_SONGTI = [
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]
LINUX_HEITI = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]
ASCII_FALLBACK = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]

FONT_OVERRIDE = os.environ.get("TITLE_CARD_FONT", "").strip()


def _font_candidates(family="songti"):
    """返回 (CJK 候选, ASCII 兜底候选)，已去重。"""
    if family == "songti":
        mac = [MAC_SONGTI, MAC_ARIAL_UNICODE, MAC_HEITI]
        linux = LINUX_SONGTI
    else:
        mac = [MAC_HEITI, MAC_ARIAL_UNICODE, MAC_SONGTI]
        linux = LINUX_HEITI

    cjk = []
    for path in ([FONT_OVERRIDE] if FONT_OVERRIDE else []) + mac + linux:
        if path and path not in cjk:
            cjk.append(path)

    ascii_fallback = [p for p in ASCII_FALLBACK if p not in cjk]
    return cjk, ascii_fallback


def _try_truetype(path, size):
    try:
        return ImageFont.truetype(path, size, index=0)
    except Exception:
        return None


def load_font(size, family="songti"):
    cjk, ascii_fallback = _font_candidates(family)
    for path in cjk + ascii_fallback:
        font = _try_truetype(path, size)
        if font is not None:
            return font
    return ImageFont.load_default()


def has_cjk_font():
    """是否存在可加载的 CJK 字体（不含仅支持 ASCII 的兜底字体）。"""
    cjk, _ = _font_candidates("songti")
    return any(_try_truetype(path, 16) is not None for path in cjk)


def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox


def draw_centered(draw, layer, y, text, font, fill, shadow=None):
    w, h, bbox = text_size(draw, text, font)
    x = (layer.width - w) // 2 - bbox[0]
    if shadow:
        draw.text((x + shadow[0], y + shadow[1]), text, font=font, fill=shadow[2])
    draw.text((x, y), text, font=font, fill=fill)
    return h


def vignette(img, strength=90):
    """简单暗角：四周压暗。"""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    w, h = img.size
    for i in range(0, 120, 4):
        alpha = int(strength * (i / 120.0) ** 2)
        d.rectangle([i, i, w - i, h - i], outline=(0, 0, 0, alpha), width=4)
    overlay = overlay.filter(ImageFilter.GaussianBlur(40))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def render_classic_gold(w, h, title, subtitle):
    img = Image.new("RGBA", (w, h), (5, 5, 5, 255))
    draw = ImageDraw.Draw(img)
    title_font = load_font(76, "songti")
    sub_font = load_font(30, "songti")

    total_h = 90 + (36 if subtitle else 0)
    y0 = (h - total_h) // 2
    draw_centered(draw, img, y0, title, title_font, (217, 180, 90, 255))
    if subtitle:
        draw_centered(draw, img, y0 + 100, subtitle, sub_font, (201, 194, 176, 255))

    img = vignette(img, strength=70)
    return img


def render_glitch_cyber(w, h, title, subtitle):
    img = Image.new("RGBA", (w, h), (6, 6, 15, 255))
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    title_font = load_font(68, "heiti")
    sub_font = load_font(28, "heiti")

    total_h = 84 + (34 if subtitle else 0)
    y0 = (h - total_h) // 2

    # RGB 错位副本
    tw, th, bbox = text_size(d, title, title_font)
    tx = (w - tw) // 2 - bbox[0]
    d.text((tx - 3, y0), title, font=title_font, fill=(0, 255, 200, 160))
    d.text((tx + 3, y0), title, font=title_font, fill=(255, 0, 180, 160))
    d.text((tx, y0), title, font=title_font, fill=(232, 250, 255, 255))

    if subtitle:
        draw_centered(d, layer, y0 + 92, subtitle, sub_font, (127, 232, 255, 255))

    # 细扫描线
    for y in range(0, h, 4):
        d.line([(0, y), (w, y)], fill=(255, 255, 255, 12), width=1)

    return Image.alpha_composite(img, layer)


def render_ink_wash(w, h, title, subtitle):
    img = Image.new("RGBA", (w, h), (243, 237, 223, 255))
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 模糊墨色晕染
    blob = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blob)
    bd.ellipse([w * 0.1, h * 0.15, w * 0.55, h * 0.75], fill=(60, 60, 60, 40))
    bd.ellipse([w * 0.55, h * 0.4, w * 0.95, h * 0.95], fill=(80, 80, 80, 30))
    blob = blob.filter(ImageFilter.GaussianBlur(60))
    layer = Image.alpha_composite(layer, blob)
    d = ImageDraw.Draw(layer)

    title_font = load_font(76, "songti")
    sub_font = load_font(28, "songti")
    total_h = 90 + (36 if subtitle else 0)
    y0 = (h - total_h) // 2
    draw_centered(d, layer, y0, title, title_font, (28, 28, 28, 255))
    if subtitle:
        draw_centered(d, layer, y0 + 100, subtitle, sub_font, (107, 102, 89, 255))

    # 角落朱砂方印
    seal_size = 64
    sx, sy = w - seal_size - 60, h - seal_size - 60
    d.rounded_rectangle([sx, sy, sx + seal_size, sy + seal_size], radius=6, fill=(184, 64, 58, 255))
    seal_font = load_font(34, "songti")
    sw, sh, sb = text_size(d, "印", seal_font)
    d.text((sx + (seal_size - sw) // 2 - sb[0], sy + (seal_size - sh) // 2 - sb[1] - 2),
           "印", font=seal_font, fill=(255, 245, 235, 255))

    return Image.alpha_composite(img, layer)


def render_neon_retro(w, h, title, subtitle):
    # 深紫渐变底
    img = Image.new("RGBA", (w, h), (26, 11, 61, 255))
    top = (26, 11, 61, 255)
    bottom = (58, 21, 96, 255)
    grad = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        grad.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4)))
    img = grad.resize((w, h))

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 底部水平网格线
    for i in range(8):
        y = int(h * 0.65 + i * (h * 0.05))
        d.line([(0, y), (w, y)], fill=(66, 230, 245, 28), width=1)

    title_font = load_font(72, "heiti")
    sub_font = load_font(28, "heiti")
    total_h = 88 + (36 if subtitle else 0)
    y0 = int((h - total_h) * 0.42)

    # 霓虹发光：模糊副本垫底
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    tw, th, bbox = text_size(gd, title, title_font)
    tx = (w - tw) // 2 - bbox[0]
    gd.text((tx, y0), title, font=title_font, fill=(255, 95, 162, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    layer = Image.alpha_composite(layer, glow)
    d = ImageDraw.Draw(layer)
    d.text((tx, y0), title, font=title_font, fill=(255, 110, 175, 255))

    if subtitle:
        draw_centered(d, layer, y0 + 96, subtitle, sub_font, (201, 184, 255, 255))

    return Image.alpha_composite(img, layer)


RENDERERS = {
    "classic-gold": render_classic_gold,
    "glitch-cyber": render_glitch_cyber,
    "ink-wash": render_ink_wash,
    "neon-retro": render_neon_retro,
}


def main():
    # 自检模式：供测试/部署预检渲染运行时能力（不改动任何文件）
    if len(sys.argv) >= 2 and sys.argv[1] == "--check":
        print(json.dumps({"ok": True, "pillow": True, "cjkFont": has_cjk_font()}))
        return

    if len(sys.argv) >= 2:
        payload = sys.argv[1]
    else:
        payload = sys.stdin.read()

    spec = json.loads(payload)
    template_id = spec.get("templateId", "classic-gold")
    title = (spec.get("title") or "").strip() or "Untitled"
    subtitle = (spec.get("subtitle") or "").strip()
    width = int(spec.get("width") or 1280)
    height = int(spec.get("height") or 720)
    output_path = spec.get("outputPath")
    if not output_path:
        raise ValueError("outputPath is required")

    renderer = RENDERERS.get(template_id, render_classic_gold)
    img = renderer(width, height, title, subtitle).convert("RGB")
    img.save(output_path, "PNG")

    print(json.dumps({"ok": True, "outputPath": output_path, "templateId": template_id}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
