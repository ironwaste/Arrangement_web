# 🥋 跆拳道比赛管理系统 (Taekwondo Manager)

基于 **Node.js + Express + MySQL** 的现代化跆拳道赛事管理解决方案，支持竞技对抗（Kyougi）和品势比赛（Poomsae）双模式。

## ✨ 功能特性

### 📋 赛事管理
- 多赛事创建与管理
- 赛事配置（胜出方式、局数、休息时间、称重容差等）
- 赛事状态跟踪（报名中 → 进行中 → 已结束）

### 👤 运动员管理
- 运动员信息录入（编号、姓名、性别、单位、级别、种子号）
- Excel 批量导入/导出运动员数据
- 按级别/单位/性别筛选查询
- 抽签号自动分配

### ⚖️ 称重管理
- 首次/复称体重记录
- 称重容差配置与合格判定
- 批量导入称重数据

### 🎯 竞技比赛 (Kyougi)
- **自动编排系统**
  - 种子选手均匀分布算法
  - 同单位回避原则
  - 轮空自动处理
  - 支持单败淘汰赛等多种赛制
- **可视化对阵图**
  - 基于 brackets-viewer 的专业对阵图展示
  - 实时更新晋级路径
- **实时计分**
  - 多裁判台同时计分
  - WebSocket 实时同步
  - 多局制支持（三局两胜）
  - 详细得分记录

### 🧘 品势比赛 (Poomsae)
- 品势分组管理（个人/团体）
- 多轮品势指定（最多 6 个品势）
- 裁判打分系统（准确度 + 表现力）
- 自动计算最终得分与排名

### 📊 数据统计
- 各级别参赛人数统计
- 单位成绩排名（团体总分）
- 奖牌榜（金/银/铜牌统计）
- 比赛结果汇总导出

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **后端框架** | Express 4.x | RESTful API 服务 |
| **模板引擎** | EJS | 服务端渲染 |
| **数据库** | MySQL 8.0+ | 关系型数据库，连接池管理 |
| **实时通信** | WebSocket (ws) | 多裁判台实时计分同步 |
| **认证鉴权** | JWT (jsonwebtoken) | Token 身份验证 |
| **对阵图引擎** | brackets-manager / brackets-viewer | 专业锦标赛对阵图生成与展示 |
| **文件处理** | Multer + ExcelJS + XLSX | 文件上传与 Excel 解析 |

## 📁 项目结构

```
TaekwondoManager_v1_test_mysql/
├── server.js                  # 服务器入口，路由配置
├── database.js                # MySQL 数据库封装类
├── auth.js                    # JWT 认证中间件
├── websocket.js               # WebSocket 实时通信服务
├── storage.js                 # BracketsManager 存储适配器
│
├── routes/                    # API 路由模块
│   ├── index.js               # 路由聚合入口
│   ├── events.js              # 赛事管理 API
│   ├── athletes.js            # 运动员管理 API
│   ├── weighin.js             # 称重管理 API
│   ├── matches.js             # 比赛记录 API
│   ├── category-mode.js       # 分组模式 API
│   ├── autoScheduler.js       # 自动编排算法
│   ├── kyougiMatchHelpers.js  # 竞技比赛辅助函数
│   ├── stats.js               # 统计数据 API
│   └── poomsae.js             # 品势比赛 API
│
├── views/                     # EJS 页面模板
│   ├── layout.ejs             # 公共布局模板
│   ├── dashboard.ejs          # 仪表盘
│   ├── events.ejs             # 赛事列表
│   ├── athletes.ejs           # 运动员管理
│   ├── weighin.ejs            # 称重管理
│   ├── taekwondo-kyougi-brackets.ejs  # 竞技编排页
│   ├── bracket-detail.ejs     # 对阵图详情
│   ├── takewondo-kyougi-matches.ejs   # 对阵表
│   ├── team-scores.ejs        # 团体总分
│   ├── medal-board.ejs        # 奖牌榜
│   ├── poomsae.ejs            # 品势编排
│   ├── poomsae-athletes.ejs   # 品势运动员
│   ├── poomsae-matches.ejs    # 品势比赛查询
│   ├── chinese-wrestle-arrange.ejs    # 摔跤编排(备用)
│   └── partials/
│       └── modals.ejs         # 弹窗组件
│
├── public/                    # 静态资源
│   ├── index.html             # 登录页
│   ├── images/                # 图片资源
│   ├── js/                    # 前端 JavaScript
│   │   ├── common.js          # 公共工具函数
│   │   ├── events.js          # 赛事管理逻辑
│   │   ├── athletes.js        # 运动员管理逻辑
│   │   ├── weighin.js         # 称重管理逻辑
│   │   ├── brackets.js        # 编排逻辑
│   │   ├── category-mode.js   # 分组模式逻辑
│   │   ├── bracket-detail.js  # 对阵图交互
│   │   ├── matches.js         # 比赛列表逻辑
│   │   ├── team-scores.js     # 团体分统计
│   │   ├── medal-board.js     # 奖牌榜逻辑
│   │   ├── excel-filter.js    # Excel 导入工具
│   │   ├── poomsae*.js        # 品势相关模块
│   │   └── ...
│   └── lib/                   # 第三方库
│       ├── brackets-viewer.min.js
│       └── brackets-viewer.min.css
│
├── data/                      # 数据文件目录
├── uploads/                   # 用户上传文件目录
├── package.json
└── .gitignore
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 16.x
- **MySQL** >= 8.0
- **npm** 或 **yarn**

### 1. 安装依赖

```bash
npm install
```

### 2. 配置数据库

创建 `.env` 文件（可选，有默认值）：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=taekwondo_manager

# 服务器配置
PORT=3000

# JWT 配置
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=30d
```

> **默认配置**：`localhost:3306`，用户 `root`，密码 `123456`，数据库 `taekwondo_manager`

### 3. 启动服务器

```bash
# 生产模式
npm start

# 开发模式（支持热重启）
npm run dev
```

服务器启动成功后访问：**http://localhost:3000**

### 4. 默认登录账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `root` | `123456` | 管理员 |

> 首次启动时会自动创建默认管理员账户

## 📡 API 接口

### 认证接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 用户登录获取 Token |
| GET | `/api/check-auth` | 验证 Token 有效性 |

> 除 `/api/login` 外，所有 `/api/*` 接口均需携带 **Authorization: Bearer <token>** 请求头

### 赛事管理 (`routes/events.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events` | 获取赛事列表 |
| POST | `/api/events` | 创建新赛事 |
| PUT | `/api/events/:id` | 更新赛事信息 |
| DELETE | `/api/events/:id` | 删除赛事 |

### 运动员管理 (`routes/athletes.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/athletes` | 获取运动员列表 |
| POST | `/api/athletes` | 添加运动员 |
| PUT | `/api/athletes/:id` | 更新运动员信息 |
| DELETE | `/api/athletes/:id` | 删除运动员 |
| POST | `/api/athletes/import` | Excel 批量导入 |
| GET | `/api/athletes/export` | 导出 Excel |

### 称重管理 (`routes/weighin.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/weighin` | 获取称重记录 |
| POST | `/api/weighin` | 添加称重记录 |
| POST | `/api/weighin/import` | 批量导入称重数据 |
| PUT | `/api/weighin/:id` | 更新称重记录 |

### 竞技比赛 (`routes/matches.js`, `routes/category-mode.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/matches` | 获取比赛列表 |
| GET | `/api/category-mode` | 获取分组模式 |
| POST | `/api/category-mode` | 创建分组 |
| POST | `/api/brackets/generate` | 自动生成对阵表 |
| GET | `/api/brackets/:categoryId` | 获取对阵图数据 |
| PUT | `/api/matches/:id/result` | 录入比赛结果 |

### 品势比赛 (`routes/poomsae.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/poomsae/groups` | 获取品势分组 |
| POST | `/api/poomsae/groups` | 创建品势分组 |
| GET | `/api/poomsae/athletes` | 获取品势运动员 |
| POST | `/api/poomsae/athletes` | 添加品势运动员 |
| GET | `/api/poomsae/matches` | 获取品势比赛 |
| POST | `/api/poomsae/scores` | 提交裁判打分 |

### 统计数据 (`routes/stats.js`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats/weight-classes` | 级别参赛统计 |
| GET | `/api/stats/team-scores` | 团体总分排行 |
| GET | `/api/stats/medal-board` | 奖牌榜数据 |

## 🌐 页面导航

| 路由 | 页面名称 | 功能说明 |
|------|----------|----------|
| `/` | 仪表盘 | 系统概览与快捷入口 |
| `/events` | 赛事列表 | 赛事的增删改查 |
| `/athletes` | 运动员管理 | 运动员信息管理与导入 |
| `/weighin` | 称重管理 | 体重记录与合格判定 |
| `/brackets` | 跆拳道编排 | 竞技比赛分组与抽签 |
| `/bracket-detail` | 对阵图 | 可视化对阵图展示 |
| `/matches` | 对阵表 | 比赛列表与结果录入 |
| `/team-scores` | 团体总分 | 单位积分排行榜 |
| `/medal-board` | 奖牌榜 | 金/银/铜牌统计 |
| `/poomsae` | 品势编排 | 品势比赛分组设置 |
| `/poomsae-athletes` | 品势运动员 | 品势选手管理 |
| `/poomsae-matches` | 品势比赛 | 品势成绩查询 |

## 🔌 WebSocket 协议

连接地址：`ws://localhost:3000`

### 消息类型

#### 客户端注册
```json
{
  "type": "register",
  "role": "judge",
  "matchId": 1
}
```
**角色类型**：`judge`(裁判) | `display`(显示板) | `admin`(管理)

#### 分数更新（仅裁判）
```json
{
  "type": "score_update",
  "data": {
    "matchId": 1,
    "blueScore": 10,
    "redScore": 8,
    "blueWins": 1,
    "redWins": 0,
    "roundNo": 1
  }
}
```

#### 比赛控制
```json
// 开始比赛
{ "type": "match_start", "data": { "matchId": 1 } }

// 结束比赛
{ "type": "match_end", "data": { "matchId": 1, "winner": "blue", "winMethod": "PTG" } }
```

#### 心跳检测
```json
{ "type": "ping" }
// 响应: { "type": "pong", "timestamp": 1700000000000 }
```

## 🗄️ 数据库结构

### 核心业务表

| 表名 | 说明 |
|------|------|
| `events` | 赛事信息 |
| `events_config` | 赛事详细配置 |
| `athletes` | 运动员基本信息 |
| `athletes_weighing` | 称重记录 |
| `category_mode` | 比赛分组模式 |
| `matchs` | 传统比赛记录（旧版兼容） |
| `taekwondo_kyougi_matchs` | 竞技比赛记录（新版） |

### 对阵图相关表（brackets-manager 标准 Schema）

| 表名 | 说明 |
|------|------|
| `bracket_participant` | 参赛选手 |
| `bracket_stage` | 赛段（淘汰赛/循环赛） |
| `bracket_group` | 小组 |
| `bracket_round` | 轮次 |
| `bracket_match` | 对阵场次 |
| `bracket_match_game` | 局分记录 |

### 品势比赛表

| 表名 | 说明 |
|------|------|
| `poomsae_groups` | 品势分组 |
| `athletes_poomsae` | 品势运动员 |
| `poomsae_matchs` | 品势比赛记录 |
| `poomsae_scores` | 品势裁判打分 |

### 系统表

| 表名 | 说明 |
|------|------|
| `test_user` | 系统用户（认证用） |

## 📦 主要依赖

```json
{
  "dependencies": {
    "express": "^4.18.2",           // Web 框架
    "mysql2": "^3.22.3",            // MySQL 驱动
    "ejs": "^5.0.2",                // 模板引擎
    "websocket/ws": "^8.14.2",      // WebSocket 服务
    "jsonwebtoken": "^9.0.3",       // JWT 认证
    "multer": "^1.4.5-lts.1",       // 文件上传
    "exceljs": "^4.4.0",            // Excel 读写
    "xlsx": "^0.18.5",              // Excel 解析
    "brackets-manager": "^1.9.1",   // 对阵图逻辑引擎
    "brackets-viewer": "^1.6.2",    // 对阵图可视化组件
    "cors": "^2.8.5",               // 跨域支持
    "uuid": "^9.0.0"                // UUID 生成
  },
  "devDependencies": {
    "nodemon": "^3.0.1"             // 开发热重启
  }
}
```

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DB_HOST` | `localhost` | MySQL 主机地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `123456` | MySQL 密码 |
| `DB_NAME` | `taekwondo_manager` | 数据库名称 |
| `PORT` | `3000` | 服务端口 |
| `JWT_SECRET` | `taekwondo_manager_secret_key_2026` | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `30d` | Token 有效期 |

## 📝 开发说明

### 项目初始化流程

1. 系统启动时自动创建数据库（如不存在）
2. 自动执行表结构迁移（CREATE TABLE IF NOT EXISTS）
3. 自动将旧版 `matchs` 表数据迁移到新版 `taekwondo_kyougi_matchs` 表
4. 初始化默认管理员账户

### 添加新的 API 模块

1. 在 `routes/` 目录下创建新的路由文件
2. 在 `routes/index.js` 中注册路由
3. 如需页面，在 `views/` 创建 EJS 模板
4. 在 `server.js` 的 `pageConfig` 中添加页面配置

### 数据库操作封装

项目对 MySQL 进行了 SQLite 风格的兼容封装：

```javascript
const db = new MySQLDatabase();
await db.connect();

// 查询单条
const user = await db.get('SELECT * FROM test_user WHERE username = ?', ['root']);

// 查询多条
const list = await db.all('SELECT * FROM athletes WHERE event_id = ?', [eventId]);

// 增删改
await db.run('INSERT INTO athletes (name) VALUES (?)', ['张三']);

// 事务
await db.transaction(async (conn) => {
  await conn.execute('UPDATE ...');
  await conn.execute('INSERT ...');
});
```

## 📄 License

MIT License
