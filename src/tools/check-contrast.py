#!/usr/bin/env python3
"""深色/浅色模式的对比度体检：从截图里量「文字到底读不读得清、卡片有没有块感」。

用法（需要 App 以 LAB_LAN_REMOTE_DEBUG=9222 启动）：

    node tools/gui-cdp.mjs --rects rects.json --theme dark
    node tools/gui-cdp.mjs --shot dark.png
    python tools/check-contrast.py dark.png rects.json

判读标准：
- 文字对比度 < 4.5:1 就是「灰蒙蒙」（小字低于 WCAG AA）；
- 卡片 vs 页面底色 < 1.5:1 基本没有块感，整屏糊成一片。

注意：`--rects` 与 `--shot` 分两次调用时页面必须是同一个主题、同一个视图，
中途别切页，否则矩形和截图对不上。
"""
import json
import sys

from PIL import Image


def lum(rgb):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _pixels(img, box):
    """取矩形内的像素（用显式遍历，避开 Pillow 12+ 对 getdata() 的弃用警告）。"""
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(img.width, max(x0 + 1, x1)), min(img.height, max(y0 + 1, y1))
    crop = img.crop((x0, y0, x1, y1))
    px = crop.load()
    return [px[x, y] for y in range(crop.height) for x in range(crop.width)]


def extremes(img, box):
    """组内最暗 / 最亮两个颜色 —— 文字总在某一端，取极值最能反映可读性。"""
    px = _pixels(img, box)
    if not px:
        return None, None
    px.sort(key=lum)
    return px[max(0, int(len(px) * 0.01))], px[min(len(px) - 1, int(len(px) * 0.99))]


def median_color(img, box):
    px = _pixels(img, box)
    if not px:
        return (0, 0, 0)
    px.sort(key=lum)
    return px[len(px) // 2]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    img = Image.open(sys.argv[1]).convert("RGB")
    data = json.load(open(sys.argv[2], encoding="utf-8"))
    meta = data.pop("__meta")
    scale = img.width / meta["innerWidth"]

    def box_of(r, pad=1.0):
        return ((r["x"] + pad) * scale, (r["y"] + pad) * scale,
                (r["x"] + r["w"] - pad) * scale, (r["y"] + r["h"] - pad) * scale)

    print("主题=%s  截图 %dx%d  scale=%.2f" % (meta["theme"], img.width, img.height, scale))
    print("-" * 74)
    print("%-12s %-20s %-20s %s" % ("元素", "最暗", "最亮", "对比度"))
    worst = []
    for name, r in data.items():
        if not r or r["w"] < 2 or r["h"] < 2:
            continue
        dark, light = extremes(img, box_of(r))
        if dark is None:
            continue
        ratio = contrast(dark, light)
        flag = "OK" if ratio >= 4.5 else ("偏低" if ratio >= 3 else "太低")
        if ratio < 4.5:
            worst.append((ratio, name))
        print("%-12s %-20s %-20s %.2f:1  %s" % (name, str(dark), str(light), ratio, flag))

    card, view = data.get("card"), data.get("view")
    if card and view:
        c = median_color(img, box_of(card, 4))
        v = median_color(img, ((view["x"] + 8) * scale, (view["y"] + 2) * scale,
                              (view["x"] + 120) * scale, (view["y"] + 12) * scale))
        cr = contrast(c, v)
        print("-" * 74)
        print("卡片底色 %s vs 页面背景 %s → %.2f:1  %s" % (
            c, v, cr, "有块感" if cr >= 1.5 else "块感不足（会灰蒙蒙）"))

    if worst:
        print("\n低于 AA(4.5:1) 的元素：", ", ".join("%s %.2f" % (n, r) for r, n in sorted(worst)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
