"""作品集静态服务 —— 与另外三个站点同构（uvicorn + TLS）。

启动方式（由 WinSW 服务调用）：
    python -m uvicorn serve:app --host 0.0.0.0 --port 18130 \
        --ssl-certfile C:\\apps\\certs\\config\\live\\report.guizzhan.xyz\\fullchain.pem \
        --ssl-keyfile  C:\\apps\\certs\\config\\live\\report.guizzhan.xyz\\privkey.pem

站点根目录 = 本文件所在目录。可用环境变量 SITE_ROOT 覆盖。

只依赖 starlette + uvicorn。视频拖动进度条依赖 HTTP Range，
Starlette 的 FileResponse 自 0.37 起支持（已验证返回 206 Partial Content）。

安全：默认屏蔽所有点开头的路径（.git / .gitignore 等），避免把仓库元数据暴露到公网。
"""
import os
import posixpath
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.staticfiles import StaticFiles

SITE_ROOT = Path(os.environ.get("SITE_ROOT") or Path(__file__).resolve().parent)

# 公网可访问的扩展名白名单。不在名单里的一律 404，
# 避免把开发文件（.py / .md）暴露出去。
ALLOWED_SUFFIXES = {
    ".html", ".css", ".js", ".json",
    ".mp4", ".webm",
    ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".gif",
    ".woff", ".woff2", ".ttf",
}

# 整体屏蔽的顶层目录（开发用，不属于站点内容）
BLOCKED_DIRS = {"tools", "deploy", "node_modules"}


class SiteFiles(StaticFiles):
    """静态文件服务，多加三道门：屏蔽点开头路径、屏蔽开发目录、只放行白名单扩展名。"""

    async def get_response(self, path: str, scope):
        norm = posixpath.normpath("/" + path.replace("\\", "/"))
        segments = [s for s in norm.split("/") if s]

        # 1) 任何一段路径以 . 开头 → 404（挡住 .git/、.gitignore、.env 等）
        if any(seg.startswith(".") for seg in segments):
            return PlainTextResponse("Not Found", status_code=404)

        # 2) 开发目录整体不可访问
        if segments and segments[0].lower() in BLOCKED_DIRS:
            return PlainTextResponse("Not Found", status_code=404)

        # 3) 扩展名白名单（目录请求交给 html=True 处理 index.html）
        suffix = Path(norm).suffix.lower()
        if suffix and suffix not in ALLOWED_SUFFIXES:
            return PlainTextResponse("Not Found", status_code=404)

        return await super().get_response(path, scope)


app = Starlette()
app.mount("/", SiteFiles(directory=str(SITE_ROOT), html=True), name="site")
