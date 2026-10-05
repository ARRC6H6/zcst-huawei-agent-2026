#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""实验助手 · 局域网互传服务端（零依赖，Python 3.7+）

同一 Wifi 下：在一台设备上运行本脚本，其他设备用浏览器打开终端提示的地址，
即可在「实验助手 → 局域网互传」页里互相收发文件与文本。

    python lan-server.py                 # 默认端口 8000
    python lan-server.py --port 9000
    python lan-server.py --data D:\\share # 自定义数据目录

设计要点（与前端单文件页面里的 #/lan 页约定一致）：

1. 文件指纹即 id：md5(name|size|lastModified)[:16]。文件不变 → id 不变，
   于是断点续传、去重与「秒传」由同一机制天然支撑。
2. 分片原子落盘：先写 <i>.part.tmp，成功后 os.replace 改名，
   磁盘上的分片要么完整、要么不存在。
3. 合并也用临时文件：uploads/<id>.merging 合并完成后再原子改名，
   避免下载到「正在合并」的残缺文件。
4. 磁盘只以 id 命名，原始文件名存在 files.json，
   彻底规避中文 / emoji 文件名与路径穿越问题（id 用正则白名单校验）。
5. 全链路流式 IO：上传分片、合并、下载均按块读写，内存占用与文件大小无关。
6. ThreadingHTTPServer + 锁：索引与文本剪贴板的读改写线程安全。
7. 允许跨域（Access-Control-Allow-Origin: *）：这样「双击即开」的单文件
   实验助手页面（file:// 打开）也能连到本服务；仅限可信局域网使用。
"""

import argparse
import hashlib
import json
import os
import re
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

VERSION = "1.0.0"
DEFAULT_PORT = 8000
DEFAULT_CHUNK_MB = 4
ID_RE = re.compile(r"^[0-9a-f]{16}$")
BLOCK = 1024 * 256

# ---------------------------------------------------------------------------
# 运行期配置（main 里赋值）
# ---------------------------------------------------------------------------
CONF = {
    "port": DEFAULT_PORT,
    "chunk": DEFAULT_CHUNK_MB * 1024 * 1024,
    "data": "",
    "static": "",      # 要托管的单文件实验助手页面（自动识别 实验助手*.html）
    "quiet": False,
}
LOCK = threading.Lock()
SESSIONS = {}          # id -> {name,size,chunkSize,totalChunks,time}
FILES = {}             # id -> {name,size,time}
CLIP = {"text": "", "time": 0}


def _p(*parts):
    return os.path.join(CONF["data"], *parts)


UPLOADS = lambda: _p("uploads")
CHUNKS = lambda: _p(".chunks")
INDEX_FILE = lambda: _p("files.json")
CLIP_FILE = lambda: _p("clip.json")


def ensure_dirs():
    os.makedirs(UPLOADS(), exist_ok=True)
    os.makedirs(CHUNKS(), exist_ok=True)


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else default
    except Exception:
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def human(n):
    try:
        n = float(n)
    except Exception:
        return "?"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return ("%d %s" % (n, unit)) if unit == "B" else ("%.1f %s" % (n, unit))
        n /= 1024.0
    return "?"


def clean_name(name):
    """只保留文件名本身：去掉路径分隔符与控制字符，规避路径穿越。"""
    name = unquote(str(name or "")).replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    return name[:180] or "未命名文件"


def file_id(name, size, last_modified):
    raw = "%s|%s|%s" % (name, size, last_modified)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def chunk_total(size, chunk):
    if size <= 0:
        return 0
    return (size + chunk - 1) // chunk


def uploaded_parts(fid):
    d = os.path.join(CHUNKS(), fid)
    out = []
    try:
        for fn in os.listdir(d):
            m = re.match(r"^(\d+)\.part$", fn)
            if not m:
                continue
            try:
                if os.path.getsize(os.path.join(d, fn)) >= 0:
                    out.append(int(m.group(1)))
            except OSError:
                pass
    except OSError:
        return []
    return sorted(out)


def app_aliases():
    """除 `/` 之外，还允许用真实文件名 / index.html 访问到单文件页面。"""
    names = {"index.html", "实验助手.html"}
    if CONF["static"]:
        names.add(os.path.basename(CONF["static"]))
    out = set()
    for n in names:
        out.add("/" + n)
        out.add("/" + quote(n))
    return out


def find_app_html(folder):
    """自动识别同级的实验助手单文件页面（容忍 实验助手v0.1beta.html 这类带版本号的文件名）。"""
    for cand in ("实验助手.html", "index.html"):
        p = os.path.join(folder, cand)
        if os.path.isfile(p):
            return p
    try:
        hits = sorted(
            fn for fn in os.listdir(folder)
            if fn.lower().endswith(".html") and fn.startswith("实验助手")
        )
    except OSError:
        hits = []
    return os.path.join(folder, hits[0]) if hits else ""


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.4)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        ips.append("127.0.0.1")
    return ips


def merge_file(fid):
    """按序合并分片 → uploads/<id>（原子改名）。"""
    target = os.path.join(UPLOADS(), fid)
    merging = target + ".merging"
    d = os.path.join(CHUNKS(), fid)
    indexes = uploaded_parts(fid)
    with open(merging, "wb") as out:
        for i in indexes:
            with open(os.path.join(d, "%d.part" % i), "rb") as src:
                while True:
                    block = src.read(BLOCK)
                    if not block:
                        break
                    out.write(block)
    os.replace(merging, target)
    try:
        for fn in os.listdir(d):
            os.remove(os.path.join(d, fn))
        os.rmdir(d)
    except OSError:
        pass
    return target


class Handler(BaseHTTPRequestHandler):
    server_version = "LabLanTransfer/" + VERSION
    protocol_version = "HTTP/1.1"

    # ---------------- 基础响应 ----------------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, code, body=b"", ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, data, code=200):
        self._send(code, json.dumps(data, ensure_ascii=False))

    def _err(self, code, message):
        # 出错时若请求体还没读完，直接断开连接，避免 keep-alive 串包
        if self.headers.get("Content-Length"):
            self.close_connection = True
        self._json({"ok": False, "error": message}, code)

    def _body(self, limit=None):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return b""
        if limit is not None and length > limit:
            return None
        return self.rfile.read(length) if length > 0 else b""

    def _json_body(self, limit=64 * 1024):
        raw = self._body(limit)
        if raw is None:
            return None
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    def _q(self):
        return parse_qs(urlparse(self.path).query)

    def log_message(self, fmt, *args):
        if not CONF["quiet"]:
            sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---------------- 路由 ----------------
    def do_OPTIONS(self):
        self._send(204, b"", "text/plain; charset=utf-8")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path in app_aliases():
            return self.serve_app()
        if path == "/api/server-info":
            return self.api_info()
        if path == "/api/files":
            return self.api_files()
        if path == "/api/download":
            return self.api_download()
        if path == "/api/upload/status":
            return self.api_status()
        if path == "/api/clip":
            return self.api_clip_get()
        if path == "/favicon.ico":
            return self._send(204, b"", "image/x-icon")
        return self._err(404, "未知接口：" + path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/upload/init":
            return self.api_init()
        if path == "/api/upload/chunk":
            return self.api_chunk()
        if path == "/api/upload/complete":
            return self.api_complete()
        if path == "/api/clip":
            return self.api_clip_post()
        return self._err(404, "未知接口：" + path)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/files":
            return self.api_delete()
        return self._err(404, "未知接口：" + path)

    # ---------------- 静态：实验助手.html ----------------
    def serve_app(self):
        path = CONF["static"]
        if not path or not os.path.isfile(path):
            return self._err(404, "未找到实验助手页面：请把 lan-server.py 与「实验助手」单文件页面放在同一目录，或用 --file 指定路径")
        with open(path, "rb") as f:
            body = f.read()
        self._send(200, body, "text/html; charset=utf-8")

    # ---------------- 接口实现 ----------------
    def api_info(self):
        with LOCK:
            count = len(FILES)
        ips = lan_ips()
        self._json({
            "ok": True,
            "app": "实验助手 · 局域网互传",
            "version": VERSION,
            "host": socket.gethostname(),
            "ip": ips[0],
            "ips": ips,
            "port": CONF["port"],
            "urls": ["http://%s:%d" % (ip, CONF["port"]) for ip in ips],
            "chunkSize": CONF["chunk"],
            "dataDir": CONF["data"],
            "files": count,
        })

    def api_files(self):
        with LOCK:
            items = [dict(id=k, **v) for k, v in FILES.items()]
        items.sort(key=lambda x: x.get("time", 0), reverse=True)
        total = sum(int(x.get("size") or 0) for x in items)
        self._json({"ok": True, "files": items, "count": len(items), "total": total})

    def api_download(self):
        fid = (self._q().get("id") or [""])[0]
        if not ID_RE.match(fid or ""):
            return self._err(400, "参数 id 不合法")
        with LOCK:
            meta = FILES.get(fid)
        if not meta:
            return self._err(404, "文件不存在或已被删除")
        path = os.path.join(UPLOADS(), fid)
        if not os.path.isfile(path):
            return self._err(404, "文件已丢失")
        size = os.path.getsize(path)
        name = meta.get("name") or fid
        ascii_name = re.sub(r'[^A-Za-z0-9._-]', "_", name) or fid
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Disposition",
            "attachment; filename=\"%s\"; filename*=UTF-8''%s" % (ascii_name, quote(name)),
        )
        self._cors()
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(path, "rb") as f:
                while True:
                    block = f.read(BLOCK)
                    if not block:
                        break
                    self.wfile.write(block)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_delete(self):
        fid = (self._q().get("id") or [""])[0]
        if not ID_RE.match(fid or ""):
            return self._err(400, "参数 id 不合法")
        removed = False
        with LOCK:
            if fid in FILES:
                FILES.pop(fid, None)
                save_json(INDEX_FILE(), FILES)
                removed = True
            SESSIONS.pop(fid, None)
        try:
            os.remove(os.path.join(UPLOADS(), fid))
        except OSError:
            pass
        d = os.path.join(CHUNKS(), fid)
        if os.path.isdir(d):
            for fn in os.listdir(d):
                try:
                    os.remove(os.path.join(d, fn))
                except OSError:
                    pass
            try:
                os.rmdir(d)
            except OSError:
                pass
        self._json({"ok": True, "removed": removed})

    def api_init(self):
        data = self._json_body()
        if data is None:
            return self._err(400, "请求体不是合法 JSON")
        name = clean_name(data.get("name"))
        try:
            size = max(0, int(data.get("size") or 0))
            last_modified = int(data.get("lastModified") or 0)
        except (TypeError, ValueError):
            return self._err(400, "size / lastModified 必须是数字")
        fid = file_id(name, size, last_modified)
        chunk = CONF["chunk"]
        total = chunk_total(size, chunk)
        with LOCK:
            meta = FILES.get(fid)
            done = bool(meta) and os.path.isfile(os.path.join(UPLOADS(), fid))
            SESSIONS[fid] = {
                "name": name, "size": size, "chunkSize": chunk,
                "totalChunks": total, "time": time.time(),
            }
        have = uploaded_parts(fid) if not done else []
        self._json({
            "ok": True, "id": fid, "name": name, "size": size,
            "chunkSize": chunk, "totalChunks": total,
            "uploaded": have, "done": done, "existed": done,
        })

    def api_chunk(self):
        q = self._q()
        fid = (q.get("id") or [""])[0]
        if not ID_RE.match(fid or ""):
            return self._err(400, "参数 id 不合法")
        try:
            index = int((q.get("index") or ["-1"])[0])
        except ValueError:
            return self._err(400, "参数 index 不合法")
        if index < 0:
            return self._err(400, "参数 index 不合法")
        with LOCK:
            sess = SESSIONS.get(fid)
        if not sess:
            return self._err(409, "上传会话不存在，请重新初始化")
        if index >= sess["totalChunks"]:
            return self._err(400, "分片序号越界")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._err(411, "缺少 Content-Length")
        if length > CONF["chunk"] + 1024:
            # 先把请求体丢掉，保持连接可复用
            self._body(length)
            return self._err(413, "分片过大")
        d = os.path.join(CHUNKS(), fid)
        os.makedirs(d, exist_ok=True)
        part = os.path.join(d, "%d.part" % index)
        tmp = part + ".tmp"
        remaining = length
        try:
            with open(tmp, "wb") as f:
                while remaining > 0:
                    block = self.rfile.read(min(BLOCK, remaining))
                    if not block:
                        break
                    f.write(block)
                    remaining -= len(block)
            os.replace(tmp, part)
        except OSError as exc:
            try:
                os.remove(tmp)
            except OSError:
                pass
            return self._err(500, "写入分片失败：%s" % exc)
        self._json({"ok": True, "id": fid, "index": index, "received": length})

    def api_status(self):
        fid = (self._q().get("id") or [""])[0]
        if not ID_RE.match(fid or ""):
            return self._err(400, "参数 id 不合法")
        with LOCK:
            sess = dict(SESSIONS.get(fid) or {})
            meta = FILES.get(fid)
        done = bool(meta) and os.path.isfile(os.path.join(UPLOADS(), fid))
        self._json({
            "ok": True, "id": fid,
            "chunkSize": sess.get("chunkSize", CONF["chunk"]),
            "totalChunks": sess.get("totalChunks", 0),
            "uploaded": uploaded_parts(fid),
            "done": done,
        })

    def api_complete(self):
        data = self._json_body()
        if data is None:
            return self._err(400, "请求体不是合法 JSON")
        fid = str(data.get("id") or "")
        if not ID_RE.match(fid):
            return self._err(400, "参数 id 不合法")
        with LOCK:
            sess = dict(SESSIONS.get(fid) or {})
        parts = uploaded_parts(fid)
        if not sess:
            if not parts:
                return self._err(409, "上传会话不存在，请重新初始化")
            # 服务重启后会话丢失：用磁盘上的分片兜底
            with LOCK:
                meta = FILES.get(fid)
            sess = {"name": meta.get("name") if meta else fid, "size": 0,
                    "chunkSize": CONF["chunk"], "totalChunks": max(parts) + 1}
        total = sess["totalChunks"]
        have = set(uploaded_parts(fid))
        missing = [i for i in range(total) if i not in have]
        if missing:
            return self._err(409, "还有 %d 个分片未上传，例如第 %d 片" % (len(missing), missing[0] + 1))
        merge_file(fid)
        size = os.path.getsize(os.path.join(UPLOADS(), fid))
        with LOCK:
            FILES[fid] = {"name": sess["name"], "size": size, "time": time.time()}
            save_json(INDEX_FILE(), FILES)
            SESSIONS.pop(fid, None)
        self._json({"ok": True, "id": fid, "name": sess["name"], "size": size})

    def api_clip_get(self):
        with LOCK:
            data = dict(CLIP)
        self._json({"ok": True, "text": data.get("text", ""), "time": data.get("time", 0)})

    def api_clip_post(self):
        data = self._json_body(limit=512 * 1024)
        if data is None:
            return self._err(400, "请求体不是合法 JSON")
        text = str(data.get("text") or "")
        if len(text) > 200000:
            return self._err(413, "文本过长（上限 20 万字符）")
        with LOCK:
            CLIP["text"] = text
            CLIP["time"] = time.time()
            save_json(CLIP_FILE(), CLIP)
        self._json({"ok": True, "time": CLIP["time"], "length": len(text)})


def banner(port, quiet=False):
    ips = lan_ips()
    lines = [
        "",
        "  ┌──────────────────────────────────────────────┐",
        "  │  实验助手 · 局域网互传 已启动                │",
        "  └──────────────────────────────────────────────┘",
        "  本机访问          : http://127.0.0.1:%d" % port,
        "  同一Wifi下其他设备 : http://%s:%d" % (ips[0], port),
    ]
    for ip in ips[1:]:
        lines.append("  其他网卡          : http://%s:%d" % (ip, port))
    lines += [
        "  收文件目录        : %s" % os.path.join(CONF["data"], "uploads"),
        "  提示              : 手机连同一 Wifi，用浏览器打开上面的地址即可互传",
        "  停止              : 按 Ctrl+C",
        "",
    ]
    text = "\n".join(lines)
    if not quiet:
        print(text, flush=True)
    # 供自动化脚本解析的机器可读行
    print("LAN_SERVER_READY port=%d ip=%s data=%s" % (port, ips[0], CONF["data"]), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="实验助手 · 局域网互传服务端（零依赖）")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="端口，默认 %d；0 表示自动分配" % DEFAULT_PORT)
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0（局域网可访问）")
    parser.add_argument("--data", default="", help="数据目录，默认脚本同级的 lan-transfer/")
    parser.add_argument("--file", default="", help="要托管的实验助手 HTML，默认脚本同级的 实验助手*.html / index.html")
    parser.add_argument("--chunk-mb", type=int, default=DEFAULT_CHUNK_MB, help="分片大小 MB，默认 %d" % DEFAULT_CHUNK_MB)
    parser.add_argument("--quiet", action="store_true", help="不打印访问日志")
    args = parser.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    CONF["data"] = os.path.abspath(args.data) if args.data else os.path.join(here, "lan-transfer")
    CONF["chunk"] = max(256 * 1024, int(args.chunk_mb) * 1024 * 1024)
    CONF["quiet"] = bool(args.quiet)
    static = args.file or ""
    if not static:
        static = find_app_html(here)
    CONF["static"] = os.path.abspath(static) if static else ""

    ensure_dirs()
    with LOCK:
        loaded = load_json(INDEX_FILE(), {})
        for k, v in loaded.items():
            if ID_RE.match(k) and isinstance(v, dict) and os.path.isfile(os.path.join(UPLOADS(), k)):
                FILES[k] = {"name": str(v.get("name") or k), "size": int(v.get("size") or 0),
                            "time": float(v.get("time") or 0)}
        clip = load_json(CLIP_FILE(), {})
        CLIP["text"] = str(clip.get("text") or "")
        CLIP["time"] = float(clip.get("time") or 0)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True
    CONF["port"] = httpd.server_address[1]
    banner(CONF["port"], args.quiet)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。", flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
