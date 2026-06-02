# bracket_match 表 opponents 字段说明

## 字段结构

在 `bracket_match` 表中，`opponent1` 和 `opponent2` 字段存储的是 JSON 字符串，格式如下：

```json
{
  "id": 16,       // participant ID（参赛者ID）
  "position": 5   // seed position（种子位置/种子编号）
}
```

---

## 字段含义详解

### 1. `id` 字段

**含义**：参赛者在 `bracket_participant` 表中的唯一标识符

**作用**：
- 关联到 `bracket_participant` 表的记录
- 通过这个 ID 可以查询参赛者的详细信息：
  - 姓名（`name`）
  - 自定义数据（`custom_data`，包含签号、单位等）
  - 所属赛事和级别

**示例**：
```javascript
// opponent1 字段值
{"id": 16, "position": 5}

// 通过 id 查询参赛者信息
const participant = await db.get(
    'SELECT id, name, custom_data FROM bracket_participant WHERE id = ?',
    [16]
);

// 解析 custom_data 获取签号等信息
const customData = JSON.parse(participant.custom_data);
console.log(customData.athlete_draw_num);  // 输出签号，例如：5
console.log(customData.athlete_team);      // 输出单位，例如："北京队"
```

---

### 2. `position` 字段

**含义**：种子位置（Seed Position），表示参赛者在对阵图中的种子编号

**作用**：
- 标识参赛者在对阵图中的初始位置
- 决定比赛的种子排序和配对逻辑
- 用于 bracket-manager 内部的算法计算

**种子位置的作用原理**：

#### 2.1 单败淘汰赛的种子位置

在单败淘汰赛中，种子位置决定了参赛者的初始分布，确保：
- **强种子分散**：1号种子和2号种子分别位于对阵图的两端，避免在早期轮次相遇
- **公平配对**：种子编号小的（强种子）在早期轮次遇到种子编号大的（弱种子）

**示例**（8人参赛）：
```
种子位置分布：
Position 1 (1号种子)  vs  Position 8 (8号种子)  → 第1轮
Position 4 (4号种子)  vs  Position 5 (5号种子)  → 第1轮
Position 2 (2号种子)  vs  Position 7 (7号种子)  → 第1轮
Position 3 (3号种子)  vs  Position 6 (6号种子)  → 第1轮

第2轮（四分之一决赛）：
Position 1 的胜者  vs  Position 4 的胜者
Position 2 的胜者  vs  Position 3 的胜者

第3轮（半决赛）：
上半区胜者  vs  下半区胜者
```

**种子排序算法**：
```javascript
// 标准种子位置算法（bracket-manager 使用）
function getSeedingPositions(size) {
    if (size === 2) return [0, 1];              // 1号种子 vs 2号种子
    if (size === 4) return [0, 3, 1, 2];        // 1 vs 4, 2 vs 3
    if (size === 8) return [0, 7, 3, 4, 1, 6, 2, 5];  // 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
    // ... 更大规模的递归计算
}

// 解释：
// [0, 7, 3, 4, 1, 6, 2, 5] 表示：
// Position 0: 1号种子（最强）
// Position 7: 8号种子（最弱）
// Position 3: 4号种子
// Position 4: 5号种子
// ... 以此类推
```

---

#### 2.2 双败淘汰赛的种子位置

双败淘汰赛的种子位置逻辑与单败淘汰赛类似，但需要处理胜者组和败者组：
- **胜者组**：使用标准的种子排序算法
- **败者组**：根据胜者组的比赛结果动态调整

---

#### 2.3 循环赛的种子位置

循环赛的种子位置主要用于：
- **分组**：在分区循环赛中，决定参赛者属于上区还是下区
- **排序**：决定循环赛的赛程顺序

**示例**（分区循环赛）：
```javascript
// 上区种子：position 1, 2, 3
// 下区种子：position 4, 5, 6

// 上区循环赛：
Position 1 vs Position 2
Position 1 vs Position 3
Position 2 vs Position 3

// 下区循环赛：
Position 4 vs Position 5
Position 4 vs Position 6
Position 5 vs Position 6

// 决赛：
上区第一 vs 下区第一
```

---

## position 与签号（athlete_draw_num）的关系

### 关系说明

**签号（athlete_draw_num）** 和 **种子位置（position）** 是两个不同的概念：

1. **签号（athlete_draw_num）**：
   - 业务系统中的概念
   - 通过抽签随机分配
   - 决定比赛的出场顺序
   - 存储在 `athletes.athlete_draw_num` 和 `bracket_participant.custom_data` 中

2. **种子位置（position）**：
   - bracket-manager 内部的概念
   - 根据种子排序算法计算
   - 决定对阵图的初始分布
   - 存储在 `bracket_match.opponent1/2` 的 JSON 中

### 映射关系

在实际应用中，签号和种子位置通常是一致的：

```javascript
// 生成对阵图时，将签号映射到种子位置
const sortedAthletes = athletes.sort((a, b) => 
    a.athlete_draw_num - b.athlete_draw_num
);

// 签号 1 → Position 1（1号种子）
// 签号 2 → Position 2（2号种子）
// 签号 3 → Position 3（3号种子）
// ... 以此类推
```

**但是，在某些情况下可能不一致**：
- 手动调整种子位置（例如：保护种子选手）
- 使用自定义的种子排序算法
- 某些特殊赛制的规则

---

## 实际应用示例

### 示例 1：查询比赛信息

```javascript
// 从 bracket_match 表读取比赛数据
const match = await db.get(
    'SELECT id, opponent1, opponent2 FROM bracket_match WHERE id = ?',
    [123]
);

// 解析 opponent1 和 opponent2
const opp1 = JSON.parse(match.opponent1);  // {"id": 16, "position": 5}
const opp2 = JSON.parse(match.opponent2);  // {"id": 17, "position": 6}

// 查询参赛者详细信息
const participant1 = await db.get(
    'SELECT id, name, custom_data FROM bracket_participant WHERE id = ?',
    [opp1.id]  // 使用 id 字段查询
);

const participant2 = await db.get(
    'SELECT id, name, custom_data FROM bracket_participant WHERE id = ?',
    [opp2.id]
);

// 解析 custom_data
const customData1 = JSON.parse(participant1.custom_data);
const customData2 = JSON.parse(participant2.custom_data);

// 显示比赛信息
console.log(`比赛 #${match.id}:`);
console.log(`红方: ${customData1.athlete_draw_num}. ${participant1.name} (${customData1.athlete_team})`);
console.log(`种子位置: ${opp1.position}`);
console.log(`蓝方: ${customData2.athlete_draw_num}. ${participant2.name} (${customData2.athlete_team})`);
console.log(`种子位置: ${opp2.position}`);

// 输出：
// 比赛 #123:
// 红方: 5. 张三 (北京队)
// 种子位置: 5
// 蓝方: 6. 李四 (上海队)
// 种子位置: 6
```

---

### 示例 2：同步到业务表

```javascript
// 从 bracket_match 表读取数据，同步到 jiu_jitsu_matchs 表
const bracketMatches = await db.all(
    'SELECT id, opponent1, opponent2, status FROM bracket_match WHERE stage_id = ?',
    [stageId]
);

for (const bm of bracketMatches) {
    // 解析 opponent1（红方）
    const opp1 = JSON.parse(bm.opponent1);
    const participant1 = await db.get(
        'SELECT id, name, custom_data FROM bracket_participant WHERE id = ?',
        [opp1.id]
    );
    const customData1 = JSON.parse(participant1.custom_data);

    // 解析 opponent2（蓝方）
    const opp2 = JSON.parse(bm.opponent2);
    const participant2 = await db.get(
        'SELECT id, name, custom_data FROM bracket_participant WHERE id = ?',
        [opp2.id]
    );
    const customData2 = JSON.parse(participant2.custom_data);

    // 写入到 jiu_jitsu_matchs 表（包含签号信息）
    await db.run(
        `INSERT INTO jiu_jitsu_matchs
        (jiu_jitsu_bracket_match_id,
         jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, jiu_jitsu_red_athlete_draw_num,
         jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name, jiu_jitsu_blue_athlete_draw_num,
         jiu_jitsu_match_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            bm.id,
            customData1.id, participant1.name, customData1.athlete_draw_num,  // 红方签号
            customData2.id, participant2.name, customData2.athlete_draw_num,  // 蓝方签号
            bm.status
        ]
    );
}
```

---

## bracket-manager 内部使用

### bracket-manager 如何使用 position

bracket-manager 库在内部使用 `position` 字段进行以下计算：

1. **生成对阵图结构**：
   - 根据 `position` 计算比赛的配对关系
   - 决定参赛者在对阵图中的初始位置

2. **计算晋级路径**：
   - 根据比赛的 `position` 计算胜者晋级到下一轮的位置
   - 处理双败淘汰赛的败者组晋级逻辑

3. **渲染对阵图**：
   - brackets-viewer 使用 `position` 确定参赛者在可视化图表中的位置
   - 显示种子编号（如果启用）

### bracket-manager API 示例

```javascript
// bracket-manager 创建 stage 时，内部会分配 position
const stage = await manager.create.stage({
    tournamentId: 1,
    name: '70kg',
    type: 'single_elimination',
    seeding: ['张三', '李四', '王五', '赵六'],  // 按顺序分配 position
    settings: {
        manualOrdering: [[1, 4, 3, 2]]  // 自定义 position 排序
    }
});

// bracket-manager 内部生成的 opponent 数据：
// Match 1: {"id": 1, "position": 1} vs {"id": 4, "position": 4}
// Match 2: {"id": 3, "position": 3} vs {"id": 2, "position": 2}

// 其中：
// id: bracket_participant 表的 ID
// position: 种子位置（根据 manualOrdering 计算）
```

---

## 数据流向总结

```
运动员数据 (athletes 表)
    ↓
抽签分配签号 (athlete_draw_num)
    ↓
生成对阵图 (generateJJBracketForClass)
    ↓
    ├─→ bracket-manager API 创建结构
    │       ↓
    │   分配 position（种子位置）
    │   创建 bracket_match 记录
    │   opponent1/2 字段：{"id": participant_id, "position": seed_position}
    │
    └─→ 直接 SQL 补充业务数据
            ↓
        更新 bracket_participant.custom_data（包含签号）
    ↓
同步到业务表 (syncJJMatchesFromBracket)
    ↓
jiu_jitsu_matchs 表（包含签号字段）
    ↓
前端渲染 (JJBracketRenderer)
    ↓
显示对阵图（签号. 姓名）
```

---

## 总结

### `{"id":16,"position":5}` 的含义

- **id: 16**：
  - 参赛者在 `bracket_participant` 表中的唯一标识符
  - 用于查询参赛者的详细信息（姓名、签号、单位等）

- **position: 5**：
  - 种子位置，表示参赛者在对阵图中的初始位置
  - 5号种子（中等强度的选手）
  - 用于 bracket-manager 内部的算法计算和渲染

### 关键区别

| 字段 | 存储位置 | 含义 | 用途 |
|------|---------|------|------|
| `athlete_draw_num` | athletes 表, custom_data | 签号 | 业务系统使用，决定出场顺序 |
| `position` | opponent JSON | 种子位置 | bracket-manager 使用，决定对阵图分布 |

### 实际应用

在大多数情况下：
- **签号 = 种子位置**（签号1的选手是1号种子）
- **前端显示签号**（从 custom_data 读取）
- **后端使用 position**（bracket-manager 内部计算）

理解这两个字段的区别和联系，有助于更好地理解对阵图生成和渲染的完整流程。