#!/usr/bin/env python3
"""判读截图的像素统计，用来客观区分「纯黑屏」和「有内容」。

用法：
    python tools/png-stats.py <png> [<png> ...]

输出每张图：平均亮度、亮度标准差、纯黑像素占比、非黑像素占比、唯一颜色数、
以及中心区域的平均色。Android 侧黑屏时一般 mean≈0、std≈0、black_ratio≈1。
"""

import sys

from PIL import Image


def stats(path: str) -> None:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    n = w * h
    total = 0
    total_sq = 0
    black = 0
    colors = set()
    cx0, cy0, cx1, cy1 = w // 4, h // 4, w * 3 // 4, h * 3 // 4
    center_sum = [0, 0, 0]
    center_n = 0
    step = 1 if n <= 400_000 else 3
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            v = (r + g + b) // 3
            total += v
            total_sq += v * v
            if r < 8 and g < 8 and b < 8:
                black += 1
            if len(colors) < 4096:
                colors.add((r >> 3, g >> 3, b >> 3))
            if cx0 <= x < cx1 and cy0 <= y < cy1:
                center_sum[0] += r
                center_sum[1] += g
                center_sum[2] += b
                center_n += 1
    sampled = len(range(0, h, step)) * len(range(0, w, step))
    mean = total / sampled
    var = max(total_sq / sampled - mean * mean, 0.0)
    center = tuple(c // center_n for c in center_sum)
    print(
        f"{path}\n"
        f"  size        : {w}x{h}\n"
        f"  mean_luma   : {mean:.2f}\n"
        f"  std_luma    : {var ** 0.5:.2f}\n"
        f"  black_ratio : {black / sampled:.4f}\n"
        f"  nonblack    : {1 - black / sampled:.4f}\n"
        f"  colors(q)   : {len(colors)}{'+' if len(colors) >= 4096 else ''}\n"
        f"  center_rgb  : {center}"
    )
    verdict = "PURE_BLACK(疑似黑屏)" if mean < 6 and var ** 0.5 < 6 else "HAS_CONTENT(有内容)"
    print(f"  verdict     : {verdict}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    for p in sys.argv[1:]:
        stats(p)
