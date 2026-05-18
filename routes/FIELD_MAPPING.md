# 数据库字段名对照表 - autoScheduler.js

## 📊 athletes 表完整字段定义（来自 database.js:145-158）

| 序号 | 字段名 | 类型 | 说明 |
|------|--------|------|------|
| 1 | `id` | INT PRIMARY KEY AUTO_INCREMENT | 主键ID |
| 2 | `event_id` | INT | 赛事编号 |
| 3 | `athlete_id` | VARCHAR(100) | 运动员编号 |
| 4 | `athlete_name` | VARCHAR(255) | 运动员姓名 |
| 5 | `athlete_gender` | VARCHAR(10) | 性别 |
| 6 | `athlete_team` | VARCHAR(255) | 代表队 |
| 7 | `athlete_draw_num` | INT | 抽签号 ⭐ |
| 8 | `athlete_pre_draw_num` | INT | 上次抽签号 |
| 9 | `athlete_age_group` | VARCHAR(100) | 组别 |
| 10 | `athlete_category` | VARCHAR(255) | 级别 |
| 11 | `athlete_rank` | INT | 排名 |
| 12 | `same_team` | INT | 同队标志 |
| 13 | `athlete_type` | VARCHAR(20) | 运动员类型 |
| 14 | `created_at` | DATETIME | 创建时间 |

---

## 🔍 autoScheduler.js 字段使用情况

### ✅ 已正确使用的字段（12处）

#### 1️⃣ **cleanSeeding 生成阶段**（第87-123行）

| 行号 | 代码 | 字段名 | 状态 |
|------|------|--------|------|
| 102 | `a.athlete_name` | athlete_name | ✅ 正确 |
| 114 | `a.athlete_name` | athlete_name | ✅ 正确 |
| 119 | `a.athlete_team` | athlete_team | ✅ 正确 |

**用途**：生成去重后的种子名单

---

#### 2️⃣ **Round Robin 循环赛分支**（第168-171行）

| 行号 | 代码 | 字段名 | 状态 | 说明 |
|------|------|--------|------|------|
| 170 | `athlete.id` | id | ✅ 正确 | 主键ID |
| 171 | `athlete.athlete_draw_num` | athlete_draw_num | ✅ 正确 | 抽签号 |

**用途**：更新 bracket_participant.custom_data JSON

---

#### 3️⃣ **Divisional 分组循环赛分支（≤2人）**（第205-207行）

| 行号 | 代码 | 字段名 | 状态 | 说明 |
|------|------|--------|------|------|
| 206 | `athlete.id` | id | ✅ 正确 | 主键ID |
| 207 | `athlete.athlete_draw_num` | athlete_draw_num | ✅ 正确 | 抽签号 |

**用途**：更新 bracket_participant.custom_data JSON

---

#### 4️⃣ **Divisional 分组循环赛分支（>2人）**（第251-254行）

| 行号 | 代码 | 字段名 | 状态 | 说明 |
|------|------|--------|------|------|
| 252 | `athlete.id` | id | ✅ 正确 | 主键ID |
| 253 | `athlete.athlete_draw_num` | athlete_draw_num | ✅ 正确 | 抽签号 |

**用途**：更新 bracket_participant.custom_data JSON（含 zone 信息）

---

#### 5️⃣ **Single Elimination 淘汰赛分支**（第318-321行）

| 行号 | 代码 | 字段名 | 状态 | 说明 |
|------|------|--------|------|------|
| 319 | `athlete.id` | id | ✅ 正确 | 主键ID |
| 320 | `athlete.athlete_draw_num` | athlete_draw_num | ✅ 正确 | 抽签号 |
| 321 | `athlete.athlete_draw_num` | athlete_draw_num | ✅ 正确 | 种子号 |

**用途**：更新 bracket_participant.custom_data JSON

---

## 📋 custom_data JSON 结构说明

### 当前结构（已修复）
```json
{
  "athlete_id": <number|null>,        // 对应 athletes.id（主键）
  "draw_num": <number>,               // 对应 athletes.athlete_draw_num
  "seed_no": <number>,                // 对应 athletes.athlete_draw_num（仅淘汰赛）
  "zone": "upper"|"lower"             // 仅分组循环赛
}
```

### 字段对应关系
| JSON 字段 | 来源字段 | 数据库字段名 | 类型 |
|-----------|---------|-------------|------|
| `athlete_id` | `athletes[i].id` | `id` | INT (主键) |
| `draw_num` | `athletes[i].athlete_draw_num` | `athlete_draw_num` | INT |
| `seed_no` | `athletes[i].athlete_draw_num` | `athlete_draw_num` | INT |
| `zone` | 计算得出 | N/A | STRING |

---

## 🎯 修复历史记录

### ❌ 2026-01-17 修复的问题

**问题**：原代码使用错误的字段名 `draw_no`

**错误代码示例**：
```javascript
// ❌ 修复前
draw_num: athletes[i]?.draw_no ?? (i + 1)

// ✅ 修复后
const athlete = athletes[i] || {};
draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
```

**影响范围**：
- [autoScheduler.js:171](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/routes/autoScheduler.js#L171) - Round Robin 分支
- [autoScheduler.js:207](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/routes/autoScheduler.js#L207) - Divisional (≤2人)
- [autoScheduler.js:253](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/routes/autoScheduler.js#L253) - Divisional (>2人)

---

## ✅ 验证清单

- [x] 所有字段名与数据库 schema 一致
- [x] 使用安全的空值检查模式 (`!= null`)
- [x] 使用防御性编程 (`|| {}`)
- [x] 无 undefined 值传入 SQL 绑定参数
- [x] custom_data JSON 结构清晰明确

---

## 📚 相关文件位置

1. **数据库定义**: [database.js:145-158](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/database.js#L145-L158)
2. **调用入口**: [events.js:1697-1702](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/routes/events.js#L1697-L1702)
3. **自动编排模块**: [autoScheduler.js](file:///d:\bieren\V1\mysql-version\TaekwondoManager_v1_test/routes/autoScheduler.js)

---

**最后更新时间**: 2026-05-17
**状态**: ✅ 所有问题已修复，字段名完全一致
