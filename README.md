# 跆拳道比赛管理系统

基于 Java + Node.js 的现代化跆拳道赛事管理解决方案，重构自 NTS_Taekwondo Network V8.12.22.1。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML5 + CSS3 + JavaScript | 响应式Web界面 |
| 桌面端 | Java Swing | 跨平台桌面客户端 |
| 后端 | Node.js + Express | RESTful API 服务 |
| 数据库 | SQLite3 | 轻量级本地数据库 |
| 实时通信 | WebSocket | 多裁判台实时计分同步 |

## 项目结构

```
TaekwondoManager/
├── server.js              # Node.js 服务器入口
├── database.js            # SQLite 数据库封装
├── websocket.js           # WebSocket 实时通信
├── routes.js              # REST API 路由
├── package.json           # Node.js 依赖
├── src/
│   └── TaekwondoManager.java   # Java Swing 桌面客户端
├── public/
│   └── index.html         # Web 前端界面
└── data/
    └── taekwondo.db       # SQLite 数据库文件
```

## 核心功能

### 1. 运动员管理
- 运动员信息录入（编号、姓名、性别、单位、级别、种子号）
- 按级别/单位/性别筛选查询
- 批量导入/导出

### 2. 比赛编排
- 自动生成淘汰赛对阵表
- 种子选手均匀分布算法
- 同单位回避原则
- 轮空自动处理

### 3. 实时计分
- 多裁判台同时计分
- WebSocket 实时同步
- 支持 +1/+2/+3/+4(击头) 得分
- 犯规扣分 (-1)
- 多局制支持（三局两胜）

### 4. 比赛查询
- 按级别/状态筛选
- 比分实时显示
- 晋级路径追踪

### 5. 统计报表
- 级别参赛统计
- 单位成绩排名
- 比赛结果汇总

## 数据库表结构

### athletes（运动员表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| athlete_no | TEXT | 运动员编号 |
| name | TEXT | 姓名 |
| gender | TEXT | 性别（男/女） |
| unit | TEXT | 单位 |
| weight_class | TEXT | 称重级别 |
| seed_no | INTEGER | 种子号 |
| draw_no | INTEGER | 签号 |

### matches（比赛信息表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| weight_class | TEXT | 级别 |
| venue_no | INTEGER | 场地号 |
| round | INTEGER | 轮次 |
| blue_xxx | - | 青方信息 |
| red_xxx | - | 红方信息 |
| winner | TEXT | 获胜者 |
| win_method | TEXT | 获胜方式 |
| match_status | TEXT | 状态 |

## 快速开始

### 1. 启动后端服务

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 或开发模式（自动重启）
npm run dev
```

服务器默认运行在 `http://localhost:3000`

### 2. 启动 Web 界面

直接用浏览器打开 `public/index.html`，或访问 `http://localhost:3000`

### 3. 启动 Java 桌面客户端

```bash
# 编译
cd src
javac -cp . TaekwondoManager.java

# 运行
java TaekwondoManager
```

> 注意：Java 客户端需要 `org.json` 库支持。

## API 接口

### 运动员
- `GET /api/athletes` - 获取运动员列表
- `POST /api/athletes` - 添加运动员
- `PUT /api/athletes/:id` - 更新运动员
- `DELETE /api/athletes/:id` - 删除运动员

### 比赛
- `GET /api/matches` - 获取比赛列表
- `GET /api/matches/:id` - 获取比赛详情
- `POST /api/matches` - 创建比赛
- `PUT /api/matches/:id/result` - 更新比赛结果

### 编排
- `POST /api/brackets/generate` - 生成对阵表
- `GET /api/brackets/:weight_class` - 获取对阵表

### 统计
- `GET /api/stats/weight-classes` - 级别统计
- `GET /api/stats/units` - 单位统计

## WebSocket 协议

### 客户端注册
```json
{
  "type": "register",
  "role": "judge|display|admin",
  "matchId": 1
}
```

### 分数更新
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

### 比赛开始/结束
```json
{
  "type": "match_start",
  "data": { "matchId": 1 }
}
```

## 与原系统对比

| 特性 | NTS V8 (原版) | 新版系统 |
|------|--------------|---------|
| 开发语言 | Delphi | Java + Node.js |
| 数据库 | Access (Jet 4.0) | SQLite3 |
| 网络通信 | WinSock 2 (TCP) | WebSocket |
| 界面技术 | VCL (Windows) | Swing + Web |
| 数据格式 | 二进制/私有 | JSON / REST |
| 跨平台 | ❌ Windows | ✅ 全平台 |
| 实时同步 | 基础TCP | WebSocket |
| 扩展性 | 有限 | 高 |

## 许可证

MIT
