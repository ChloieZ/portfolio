# 部署指南 —— 把作品集挂到公网

> ## ⚠️ 本文档已部分作废（2026-10-08 更正）
>
> 实测发现你的服务器 **是 Windows 不是 Linux**（SSH banner 为 `OpenSSH_for_Windows_9`，
> 且 3389 远程桌面开放）。因此本文档里**方案 A 的 Linux 部分全部不适用** ——
> Caddy、nginx、`/etc/letsencrypt`、`systemctl` 在 Windows 上都不存在。
>
> - **仍在用**：现状表格、方案 B（GitHub Pages）、登录墙那一节、自查清单
> - **已作废**：A2 的 certbot 命令、A3 的 Caddyfile / nginx.conf、`serve.py` 的启动方式
> - **Windows 版方案**：等 `recon.ps1` 的侦察结果回来后重写
>
> `Caddyfile`、`nginx.conf`、`serve.py` 暂时保留作参考，不要直接照搬到服务器上。

目标：给简历一个**别人点得开**的入口。作品集本身是纯静态（HTML/CSS/JS + 3 个 mp4），
没有任何后端依赖，所以只要能把文件夹放到一个能访问的地方就行。

---

## 现状（2026-10-08 实测）

| 项目 | 实测结果 |
| --- | --- |
| 服务器 | `121.43.24.133`（阿里云杭州） |
| 已上线产品 | `report:18100` / `picture:18110` / `xinyuan:18120`，均由 **uvicorn** 直接提供服务 |
| 开放端口 | 18100、18110、18120 —— **80 和 443 是关闭的** |
| TLS 证书 | Let's Encrypt，多域名 SAN，覆盖上述三个子域，2027-01-05 到期 |
| DNS | **无泛域名**，每个子域都要单独加 A 记录 |
| 根域名 | `guizzhan.xyz` 公网不解析 |
| ⚠️ 三个产品 | **全部在登录墙后面**，访问会 303 跳 `/login` |

最后一条是重点：简历链接把人引到作品集，作品集再把 HR 引到登录页 —— 这个体验是断的。
见文末「必读：登录墙」。

---

## 方案 A：挂在自己服务器（推荐）

**为什么推荐**：国内访问快、和三个产品同域、URL 可控、完全自主。

**代价**：需要 DNS 管理权 + 服务器操作权限 + 扩一次证书。

### A1. 加 DNS 记录

在 `guizzhan.xyz` 的 DNS 控制台加一条：

```
类型  A
主机   portfolio           （即 portfolio.guizzhan.xyz）
值     121.43.24.133
```

验证（等 1~5 分钟生效）：

```bash
nslookup portfolio.guizzhan.xyz 8.8.8.8
```

### A2. 扩展现有证书

80/443 关闭 → **ACME 的 HTTP-01 挑战用不了**，必须走 **DNS-01**（需要 DNS 服务商的 API Key）。
你现有的三域名证书大概率就是这么签的，用同样的方式追加一个域名即可。

certbot（以阿里云 DNS 插件为例）：

```bash
certbot certonly \
  --dns-aliyun \
  --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini \
  -d report.guizzhan.xyz -d picture.guizzhan.xyz \
  -d xinyuan.guizzhan.xyz -d portfolio.guizzhan.xyz \
  --cert-name guizzhan
```

验证：

```bash
echo | openssl s_client -connect report.guizzhan.xyz:18100 \
  -servername report.guizzhan.xyz 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName
# 输出里应包含 DNS:portfolio.guizzhan.xyz
```

### A3. 起静态服务

选一个 Web 服务器，监听一个新的高位端口（建议 **18130**，和现有三个错开）。
二选一，配置都在本目录。

**方式一：Caddy**（推荐，配置最短，自动处理 Range / gzip / 缓存）

```bash
cp Caddyfile /etc/caddy/Caddyfile.d/portfolio.conf   # 或直接用它当主 Caddyfile
mkdir -p /var/www/portfolio
# 上传文件后：
caddy reload --config /etc/caddy/Caddyfile
```

**方式二：nginx**

```bash
cp nginx.conf /etc/nginx/conf.d/portfolio.conf
nginx -t && systemctl reload nginx
```

**方式三：沿用你现有的 uvicorn 模式**（和另外三个产品一致，如果它们的部署你已经脚本化了，用这个最省心）
见 `subpath: serve.py` —— 一个十几行的 FastAPI 静态服务，用和现有产品相同的证书启动。

### A4. 上传文件

用 `scp` / `rsync` 把整个作品集目录传上去：

```bash
rsync -av --delete \
  --exclude 'tools/' --exclude '预览截图.png' --exclude '需求.txt' \
  "D:/Software/My Product/作品集/" root@121.43.24.133:/var/www/portfolio/
```

### A5. 验证

```bash
BASE=https://portfolio.guizzhan.xyz:18130

curl -sI  $BASE/ | head -1                      # 期望 HTTP/2 200
curl -sI  $BASE/assets/video/xinyuan.mp4 | grep -i accept-ranges
#   ↑ 必须出现 Accept-Ranges: bytes，否则视频不能拖进度条
curl -s -o /dev/null -w '%{http_code}\n' -r 0-1023 $BASE/assets/video/xinyuan.mp4   # 期望 206
```

### 最终 URL

```
https://portfolio.guizzhan.xyz:18130/
```

> 带端口不优雅。想要 `https://portfolio.guizzhan.xyz`（无端口）需要开 443 —— 但 443 属于
> 标准端口，大陆服务器上要求域名已 **ICP 备案**。你现在用高位端口很可能就是为了规避这条。
> 要走无端口方案，请先确认域名备案状态。

---

## 方案 B：GitHub Pages（今天就能上线，无需服务器）

**为什么可能适合**：零运维、免备案、自动 HTTPS、可直接用你的 GitHub 账号。

**代价**：`github.io` 域名在国内网络下**经常很慢甚至打不开**，简历投国内公司有风险。

```bash
cd "D:/Software/My Product/作品集"
git init -b main
git add .
git commit -m "作品集：三个产品的介绍 / 演示视频 / 体验入口"

# 先在网页上建一个空的公开仓库 ChloieZ/portfolio，然后：
git remote add origin https://github.com/ChloieZ/portfolio.git
git push -u origin main
```

推送后到 **Settings → Pages**，Source 选 `Deploy from a branch` → `main` → `/ (root)`，保存。

最终 URL：

```
https://chloiez.github.io/portfolio/
```

### 之后可以绑自定义域名

Pages 支持绑定 `portfolio.guizzhan.xyz`，但**仍受大陆网络对 github.io 的限制**，
改善有限。想彻底解决，得把 DNS 托管到 Cloudflare 再上 Cloudflare Pages（免备案）。

---

## 必读：登录墙

你的三个产品现在都跳 `/login`（`https://xinyuan.guizzhan.xyz:18120/` → `/login`）。
**简历上的人点「在线体验」会看到登录页，看不到产品** —— 这会让整个作品集的价值打折。

三种解法，按推荐度排序：

1. **加一个演示账号**（最省事，推荐）
   建一个只读的 `demo` 账号，把账号密码直接写在作品集页面上，
   例如按钮下加一行「演示账号 demo / demo1234」。
   → 需要在 `data/products.js` 里加字段并改一点渲染代码，说一声我来做。

2. **做免登录的演示模式**
   给 `/` 加一个 `?demo=1` 之类的入口，进只读示例数据。
   → 需要改产品代码，工作量中等。

3. **录屏 + 截图代替**
   既然每行已经有演示视频，可以把「在线体验」按钮降级为次要入口，
   视频作为主展示。**零改动**，但少了真机体验。

---

## 上线后自查清单

- [ ] 从**手机流量**（不连 WiFi）打开一次，确认公网可达
- [ ] 三个「在线体验」按钮都能点开且**不跳登录页**
- [ ] 三个视频都能播放、能拖进度条（`Accept-Ranges`）
- [ ] 顶部个人信息里的姓名/联系方式已填（现在是占位符）
- [ ] 页面在手机竖屏下不横向溢出
