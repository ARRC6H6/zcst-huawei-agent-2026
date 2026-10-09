#!/usr/bin/env python3
"""apk 交付前自检：ABI / 内嵌前端 / dev 反代残留 / **必需的 Kotlin 类是否进包**。

用法：
    python tools/verify-apk.py build/某包.apk

检查项：
1. lib/<abi>/liblab_assistant_lib.so 存在，且列出 ABI；
2. .so 里含当前前端的特征串（说明页面是**编译期**内嵌进去的）；
3. .so 里**不含** `Failed to request` —— 这个格式串只存在于
   `tauri/src/protocol/tauri.rs` 的 `#[cfg(all(dev, mobile))]` 分支里。
   若它还在，说明构建没开 `custom-protocol`，移动端会把资源请求反代到 dev server，
   装到手机上就是白屏/黑屏（本工程踩过这个坑，见交接报告）。
4. ⭐ **`classes.dex` 里必须含「Rust 按类名加载的 Kotlin 类」**。

   ⚠️ 第 4 项是 2026-10-08 补的，起因是一次**真机黑屏闪退**：
   引入 `tauri-plugin-opener` 后，Rust 侧编进了 `.so`（`open_url` 等字符串都在，第 2/3 项全过），
   但 Android 侧的 Kotlin 类 `app.tauri.opener.OpenerPlugin` **从没进包** ——
   因为插件集成是两段式的，第 2 段由 `tauri android init` 完成，而本工程手工打包**绕开了 CLI**。
   启动时 `register_android_plugin("app.tauri.opener", "OpenerPlugin")` 按类名加载失败 → 崩。

   **第 1/2/3 项当时全部通过，这个 bug 逃过了所有静态自检。** 所以此处按「清单」补上：
   凡是 Rust 侧 `register_android_plugin` 用到的类，都必须在 dex 里能找到。
"""

import sys
import zipfile

MARKERS_MUST_HAVE = [
    (b"lan-become-server", "前端互传按钮锚点"),
    (b'<details class="card card-fold">', "前端折叠卡片结构"),
    # 0.5.1 三个新能力的内嵌锚点：任何一个缺失，都说明 apk 里那份前端是旧的
    (b"chem-ion-bar", "离子电荷输入（2026-10-09）"),
    (b"exp-export-md", "导出格式选择 / 离线 MD（2026-10-09）"),
    (b"data-fit-tf", "手机溢出兜底缩放（2026-10-09）"),
]
MARKERS_MUST_NOT_HAVE = [
    (b"Failed to request ", "dev 反代路径（custom-protocol 未生效）"),
]

# ⭐ Rust 侧按**类名**加载的 Kotlin 类（dex 里必须能找到）。
#    加新插件时，检查它的 src/lib.rs 里 `register_android_plugin(<包名>, <类名>)` 两个参数，
#    换算成 dex 里的形式：`L<包名斜杠化>/<类名>;`，加到下面。
REQUIRED_DEX_CLASSES = [
    ("Lapp/tauri/opener/OpenerPlugin;", "tauri-plugin-opener 的 Android 插件类（外链打开）"),
    ("Lapp/tauri/plugin/PluginManager;", "tauri-android 的插件管理器（核心）"),
    ("Lapp/tauri/AppPlugin;", "tauri-android 的应用插件（核心）"),
]


def check(apk: str) -> int:
    bad = 0
    with zipfile.ZipFile(apk) as z:
        names = z.namelist()
        libs = [n for n in names if n.startswith("lib/") and n.endswith(".so")]
        print(f"{apk}")
        print(f"  native libs : {libs if libs else '无（异常）'}")
        if not libs:
            return 1
        for name in libs:
            data = z.read(name)
            print(f"  --- {name} ({len(data)} B)")
            for needle, why in MARKERS_MUST_HAVE:
                hit = data.find(needle) >= 0
                print(f"      [{'OK ' if hit else 'FAIL'}] 应存在：{why}")
                bad += 0 if hit else 1
            for needle, why in MARKERS_MUST_NOT_HAVE:
                hit = data.find(needle) >= 0
                print(f"      [{'FAIL' if hit else 'OK '}] 不应存在：{why}")
                bad += 1 if hit else 0

        # ---- ⭐ 必需的 Kotlin 类（dex）----
        dex_names = [n for n in names if n.endswith(".dex")]
        print(f"  --- classes.dex ({len(dex_names)} 个)")
        if not dex_names:
            print("      [FAIL] 找不到 classes.dex")
            bad += 1
        else:
            dex = b"".join(z.read(n) for n in dex_names)
            for needle, why in REQUIRED_DEX_CLASSES:
                hit = needle.encode() in dex
                print(f"      [{'OK ' if hit else 'FAIL'}] 应存在：{why}  ({needle})")
                bad += 0 if hit else 1

    print(f"  结论：{'通过' if bad == 0 else f'{bad} 项不通过'}")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    code = 0
    for a in sys.argv[1:]:
        code |= check(a)
    sys.exit(code)
