#!/usr/bin/env python3
"""apk 交付前自检：ABI / 内嵌前端 / 是否误留 dev 反代路径。

用法：
    python tools/verify-apk.py build/某包.apk

检查项：
1. lib/<abi>/liblab_assistant_lib.so 存在，且列出 ABI；
2. .so 里含当前前端的特征串（说明页面是**编译期**内嵌进去的）；
3. .so 里**不含** `Failed to request` —— 这个格式串只存在于
   `tauri/src/protocol/tauri.rs` 的 `#[cfg(all(dev, mobile))]` 分支里。
   若它还在，说明构建没开 `custom-protocol`，移动端会把资源请求反代到 dev server，
   装到手机上就是白屏/黑屏（本工程踩过这个坑，见交接报告）。
"""

import sys
import zipfile

MARKERS_MUST_HAVE = [
    (b"lan-become-server", "前端互传按钮锚点"),
    (b'<details class="card card-fold">', "前端折叠卡片结构"),
]
MARKERS_MUST_NOT_HAVE = [
    (b"Failed to request ", "dev 反代路径（custom-protocol 未生效）"),
]


def check(apk: str) -> int:
    bad = 0
    with zipfile.ZipFile(apk) as z:
        libs = [n for n in z.namelist() if n.startswith("lib/") and n.endswith(".so")]
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
