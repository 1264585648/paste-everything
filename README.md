# Data Lens

一个无需后端、可直接部署到 Cloudflare Pages 的通用数据查看与编辑工具。

## 当前功能

- 自动识别 JSON、XML、CSV、TXT，也可手动切换数据类型
- 粘贴、输入、上传文件、拖放文件
- JSON / XML 结构树
- CSV 与结构化 JSON 表格视图
- 原文视图与基础语法高亮
- 格式化、压缩、校验、搜索
- 复制与下载
- 深色模式
- 数据仅在浏览器中处理，不上传服务器

## 本地运行

可以直接双击 `index.html`，也可以在目录中运行：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 部署到 Cloudflare Pages

### 方式一：直接上传

1. 登录 Cloudflare Dashboard。
2. 进入 **Workers & Pages**。
3. 选择 **Create application → Pages → Upload assets**。
4. 上传本目录中的全部文件，或上传项目压缩包解压后的内容。
5. 不需要构建命令，部署目录就是项目根目录。

### 方式二：连接 GitHub

1. 将本目录提交到 GitHub 仓库。
2. 在 Cloudflare Pages 中连接该仓库。
3. Framework preset 选择 `None`。
4. Build command 留空。
5. Build output directory 填 `/` 或留空（按 Cloudflare 当前界面要求）。
6. 保存并部署。

## 文件结构

```text
index.html   页面结构
styles.css   页面样式
app.js       数据识别、解析、编辑与可视化逻辑
_headers     安全响应头
```

## 下一阶段建议

- YAML、TOML、INI、SQL、Markdown 支持
- JSONPath / XPath 查询
- JSON Schema 校验
- Diff 对比
- 大文件分块与虚拟滚动
- 可编辑树节点与表格单元格
- URL 编码、Base64、JWT 等开发者工具
- 浏览器本地历史记录与工作区
