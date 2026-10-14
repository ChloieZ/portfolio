#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""作品集服务：公开静态站 + 受保护的管理后台。

启动方式（由 WinSW 服务调用）：
    python -m uvicorn serve:app --host 0.0.0.0 --port 18130 \
        --ssl-certfile C:\\apps\\certs\\config\\live\\report.guizzhan.xyz\\fullchain.pem \
        --ssl-keyfile  C:\\apps\\certs\\config\\live\\report.guizzhan.xyz\\privkey.pem

设计要点：
  * data/products.json  是唯一数据源，由管理后台写入
  * data/products.js    由本服务自动生成，前端照旧用 <script> 读取
    —— 这样访问者看到的仍是纯静态页，接口挂了页面照常显示
  * 管理密码从环境变量 ADMIN_PASSWORD 读取；没设置则后台接口一律拒绝（防裸奔）
  * 视频直接以原始字节流 POST 上传，不依赖 python-multipart
"""
import asyncio
import hashlib
import hmac
import json
import os
import posixpath
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
DATA_JSON = BASE / "data" / "products.json"
DATA_JS = BASE / "data" / "products.js"
VIDEO_DIR = BASE / "assets" / "video"
ADMIN_PAGE = BASE / "admin" / "index.html"

ADMIN_PASSWORD = (os.environ.get("ADMIN_PASSWORD") or "").strip()
COOKIE_NAME = "pf_admin"
SESSION_SECONDS = 12 * 3600
MAX_UPLOAD_MB = 200
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".mkv"}

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
SRC_RE = re.compile(r"^assets/video/[A-Za-z0-9._-]+$")

# 会话签名密钥：显式配置优先，否则从密码派生（改密码即失效所有会话）
SECRET = (os.environ.get("ADMIN_SECRET") or "").strip() or hashlib.sha256(
    ("portfolio/" + ADMIN_PASSWORD).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- 鉴权
def _sign(exp: str) -> str:
    return hmac.new(SECRET.encode("utf-8"), exp.encode("utf-8"), hashlib.sha256).hexdigest()[:40]


def make_token() -> str:
    exp = str(int(time.time()) + SESSION_SECONDS)
    return exp + "." + _sign(exp)


def token_ok(tok: str) -> bool:
    if not tok or "." not in tok:
        return False
    exp, sig = tok.split(".", 1)
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(exp))


def is_admin(request) -> bool:
    if not ADMIN_PASSWORD:
        return False
    return token_ok(request.cookies.get(COOKIE_NAME, ""))


def need_login() -> JSONResponse:
    return JSONResponse({"ok": False, "error": "未登录或会话已过期"}, status_code=401)


# ---------------------------------------------------------------- 数据读写
def load_cfg() -> dict:
    if DATA_JSON.exists():
        return json.loads(DATA_JSON.read_text(encoding="utf-8"))
    return {"profile": {}, "products": []}


def regenerate_js(cfg: dict | None = None) -> None:
    """由 JSON 生成前端读取的 products.js。"""
    cfg = load_cfg() if cfg is None else cfg
    body = json.dumps(cfg, ensure_ascii=False, indent=2)
    DATA_JS.write_text(
        "/* 本文件由管理后台自动生成，请勿手改；要改请访问 /admin */\n"
        "window.PORTFOLIO = " + body + ";\n",
        encoding="utf-8",
    )


def validate(cfg) -> str | None:
    """返回错误信息，None 表示通过。"""
    if not isinstance(cfg, dict):
        return "配置必须是对象"
    if not isinstance(cfg.get("profile", {}), dict):
        return "profile 必须是对象"
    ps = cfg.get("products")
    if not isinstance(ps, list):
        return "products 必须是数组"
    if len(ps) > 60:
        return "产品数量过多（上限 60）"
    seen = set()
    for i, p in enumerate(ps, 1):
        if not isinstance(p, dict):
            return f"第 {i} 个产品不是对象"
        pid = p.get("id") or ""
        if not ID_RE.match(pid):
            return f"第 {i} 个产品的 id 不合法（只允许小写字母、数字、连字符，且以字母数字开头）：{pid!r}"
        if pid in seen:
            return f"id 重复：{pid}"
        seen.add(pid)
        if not str(p.get("name") or "").strip():
            return f"产品 {pid} 缺少名称"
        v = (p.get("video") or {}).get("src") or ""
        if v and not SRC_RE.match(v):
            return f"产品 {pid} 的视频路径不合法（必须形如 assets/video/xxx.mp4）：{v!r}"
        link = (p.get("link") or {}).get("url") or ""
        if link and not re.match(r"^https?://", link):
            return f"产品 {pid} 的体验链接必须以 http(s):// 开头"
        repo = p.get("repo") or ""
        if repo and not re.match(r"^https?://", repo):
            return f"产品 {pid} 的源码链接必须以 http(s):// 开头"
    return None


# ---------------------------------------------------------------- 管理接口
async def api_session(request):
    return JSONResponse({"ok": True, "authed": is_admin(request), "enabled": bool(ADMIN_PASSWORD)})


async def api_login(request):
    if not ADMIN_PASSWORD:
        return JSONResponse({"ok": False, "error": "服务端未设置 ADMIN_PASSWORD，后台已禁用"},
                            status_code=503)
    try:
        body = await request.json()
    except Exception:
        body = {}
    pw = str((body or {}).get("password", ""))
    if not hmac.compare_digest(pw.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")):
        await asyncio.sleep(0.6)
        return JSONResponse({"ok": False, "error": "密码错误"}, status_code=401)
    resp = JSONResponse({"ok": True})
    resp.set_cookie(COOKIE_NAME, make_token(), max_age=SESSION_SECONDS,
                    httponly=True, samesite="lax", path="/")
    return resp


async def api_logout(request):
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


async def api_get_products(request):
    return JSONResponse(load_cfg())


async def api_save_products(request):
    if not is_admin(request):
        return need_login()
    try:
        cfg = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "请求体不是合法 JSON"}, status_code=400)
    err = validate(cfg)
    if err:
        return JSONResponse({"ok": False, "error": err}, status_code=400)
    DATA_JSON.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    regenerate_js(cfg)
    return JSONResponse({"ok": True, "products": len(cfg["products"])})


async def api_upload(request):
    if not is_admin(request):
        return need_login()
    raw = (request.query_params.get("name") or "").strip()
    # 只取文件名、只留白名单字符 —— 杜绝 ../ 之类的路径穿越
    base = Path(raw).name
    safe = re.sub(r"[^A-Za-z0-9._-]", "", base)
    ext = Path(safe).suffix.lower()
    if ext not in VIDEO_EXTS:
        return JSONResponse({"ok": False, "error": "只接受 mp4 / webm / mov / m4v / mkv"}, status_code=400)

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    dest = VIDEO_DIR / safe
    tmp = dest.with_name(dest.name + ".part")
    limit = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    try:
        with tmp.open("wb") as fh:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    fh.close()
                    tmp.unlink(missing_ok=True)
                    return JSONResponse({"ok": False, "error": f"文件超过 {MAX_UPLOAD_MB} MB"},
                                        status_code=413)
                fh.write(chunk)
        if size == 0:
            tmp.unlink(missing_ok=True)
            return JSONResponse({"ok": False, "error": "上传内容为空"}, status_code=400)
        tmp.replace(dest)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return JSONResponse({"ok": False, "error": f"写入失败：{e}"}, status_code=500)
    return JSONResponse({"ok": True, "src": f"assets/video/{dest.name}", "size": size})


async def admin_page(request):
    if not ADMIN_PAGE.exists():
        return PlainTextResponse("admin/index.html 缺失", status_code=500)
    return FileResponse(ADMIN_PAGE)


# ---------------------------------------------------------------- 静态站
ALLOWED_SUFFIXES = {
    ".html", ".css", ".js", ".json",
    ".mp4", ".webm", ".mov", ".m4v",
    ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".gif",
    ".woff", ".woff2", ".ttf",
}
BLOCKED_DIRS = {"tools", "deploy", "admin", "node_modules", ".venv"}


class SiteFiles(StaticFiles):
    """四道门：屏蔽点开头路径、屏蔽开发目录、扩展名白名单、无扩展名只放行目录。"""

    async def get_response(self, path: str, scope):
        norm = posixpath.normpath("/" + path.replace("\\", "/"))
        segs = [s for s in norm.split("/") if s]
        if any(s.startswith(".") for s in segs):
            return PlainTextResponse("Not Found", status_code=404)
        if segs and segs[0].lower() in BLOCKED_DIRS:
            return PlainTextResponse("Not Found", status_code=404)
        suffix = Path(norm).suffix.lower()
        if suffix:
            if suffix not in ALLOWED_SUFFIXES:
                return PlainTextResponse("Not Found", status_code=404)
        elif not (BASE / norm.lstrip("/")).is_dir():
            # 无扩展名的文件（VERSION、LICENSE 之类）一律不公开；
            # 目录请求放行，交给 html=True 去找 index.html
            return PlainTextResponse("Not Found", status_code=404)
        return await super().get_response(path, scope)


@asynccontextmanager
async def lifespan(app):
    try:
        regenerate_js()
        print(f"[serve] products.js 已从 products.json 重新生成")
    except Exception as e:
        print(f"[serve] 生成 products.js 失败：{e}")
    print(f"[serve] 管理后台：{'已启用' if ADMIN_PASSWORD else '未启用（未设置 ADMIN_PASSWORD）'}")
    yield


routes = [
    Route("/admin", admin_page),
    Route("/admin/", admin_page),
    Route("/api/session", api_session),
    Route("/api/login", api_login, methods=["POST"]),
    Route("/api/logout", api_logout, methods=["POST"]),
    Route("/api/products", api_get_products),
    Route("/api/products/save", api_save_products, methods=["POST"]),
    Route("/api/upload", api_upload, methods=["POST"]),
]

app = Starlette(routes=routes, lifespan=lifespan)
app.mount("/", SiteFiles(directory=str(BASE), html=True), name="site")
