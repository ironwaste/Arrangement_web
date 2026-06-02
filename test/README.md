# Bracket Manager & Viewer 测试说明

## 目录结构

```
test/
├── bracket-test.html        # 前端测试页面（使用 bracket-viewer）
├── bracket-test-server.js   # 后端测试接口（使用 bracket-manager）
└── README.md               # 本说明文件
```

## 快速开始

### 1. 启动测试服务器

在项目根目录下启动服务器（确保已在 `app.js` 或 `server.js` 中注册路由）：

```javascript
// 在 app.js 或 server.js 中添加
const bracketTestRoutes = require('./test/bracket-test-server');
app.use('/api/test', bracketTestRoutes);
```

或者直接访问已有的 API 接口。

### 2. 访问测试页面

打开浏览器访问：

```
http://localhost:3000/test/bracket-test.html
```

或者启动一个简单的 HTTP 服务器：

```bash
cd test
npx http-server . -p 8080
# 然后访问 http://localhost:8080/bracket-test.html
```

## 功能说明

### 3.1 创建分区循环赛（Pool Stage）

点击 "🎯 创建分区循环赛（Pool Stage）" 按钮，将创建：

- **8名选手**分为2个小组
- 每个小组进行循环赛
- 使用 `round_robin` 赛制

**代码示例：**

```javascript
await manager.create.stage({
    tournamentId: 999,
    name: 'Groups',
    type: 'round_robin',
    seeding: [
        { id: 10, name: 'Alpha', region: 'EU' },
        { name: 'Bravo', region: 'NA' },
        'Charlie',
        'Delta',
        { name: 'Echo', region: 'AS' },
        { name: 'Foxtrot', region: 'AF' },
        'Golf',
        'Hotel'
    ],
    settings: {
        groupCount: 2,
        seedOrdering: ['groups.effort_balanced'],
    },
});
```

### 3.2 创建单败淘汰赛（Single Elimination）

点击 "🏁 创建单败淘汰赛（Single Elimination）" 按钮，将创建：

- **8名选手**进行单败淘汰
- 使用 `single_elimination` 赛制
- 对阵结构：1/4决赛 → 半决赛 → 决赛

### 3.3 创建双败淘汰赛（Double Elimination）

点击 "🔄 创建双败淘汰赛（Double Elimination）" 按钮，将创建：

- **4支队伍**进行双败淘汰
- 使用 `double_elimination` 赛制
- 失败两次被淘汰

## API 接口

### 4.1 创建分区循环赛

**接口地址：** `GET /api/test/create-pool-stage`

**返回示例：**

```json
{
    "success": true,
    "message": "分区循环赛对阵图创建成功",
    "tournamentId": 999,
    "data": {
        "stage": [...],
        "round": [...],
        "group": [...],
        "match": [...],
        "participant": [...]
    }
}
```

### 4.2 获取对阵图数据

**接口地址：** `GET /api/test/get-pool-stage/:tournamentId`

**参数：**
- `tournamentId` - 赛事ID

### 4.3 创建单败淘汰赛

**接口地址：** `GET /api/test/create-single-elimination`

### 4.4 创建双败淘汰赛

**接口地址：** `GET /api/test/create-double-elimination`

## 数据库表结构

测试过程中会自动创建以下表：

- `bracket_stage` - 对阵图阶段
- `bracket_round` - 轮次
- `bracket_group` - 分组
- `bracket_match` - 比赛场次
- `bracket_participant` - 参赛者

## bracket-manager 使用要点

### 5.1 初始化 BracketsManager

```javascript
const { BracketsManager } = require('brackets-manager');
const { MySQLStorage } = require('../storage');

const storage = new MySQLStorage(dbPool);
const manager = new BracketsManager({ storage });
```

### 5.2 创建对阵图阶段

```javascript
const stage = await manager.create.stage({
    tournamentId: 1,
    name: 'Stage Name',
    type: 'round_robin',  // 或 'single_elimination', 'double_elimination'
    seeding: [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        // ...
    ],
    settings: {
        groupCount: 2,  // 分区循环赛专用
        seedOrdering: ['groups.effort_balanced']
    }
});
```

### 5.3 获取对阵图数据

```javascript
const stageData = await manager.get.stageData(tournamentId);
// 返回格式：
// {
//   stage: [...],
//   round: [...],
//   group: [...],
//   match: [...],
//   participant: [...]
// }
```

## bracket-viewer 使用要点

### 6.1 引入 CSS 和 JS

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/brackets-viewer@latest/dist/brackets-viewer.min.css">
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/brackets-viewer@latest/dist/brackets-viewer.min.js"></script>
```

### 6.2 渲染对阵图

```javascript
bracketsViewer.render(data, {
    navigation: true,
    selector: '#container-id',
});
```

### 6.3 HTML 结构

```html
<div id="bracket-container" class="brackets-viewer"></div>
```

## 数据流向图

```
athletes（业务数据）
    ↓
bracket-manager（生成对阵图）
    ↓
bracket_* 表（数据库存储）
    ↓
bracket-viewer（前端渲染）
    ↓
用户界面（显示对阵图）
```

## 常见问题

### Q1: 为什么分区循环赛的 seeding 可以是对象和字符串混合？

A: `bracket-manager` 库支持灵活的数据格式：
- 对象格式：`{ id: 1, name: 'Alpha', region: 'EU' }` - 包含额外属性
- 字符串格式：`'Charlie'` - 简化为只有名字

### Q2: 如何自定义对阵图样式？

A: 通过 CSS 覆盖默认样式：

```css
.brackets-viewer .participant {
    border: 2px solid #3498db;
    border-radius: 6px;
    padding: 8px 12px;
}
```

### Q3: 如何处理比赛结果更新？

A: 使用 `manager.set` 方法：

```javascript
await manager.set.matchResults(stageId, matchId, {
    winner_id: participantId,
    score: {...}
});
```

## 扩展功能

### 添加更多赛制

在 `bracket-test-server.js` 中添加新的路由：

```javascript
router.get('/create-custom-stage', async (req, res) => {
    const manager = new BracketsManager({ storage });
    
    await manager.create.stage({
        tournamentId: 1000,
        name: 'Custom Stage',
        type: 'custom_type',
        seeding: [...],
        settings: {...}
    });
    
    const stageData = await manager.get.stageData(1000);
    res.json({ success: true, data: stageData });
});
```

## 技术栈

- **后端**: Node.js + Express + MySQL
- **对阵图生成**: brackets-manager@^1.9.1
- **对阵图显示**: brackets-viewer@^1.6.2
- **前端**: HTML5 + CSS3 + Vanilla JavaScript

## 参考资料

- [brackets-manager 文档](https://github.com/DrKylie/brackets-manager)
- [brackets-viewer 文档](https://github.com/DrKylie/brackets-viewer)

## 注意事项

1. **测试数据清理**：测试完成后，记得清理测试数据（tournamentId: 997, 998, 999）
2. **数据库连接**：确保 MySQL 数据库正在运行
3. **端口冲突**：如果 3000 端口被占用，修改 `app.js` 中的端口配置
4. **CORS**：如果前后端分离部署，需要配置 CORS

## 许可证

本测试代码仅供学习和测试使用。
