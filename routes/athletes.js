/**
 * 运动员管理路由，包含运动员CRUD、批量导入、抽签、级别查询等
 */
const express = require('express');
const router = express.Router();
const {
  deleteKyougiMatchsByClass
} = require('./kyougiMatchHelpers');

async function checkColumnExists(db, tableName, columnName) {
  try {
    const result = await db.get(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [tableName, columnName]
    );
    return result && result.count > 0;
  } catch (err) {
    console.error(`[检查字段] 检查 ${tableName}.${columnName} 失败:`, err.message);
    return false;
  }
}

module.exports = (db) => {
  /** 查找或创建品势组别 */
  async function findOrCreatePoomsaeGroup(eventId, groupName, type, gender, groupClass, beltLevel) {
    const existingGroup = await db.get(
      'SELECT id FROM poomsae_groups WHERE event_id = ? AND name = ? AND type = ? AND gender = ? AND age_group = ? AND form_name = ?',
      [eventId, groupName, type, gender, groupClass, beltLevel]
    );
    if (existingGroup) return existingGroup.id;

    const groupResult = await db.run(
      `INSERT INTO poomsae_groups (event_id, name, type, age_group, gender, form_name, status)
       VALUES (?, ?, ?, ?, ?, ?, '未开始')`,
      [eventId, groupName, type, groupClass, gender, beltLevel]
    );
    return groupResult.id;
  }

  /* ==================== 运动员 CRUD ==================== */
  router.get('/athletes', async (req, res) => {
    try {
      const { weight_class, unit, gender, event_id, category_id, athlete_type } = req.query;
      let sql = 'SELECT * FROM athletes WHERE 1=1';
      const params = [];

      if (event_id) { 
        sql += ' AND event_id = ?'; 
        params.push(event_id); 
        
        const event = await db.get('SELECT event_type FROM events WHERE event_id = ?', [event_id]);
        if (event) {
          if (event.event_type === 'taekwondo_poomsae') {
            res.json({ success: true, data: [] });
            return;
          }
        }
      }

      if (athlete_type) {
        console.log(`[运动员查询] athlete_type: ${athlete_type}`);
      }

      let weightClassValue = weight_class;
      if (category_id && !weightClassValue) {
        const categoryRow = await db.get(
          'SELECT weight_class FROM category_mode WHERE category_id = ?',
          [category_id]
        );
        if (categoryRow && categoryRow.weight_class) {
          weightClassValue = categoryRow.weight_class;
        }
      }

      if (weightClassValue) { sql += ' AND athlete_category = ?'; params.push(weightClassValue); }
      if (unit) { sql += ' AND athlete_team LIKE ?'; params.push(`%${unit}%`); }
      if (gender) { sql += ' AND athlete_gender = ?'; params.push(gender); }

      sql += ' ORDER BY CAST(athlete_id AS UNSIGNED), athlete_id';

      const athletes = await db.all(sql, params);
      res.json({ success: true, data: athletes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/athletes', async (req, res) => {
    try {
      const { athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group, athlete_category, athlete_draw_num, athlete_pre_draw_num, event_id, belt_level } = req.body;

      if (athlete_id) {
        const existing = await db.get('SELECT id FROM athletes WHERE athlete_id = ? AND event_id = ?', [athlete_id, event_id]);
        if (existing) {
          return res.status(400).json({ success: false, error: '运动员号重复，请更换' });
        }
      }

      let event_type = null;
      if (event_id) {
        const event = await db.get('SELECT event_type FROM events WHERE event_id = ?', [event_id]);
        if (event) {
          event_type = event.event_type;
        }
      }

      const hasBeltLevel = await checkColumnExists(db, 'athletes', 'belt_level');
      
      let result;
      if (hasBeltLevel) {
        result = await db.run(
          `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group, athlete_category, athlete_draw_num, athlete_pre_draw_num, event_id, belt_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group || null, athlete_category, athlete_draw_num || null, athlete_pre_draw_num || null, event_id || null, belt_level || null]
        );
      } else {
        result = await db.run(
          `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group, athlete_category, athlete_draw_num, athlete_pre_draw_num, event_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group || null, athlete_category, athlete_draw_num || null, athlete_pre_draw_num || null, event_id || null]
        );
      }

      if (event_type === 'taekwondo_poomsae' && event_id) {
        await db.run(
          `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
           VALUES (?, ?, ?, ?)`,
          [event_id, athlete_id || '', athlete_name, athlete_team || null]
        );
      }

      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/athletes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const fields = [];
      const values = [];
      const allowed = ['athlete_id', 'athlete_name', 'athlete_gender', 'athlete_team', 'athlete_age_group', 'athlete_category', 'athlete_draw_num', 'athlete_pre_draw_num', 'event_id'];

      let drawNumChanged = false;
      if (req.body.athlete_draw_num !== undefined) {
        const current = await db.get('SELECT athlete_draw_num, athlete_category, event_id FROM athletes WHERE id = ?', [id]);
        if (current) {
          const oldDrawNum = current.athlete_draw_num;
          const newDrawNum = req.body.athlete_draw_num;
          if (String(oldDrawNum) !== String(newDrawNum)) {
            drawNumChanged = { athlete_category: current.athlete_category, event_id: current.event_id };
          }
        }
      }

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      }

      const hasBeltLevel = await checkColumnExists(db, 'athletes', 'belt_level');
      if (hasBeltLevel && req.body.belt_level !== undefined) {
        fields.push('belt_level = ?');
        values.push(req.body.belt_level);
      }

      if (fields.length === 0) return res.json({ success: true });
      values.push(id);
      await db.run(`UPDATE athletes SET ${fields.join(', ')} WHERE id = ?`, values);

      if (drawNumChanged && drawNumChanged.athlete_category && drawNumChanged.event_id) {
        try {
          await deleteKyougiMatchsByClass(db, drawNumChanged.athlete_category, drawNumChanged.event_id);
          const stageRow = await db.get(
            'SELECT id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
            [Number(drawNumChanged.event_id), drawNumChanged.athlete_category]
          );
          if (stageRow && stageRow.id) {
            const oldSid = Number(stageRow.id);
            try {
              const matchRows = await db.prepare('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?').all(oldSid);
              const pIds = new Set();
              for (const m of matchRows) {
                if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch(e) {} }
                if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch(e) {} }
              }
              await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(oldSid);
              await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(oldSid);
              await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(oldSid);
              await db.prepare('DELETE FROM bracket_group WHERE stage_id = ?').run(oldSid);
              await db.prepare('DELETE FROM bracket_stage WHERE id = ?').run(oldSid);
              for (const pid of pIds) { await db.prepare('DELETE FROM bracket_participant WHERE id = ?').run(pid); }
            } catch (e) {
              console.log('签号变更清除stage:', oldSid, e.message);
            }
          }
        } catch (e) {
          console.error('签号变更删除对阵数据失败:', e.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 运动员批量操作 ==================== */
  router.delete('/athletes/all', async (req, res) => {
    try {
      const { event_id, athlete_type } = req.query;

      let deletedCount = 0;

      if (event_id) {
        const result = await db.run('DELETE FROM athletes WHERE event_id = ?', [event_id]);
        deletedCount += result.changes || 0;

        await db.run('DELETE FROM athletes_poomsae WHERE event_id = ?', [event_id]);
        await db.run('DELETE FROM athletes_weighing WHERE event_id = ?', [event_id]);

        res.json({ success: true, data: { deleted: deletedCount } });
      } else {
        const result = await db.run('DELETE FROM athletes');
        deletedCount += result.changes || 0;

        await db.run('DELETE FROM athletes_weighing');

        res.json({ success: true, data: { deleted: deletedCount } });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/athletes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const athlete = await db.get('SELECT athlete_id, event_id FROM athletes WHERE id = ?', [id]);
      if (athlete) {
        await db.run('DELETE FROM athletes_weighing WHERE event_id = ? AND athlete_id = ?', [athlete.event_id, athlete.athlete_id]);
      }
      await db.run('DELETE FROM athletes WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/athletes/batch', async (req, res) => {
    try {
      const { athletes, event_id } = req.body;
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return res.status(400).json({ success: false, error: '运动员数据不能为空' });
      }

      let event_type = null;
      if (event_id) {
        const event = await db.get('SELECT event_type FROM events WHERE event_id = ?', [event_id]);
        if (event) {
          event_type = event.event_type;
        }
      }

      const inserted = [];
      let success = 0;
      let failed = 0;

      for (const a of athletes) {
        try {
          if (event_type === 'taekwondo_poomsae' && event_id) {
            await db.run(
              `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
               VALUES (?, ?, ?, ?)`,
              [event_id, a.athlete_id || '', a.athlete_name, a.athlete_team || null]
            );
          }

          const hasBeltLevel = await checkColumnExists(db, 'athletes', 'belt_level');
          const hasAthleteBeltLevel = a.belt_level !== undefined && a.belt_level !== null && a.belt_level !== '';
          
          let result;
          if (hasBeltLevel && hasAthleteBeltLevel) {
            result = await db.run(
              `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group, athlete_category, athlete_draw_num, athlete_pre_draw_num, event_id, belt_level)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [a.athlete_id || '', a.athlete_name, a.athlete_gender, a.athlete_team, a.athlete_age_group || null, a.athlete_category, a.athlete_draw_num || null, a.athlete_pre_draw_num || null, event_id || null, a.belt_level]
            );
          } else {
            result = await db.run(
              `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, athlete_age_group, athlete_category, athlete_draw_num, athlete_pre_draw_num, event_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [a.athlete_id || '', a.athlete_name, a.athlete_gender, a.athlete_team, a.athlete_age_group || null, a.athlete_category, a.athlete_draw_num || null, a.athlete_pre_draw_num || null, event_id || null]
            );
          }
          inserted.push({ id: result.id, ...a });
          success++;
        } catch (err) {
          failed++;
        }
      }
      res.json({ success: true, data: { success, failed, inserted } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 级别查询 ==================== */
  router.get('/weight-classes', async (req, res) => {
    try {
      const { event_id } = req.query;
      let sql = 'SELECT DISTINCT athlete_category FROM athletes WHERE 1=1';
      const params = [];
      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
      }
      sql += ' ORDER BY athlete_category';
      const rows = await db.all(sql, params);
      res.json({ success: true, data: rows.map(r => r.athlete_category) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ==================== 抽签功能 ==================== */
  async function performDraw(athletes) {
    for (const a of athletes) {
      await db.run('UPDATE athletes SET athlete_draw_num = 0 WHERE id = ?', [a.id]);
    }

    const n = athletes.length;
    if (n === 1) {
      await db.run('UPDATE athletes SET athlete_draw_num = 1 WHERE id = ?', [athletes[0].id]);
      return { total_drawn: 1, team_adjustments: [] };
    }
    const targetSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const seedOrderFull = generateStandardSeedOrder(targetSize);

    const seedToBracketPos = {};
    for (let i = 0; i < seedOrderFull.length; i++) {
      seedToBracketPos[seedOrderFull[i]] = i;
    }

    const seeded = athletes.filter(a => a.athlete_draw_num > 0 && a.athlete_draw_num <= n).sort((a, b) => a.athlete_draw_num - a.athlete_draw_num);
    const unseeded = athletes.filter(a => a.athlete_draw_num === 0 || a.athlete_draw_num > n);

    const seededAssignments = [];
    for (const athlete of seeded) {
      seededAssignments.push({ athlete, position: athlete.athlete_draw_num });
    }

    for (let i = unseeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
    }

    const usedPositions = new Set(seededAssignments.map(a => a.position));
    const remainingPositions = [];
    for (let pos = 1; pos <= n; pos++) {
      if (!usedPositions.has(pos)) remainingPositions.push(pos);
    }

    const unseededAssignments = [];
    const unitPositionMap = new Map();
    for (const sa of seededAssignments) {
      const athlete_team = sa.athlete.athlete_team;
      if (!unitPositionMap.has(athlete_team)) unitPositionMap.set(athlete_team, []);
      unitPositionMap.get(athlete_team).push(sa.position);
    }

    for (const athlete of unseeded) {
      const athlete_team = athlete.athlete_team;
      const unitPositions = unitPositionMap.get(athlete_team) || [];
      let bestPos = null;
      let bestScore = -1;
      for (let i = 0; i < remainingPositions.length; i++) {
        const pos = remainingPositions[i];
        const bracketPos = seedToBracketPos[pos];
        let minDistance = targetSize;
        for (const up of unitPositions) {
          const upBracketPos = seedToBracketPos[up];
          const dist = Math.abs(bracketPos - upBracketPos);
          if (dist < minDistance) minDistance = dist;
        }
        const score = minDistance * 100 + (targetSize - bracketPos);
        if (score > bestScore) { bestScore = score; bestPos = i; }
      }
      const assignedPos = remainingPositions.splice(bestPos, 1)[0];
      unseededAssignments.push({ athlete, position: assignedPos });
      if (!unitPositionMap.has(athlete_team)) unitPositionMap.set(athlete_team, []);
      unitPositionMap.get(athlete_team).push(assignedPos);
    }

    const allAssignments = [...seededAssignments, ...unseededAssignments];

    for (const assignment of allAssignments) {
      await db.run('UPDATE athletes SET athlete_draw_num = ? WHERE id = ?', [assignment.position, assignment.athlete.id]);
    }

    const teamAdjustments = [];
    const unitZoneMap = new Map();
    for (const a of allAssignments) {
      const athlete_team = a.athlete.athlete_team;
      if (!unitZoneMap.has(athlete_team)) unitZoneMap.set(athlete_team, new Set());
      const bracketPos = seedToBracketPos[a.position];
      const zone = Math.ceil((bracketPos + 1) / (targetSize / Math.min(4, targetSize)));
      unitZoneMap.get(athlete_team).add(zone);
    }
    for (const [athlete_team, zones] of unitZoneMap) {
      const count = allAssignments.filter(a => a.athlete.athlete_team === athlete_team).length;
      if (count > 1 && zones.size > 1) {
        teamAdjustments.push({ athlete_team, count, zones: zones.size });
      }
    }

    return { total_drawn: allAssignments.length, team_adjustments: teamAdjustments };
  }

  router.post('/athletes/draw', async (req, res) => {
    try {
      const { weight_class, event_id, athlete_gender, group_class } = req.body;

      let sql = 'SELECT * FROM athletes WHERE 1=1';
      const params = [];
      if (weight_class) {
        sql += ' AND athlete_category = ?';
        params.push(weight_class);
      }
      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
      }
      if (athlete_gender) {
        sql += ' AND athlete_gender = ?';
        params.push(athlete_gender);
      }
      if (group_class) {
        sql += ' AND athlete_age_group = ?';
        params.push(group_class);
      }
      sql += ' ORDER BY athlete_draw_num DESC, id';
      const athletes = await db.all(sql, params);

      if (athletes.length < 1) {
        return res.status(400).json({ success: false, error: '没有运动员可抽签' });
      }

      if (!weight_class) {
        const classGroups = {};
        athletes.forEach(a => {
          const groupKey = a.athlete_category || '未分组';
          if (!classGroups[groupKey]) classGroups[groupKey] = [];
          classGroups[groupKey].push(a);
        });

        let totalDrawn = 0;
        const allClasses = [];
        const allTeamAdjustments = [];

        for (const cls of Object.keys(classGroups)) {
          const group = classGroups[cls];
          const result = await performDraw(group);
          totalDrawn += result.total_drawn;
          allClasses.push(cls);
          allTeamAdjustments.push(...result.team_adjustments);
        }

        if (totalDrawn === 0) {
          return res.status(400).json({ success: false, error: '没有足够运动员的级别可抽签' });
        }

        return res.json({ success: true, data: { total_drawn: totalDrawn, classes: allClasses, team_adjustments: allTeamAdjustments } });
      }

      const result = await performDraw(athletes);
      res.json({ success: true, data: { total_drawn: result.total_drawn, classes: [weight_class], team_adjustments: result.team_adjustments } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/athletes/clear-draw', async (req, res) => {
    try {
      const { weight_class, event_id, athlete_gender, group_class } = req.body;
      let sql = 'UPDATE athletes SET athlete_draw_num = 0 WHERE 1=1';
      const params = [];
      if (weight_class) {
        sql += ' AND athlete_category = ?';
        params.push(weight_class);
      }
      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
      }
      if (athlete_gender) {
        sql += ' AND athlete_gender = ?';
        params.push(athlete_gender);
      }
      if (group_class) {
        sql += ' AND athlete_age_group = ?';
        params.push(group_class);
      }
      const result = await db.run(sql, params);
      res.json({ success: true, data: { cleared: result.changes || 0 } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  function generateStandardSeedOrder(size) {
    if (size <= 1) return [1];
    let pairs = [[1, 2]];
    let currentSize = 2;
    while (currentSize < size) {
      const nextSize = currentSize * 2;
      const nextPairs = [];
      for (const [a, b] of pairs) {
        nextPairs.push([a, nextSize + 1 - a]);
        nextPairs.push([nextSize + 1 - b, b]);
      }
      pairs = nextPairs;
      currentSize = nextSize;
    }
    return pairs.flat();
  }

  function resolveUnitConflicts(assignments, targetSize) {
    const maxIterations = 100;
    for (let iter = 0; iter < maxIterations; iter++) {
      let improved = false;

      for (let i = 0; i < assignments.length; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          const a1 = assignments[i];
          const a2 = assignments[j];

          if (a1.athlete.athlete_team && a1.athlete.athlete_team === a2.athlete.athlete_team) {
            const quarter1 = Math.floor((a1.position - 1) / (targetSize / 4));
            const quarter2 = Math.floor((a2.position - 1) / (targetSize / 4));

            if (quarter1 === quarter2) {
              const origScore = calculateConflictScore(assignments, targetSize);
              [a1.position, a2.position] = [a2.position, a1.position];
              const newScore = calculateConflictScore(assignments, targetSize);

              if (newScore < origScore) {
                improved = true;
              } else {
                [a1.position, a2.position] = [a2.position, a1.position];
              }
            }
          }
        }
      }

      if (!improved) break;
    }
  }

  function calculateConflictScore(assignments, targetSize) {
    let score = 0;
    const unitMap = new Map();

    for (const a of assignments) {
      const athlete_team = a.athlete.athlete_team;
      if (!athlete_team) continue;
      if (!unitMap.has(athlete_team)) unitMap.set(athlete_team, []);
      unitMap.get(athlete_team).push(a.position);
    }

    for (const [athlete_team, positions] of unitMap) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.abs(positions[i] - positions[j]);
          const quarter1 = Math.floor((positions[i] - 1) / (targetSize / 4));
          const quarter2 = Math.floor((positions[j] - 1) / (targetSize / 4));

          if (quarter1 === quarter2) score += 100;
          else if (Math.floor(quarter1 / 2) === Math.floor(quarter2 / 2)) score += 50;
          score += Math.max(0, 20 - dist);
        }
      }
    }

    return score;
  }

  function getRoundName(roundNumber, totalRounds) {
    if (!roundNumber || !totalRounds) return null;
    if (roundNumber === totalRounds) return 'Final';
    const denominator = Math.pow(2, totalRounds - roundNumber);
    return `1/${denominator}`;
  }

  return router;
};
