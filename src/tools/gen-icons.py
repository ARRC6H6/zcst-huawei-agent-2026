#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「实验助手」的图标（零依赖，只用 Python 标准库 zlib + math）。

    python tools/gen-icons.py              # 桌面 + Android 全套
    python tools/gen-icons.py --desktop    # 只出桌面（src-tauri/icons/）
    python tools/gen-icons.py --android    # 只出 Android（gen/android/.../res/）
    python tools/gen-icons.py --preview    # 额外在 tools/preview/ 拼一张预览图

素材：`src-tauri/assets/新图标模板.png`（512×512 透明底 + 彩色主体）
      —— 主色：深蓝 #0057A8 / 深蓝描边 #323653 / 金黄 #FEC302 / 橙 #F1A604 /
               米白 #F9FBEF / 浅灰绿 #D3E8E7 / 浅蓝 #BCDEF6
      内容是斜向的立体丝带式「∞」。换图标只要换这个模板文件，再跑一次本脚本。

为什么用「重采样模板」而不是「用代码画」：
    这枚图案是**立体丝带式**（深蓝描边 + 白高光带 + 金黄主体 + 米白/浅灰绿渐变过渡），
    用几何代码复现会明显失真。模板本身就是素材，高质量重采样既能忠实还原，
    又能保证所有尺寸风格完全一致。为此本脚本自带 Lanczos 重采样（纯标准库实现）。

桌面端产出（src-tauri/icons/，15 个）：
    32x32.png  128x128.png  128x128@2x.png(256)  icon.png(512)  icon.ico
    Square30/44/71/89/107/142/150/284/310Logo.png  StoreLogo.png
    ※ tauri.conf.json 只引用 4 个（32 / 128 / 128@2x / icon.ico），
      Square*/StoreLogo 是 Windows Store(MSIX) 用的；本工程 bundle.targets=["nsis"]，
      实际用不到，但为「换模板即全替换」一并生成。

Android 产出（gen/android/app/src/main/res/，20 张 PNG + 3 个 XML）：
    mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png            旧式（方，白底，系统自己遮罩）
    mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png      旧式（圆）
    mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png 自适应前景（透明底）
    mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml
    values/ic_launcher_background.xml                      （白底 #FFFFFF）
    ※ 自适应图标（Android 8+）：背景层纯白 + 前景层图案。
      前景内容只占中心 ~62%，因为启动器会把外面那圈裁掉（安全区 = 中心 66%）。
"""

import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ICONS_OUT = os.path.join(PROJECT, "src-tauri", "icons")
TEMPLATE_DIR = os.path.join(PROJECT, "src-tauri", "assets")
ANDROID_RES = os.path.join(PROJECT, "src-tauri", "gen", "android", "app", "src", "main", "res")
PREVIEW_OUT = os.path.join(PROJECT, "build")

# 图案素材（可换成任意透明底 PNG）。
# 放在 src-tauri/assets/：**不要放 icons/**，那目录里全是待交付的成品，
# 混进一个模板会让人分不清哪个该改。
TEMPLATE_CANDIDATES = ["新图标模板.png", "图标模板.png", "icon-template.png"]
# 兼容：也接受直接丢在 icons/ 下的模板
TEMPLATE_DIRS = [TEMPLATE_DIR, ICONS_OUT]

BG = (255, 255, 255)        # 白底
ART_SCALE_DESKTOP = 0.88    # 桌面：图案占图标边长比例（留白 6% 边距）
ART_SCALE_ANDROID = 0.80    # 旧式安卓：略小一点，防某些启动器裁边
ART_SCALE_ADAPTIVE = 0.62   # 自适应前景：只占 62%（安全区是中心 66%）
ICO_SIZES = [16, 32, 48, 64, 128, 256]


# ---------------------------------------------------------------------------
# 模板载入（零依赖解码 PNG）
# ---------------------------------------------------------------------------
def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png_rgba(path):
    """解码 PNG → (w, h, bytearray RGBA)。支持 8 位灰度/RGB/RGBA、非隔行。"""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG：%s" % path)
    pos = 8
    w = h = bitdepth = ctype = None
    idat = bytearray()
    plte = None
    trns = None
    while pos + 8 <= len(data):
        (ln,) = struct.unpack_from(">I", data, pos)
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if tag == b"IHDR":
            w, h, bitdepth, ctype, comp, filt, interlace = struct.unpack(">IIBBBBB", body)
            if bitdepth != 8:
                raise ValueError("只支持 8 位深度，模板是 %d 位" % bitdepth)
            if interlace:
                raise ValueError("不支持隔行 PNG")
        elif tag == b"PLTE":
            plte = body
        elif tag == b"tRNS":
            trns = body
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break

    nch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(bytes(idat))
    stride = w * nch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        row = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(nch, stride):
                row[i] = (row[i] + row[i - nch]) & 0xFF
        elif f == 2:
            for i in range(stride):
                row[i] = (row[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = row[i - nch] if i >= nch else 0
                row[i] = (row[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = row[i - nch] if i >= nch else 0
                c = prev[i - nch] if i >= nch else 0
                row[i] = (row[i] + _paeth(a, prev[i], c)) & 0xFF
        elif f != 0:
            raise ValueError("未知行过滤器 %d" % f)
        out[y * stride:(y + 1) * stride] = row
        prev = row

    # 统一成 RGBA
    rgba = bytearray(w * h * 4)
    if ctype == 6:
        rgba[:] = out
    elif ctype == 2:
        for i in range(w * h):
            rgba[i * 4:i * 4 + 3] = out[i * 3:i * 3 + 3]
            rgba[i * 4 + 3] = 255
    elif ctype == 0:
        for i in range(w * h):
            v = out[i]
            rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
            rgba[i * 4 + 3] = 255
    elif ctype == 4:
        for i in range(w * h):
            v = out[i * 2]
            rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
            rgba[i * 4 + 3] = out[i * 2 + 1]
    elif ctype == 3:
        for i in range(w * h):
            idx = out[i]
            rgba[i * 4:i * 4 + 3] = plte[idx * 3:idx * 3 + 3]
            rgba[i * 4 + 3] = trns[idx] if (trns and idx < len(trns)) else 255
    else:
        raise ValueError("不支持的 PNG 颜色类型 %d" % ctype)
    return w, h, rgba


def _find_template():
    for d in TEMPLATE_DIRS:
        for name in TEMPLATE_CANDIDATES:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return p
    raise SystemExit(
        "找不到图标模板。请把模板 PNG 放到：\n  %s\n候选名：%s"
        % (TEMPLATE_DIR, " / ".join(TEMPLATE_CANDIDATES))
    )


def load_template_trimmed():
    """载入模板并裁到内容包围盒（去四周多余透明边），返回 (w, h, RGBA)。"""
    path = _find_template()
    w, h, px = read_png_rgba(path)
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if px[row + x * 4 + 3] > 8:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        raise SystemExit("模板是全透明的，没有内容：%s" % path)
    cw, ch = maxx - minx + 1, maxy - miny + 1
    out = bytearray(cw * ch * 4)
    for y in range(ch):
        s = ((miny + y) * w + minx) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = px[s:s + cw * 4]
    print("模板：%s" % os.path.basename(path))
    print("  原始 %dx%d → 内容包围盒 %dx%d（去透明边）" % (w, h, cw, ch))
    return cw, ch, out


# ---------------------------------------------------------------------------
# Lanczos 重采样（纯标准库；用权重表，避免逐像素算 sin）
# ---------------------------------------------------------------------------
def _lanczos(x, a=3.0):
    if x == 0.0:
        return 1.0
    if x < -a or x > a:
        return 0.0
    px = math.pi * x
    return (a * math.sin(px) * math.sin(px / a)) / (px * px)


def _contribs(dst_n, src_n, scale, a=3.0):
    """每个目标像素的源区间与权重（两趟：横、纵各一次）"""
    filt_scale = 1.0 / scale
    support = a * filt_scale
    out = []
    for i in range(dst_n):
        center = (i + 0.5) * scale - 0.5
        lo = max(0, int(math.floor(center - support)))
        hi = min(src_n - 1, int(math.ceil(center + support)))
        ws = []
        total = 0.0
        for j in range(lo, hi + 1):
            wgt = _lanczos((j - center) * filt_scale, a)
            if wgt != 0.0:
                ws.append((j, wgt))
                total += wgt
        if total != 0.0:
            ws = [(j, w / total) for j, w in ws]
        else:
            ws = [(min(max(int(round(center)), 0), src_n - 1), 1.0)]
        out.append(ws)
    return out


def resample_rgba(src, sw, sh, dw, dh):
    """Lanczos 缩放 RGBA（预乘 alpha，避免透明边发黑）"""
    if (dw, dh) == (sw, sh):
        return bytearray(src)

    def to_premul():
        pm = bytearray(sw * sh * 4)
        for i in range(sw * sh):
            a = src[i * 4 + 3]
            if a == 0:
                continue
            f = a / 255.0
            pm[i * 4] = int(round(src[i * 4] * f))
            pm[i * 4 + 1] = int(round(src[i * 4 + 1] * f))
            pm[i * 4 + 2] = int(round(src[i * 4 + 2] * f))
            pm[i * 4 + 3] = a
        return pm

    pm = to_premul()

    # 横向
    if dw == sw:
        tmp, tw = bytearray(pm), sw
    else:
        cs = _contribs(dw, sw, sw / dw)
        tw = dw
        tmp = bytearray(dw * sh * 4)
        for y in range(sh):
            srow = y * sw * 4
            drow = y * dw * 4
            for i, ws in enumerate(cs):
                r = g = b = a = 0.0
                for j, wgt in ws:
                    o = srow + j * 4
                    r += pm[o] * wgt
                    g += pm[o + 1] * wgt
                    b += pm[o + 2] * wgt
                    a += pm[o + 3] * wgt
                o = drow + i * 4
                tmp[o] = min(255, max(0, int(round(r))))
                tmp[o + 1] = min(255, max(0, int(round(g))))
                tmp[o + 2] = min(255, max(0, int(round(b))))
                tmp[o + 3] = min(255, max(0, int(round(a))))

    # 纵向
    if dh == sh:
        pm2, th = tmp, sh
    else:
        cs = _contribs(dh, sh, sh / dh)
        th = dh
        pm2 = bytearray(tw * dh * 4)
        for x in range(tw):
            for i, ws in enumerate(cs):
                r = g = b = a = 0.0
                for j, wgt in ws:
                    o = (j * tw + x) * 4
                    r += tmp[o] * wgt
                    g += tmp[o + 1] * wgt
                    b += tmp[o + 2] * wgt
                    a += tmp[o + 3] * wgt
                o = (i * tw + x) * 4
                pm2[o] = min(255, max(0, int(round(r))))
                pm2[o + 1] = min(255, max(0, int(round(g))))
                pm2[o + 2] = min(255, max(0, int(round(b))))
                pm2[o + 3] = min(255, max(0, int(round(a))))

    # 反预乘
    out = bytearray(tw * th * 4)
    for i in range(tw * th):
        a = pm2[i * 4 + 3]
        if a == 0:
            continue
        f = 255.0 / a
        out[i * 4] = min(255, max(0, int(round(pm2[i * 4] * f))))
        out[i * 4 + 1] = min(255, max(0, int(round(pm2[i * 4 + 1] * f))))
        out[i * 4 + 2] = min(255, max(0, int(round(pm2[i * 4 + 2] * f))))
        out[i * 4 + 3] = a
    return out


# ---------------------------------------------------------------------------
# 合成：把图案按比例居中贴到 白底 / 透明底 画布上
# ---------------------------------------------------------------------------
def compose(size, tw, th, art, scale, background=True):
    """size×size RGBA。art 按 scale（占边长比例）等比缩放后居中贴放。"""
    canvas = bytearray(size * size * 4)
    if background:
        for i in range(size * size):
            canvas[i * 4] = BG[0]
            canvas[i * 4 + 1] = BG[1]
            canvas[i * 4 + 2] = BG[2]
            canvas[i * 4 + 3] = 255

    target = size * scale
    k = target / max(tw, th)
    dw = max(1, int(round(tw * k)))
    dh = max(1, int(round(th * k)))
    scaled = resample_rgba(art, tw, th, dw, dh)

    ox = (size - dw) // 2
    oy = (size - dh) // 2
    for y in range(dh):
        dy = oy + y
        if dy < 0 or dy >= size:
            continue
        srow = y * dw * 4
        drow = dy * size * 4
        for x in range(dw):
            dx = ox + x
            if dx < 0 or dx >= size:
                continue
            o = srow + x * 4
            a = scaled[o + 3]
            if a == 0:
                continue
            d = drow + dx * 4
            if a == 255:
                canvas[d] = scaled[o]
                canvas[d + 1] = scaled[o + 1]
                canvas[d + 2] = scaled[o + 2]
                canvas[d + 3] = 255
            else:
                f = a / 255.0
                for c in range(3):
                    canvas[d + c] = int(round(canvas[d + c] * (1 - f) + scaled[o + c] * f))
                canvas[d + 3] = max(canvas[d + 3], a)
    return canvas


# ---------------------------------------------------------------------------
# PNG / ICO 写出
# ---------------------------------------------------------------------------
def _png_bytes(w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)  # filter: None
        raw += rgba[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, body):
        return (
            struct.pack(">I", len(body))
            + tag
            + body
            + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", comp)
        + chunk(b"IEND", b"")
    )


def write_png(path, size, rgba):
    b = _png_bytes(size, size, rgba)
    with open(path, "wb") as f:
        f.write(b)
    return len(b)


def write_ico(path, images):
    """images: [(size, rgba)] → ICO。每个图层用 PNG 存法（Vista+ 原生支持，体积小一个数量级）。"""
    blobs = [_png_bytes(s, s, rgba) for s, rgba in images]
    header = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    offset = 6 + 16 * len(images)
    for (size, _), blob in zip(images, blobs):
        header += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0, 0, 1, 32, len(blob), offset,
        )
        offset += len(blob)
    with open(path, "wb") as f:
        f.write(bytes(header))
        for blob in blobs:
            f.write(blob)
    return offset


# ---------------------------------------------------------------------------
# 桌面
# ---------------------------------------------------------------------------
DESKTOP_TARGETS = [
    ("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512),
    ("Square30x30Logo.png", 30), ("Square44x44Logo.png", 44), ("Square71x71Logo.png", 71),
    ("Square89x89Logo.png", 89), ("Square107x107Logo.png", 107), ("Square142x142Logo.png", 142),
    ("Square150x150Logo.png", 150), ("Square284x284Logo.png", 284), ("Square310x310Logo.png", 310),
    ("StoreLogo.png", 50),
]


def gen_desktop(tw, th, art):
    os.makedirs(ICONS_OUT, exist_ok=True)
    print("\n桌面图标 → %s" % os.path.abspath(ICONS_OUT))
    rendered = {}
    for name, size in DESKTOP_TARGETS:
        rgba = compose(size, tw, th, art, ART_SCALE_DESKTOP, background=True)
        rendered[size] = rgba
        print("  %-24s %3dpx  %7d B" % (name, size, write_png(os.path.join(ICONS_OUT, name), size, rgba)))
    ico_sizes = [(s, rendered.get(s) or compose(s, tw, th, art, ART_SCALE_DESKTOP, True)) for s in ICO_SIZES]
    print("  %-24s %s  %7d B" % ("icon.ico", ICO_SIZES, write_ico(os.path.join(ICONS_OUT, "icon.ico"), ico_sizes)))


# ---------------------------------------------------------------------------
# Android
# ---------------------------------------------------------------------------
ANDROID_DENSITIES = [
    ("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432),
]

ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""

COLOR_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
"""


def gen_android(tw, th, art):
    if not os.path.isdir(ANDROID_RES):
        print("\n跳过 Android：找不到 %s" % ANDROID_RES)
        return
    print("\nAndroid 图标 → %s" % os.path.abspath(ANDROID_RES))
    for name, legacy, fg in ANDROID_DENSITIES:
        d = os.path.join(ANDROID_RES, "mipmap-" + name)
        os.makedirs(d, exist_ok=True)
        a = compose(legacy, tw, th, art, ART_SCALE_ANDROID, background=True)
        write_png(os.path.join(d, "ic_launcher.png"), legacy, a)
        write_png(os.path.join(d, "ic_launcher_round.png"), legacy, a)
        f = compose(fg, tw, th, art, ART_SCALE_ADAPTIVE, background=False)
        write_png(os.path.join(d, "ic_launcher_foreground.png"), fg, f)
        print("  mipmap-%-9s ic_launcher %3dpx  round %3dpx  foreground %3dpx" % (name, legacy, legacy, fg))
    anydpi = os.path.join(ANDROID_RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for fn in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, fn), "w", encoding="utf-8", newline="\n") as f:
            f.write(ADAPTIVE_XML)
    with open(os.path.join(ANDROID_RES, "values", "ic_launcher_background.xml"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(COLOR_XML)
    print("  mipmap-anydpi-v26/ic_launcher.xml + _round.xml（白底 + 图案前景）")
    print("  values/ic_launcher_background.xml（#FFFFFF）")


# ---------------------------------------------------------------------------
# 预览
# ---------------------------------------------------------------------------
def gen_preview(tw, th, art):
    os.makedirs(PREVIEW_OUT, exist_ok=True)
    sizes = [256, 128, 64, 48, 32, 16]
    pad = 12
    W = sum(sizes) + pad * (len(sizes) + 1)
    H = max(sizes) + pad * 2
    buf = bytearray(W * H * 4)
    for i in range(W * H):
        buf[i * 4:i * 4 + 3] = bytes((238, 240, 243))
        buf[i * 4 + 3] = 255
    x = pad
    for s in sizes:
        rgba = compose(s, tw, th, art, ART_SCALE_DESKTOP, background=True)
        y0 = (H - s) // 2
        for yy in range(s):
            for xx in range(s):
                o = (yy * s + xx) * 4
                a = rgba[o + 3] / 255.0
                if a <= 0:
                    continue
                d = ((y0 + yy) * W + x + xx) * 4
                for c in range(3):
                    buf[d + c] = int(round(buf[d + c] * (1 - a) + rgba[o + c] * a))
        x += s + pad
    p = os.path.join(PREVIEW_OUT, "icon-preview.png")
    with open(p, "wb") as f:
        f.write(_png_bytes(W, H, buf))
    print("\n预览图：%s  (%dx%d)  ← 可用 tools/png-ascii.py 查看" % (p, W, H))


def main():
    args = sys.argv[1:]
    do_desktop = (not args) or "--all" in args or "--desktop" in args or "--preview" in args
    do_android = (not args) or "--all" in args or "--android" in args or "--preview" in args
    if "--desktop" in args and "--android" not in args and "--all" not in args and "--preview" not in args:
        do_android = False
    if "--android" in args and "--desktop" not in args and "--all" not in args and "--preview" not in args:
        do_desktop = False

    tw, th, art = load_template_trimmed()
    if do_desktop:
        gen_desktop(tw, th, art)
    if do_android:
        gen_android(tw, th, art)
    if "--preview" in args:
        gen_preview(tw, th, art)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
