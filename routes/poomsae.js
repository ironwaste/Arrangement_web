const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const xlsx = require('xlsx');
const fs = require('fs');

module.exports = (db, upload) => {

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

  router.get('/poomsae-groups', async (req, res) => {
    try {
      const { event_id } = req.query;
      let sql = `
        SELECT g.*,
          e.event_name as event_name,
          COUNT(a.id) as athlete_count
        FROM poomsae_groups g
        LEFT JOIN events e ON g.event_id = e.event_id
        LEFT JOIN athletes_poomsae a ON g.event_id = a.event_id
        WHERE 1=1
      `;
      const params = [];

      if (event_id) {
        sql += ' AND g.event_id = ?';
        params.push(event_id);
      }

      sql += ' GROUP BY g.id ORDER BY g.created_at';

      const data = await db.all(sql, params);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-groups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const data = await db.get('SELECT * FROM poomsae_groups WHERE id = ?', [id]);
      if (!data) {
        return res.status(404).json({ success: false, error: '组别不存在' });
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-groups', async (req, res) => {
    try {
      const { event_id, name, type, age_group, gender, form_name } = req.body;
      const result = await db.run(
        `INSERT INTO poomsae_groups (event_id, name, type, age_group, gender, form_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [event_id || null, name, type || '个人', age_group || '少年组', gender || '男', form_name || '太极一章', '未开始']
      );
      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/poomsae-groups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { event_id, name, type, age_group, gender, form_name, status } = req.body;

      await db.run(
        `UPDATE poomsae_groups SET
          event_id = ?, name = ?, type = ?, age_group = ?, gender = ?, form_name = ?, status = ?
         WHERE id = ?`,
        [event_id || null, name, type || '个人', age_group || '少年组', gender || '男', form_name || '太极一章', status || '未开始', id]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/poomsae-groups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const group = await db.get('SELECT event_id FROM poomsae_groups WHERE id = ?', [id]);
      if (group) {
        await db.run('DELETE FROM athletes_poomsae WHERE event_id = ?', [group.event_id]);
      }
      await db.run('DELETE FROM poomsae_groups WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-groups/:id/draw', async (req, res) => {
    try {
      const { id } = req.params;

      const group = await db.get('SELECT event_id FROM poomsae_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(400).json({ success: false, error: '组别不存在' });
      }

      const athletes = await db.all('SELECT * FROM athletes_poomsae WHERE event_id = ? ORDER BY id', [group.event_id]);

      if (athletes.length === 0) {
        return res.status(400).json({ success: false, error: '该组别没有参赛人员' });
      }

      for (let i = athletes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [athletes[i], athletes[j]] = [athletes[j], athletes[i]];
      }

      for (let i = 0; i < athletes.length; i++) {
        await db.run('UPDATE athletes_poomsae SET poomsae_athlete_draw_num = ? WHERE id = ?', [i + 1, athletes[i].id]);
      }

      await db.run('UPDATE poomsae_groups SET status = ? WHERE id = ?', ['准备中', id]);

      res.json({ success: true, data: { total: athletes.length } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-athletes', async (req, res) => {
    try {
      const { group_id, status, event_id } = req.query;
      let sql = 'SELECT * FROM athletes_poomsae WHERE 1=1';
      const params = [];

      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
      }
      if (group_id) {
        sql += ' AND group_id = ?';
        params.push(group_id);
      }
      if (status) {
        const statuses = status.split(',');
        sql += ' AND status IN (' + statuses.map(() => '?').join(',') + ')';
        params.push(...statuses);
      }

      sql += ' ORDER BY draw_no, id';

      const data = await db.all(sql, params);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-athletes', async (req, res) => {
    try {
      const { event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team } = req.body;
      const result = await db.run(
        `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
         VALUES (?, ?, ?, ?)`,
        [event_id || null, poomsae_athlete_id || null, poomsae_athlete_name, poomsae_athlete_team || null]
      );
      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/poomsae-athletes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team, poomsae_athlete_draw_num } = req.body;

      await db.run(
        `UPDATE athletes_poomsae SET
          poomsae_athlete_id = ?, poomsae_athlete_name = ?, poomsae_athlete_team = ?, poomsae_athlete_draw_num = ?
         WHERE id = ?`,
        [poomsae_athlete_id || null, poomsae_athlete_name, poomsae_athlete_team || null, poomsae_athlete_draw_num || 0, id]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/poomsae-athletes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM athletes_poomsae WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/poomsae-athletes/batch', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的ID列表' });
      }

      const placeholders = ids.map(() => '?').join(',');
      await db.run(`DELETE FROM athletes_poomsae WHERE id IN (${placeholders})`, ids);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-athletes/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传文件' });
      }

      const group_id = req.body.group_id;
      if (!group_id) {
        return res.status(400).json({ success: false, error: '请提供组别ID' });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

      if (data.length < 2) {
        return res.status(400).json({ success: false, error: '文件数据不足' });
      }

      const rows = data.slice(1);
      let imported = 0;

      const group = await db.get('SELECT event_id FROM poomsae_groups WHERE id = ?', [group_id]);
      if (!group) {
        return res.status(400).json({ success: false, error: '组别不存在' });
      }

      for (const row of rows) {
        if (!row || row.length < 2) continue;

        const name = String(row[0] || '').trim();
        const unit = String(row[1] || '').trim();

        if (!name) continue;

        await db.run(
          `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_name, poomsae_athlete_team)
           VALUES (?, ?, ?)`,
          [group.event_id, name, unit || null]
        );
        imported++;
      }

      fs.unlinkSync(req.file.path);

      res.json({ success: true, data: { count: imported } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/poomsae-scores', async (req, res) => {
    try {
      const { athlete_id, group_id, judge_count, presentation_score, accuracy_score, total_score, judge_scores } = req.body;

      const result = await db.run(
        `INSERT INTO poomsae_scores (athlete_id, group_id, judge_count, presentation_score, accuracy_score, total_score, judge_scores)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [athlete_id, group_id, judge_count || 3, presentation_score, accuracy_score, total_score, judge_scores || null]
      );

      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-ranking', async (req, res) => {
    try {
      const { group_id } = req.query;

      let sql = `
        SELECT
          a.id,
          a.athlete_name,
          a.athlete_team,
          a.athlete_draw_num,
          a.athlete_gender,
          s.presentation_score,
          s.accuracy_score,
          s.total_score,
          s.judge_count,
          s.judge_scores,
          s.created_at
        FROM athletes_poomsae a
        LEFT JOIN poomsae_scores s ON a.id = s.athlete_id
        WHERE a.group_id = ? AND a.status = '已评分'
      `;

      const data = await db.all(sql, [group_id]);

      const sorted = data.sort((a, b) => {
        if (parseFloat(b.total_score) !== parseFloat(a.total_score)) {
          return parseFloat(b.total_score) - parseFloat(a.total_score);
        }

        if (parseFloat(b.accuracy_score) !== parseFloat(a.accuracy_score)) {
          return parseFloat(b.accuracy_score) - parseFloat(a.accuracy_score);
        }

        if (parseFloat(b.presentation_score) !== parseFloat(a.presentation_score)) {
          return parseFloat(b.presentation_score) - parseFloat(a.presentation_score);
        }

        if (a.judge_scores && b.judge_scores) {
          try {
            const aScores = JSON.parse(a.judge_scores);
            const bScores = JSON.parse(b.judge_scores);

            if (aScores.length >= 3 && bScores.length >= 3) {
              const aTotals = aScores.map(s => s.presentation + s.accuracy).sort((x, y) => x - y);
              const bTotals = bScores.map(s => s.presentation + s.accuracy).sort((x, y) => x - y);

              const aTrimmed = aTotals.slice(1, -1);
              const bTrimmed = bTotals.slice(1, -1);

              const aTrimmedAvg = aTrimmed.reduce((sum, v) => sum + v, 0) / aTrimmed.length;
              const bTrimmedAvg = bTrimmed.reduce((sum, v) => sum + v, 0) / bTrimmed.length;

              if (bTrimmedAvg !== aTrimmedAvg) {
                return bTrimmedAvg - aTrimmedAvg;
              }

              const aAccs = aScores.map(s => s.accuracy).sort((x, y) => x - y);
              const bAccs = bScores.map(s => s.accuracy).sort((x, y) => x - y);
              const aAccTrimmed = aAccs.slice(1, -1);
              const bAccTrimmed = bAccs.slice(1, -1);
              const aAccAvg = aAccTrimmed.reduce((sum, v) => sum + v, 0) / aAccTrimmed.length;
              const bAccAvg = bAccTrimmed.reduce((sum, v) => sum + v, 0) / bAccTrimmed.length;

              if (bAccAvg !== aAccAvg) {
                return bAccAvg - aAccAvg;
              }

              const aPres = aScores.map(s => s.presentation).sort((x, y) => x - y);
              const bPres = bScores.map(s => s.presentation).sort((x, y) => x - y);
              const aPresTrimmed = aPres.slice(1, -1);
              const bPresTrimmed = bPres.slice(1, -1);
              const aPresAvg = aPresTrimmed.reduce((sum, v) => sum + v, 0) / aPresTrimmed.length;
              const bPresAvg = bPresTrimmed.reduce((sum, v) => sum + v, 0) / bPresTrimmed.length;

              if (bPresAvg !== aPresAvg) {
                return bPresAvg - aPresAvg;
              }
            }
          } catch (e) {
            console.warn('比较原始分数失败:', e);
          }
        }

        return (a.athlete_draw_num || 999) - (b.draw_no || 999);
      });

      res.json({ success: true, data: sorted });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-ranking/export', async (req, res) => {
    try {
      const { group_id } = req.query;

      const group = await db.get('SELECT * FROM poomsae_groups WHERE id = ?', [group_id]);
      const data = await db.all(
        `SELECT
          a.id,
          a.athlete_name,
          a.athlete_team,
          a.athlete_draw_num,
          s.presentation_score,
          s.accuracy_score,
          s.total_score
        FROM athletes_poomsae a
        LEFT JOIN poomsae_scores s ON a.id = s.athlete_id
        WHERE a.group_id = ? AND a.status = '已评分'
        ORDER BY s.total_score DESC, a.athlete_draw_num`,
        [group_id]
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('品势成绩');

      worksheet.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '签号', key: 'athlete_draw_num', width: 8 },
        { header: '姓名', key: 'name', width: 15 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '表现力', key: 'presentation', width: 12 },
        { header: '准确度', key: 'accuracy', width: 12 },
        { header: '总分', key: 'total', width: 12 }
      ];

      data.forEach((item, index) => {
        worksheet.addRow({
          rank: index + 1,
          draw_no: item.draw_no || '-',
          name: item.name,
          unit: item.unit || '-',
          presentation: item.presentation_score,
          accuracy: item.accuracy_score,
          total: item.total_score
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=品势成绩-${group?.name || '未命名'}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-export/checkin', async (req, res) => {
    try {
      const { group_id } = req.query;

      const group = await db.get('SELECT * FROM poomsae_groups WHERE id = ?', [group_id]);
      const athletes = await db.all(
        'SELECT * FROM athletes_poomsae WHERE group_id = ? ORDER BY draw_no',
        [group_id]
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('检录单');

      worksheet.columns = [
        { header: '签号', key: 'athlete_draw_num', width: 10 },
        { header: '姓名', key: 'name', width: 15 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '性别', key: 'gender', width: 10 },
        { header: '检录状态', key: 'check_status', width: 12 },
        { header: '检录时间', key: 'check_time', width: 15 },
        { header: '检录员签字', key: 'checker', width: 15 },
        { header: '备注', key: 'notes', width: 20 }
      ];

      athletes.forEach(a => {
        worksheet.addRow({
          draw_no: a.athlete_draw_num || '-',
          name: a.athlete_name,
          unit: a.athlete_team || '-',
          gender: a.athlete_gender,
          check_status: '',
          check_time: '',
          checker: '',
          notes: ''
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=品势检录单-${group?.name || '未命名'}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-export/scores', async (req, res) => {
    try {
      const { group_id } = req.query;

      const group = await db.get('SELECT * FROM poomsae_groups WHERE id = ?', [group_id]);
      const data = await db.all(
        `SELECT
          a.athlete_draw_num, a.athlete_name, a.athlete_team, a.athlete_gender,
          s.presentation_score, s.accuracy_score, s.total_score, s.judge_scores
        FROM athletes_poomsae a
        LEFT JOIN poomsae_scores s ON a.id = s.athlete_id
        WHERE a.group_id = ? AND a.status = '已评分'
        ORDER BY s.total_score DESC, a.athlete_draw_num`,
        [group_id]
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('成绩');

      worksheet.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '签号', key: 'athlete_draw_num', width: 10 },
        { header: '姓名', key: 'name', width: 15 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '表现力', key: 'presentation', width: 12 },
        { header: '准确度', key: 'accuracy', width: 12 },
        { header: '总分', key: 'total', width: 12 }
      ];

      data.forEach((item, index) => {
        worksheet.addRow({
          rank: index + 1,
          draw_no: item.draw_no || '-',
          name: item.name,
          unit: item.unit || '-',
          presentation: item.presentation_score || 0,
          accuracy: item.accuracy_score || 0,
          total: item.total_score || 0
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=品势成绩-${group?.name || '未命名'}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-export/scorebook', async (req, res) => {
    try {
      const { group_id } = req.query;

      const group = await db.get('SELECT * FROM poomsae_groups WHERE id = ?', [group_id]);
      const data = await db.all(
        `SELECT
          a.athlete_draw_num, a.athlete_name, a.athlete_team, a.athlete_gender, a.age,
          s.presentation_score, s.accuracy_score, s.total_score, s.judge_count, s.judge_scores
        FROM athletes_poomsae a
        LEFT JOIN poomsae_scores s ON a.id = s.athlete_id
        WHERE a.group_id = ?
        ORDER BY s.total_score DESC, a.athlete_draw_num`,
        [group_id]
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('成绩册');

      worksheet.columns = [
        { header: '组别', key: 'group', width: 20 },
        { header: '签号', key: 'athlete_draw_num', width: 10 },
        { header: '姓名', key: 'name', width: 15 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '性别', key: 'gender', width: 10 },
        { header: '年龄', key: 'age', width: 10 },
        { header: '品势名称', key: 'form_name', width: 15 },
        { header: '表现力', key: 'presentation', width: 12 },
        { header: '准确度', key: 'accuracy', width: 12 },
        { header: '总分', key: 'total', width: 12 },
        { header: '排名', key: 'rank', width: 10 }
      ];

      data.forEach((item, index) => {
        worksheet.addRow({
          group: group?.name || '-',
          draw_no: item.draw_no || '-',
          name: item.name,
          unit: item.unit || '-',
          gender: item.gender,
          age: item.age || '-',
          form_name: group?.form_name || '-',
          presentation: item.presentation_score || 0,
          accuracy: item.accuracy_score || 0,
          total: item.total_score || 0,
          rank: item.total_score ? index + 1 : '-'
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=品势成绩册-${group?.name || '未命名'}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/poomsae-export/medals', async (req, res) => {
    try {
      const { event_id } = req.query;

      const groups = await db.all(
        'SELECT * FROM poomsae_groups WHERE event_id = ? AND status = ?',
        [event_id, '已结束']
      );

      const unitMedals = {};

      for (const group of groups) {
        const rankings = await db.all(
          `SELECT
            a.athlete_name, a.athlete_team, s.total_score
          FROM athletes_poomsae a
          LEFT JOIN poomsae_scores s ON a.id = s.athlete_id
          WHERE a.group_id = ? AND a.status = '已评分'
          ORDER BY s.total_score DESC`,
          [group.id]
        );

        rankings.forEach((r, index) => {
          if (!unitMedals[r.unit]) {
            unitMedals[r.unit] = { unit: r.unit, gold: 0, silver: 0, bronze: 0 };
          }
          if (index === 0) unitMedals[r.unit].gold++;
          else if (index === 1) unitMedals[r.unit].silver++;
          else if (index === 2) unitMedals[r.unit].bronze++;
        });
      }

      const result = Object.values(unitMedals).sort((a, b) => {
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('奖牌榜');

      worksheet.columns = [
        { header: '排名', key: 'rank', width: 8 },
        { header: '单位', key: 'unit', width: 20 },
        { header: '金牌', key: 'gold', width: 10 },
        { header: '银牌', key: 'silver', width: 10 },
        { header: '铜牌', key: 'bronze', width: 10 },
        { header: '总计', key: 'total', width: 10 }
      ];

      result.forEach((item, index) => {
        worksheet.addRow({
          rank: index + 1,
          unit: item.unit,
          gold: item.gold,
          silver: item.silver,
          bronze: item.bronze,
          total: item.gold + item.silver + item.bronze
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=品势奖牌榜.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
