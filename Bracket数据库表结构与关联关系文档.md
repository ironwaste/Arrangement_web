# Bracket 数据库表结构与关联关系

## 一、表概览

Bracket 系统包含以下核心表：

| 表名 | 作用 | 层级 |
|------|------|------|
| `bracket_stage` | 对阵图阶段（核心表） | Level 1 |
| `bracket_group` | 分组（如上区、下区） | Level 2 |
| `bracket_round` | 轮次（如 R1、Final） | Level 2 |
| `bracket_match` | 比赛场次 | Level 3 |
| `bracket_match_game` | 比赛局数（比分） | Level 4 |
| `bracket_participant` | 参赛者（运动员） | 独立表 |

---

## 二、层级关系图

```
bracket_stage (对阵图阶段)
    │
    ├── bracket_group (分组)
    │       │
    │       └── 一个 stage 可以有 1-N 个 group
    │
    ├── bracket_round (轮次)
    │       │
    │       └── 一个 stage 可以有 1-N 个 round
    │
    ├── bracket_match (比赛场次)
    │       │
    │       ├── 一个 stage 可以有 1-N 个 match
    │       ├── 一个 round 可以有 1-N 个 match
    │       └── 一个 group 可以有 1-N 个 match
    │
    └── bracket_participant (参赛者)
            │
            └── 通过 tournament_id 关联到 stage
```

---

## 三、详细表结构

### 3.1 bracket_stage（对阵图阶段）

**位置**：`database.js` 第 347-360 行

```sql
CREATE TABLE bracket_stage (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，stage 唯一标识
    tournament_id INT NOT NULL DEFAULT 1,        -- 关联到 events.event_id
    event_id INT DEFAULT NULL,                   -- 赛事ID（业务系统使用）
    category_id VARCHAR(100) DEFAULT NULL,       -- 级别名称（如 "70kg"）
    mode_category_id INT DEFAULT NULL,           -- 模式类别ID（关联 category_mode 表）
    name VARCHAR(255) NOT NULL,                   -- stage 名称（如 "70kg"、"70kg_分区循环赛"）
    type VARCHAR(50) NOT NULL,                   -- 赛制类型：
                                                 --   - single_elimination (单败淘汰)
                                                 --   - double_elimination (双败淘汰)
                                                 --   - round_robin (循环赛)
    number INT NOT NULL,                         -- stage 序号
    settings TEXT DEFAULT NULL,                  -- 额外设置（JSON 格式）
    seeding TEXT DEFAULT NULL,                   -- 种子列表（JSON 格式）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP -- 创建时间
)
```

**关联字段**：
- `tournament_id` → `events.event_id`（赛事ID）
- `event_id` → 业务系统使用
- `category_id` → 级别名称
- `mode_category_id` → `category_mode.id`

---

### 3.2 bracket_group（分组）

**位置**：`database.js` 第 398-405 行

```sql
CREATE TABLE bracket_group (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，group 唯一标识
    stage_id INT NOT NULL,                      -- 所属 stage ID（外键）
    name VARCHAR(255) NOT NULL DEFAULT '',      -- 分组名称（如 "上区"、"下区"）
    number INT NOT NULL                         -- 分组序号（如 1、2）
)
```

**关联关系**：
```
bracket_stage (1)
    ↓
bracket_group (N)
```

- 一个 stage 可以有 1-N 个 group
- 主要用于分区循环赛（如上区、下区）
- 单败淘汰赛通常只有 1 个 group

---

### 3.3 bracket_round（轮次）

**位置**：`database.js` 第 410-419 行

```sql
CREATE TABLE bracket_round (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，round 唯一标识
    stage_id INT NOT NULL,                      -- 所属 stage ID（外键）
    group_id INT DEFAULT NULL,                  -- 所属 group ID（外键，可选）
    name VARCHAR(255) NOT NULL,                 -- 轮次名称（如 "Final"、"R1"、"1/2"）
    number INT NOT NULL                         -- 轮次序号（从 1 开始）
)
```

**关联关系**：
```
bracket_stage (1)
    │
    ├── bracket_round (N)
    │       │
    │       └── 一个 stage 可以有 1-N 个 round
    │
    └── bracket_group (N)
            │
            └── 一个 group 可以有 1-N 个 round
```

**轮次名称示例**：
- 单败淘汰赛：`Final`、`1/2`、`1/4`、`1/8`
- 双败淘汰赛胜者组：`D.Final`、`1/2`、`1/4`
- 双败淘汰赛败者组：`Rep.1`、`Rep.2`、`D.Final`
- 循环赛：`R1`、`R2`、`R3`

---

### 3.4 bracket_match（比赛场次）

**位置**：`database.js` 第 424-442 行

```sql
CREATE TABLE bracket_match (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，match 唯一标识
    stage_id INT NOT NULL,                      -- 所属 stage ID（外键）
    round_id INT DEFAULT NULL,                  -- 所属 round ID（外键，可选）
    group_id INT DEFAULT NULL,                  -- 所属 group ID（外键，可选）
    event_id INT DEFAULT NULL,                  -- 赛事ID（业务系统使用）
    category_id VARCHAR(100) DEFAULT NULL,       -- 级别名称（业务系统使用）
    number INT NOT NULL,                        -- 比赛场次序号
    child_count INT NOT NULL DEFAULT 0,         -- 子比赛数量（如 BO3 的 3）
    opponent1 TEXT DEFAULT NULL,                -- 红方对手信息（JSON 格式）
    opponent2 TEXT DEFAULT NULL,                 -- 蓝方对手信息（JSON 格式）
    winner_id INT DEFAULT NULL,                 -- 获胜者 ID（关联到 participant.id）
    status VARCHAR(50) DEFAULT 'pending',       -- 比赛状态：
                                                --   - pending (待开始)
                                                --   - running (进行中)
                                                --   - completed (已完成)
                                                --   - bye (轮空)
    next_match_id INT DEFAULT NULL              -- 下一场比赛 ID（晋级用）
)
```

**关联关系**：
```
bracket_stage (1)
    │
    ├── bracket_round (N)
    │       │
    │       └── bracket_match (N)
    │
    └── bracket_group (N)
            │
            └── bracket_match (N)
```

**opponent 字段格式**：
```json
// 当前代码中的格式
{"id": 16}

// 完整格式（包含 position）
{"id": 16, "position": 5, "name": "张三"}

// 轮空格式
{"id": null, "name": "BYE"}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT | 参赛者ID（关联 `bracket_participant.id`） |
| `position` | INT | 种子位置编号（签号） |
| `name` | VARCHAR | 参赛者姓名 |

---

### 3.5 bracket_match_game（比赛局数）

**位置**：`database.js` 第 462-472 行

```sql
CREATE TABLE bracket_match_game (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，game 唯一标识
    stage_id INT DEFAULT NULL,                  -- 所属 stage ID
    parent_id INT DEFAULT NULL,                 -- 父比赛场次 ID（关联 bracket_match.id）
    match_id INT DEFAULT NULL,                  -- 关联的 match ID（外键）
    number INT NOT NULL,                       -- 局号（如 1、2、3）
    opponent1_score INT DEFAULT NULL,          -- 红方得分
    opponent2_score INT DEFAULT NULL            -- 蓝方得分
)
```

**关联关系**：
```
bracket_match (1)
    │
    └── bracket_match_game (N)
            │
            └── 一场比赛可以有 1-N 局（BO1、BO3、BO5 等）
```

**使用场景**：
- BO1（Best of 1）：1 局
- BO3（Best of 3）：最多 3 局
- BO5（Best of 5）：最多 5 局

---

### 3.6 bracket_participant（参赛者）

**位置**：`database.js` 第 336-344 行

```sql
CREATE TABLE bracket_participant (
    id INT PRIMARY KEY AUTO_INCREMENT,           -- 主键，participant 唯一标识
    tournament_id INT NOT NULL DEFAULT 1,        -- 关联到 events.event_id
    event_id INT DEFAULT NULL,                   -- 赛事ID（业务系统使用）
    category_id VARCHAR(100) DEFAULT NULL,        -- 级别名称（业务系统使用）
    name VARCHAR(255) NOT NULL,                  -- 参赛者姓名
    custom_data TEXT DEFAULT NULL                -- 自定义数据（JSON 格式）
)
```

**custom_data 字段格式**：
```json
{
    "id": 123,                         // 运动员ID（关联 athletes.id）
    "athlete_draw_num": 5,            // 签号
    "athlete_team": "北京队",         // 单位/队伍
    "zone": "upper"                    // 分区（上区/下区）
}
```

---

## 四、数据关联图

### 4.1 完整关联关系

```
events (赛事表)
    │
    ├── tournament_id → bracket_stage.tournament_id
    │
    └── event_id → bracket_stage.event_id
            │
            ├── bracket_participant.event_id
            │       │
            │       └── bracket_participant.tournament_id
            │
            ├── bracket_stage (对阵图阶段)
            │       │
            │       ├── bracket_stage.mode_category_id → category_mode.id
            │       │
            │       ├── bracket_group (分组)
            │       │       │
            │       │       └── 一个 stage 有 N 个 group
            │       │
            │       ├── bracket_round (轮次)
            │       │       │
            │       │       ├── 一个 stage 有 N 个 round
            │       │       └── 一个 group 有 N 个 round
            │       │
            │       └── bracket_match (比赛场次)
            │               │
            │               ├── 一个 stage 有 N 个 match
            │               ├── 一个 round 有 N 个 match
            │               ├── 一个 group 有 N 个 match
            │               │
            │               ├── match.opponent1 → bracket_participant.id
            │               ├── match.opponent2 → bracket_participant.id
            │               ├── match.winner_id → bracket_participant.id
            │               │
            │               └── bracket_match_game (比赛局数)
            │                       │
            │                       └── 一个 match 有 N 个 game
            │
            └── 业务表
                    │
                    ├── taekwondo_kyougi_matchs (跆拳道比赛记录)
                    │       └── kyougi_bracket_match_id → bracket_match.id
                    │
                    └── jiu_jitsu_matchs (柔术比赛记录)
                            └── jiu_jitsu_bracket_match_id → bracket_match.id
```

### 4.2 业务表关联

```
bracket_match (核心表)
    │
    ├── match.winner_id → bracket_participant.id
    ├── match.opponent1 → bracket_participant.id
    ├── match.opponent2 → bracket_participant.id
    │
    └── match.id → 业务表
            │
            ├── taekwondo_kyougi_matchs.kyougi_bracket_match_id
            │
            └── jiu_jitsu_matchs.jiu_jitsu_bracket_match_id
```

---

## 五、数据流向

### 5.1 生成对阵图流程

```
1. 准备数据
   athletes 表（运动员信息）
       ↓
2. 创建 participant
   bracket_participant（参赛者）
       ↓
3. 创建 stage
   bracket_stage（对阵图阶段）
       ↓
4. 创建 group（可选）
   bracket_group（分组）
       ↓
5. 创建 round
   bracket_round（轮次）
       ↓
6. 创建 match
   bracket_match（比赛场次）
       │
       ├── opponent1（红方）
       └── opponent2（蓝方）
       ↓
7. 创建 game（可选）
   bracket_match_game（比赛局数）
```

### 5.2 更新比赛结果流程

```
1. 输入比赛结果
   match.opponent1_score / opponent2_score
       ↓
2. 更新 match_game
   bracket_match_game
       ↓
3. 确定获胜者
   match.winner_id → bracket_participant.id
       ↓
4. 更新 match status
   match.status = 'completed'
       ↓
5. 晋级到下一场
   next_match.opponent1 / opponent2 → winner_id
```

### 5.3 同步到业务表流程

```
1. 从 bracket 表查询数据
   bracket_stage → bracket_match → bracket_participant
       ↓
2. 解析 opponent 信息
   opponent1 / opponent2 → participant.id
       ↓
3. 提取业务数据
   从 custom_data 提取签号、单位等信息
       ↓
4. 写入业务表
   taekwondo_kyougi_matchs / jiu_jitsu_matchs
```

---

## 六、常见查询示例

### 6.1 查询某个级别的所有对阵图

```sql
SELECT 
    bs.id AS stage_id,
    bs.name AS stage_name,
    bs.type AS stage_type,
    COUNT(DISTINCT bm.id) AS match_count,
    COUNT(DISTINCT br.id) AS round_count
FROM bracket_stage bs
LEFT JOIN bracket_match bm ON bm.stage_id = bs.id
LEFT JOIN bracket_round br ON br.stage_id = bs.id
WHERE bs.event_id = 1 AND bs.category_id = '70kg'
GROUP BY bs.id, bs.name, bs.type;
```

### 6.2 查询某个级别的所有比赛场次

```sql
SELECT 
    bm.id AS match_id,
    bm.number AS match_number,
    bm.status AS match_status,
    br.name AS round_name,
    p1.name AS red_athlete,
    p2.name AS blue_athlete,
    p1.custom_data AS red_custom,
    p2.custom_data AS blue_custom
FROM bracket_match bm
LEFT JOIN bracket_round br ON br.id = bm.round_id
LEFT JOIN bracket_participant p1 ON JSON_EXTRACT(bm.opponent1, '$.id') = p1.id
LEFT JOIN bracket_participant p2 ON JSON_EXTRACT(bm.opponent2, '$.id') = p2.id
WHERE bm.event_id = 1 AND bm.category_id = '70kg'
ORDER BY br.number, bm.number;
```

### 6.3 查询某个级别的所有参赛者

```sql
SELECT 
    bp.id,
    bp.name,
    bp.custom_data,
    JSON_EXTRACT(bp.custom_data, '$.athlete_draw_num') AS draw_num,
    JSON_EXTRACT(bp.custom_data, '$.athlete_team') AS team
FROM bracket_participant bp
WHERE bp.event_id = 1 AND bp.category_id = '70kg'
ORDER BY JSON_EXTRACT(bp.custom_data, '$.athlete_draw_num');
```

### 6.4 查询某个级别的分区信息

```sql
SELECT 
    bg.id AS group_id,
    bg.name AS group_name,
    bg.number AS group_number,
    COUNT(bm.id) AS match_count
FROM bracket_group bg
LEFT JOIN bracket_match bm ON bm.group_id = bg.id
WHERE bg.stage_id = 1
GROUP BY bg.id, bg.name, bg.number
ORDER BY bg.number;
```

---

## 七、赛制类型与表结构对应

### 7.1 单败淘汰赛 (single_elimination)

```
bracket_stage
    │
    ├── bracket_group (1个)
    │       │
    │       └── bracket_round (N个: Final, 1/2, 1/4, ...)
    │               │
    │               └── bracket_match (每轮比赛数量递减)
    │
    └── bracket_participant (N个)
```

**示例**（8人）：
- Round 1 (1/8): 4 场比赛
- Round 2 (1/4): 2 场比赛
- Round 3 (1/2): 1 场比赛
- Round 4 (Final): 1 场比赛

---

### 7.2 双败淘汰赛 (double_elimination)

```
bracket_stage
    │
    ├── bracket_group (2个: 胜者组、败者组)
    │       │
    │       ├── 胜者组 bracket_round
    │       │       └── bracket_match
    │       │
    │       └── 败者组 bracket_round
    │               └── bracket_match
    │
    └── bracket_participant (N个)
```

**特点**：
- 胜者组和败者组分别有各自的 round 和 match
- 最后有 Grand Final（总决赛）

---

### 7.3 单循环赛 (round_robin)

```
bracket_stage
    │
    ├── bracket_group (1个)
    │       │
    │       └── bracket_round (N个: R1, R2, R3, ...)
    │               │
    │               └── bracket_match (每轮比赛数量固定)
    │
    └── bracket_participant (N个)
```

**示例**（4人）：
- R1: 2 场比赛（两两对决）
- R2: 2 场比赛
- R3: 2 场比赛
- 总计: 6 场比赛

---

### 7.4 分区循环赛 (pool_elimination)

```
bracket_stage (分区循环赛)
    │
    ├── bracket_group (2个: 上区、下区)
    │       │
    │       ├── 上区 bracket_round
    │       │       └── bracket_match (上区内循环)
    │       │
    │       └── 下区 bracket_round
    │               └── bracket_match (下区内循环)
    │
    ├── bracket_participant (N个)
    │
    └── bracket_stage (决赛)
            │
            └── bracket_match (上区第一 vs 下区第一)
```

**特点**：
- 上区和下区分别进行循环赛
- 各组第一名进入决赛

---

## 八、外键约束

### 8.1 bracket_stage（主表）

```sql
-- 无外键约束（顶级表）
```

### 8.2 bracket_group

```sql
FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE
-- 删除 stage 时，级联删除所有 group
```

### 8.3 bracket_round

```sql
FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE
FOREIGN KEY (group_id) REFERENCES bracket_group(id)
-- 删除 stage 时，级联删除所有 round
```

### 8.4 bracket_match

```sql
FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE
FOREIGN KEY (round_id) REFERENCES bracket_round(id)
FOREIGN KEY (group_id) REFERENCES bracket_group(id)
FOREIGN KEY (next_match_id) REFERENCES bracket_match(id)
-- 删除 stage 时，级联删除所有 match
```

### 8.5 bracket_match_game

```sql
FOREIGN KEY (match_id) REFERENCES bracket_match(id) ON DELETE CASCADE
-- 删除 match 时，级联删除所有 game
```

### 8.6 bracket_participant

```sql
-- 无外键约束（独立表）
-- 通过 tournament_id 和 name 与其他表关联
```

---

## 九、索引

| 表名 | 索引名称 | 字段 | 用途 |
|------|---------|------|------|
| `bracket_stage` | `idx_stage_event` | `event_id` | 按赛事查询对阵图 |
| `bracket_group` | `idx_group_stage` | `stage_id` | 按 stage 查询分组 |
| `bracket_round` | `idx_round_stage` | `stage_id` | 按 stage 查询轮次 |
| `bracket_match` | `idx_match_stage` | `stage_id` | 按 stage 查询比赛 |
| `bracket_match` | `idx_match_round` | `round_id` | 按 round 查询比赛 |
| `bracket_match` | `idx_match_group` | `group_id` | 按 group 查询比赛 |
| `bracket_match` | `idx_match_next` | `next_match_id` | 查找下一场比赛 |
| `bracket_match_game` | `idx_match_game_match` | `match_id` | 按 match 查询局数 |
| `bracket_participant` | - | - | 无索引（依赖 tournament_id） |

---

## 十、总结

Bracket 系统的表结构设计遵循以下原则：

1. **层级清晰**：`stage → group/round → match → game` 四层结构
2. **业务分离**：bracket 表与业务表通过 `bracket_match_id` 关联
3. **灵活扩展**：通过 `custom_data` 字段支持自定义数据
4. **级联删除**：删除上级记录时自动删除下级记录
5. **多种赛制**：支持单败、双败、循环等多种赛制

这种设计既利用了 bracket-manager 的算法能力，又满足了业务系统的自定义需求。