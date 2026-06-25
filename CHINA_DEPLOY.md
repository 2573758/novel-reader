# 📖 简阅 — 中国云平台部署指南

## 为什么需要部署到中国服务器？

`novel-readershen.vercel.app` 托管在 Vercel（美国服务器）。当用户导入小说时，Vercel 服务器需要访问 `wenku8.net` 获取小说数据。但由于 Vercel IP 在海外，被中国防火墙或 wenku8 服务器拦截，导致导入失败。

**解决方案**：将 API 服务器部署到能访问中国网络的服务器上，Vercel 前端通过中继访问这些 API。

```
用户手机/电脑
    ↓
Vercel 前端 (PWA) ←── API 调用 ──→ 中国服务器 (新部署) ──→ wenku8.net
```

---

## 方案 A：Zeabur 部署（推荐，已配置好）

Zeabur 是一个支持亚洲区域的 PaaS 平台，项目已配置好，只需几步即可部署。

### 前置条件
- GitHub 账号
- Zeabur 账号（用 GitHub 登录 https://zeabur.com ）

### 部署步骤

**1. 推送 deploy-zeabur 到 GitHub**

```bash
# 进入 deploy-zeabur 目录
cd deploy-zeabur

# 初始化 git（已完成，跳过）
# 创建 GitHub 新仓库（如 wenku8-relay）

git remote add origin https://github.com/你的用户名/wenku8-relay.git
git add .
git commit -m "初始部署"
git branch -M main
git push -u origin main
```

**2. 在 Zeabur 中部署**

1. 登录 https://dash.zeabur.com
2. 点击 "Deploy New Service" → 选择你刚创建的 GitHub 仓库
3. 选择 `deploy-zeabur` 子目录
4. Zeabur 会自动检测 Node.js 项目并部署
5. 等待部署完成，获得域名如 `https://wenku8-relay.zeabur.app`

**3. 测试**

浏览器访问：`https://你的域名.zeabur.app/api/novel/3281`

应该返回小说《xxx》的 JSON 数据。

**4. 连接 Vercel 前端**

在 Vercel 站点（`novel-readershen.vercel.app`）：
- 打开书架 → 点击 ⚙️ 按钮
- 输入 Zeabur 域名（如 `https://wenku8-relay.zeabur.app`）
- 点击"测试连接"确认 ✅
- 点击"保存"

现在导入小说应该正常工作了！

---

## 方案 B：Docker 部署到任何 VPS

如果你有中国 VPS（腾讯云轻量服务器、阿里云 ECS 等），可以使用 Docker 部署。

### 步骤

**1. 构建 Docker 镜像**

```bash
cd relay
docker build -t wenku8-relay .
```

**2. 运行**

```bash
docker run -d -p 3001:3001 --name wenku8-relay --restart always wenku8-relay
```

**3. 配置 Nginx 反向代理（可选）**

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**4. 测试**

```bash
curl http://你的服务器IP:3001/api/novel/3281
```

返回 JSON 即成功。

---

## 方案 C：阿里云函数计算 FC（Serverless）

适合想要免费/低成本方案的用户。

### 部署步骤

1. 登录阿里云函数计算控制台
2. 创建函数 → 选择"Node.js 20"运行时
3. 上传代码包（使用 `relay/relay.js` 作为入口，需安装依赖）
4. 配置 HTTP 触发器
5. 获得公网 URL

---

## 前端配置说明

前端已内置配置界面，支持两种连接方式：

### 方式 1：用户自行设置（推荐）

书架页 → ⚙️ → 输入中国服务器地址 → 测试 → 保存

设置存储在浏览器 localStorage 中，每个用户独立配置。

### 方式 2：Vercel 环境变量（全局生效）

在 Vercel Dashboard → Settings → Environment Variables 添加：

| 变量名 | 值 |
|--------|-----|
| `RELAY_URL` | `https://你的服务器.com/relay` |

这样所有 API 请求都会通过你的中国服务器中继，也支持图片代理。

---

## 常见问题

### Q: Zeabur 部署后仍然无法访问 wenku8？
A: Zeabur 的亚洲节点可能在香港/新加坡。如果仍被拦截，请使用方案 B（国内 VPS）或方案 C（阿里云 FC）。

### Q: 腾讯云轻量服务器多少钱？
A: 最便宜套餐约 ¥50/月，2核2G，足够使用。新人通常有优惠（~¥28/月）。

### Q: 一定要用自己的服务器吗？
A: 是的。wenku8.net 需要从中国境内访问，只有部署在中国网络的服务器才能稳定访问。
