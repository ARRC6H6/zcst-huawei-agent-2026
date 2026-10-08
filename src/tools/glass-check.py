"""检查窗口是否真的「透」出去（亚克力/透明）：对比窗口内外同一高度的像素。

    python tools/glass-check.py --title 实验助手

判定逻辑：
- 无边框/不透明窗口：窗口内的底色与壁纸无关（整块同色）
- 透明/亚克力窗口：窗口内的像素会带上窗口外壁纸的色调，且壁纸花纹会以模糊形式透出
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
SRCCOPY = 0x00CC0020


def find_hwnd(title_part):
    found = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(h, _):
        n = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(h, n, 512)
        if n.value and title_part in n.value and user32.IsWindowVisible(h):
            found.append((h, n.value))
        return True

    user32.EnumWindows(cb, 0)
    found.sort(key=lambda x: len(x[1]))
    return found[0][0] if found else None


def grab(x, y, w, h):
    hdc = user32.GetDC(0)
    mem = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    gdi32.SelectObject(mem, bmp)
    gdi32.BitBlt(mem, 0, 0, w, h, hdc, x, y, SRCCOPY)

    class BMIH(ctypes.Structure):
        _fields_ = [("biSize", wt.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
                    ("biPlanes", wt.WORD), ("biBitCount", wt.WORD), ("biCompression", wt.DWORD),
                    ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", ctypes.c_long),
                    ("biYPelsPerMeter", ctypes.c_long), ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]

    class BMI(ctypes.Structure):
        _fields_ = [("bmiHeader", BMIH), ("bmiColors", wt.DWORD * 3)]

    bmi = BMI()
    bmi.bmiHeader.biSize = ctypes.sizeof(BMIH)
    bmi.bmiHeader.biWidth = w
    bmi.bmiHeader.biHeight = -h
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bmi), 0)
    img = Image.frombuffer("RGBA", (w, h), buf, "raw", "BGRA", 0, 1).convert("RGB")
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem)
    user32.ReleaseDC(0, hdc)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", default="实验助手")
    ap.add_argument("--out", default=os.path.join(HERE, "..", "src-tauri", ".lan-check", "glass.png"))
    args = ap.parse_args()

    hwnd = find_hwnd(args.title)
    if not hwnd:
        print("找不到窗口")
        return 2
    user32.SetForegroundWindow(hwnd)

    wr = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    x, y, w, h = wr.left, wr.top, wr.right - wr.left, wr.bottom - wr.top
    pad = 60
    img = grab(x - pad, y - pad, w + pad * 2, h + pad * 2)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    img.save(args.out)
    a = np.array(img).astype(int)

    print(f"窗口 {w}x{h} @ ({x},{y})；抓图含 {pad}px 外边距 -> {args.out}")
    mid = pad + w // 2
    print("\n同一列（窗口中央）从窗口外到窗口内的颜色：")
    for dy in range(-6, 40, 6):
        yy = pad + dy
        if 0 <= yy < a.shape[0]:
            tag = "外" if dy < 0 else "内"
            print(f"  {tag} dy={dy:+3d}  {a[yy, mid].tolist()}")

    # 壁纸花纹是否透过来：窗口内区域的方差（模糊后应仍有轻微起伏）
    inner = a[pad + 40:pad + h - 40, pad + 40:pad + w - 40]
    print(f"\n窗口内区域 标准差(每通道) = {inner.reshape(-1, 3).std(axis=0).round(1).tolist()}")
    print(f"窗口内区域 均值(每通道)   = {inner.reshape(-1, 3).mean(axis=0).round(1).tolist()}")
    outside = a[2:14, pad:pad + w]
    print(f"窗口上方壁纸 均值         = {outside.reshape(-1, 3).mean(axis=0).round(1).tolist()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
