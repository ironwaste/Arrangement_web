# bracket_participant 表关联关系与代码实现详解

## 一、数据库表结构

### 1.1 bracket_participant 表定义

**位置**：`database.js` 第 336-344 行

```sql
CREATE TABLE bracket_participant (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，participant 唯一标识
    tournament_id INT NOT NULL DEFAULT 1,        -- 关联到 events.event_id
    event_id INT DEFAULT NULL,                   -- 赛事ID（业务系统使用）
    category_id VARCHAR(100) DEFAULT NULL,        -- 级别ID（旧版，新版已改为 INT 类型）
    name VARCHAR(255) NOT NULL,                  -- 参赛者姓名
    custom_data TEXT DEFAULT NULL                -- 自定义数据（JSON 格式）
)
```

### 1.2 bracket_match 表的 opponent 字段

**位置**：`database.js` 第 424-442 行

```sql
CREATE TABLE bracket_match (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stage_id INT NOT NULL,
    round_id INT DEFAULT NULL,
    opponent1 TEXT DEFAULT NULL,  -- 红方对手信息（JSON 格式）
    opponent2 TEXT DEFAULT NULL,   -- 蓝方对手信息（JSON 格式）
    winner_id INT DEFAULT NULL,   -- 获胜者ID（关联到 bracket_participant.id）
    -- ... 其他字段
)
```

---

## 二、核心关联关系

### 2.1 关联关系图

```
athletes 表（业务表）
    │
    ├── id → bracket_participant.custom_data.id
    ├── athlete_name → bracket_participant.name
    ├── athlete_draw_num → bracket_participant.custom_data.athlete_draw_num
    └── athlete_team → bracket_participant.custom_data.athlete_team
            │
            ↓
bracket_participant 表（参赛者表）
    │
    ├── id (主键) → bracket_match.opponent1/opponent2 中的 id
    ├── tournament_id → events.event_id
    ├── name → 运动员姓名
    └── custom_data (JSON) → 包含 id, athlete_draw_num, athlete_team 等
            │
            ↓
bracket_match 表（比赛场次表）
    │
    ├── opponent1 (JSON) → {"id": 16, "position": 5}
    │       │
    │       └── id 关联到 bracket_participant.id
    │
    └── opponent2 (JSON) → {"id": 18, "position": 3}
            │
            └── id 关联到 bracket_participant.id
```

### 2.2 间接关联流程

```
bracket_participant.custom_data.id → athletes.id
bracket_participant.name → athletes.athlete_name
bracket_participant.tournament_id → events.event_id
bracket_participant.category_id → category_mode.category_id（新版本）
```

---

## 三、数据流向

### 3.1 创建参赛者（生成对阵图时）

```
athletes 表
    │
    ├── 读取所有运动员数据
    │
    ↓
bracket-manager API
    │
    ├── manager.create.stage() → 创建 stage
    │
    └── manager.addParticipant() → 创建 participant（自动）
            │
            ↓
bracket_participant 表
    │
    ├── id: 自动生成
    ├── tournament_id: event_id
    ├── name: 运动员姓名
    └── custom_data: 初始为 null
            │
            ↓
UPDATE bracket_participant
    │
    └── 设置 custom_data = JSON.stringify({
            id: athlete.id,
            athlete_draw_num: athlete.athlete_draw_num,
            athlete_team: athlete.athlete_team
        })
```

### 3.2 创建比赛场次

```
bracket_participant 表
    │
    ├── 获取 participant 列表
    │
    ├── 建立 seed 编号到 participant ID 的映射
    │       │
    │       └── seedingToParticipant.set(seedNum, participantId)
    │
    └── 生成比赛配对
            │
            ↓
bracket_match 表
    │
    └── opponent1: JSON.stringify({ id: participantId })
    └── opponent2: JSON.stringify({ id: participantId })
```

### 3.3 同步数据到业务表

```
bracket_match 表
    │
    ├── 读取 opponent1/opponent2
    │       │
    │       └── JSON.parse() → { id: 16, position: 5 }
    │
    ↓
bracket_participant 表
    │
    ├── 通过 opponent.id 查询 participant
    │
    └── 获取 custom_data
            │
            ├── custom_data.id → 运动员ID
            ├── custom_data.athlete_draw_num → 签号
            └── custom_data.athlete_team → 单位
                    │
                    ↓
jiu_jitsu_matchs / taekwondo_kyougi_matchs 表（业务表）
    │
    ├── jiu_jitsu_red_athlete_id
    ├── jiu_jitsu_red_athlete_name
    ├── jiu_jitsu_red_athlete_draw_num
    └── jiu_jitsu_red_athlete_team
```

---

## 四、代码实现详解

### 4.1 生成对阵图时创建 participant

**文件**：`routes/Jiu-Jitsu/jiu-jitsu-bracket-helpers.js`

```javascript
// 第 325-339 行：生成单循环赛
const rrStage = await manager.create.stage({
    tournamentId: Number(event_id),    // tournament_id
    name: weightClass,                 // 级别名称
    type: 'round_robin',               // 赛制类型
    seeding: effectiveSeeding,          // 种子列表（运动员姓名数组）
    settings: { size: n, groupCount: 1 },
});

// bracket-manager 会自动创建 bracket_participant 记录
// 然后我们手动更新 custom_data
const participantList = await db.all(
    'SELECT id, name FROM bracket_participant WHERE tournament_id = ?',
    [Number(event_id)]
);

for (let i = 0; i < cleanSeeding.length; i++) {
    if (cleanSeeding[i] === null) continue;
    const p = participantList.find(pp => pp.name === cleanSeeding[i]);
    if (p) {
        const athlete = sortedAthletes[i] || {};
        // 更新 custom_data
        await db.run(
            'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
            [JSON.stringify({
                id: athlete.id != null ? athlete.id : null,
                athlete_draw_num: athlete.athlete_draw_num != null 
                    ? athlete.athlete_draw_num : (i + 1),
                athlete_team: athlete.athlete_team || ''
            }), p.id]
        );
    }
}
```

### 4.2 创建比赛场次时设置 opponent

**文件**：`routes/Jiu-Jitsu/jiu-jitsu-bracket-helpers.js` 第 96-147 行

```javascript
async function createJJRoundRobinBracketMatches(db, stageId, effectiveSeeding, participantList) {
    const n = effectiveSeeding.length;
    if (n < 2) return;

    // 建立 seed 编号到 participant ID 的映射
    // 例如：seed 1 → participant ID 5
    const seedingToParticipant = new Map();
    for (let i = 0; i < effectiveSeeding.length; i++) {
        const p = participantList.find(pp => pp.name === effectiveSeeding[i]);
        if (p) {
            seedingToParticipant.set(i + 1, p.id);  // seed 从 1 开始
        }
    }

    // 生成循环赛赛程
    const rrMatches = generateJJRoundRobinSchedule(n);

    // 创建每场比赛
    for (const match of rrMatches) {
        // 根据 seed 编号获取 participant ID
        const opp1ParticipantId = seedingToParticipant.get(match.seed1);  // seed 1
        const opp2ParticipantId = seedingToParticipant.get(match.seed2);      // seed 2

        // 设置 opponent（JSON 格式）
        const opponent1 = opp1ParticipantId 
            ? JSON.stringify({ id: opp1ParticipantId })  // {"id": 5}
            : null;
        const opponent2 = opp2ParticipantId 
            ? JSON.stringify({ id: opp2ParticipantId })  // {"id": 8}
            : null;

        // 创建比赛场次记录
        await db.run(
            'INSERT INTO bracket_match (stage_id, round_id, group_id, number, child_count, opponent1, opponent2, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [stageId, roundId, groupId, matchNumber, 0, opponent1, opponent2, 2]
        );
        
        matchNumber++;
    }
}
```

### 4.3 同步数据到业务表

**文件**：`routes/Jiu-Jitsu/jiu-jitsu-bracket-helpers.js` 第 919-937 行

```javascript
async function syncJJMatchesFromBracket(db, event_id, weightClass, compMode) {
    // 1. 从 bracket_participant 表读取所有参赛者
    const participants = await db.all(
        'SELECT id, name, custom_data FROM bracket_participant WHERE tournament_id = ?',
        [Number(event_id)]
    );

    // 2. 解析 custom_data，构建 participantMap
    const participantMap = new Map();
    participants.forEach(p => {
        let info = { 
            name: p.name, 
            id: null, 
            athlete_draw_num: null, 
            unit: '', 
            zone: '' 
        };
        
        try {
            if (p.custom_data) {
                // 解析 custom_data JSON
                const custom = JSON.parse(p.custom_data);
                info.id = custom.id;                          // 运动员ID
                info.athlete_draw_num = custom.athlete_draw_num;  // 签号
                info.unit = custom.athlete_team || '';          // 单位
                info.zone = custom.zone || '';                // 分区
            }
        } catch (e) {}
        
        // 以 participant ID 为键存储
        participantMap.set(p.id, info);
    });

    // 3. 从 bracket_match 表读取所有比赛
    const bracketMatches = await db.all(
        `SELECT bm.id, bm.number, bm.opponent1, bm.opponent2, bm.status
         FROM bracket_match bm
         WHERE bm.stage_id = ?`,
        [stageId]
    );

    // 4. 处理每场比赛
    for (const bm of bracketMatches) {
        let redAthleteId = null, redAthleteName = '', redDrawNum = null;
        let blueAthleteId = null, blueAthleteName = '', blueDrawNum = null;

        // 解析 opponent1（红方）
        try {
            if (bm.opponent1) {
                const opp1 = typeof bm.opponent1 === 'string' 
                    ? JSON.parse(bm.opponent1) 
                    : bm.opponent1;
                
                if (opp1 && opp1.id) {
                    // 通过 opponent.id 查询 participant
                    const info = participantMap.get(opp1.id);
                    if (info) {
                        redAthleteId = info.id;
                        redAthleteName = info.name;
                        redDrawNum = info.athlete_draw_num;
                    }
                }
            }
        } catch (e) {}

        // 解析 opponent2（蓝方）
        try {
            if (bm.opponent2) {
                const opp2 = typeof bm.opponent2 === 'string' 
                    ? JSON.parse(bm.opponent2) 
                    : bm.opponent2;
                
                if (opp2 && opp2.id) {
                    const info = participantMap.get(opp2.id);
                    if (info) {
                        blueAthleteId = info.id;
                        blueAthleteName = info.name;
                        blueDrawNum = info.athlete_draw_num;
                    }
                }
            }
        } catch (e) {}

        // 5. 写入业务表
        await db.run(
            `INSERT INTO jiu_jitsu_matchs
            (event_id, jiu_jitsu_match_categroy,
             jiu_jitsu_red_athlete_id, jiu_jitsu_red_athlete_name, 
             jiu_jitsu_red_athlete_draw_num,
             jiu_jitsu_blue_athlete_id, jiu_jitsu_blue_athlete_name,
             jiu_jitsu_blue_athlete_draw_num,
             jiu_jitsu_match_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [event_id, weightClass,
             redAthleteId, redAthleteName, redDrawNum,
             blueAthleteId, blueAthleteName, blueDrawNum,
             '未开始']
        );
    }
}
```

---

## 五、opponent 字段格式详解

### 5.1 基本格式

```json
// 单败淘汰赛、循环赛
{"id": 16}

// 包含位置信息（如果需要）
{"id": 16, "position": 5}

// 轮空（BYE）
{"id": null, "name": "BYE"}

// 带姓名（决赛等特殊场景）
{"id": null, "name": "上区第一"}
```

### 5.2 完整数据结构

```javascript
// bracket_participant 表
{
    id: 5,                                    // participant ID（主键）
    tournament_id: 1,                         // 赛事ID
    event_id: 1,                             // 业务系统赛事ID
    name: "张三",                             // 运动员姓名
    custom_data: {
        id: 123,                              // 运动员在 athletes 表中的ID
        athlete_draw_num: 1,                 // 签号
        athlete_team: "北京队",              // 单位
        zone: "upper"                         // 分区（上区/下区）
    }
}

// bracket_match 表
{
    id: 10,                                   // 比赛ID
    opponent1: '{"id": 5}',                  // 红方：participant ID 5
    opponent2: '{"id": 8}',                  // 蓝方：participant ID 8
    winner_id: 5,                            // 获胜者：participant ID 5
    status: "completed"                       // 比赛状态
}
```

---

## 六、查询示例

### 6.1 查询某个级别的所有参赛者

```sql
SELECT 
    bp.id AS participant_id,
    bp.name AS athlete_name,
    bp.custom_data,
    JSON_EXTRACT(bp.custom_data, '$.id') AS athlete_id,
    JSON_EXTRACT(bp.custom_data, '$.athlete_draw_num') AS draw_num,
    JSON_EXTRACT(bp.custom_data, '$.athlete_team') AS team
FROM bracket_participant bp
WHERE bp.tournament_id = 1
ORDER BY JSON_EXTRACT(bp.custom_data, '$.athlete_draw_num');
```

### 6.2 查询某场比赛的双方信息

```sql
SELECT 
    bm.id AS match_id,
    bm.number AS match_number,
    
    -- 解析 opponent1（红方）
    JSON_EXTRACT(bm.opponent1, '$.id') AS red_participant_id,
    rp1.name AS red_name,
    JSON_EXTRACT(rp1.custom_data, '$.athlete_draw_num') AS red_draw_num,
    JSON_EXTRACT(rp1.custom_data, '$.athlete_team') AS red_team,
    
    -- 解析 opponent2（蓝方）
    JSON_EXTRACT(bm.opponent2, '$.id') AS blue_participant_id,
    rp2.name AS blue_name,
    JSON_EXTRACT(rp2.custom_data, '$.athlete_draw_num') AS blue_draw_num,
    JSON_EXTRACT(rp2.custom_data, '$.athlete_team') AS blue_team,
    
    bm.winner_id,
    bm.status
FROM bracket_match bm
LEFT JOIN bracket_participant rp1 ON JSON_EXTRACT(bm.opponent1, '$.id') = rp1.id
LEFT JOIN bracket_participant rp2 ON JSON_EXTRACT(bm.opponent2, '$.id') = rp2.id
WHERE bm.stage_id = 1
ORDER BY bm.number;
```

### 6.3 查询某个级别的对阵图统计

```sql
SELECT 
    bs.name AS stage_name,
    COUNT(DISTINCT bp.id) AS participant_count,
    COUNT(bm.id) AS match_count,
    SUM(CASE WHEN bm.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS completed_matches
FROM bracket_stage bs
LEFT JOIN bracket_participant bp ON bp.tournament_id = bs.tournament_id
LEFT JOIN bracket_match bm ON bm.stage_id = bs.id
WHERE bs.event_id = 1
GROUP BY bs.id, bs.name;
```

---

## 七、总结

### 7.1 核心关联方式

1. **bracket_participant.id** 是核心关联键
2. **bracket_match.opponent1/opponent2** 中存储 `{id: participant_id}` 格式的 JSON
3. **bracket_participant.custom_data** 中存储业务系统的运动员详细信息

### 7.2 数据查询流程

```
1. 从 bracket_match 读取 opponent JSON
   ↓
2. JSON.parse() 解析出 participant_id
   ↓
3. 从 bracket_participant 查询完整信息
   ↓
4. JSON.parse() 解析 custom_data 获取运动员详细信息
   ↓
5. 写入业务表（jiu_jitsu_matchs / taekwondo_kyougi_matchs）
```

### 7.3 设计优势

1. **解耦**：bracket-manager 只关心 participant_id，不直接访问业务数据
2. **灵活性**：custom_data 可以存储任意业务相关的自定义字段
3. **可追溯性**：通过 participant_id 可以追溯到原始的 athletes 表数据
4. **扩展性**：如果要支持新字段，只需在 custom_data 中添加，无需修改表结构

这种设计既利用了 bracket-manager 的标准 API，又通过 custom_data 字段满足了业务系统的自定义需求，是一个灵活且可扩展的解决方案。

---

## 八、bracket-manager 与 bracket_participant 的关系

### 8.1 核心问题解答

**问题**：bracket-manager 是根据 bracket_participant 表中的数据来进行设置的吗？

**回答**：是的，但更准确地说，应该是 **bracket-manager 主动创建和管理 bracket_participant 表**，而不是被动读取。

### 8.2 bracket-manager 的工作流程

#### 8.2.1 创建阶段（Stage）

**代码位置**：[jiu-jitsu-bracket-helpers.js:555-590](file:///d:\vscode\arragment\Arrangement_web\routes\Jiu-Jitsu\jiu-jitsu-bracket-helpers.js#L555-L590)

```javascript
const stage = await manager.create.stage({
    tournamentId: Number(event_id),
    name: weightClass,
    type: 'single_elimination',
    seeding: cleanSeeding,  // 种子列表：['张三', '李四', '王五', '赵六']
    settings: {
        manualOrdering: [seedOrder],
    },
});
```

**当调用 `manager.create.stage()` 时，bracket-manager 会自动：**
1. 在 `bracket_stage` 表中创建一条记录
2. 在 `bracket_participant` 表中为每个种子创建一条记录
3. 在 `bracket_round` 表中创建轮次记录
4. 在 `bracket_match` 表中创建比赛场次记录

#### 8.2.2 bracket_participant 表的自动创建

**bracket-manager 内部流程**：
```
调用 manager.create.stage()
    ↓
bracket-manager 创建 bracket_stage 记录
    ↓
bracket-manager 为 seeding 数组中的每个元素创建 bracket_participant 记录
    ↓
bracket-manager 创建 bracket_round 和 bracket_match 记录
    ↓
bracket-manager 建立 opponent 关联（通过 participant ID）
```

#### 8.2.3 我们对 bracket_participant 的补充操作

虽然 bracket-manager 会自动创建 `bracket_participant` 记录，但这些记录只有基本信息（主要是 `name`）。我们需要额外补充业务数据：

**代码位置**：[jiu-jitsu-bracket-helpers.js:630-641](file:///d:\vscode\arragment\Arrangement_web\routes\Jiu-Jitsu\jiu-jitsu-bracket-helpers.js#L630-L641)

```javascript
for (let i = 0; i < cleanSeeding.length; i++) {
    const bracketName = cleanSeeding[i];
    if (!bracketName) continue;
    
    await db.run(
        'UPDATE bracket_participant SET custom_data = ? WHERE name = ?',
        [JSON.stringify({
            id: athlete.id,
            athlete_draw_num: athlete.athlete_draw_num,
            athlete_team: athlete.athlete_team
        }), bracketName]
    );
}
```

### 8.3 关键代码示例

#### 示例1：创建单败淘汰赛

```javascript
// 准备种子列表
const cleanSeeding = ['张三', '李四', '王五', '赵六'];

// bracket-manager 自动创建所有表
const stage = await manager.create.stage({
    tournamentId: 1,
    name: '70kg',
    type: 'single_elimination',
    seeding: cleanSeeding,
    settings: { manualOrdering: [[1, 4, 3, 2]] },
});

// bracket-manager 已自动创建：
// - bracket_stage: 1条记录
// - bracket_participant: 4条记录（张三、李四、王五、赵六）
// - bracket_round: 3条记录（Final、1/2、1/4）
// - bracket_match: 4条记录（第一轮2场、半决赛1场、决赛1场）
```

#### 示例2：查询并更新 bracket_participant

```javascript
// 查询 bracket-manager 创建的 participant
const participantList = await db.all(
    'SELECT id, name FROM bracket_participant WHERE tournament_id = ?',
    [Number(event_id)]
);

// 更新 custom_data（补充业务数据）
for (const p of participantList) {
    const athlete = athletes.find(a => a.athlete_name === p.name);
    if (athlete) {
        await db.run(
            'UPDATE bracket_participant SET custom_data = ? WHERE id = ?',
            [JSON.stringify({
                id: athlete.id,
                athlete_draw_num: athlete.athlete_draw_num,
                athlete_team: athlete.athlete_team
            }), p.id]
        );
    }
}
```

### 8.4 总结

| 问题 | 回答 |
|------|------|
| **bracket-manager 是否使用 bracket_participant 表？** | **是** |
| **谁创建 bracket_participant 表？** | **bracket-manager 自动创建** |
| **什么时候创建？** | **调用 `manager.create.stage()` 时** |
| **我们需要做什么？** | **补充更新 custom_data 字段** |
| **数据流向** | **athletes → bracket_participant → bracket_match** |

**核心关系**：
1. **bracket-manager** 是"管理者"，负责创建和管理所有 bracket 相关表
2. **bracket_participant** 是 bracket-manager 使用的数据表之一
3. **我们的业务系统**负责向 bracket_participant 补充业务数据（通过 custom_data 字段）
4. **bracket_match** 通过 opponent1/opponent2 字段引用 bracket_participant.id

所以正确的说法是：**bracket-manager 根据传入的 seeding 数据创建 bracket_participant 记录，然后根据这些记录设置对阵图结构**。

---

## 九、bracket_stage 表的辅助字段说明

### 9.1 number 字段

#### 9.1.1 字段定义

**数据库定义**（`database.js` 第 347-358 行）：

```sql
CREATE TABLE bracket_stage (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tournament_id INT NOT NULL DEFAULT 1,
    event_id INT DEFAULT NULL,
    category_id INT DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    number INT NOT NULL,           -- ← 这个字段
    settings TEXT DEFAULT NULL,
    seeding TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### 9.1.2 字段含义

**`number` 字段表示同一赛事（`tournament_id`）中的第几个阶段（Stage）编号**，由 bracket-manager 库自动生成。

#### 9.1.3 场景示例

假设一个级别（如"70kg"）的比赛流程如下：

| 赛制类型 | Stage 名称 | number 值 | 说明 |
|---------|----------|----------|------|
| **分区循环赛** | 70kg_上区 | 1 | 第一个阶段 |
| **分区循环赛** | 70kg_下区 | 2 | 第二个阶段 |
| **分区循环赛** | 70kg_决赛 | 3 | 第三个阶段 |
| **单败淘汰赛** | 70kg | 4 | 第四个阶段 |

#### 9.1.4 为什么需要 number 字段？

1. **排序显示**：对阵图界面需要按照正确的顺序展示多个阶段
2. **区分阶段**：当一个级别有多个阶段时（如分区循环赛的上区、下区、决赛），需要通过 `number` 排序
3. **bracket-manager 自动管理**：这个字段由 bracket-manager 库自动生成，**我们不需要手动设置**

### 9.2 seeding 字段

#### 9.2.1 字段定义

**数据库定义**（`database.js` 第 347-358 行）：

```sql
CREATE TABLE bracket_stage (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tournament_id INT NOT NULL DEFAULT 1,
    event_id INT DEFAULT NULL,
    category_id INT DEFAULT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    number INT NOT NULL,
    settings TEXT DEFAULT NULL,
    seeding TEXT DEFAULT NULL,           -- ← 这个字段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### 9.2.2 字段含义

**`seeding` 字段存储该对阵图阶段的原始种子列表（运动员姓名数组）**，数据类型为 JSON 字符串。

#### 9.2.3 为什么是空的？（重要说明）

**`bracket_stage.seeding` 字段为空是正常现象**，原因如下：

**使用的库版本**：`brackets-manager@^1.9.1`

根据 `bracket-manager` 库的设计：

```javascript
// 当我们调用这个时：
const stage = await manager.create.stage({
    tournamentId: Number(event_id),
    name: weightClass,
    type: 'single_elimination',
    seeding: cleanSeeding,  // ← 我们传入了这个参数
    settings: {...}
});

// bracket-manager 会：
// 1. ✅ 创建 bracket_stage 记录（但 seeding 字段不会被存储）
// 2. ✅ 创建 bracket_participant 记录（存储所有参赛者）
// 3. ✅ 创建 bracket_round 记录
// 4. ✅ 创建 bracket_match 记录
// ❌ 不会存储 seeding 到 bracket_stage.seeding 字段
```

#### 9.2.4 bracket-manager 的设计理念

`seeding` 参数被视为"**一次性输入**"，主要用于：
- 在内存中生成对阵图结构
- 创建 `bracket_participant` 记录
- 生成比赛配对

**一旦对阵图生成完毕，`seeding` 就完成了它的使命**，不需要持久化到数据库。

#### 9.2.5 为什么 bracket_participant 更重要

```sql
-- ✅ bracket_participant 表存储了所有参赛者信息（这是实际使用的数据）
SELECT id, name, custom_data FROM bracket_participant WHERE tournament_id = 1;

-- ❌ bracket_stage.seeding 字段为空（这个字段没什么实际用途）
SELECT id, name, seeding FROM bracket_stage WHERE tournament_id = 1;
```

### 9.3 实际存储结构对比

| 存储位置 | 数据 | 说明 |
|---------|------|------|
| **bracket_stage.seeding** | ❌ 空 | 由 bracket-manager 管理，但**不存储** |
| **bracket_participant** | ✅ 完整 | 存储所有参赛者（姓名、ID、custom_data） |
| **bracket_match.opponent1/opponent2** | ✅ 完整 | 通过 participant ID 关联参赛者 |

### 9.4 如何重建 Seeding 数据

如果确实需要 `seeding` 数据（运动员姓名数组），可以从 `bracket_participant` 表重建：

```javascript
// 从数据库重建 seeding 列表
const participants = await db.all(
    'SELECT name FROM bracket_participant WHERE tournament_id = ? ORDER BY id',
    [event_id]
);

const seeding = participants.map(p => p.name);
// 结果：["张三", "李四", "王五", "赵六"]
```

### 9.5 总结

| 问题 | 回答 |
|------|------|
| **number 字段是什么？** | 同一赛事中的第几个阶段编号 |
| **number 字段由谁管理？** | **bracket-manager 自动生成** |
| **seeding 字段是什么？** | 运动员姓名数组 |
| **seeding 字段为什么为空？** | **这是正常现象，bracket-manager 不存储此字段** |
| **需要担心吗？** | ❌ **不需要**，参赛者数据存储在 `bracket_participant` 表中 |
| **数据是否丢失？** | ❌ **没有丢失**，所有参赛者信息都在 `bracket_participant` 表中 |

**简单理解**：
- `number` 字段用于排序，由 bracket-manager 自动管理
- `seeding` 字段只是生成对阵图时的"原料"，生成后就用不到了，真正的数据都在 `bracket_participant` 表中
- 我们可以完全忽略这两个字段，只需要关注 `bracket_participant` 和 `bracket_match` 表即可