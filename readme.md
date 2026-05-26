# Bing Rewards 🏆

> 自动完成 Bing 搜索任务、积分任务、APP签到等，轻松获取 Microsoft Rewards 积分。

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📋 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **自动登录** | 自动登录微软账号，支持两步验证（TOTP） |
| 🔍 **搜索任务** | 自动使用热搜词执行 Bing 搜索，获取搜索积分 |
| 📋 **积分页面任务** | 自动完成打卡任务、每日活动、活动任务 |
| 🎯 **积分领取** | 自动检测并领取待领取积分 |
| 📱 **APP 签到** | 通过 API 调用实现 APP 签到 |
| 📖 **APP 阅读** | 自动完成 APP 阅读文章任务 |
| 📱 **APP 搜索** | 通过 API 执行移动端搜索任务 |
| 🔄 **自动更新** | 支持从云端检查版本并自动更新 |
| 🌐 **代理支持** | 支持为每个账号单独配置 SOCKS5 代理 |
| 👥 **多账号** | 支持批量处理多个账号 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 16.0
- **浏览器**（支持 Chromium 系浏览器，如 Chrome、Edge、CentBrowser）
- **Linux 额外依赖**：`chromium`、`chromium-chromedriver`、`xvfb`（无头模式运行）

### 安装

```bash
npm install
```

### 配置账号

编辑 `accounts.json` 文件，配置你的微软账号：

```json
[
  {
    "username": "your_email@outlook.com",
    "password": "your_password",
    "otpauth": "otpauth://totp/xxx...",
    "proxy": ""
  },
  {
    "username": "another@hotmail.com",
    "password": "your_password2",
    "otpauth": "otpauth://totp/xxx...",
    "proxy": "socks5://127.0.0.1:1080"
  }
]
```

**配置项说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `username` | ✅ | 微软账号邮箱地址 |
| `password` | ✅ | 账号密码 |
| `otpauth` | ❌ | 两步验证密钥（otpauth:// URL 格式），没有可留空 |
| `proxy` | ❌ | SOCKS5 代理地址，留空则不使用代理 |

### 运行

```bash
npm start
```

或直接运行：

```bash
node index.js
```

---

## 🛠️ 依赖

| 依赖 | 用途 |
|------|------|
| [playwright](https://github.com/microsoft/playwright) ^1.40.0 | 浏览器自动化控制 |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) ^11.1.1 | 增强文件系统操作 |
| [axios](https://github.com/axios/axios) ^1.6.2 | HTTP 请求（API 调用、云更新） |
| [otplib](https://github.com/yeojz/otplib) ^12.0.1 | TOTP 两步验证码生成 |

---

## 📝 使用说明

### 首次运行

1. 确保系统已安装 Chrome / Edge / CentBrowser 等 Chromium 系浏览器
2. 配置好 `accounts.json` 中的账号信息
3. 运行 `npm start`，程序会自动处理所有任务

### 浏览器登录说明

- 程序会自动管理登录状态，Cookie 保存在 `user_data_用户名` 目录
- 首次登录会启动**有头浏览器**（Windows），方便观察登录过程
- 登录成功后，后续运行会复用已保存的登录状态
- Token 缓存在用户数据目录的 `app_token.txt` 文件中

### 调试模式

- 调试截图和 HTML 保存在 `debug` 目录
- 登录失败、任务异常时会自动保存截图和页面 HTML

### 代理配置

如果需要为某个账号配置代理，在 `accounts.json` 中设置 `proxy` 字段：

```json
{
  "username": "your_email@outlook.com",
  "password": "your_password",
  "proxy": "socks5://127.0.0.1:1080"
}
```

> 目前仅支持 SOCKS5 代理协议。

### Linux 服务器运行

```bash
# 安装依赖
apt install chromium chromium-chromedriver xvfb

# 使用 xvfb 无头运行
xvfb-run node index.js
```

---

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/zgcwkj">zgcwkj</a>
</p>
