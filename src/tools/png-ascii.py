#!/usr/bin/env python3
"""把截图降采样成 ASCII 亮度图，供没有图像输入能力时「看」屏幕内容。

用法：
    python tools/png-ascii.py <png> [列数]

空白页/纯色页会呈现为整片同一字符；正常的页面会看到边框、卡片、文字块的轮廓。
"""

import sys

from PIL import Image

RAMP = " .:-=+*#%@"


def render(path: str, cols: int = 64) -> None:
    img = Image.open(path).convert("L")
    w, h = img.size
    rows = max(1, int(cols * h / w / 2.1))  # 字符高宽比约 2:1
    small = img.resize((cols, rows), Image.BOX)
    px = small.load()
    print(f"{path}  {w}x{h} -> ASCII {cols}x{rows}")
    print("+" + "-" * cols + "+")
    for y in range(rows):
        line = "".join(RAMP[min(len(RAMP) - 1, px[x, y] * len(RAMP) // 256)] for x in range(cols))
        print("|" + line + "|")
    print("+" + "-" * cols + "+")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    render(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 64)
