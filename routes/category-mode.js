/**
 * 级别模式配置路由，包含级别CRUD、同步、批量更新、统计等
 */
const express = require('express');
const router = express.Router();

module.exports = (db) => {
  router.get('/category-mode', async (req, res) => {
    try {
      const { event_id } = req.query;
      let sql = 'SELECT * FROM category_mode WHERE 1=1';
      const params = [];
      
      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
      }
      
      sql += ' ORDER BY weight_class';
      const rows = await db.all(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/category-mode/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.get('SELECT * FROM category_mode WHERE category_id = ?', [id]);
      if (!row) {
        return res.status(404).json({ success: false, error: '记录不存在' });
      }
      res.json({ success: true, data: row });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/category-mode/sync', async (req, res) => {
    try {
      const { event_id } = req.body;
      if (!event_id) {
        return res.status(400).json({ success: false, error: '缺少event_id参数' });
      }

      const eventRow = await db.get('SELECT event_type FROM events WHERE event_id = ?', [event_id]);
      const syncEventType = eventRow ? eventRow.event_type : 'taekwondo_kyougi';
      const syncAthleteType = syncEventType === 'jiu_jitsu' ? 'jiu_jitsu' : syncEventType === 'taekwondo_poomsae' ? 'poomsae' : syncEventType === 'chinese_wrestle' ? 'chinese_wrestle' : 'taekwondo_kyougi';

      const athletes = await db.all(
        'SELECT athlete_category, COUNT(*) as cnt FROM athletes WHERE event_id = ? AND athlete_type = ? AND athlete_category IS NOT NULL AND athlete_category != "" GROUP BY athlete_category',
        [event_id, syncAthleteType]
      );

      let synced = 0;
      for (const a of athletes) {
        const existing = await db.get(
          'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?',
          [event_id, a.athlete_category]
        );

        if (existing) {
          await db.run(
            `UPDATE category_mode SET
             categroy_count = ?,
             updated_at = CURRENT_TIMESTAMP
             WHERE category_id = ?`,
            [a.cnt, existing.category_id]
          );
        } else {
          await db.run(
            `INSERT INTO category_mode (event_id, weight_class, categroy_count)
             VALUES (?, ?, ?)`,
            [event_id, a.athlete_category, a.cnt]
          );
        }
        synced++;
      }

      const existingCategories = await db.all(
        'SELECT category_id, weight_class FROM category_mode WHERE event_id = ?',
        [event_id]
      );
      const athleteCategories = new Set(athletes.map(a => a.athlete_category));

      for (const ec of existingCategories) {
        const hasExactMatch = athleteCategories.has(ec.weight_class);
        const hasPartialMatch = athletes.some(a => 
          a.athlete_category && ec.weight_class && 
          (a.athlete_category.includes(ec.weight_class) || ec.weight_class.includes(a.athlete_category))
        );
        
        if (!hasExactMatch && !hasPartialMatch) {
          await db.run(
            'DELETE FROM category_mode WHERE category_id = ?',
            [ec.category_id]
          );
        }
      }

      await db.run(`
        DELETE c1 FROM category_mode c1
        INNER JOIN category_mode c2
        WHERE c1.event_id = c2.event_id
          AND c1.weight_class = c2.weight_class
          AND c1.category_id > c2.category_id
      `);

      const result = await db.all(
        'SELECT * FROM category_mode WHERE event_id = ? ORDER BY weight_class',
        [event_id]
      );

      res.json({ success: true, data: result, synced });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/category-mode/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        'category_venue', 'category_date_num', 'categroy_mode_num',
        'categroy_mode_name', 'category_mode_description', 'mode', 'mode_name', 'description'
      ];
      const fields = [];
      const values = [];

      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      }

      if (fields.length === 0) {
        return res.json({ success: true });
      }

      values.push(id);
      await db.run(`UPDATE category_mode SET ${fields.join(', ')} WHERE category_id = ?`, values);

      const updated = await db.get('SELECT * FROM category_mode WHERE category_id = ?', [id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/category-mode/batch', async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: '数据格式错误' });
      }

      const allowedFields = [
        'category_venue', 'category_date_num', 'categroy_mode_num',
        'categroy_mode_name', 'category_mode_description', 'mode', 'mode_name', 'description'
      ];

      for (const item of items) {
        if (!item.id) continue;
        const fields = [];
        const values = [];

        for (const key of allowedFields) {
          if (item[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(item[key]);
          }
        }

        if (fields.length > 0) {
          values.push(item.id);
          await db.run(`UPDATE category_mode SET ${fields.join(', ')} WHERE category_id = ?`, values);
        }
      }

      res.json({ success: true, updated: items.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/category-mode/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM category_mode WHERE category_id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/category-mode/stats/:event_id', async (req, res) => {
    try {
      const { event_id } = req.params;
      
      const stats = await db.get(`
        SELECT 
          COUNT(DISTINCT weight_class) as total_classes,
          SUM(categroy_count) as total_athletes,
          COUNT(CASE WHEN categroy_mode_name = '单败淘汰赛' THEN 1 END) as single_elimination_count,
          COUNT(CASE WHEN categroy_mode_name = '双败淘汰赛' THEN 1 END) as double_elimination_count,
          COUNT(CASE WHEN categroy_mode_name = '单循环赛' THEN 1 END) as round_robin_count,
          COUNT(CASE WHEN categroy_mode_name = '分区循环赛' THEN 1 END) as divisional_round_robin_count
        FROM category_mode
        WHERE event_id = ?
      `, [event_id]);

      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/competition-modes', async (req, res) => {
    try {
      const { event_id, weight_class, category_id } = req.query;
      let sql = 'SELECT * FROM category_mode WHERE 1=1';
      const params = [];
      
      if (event_id) {
        sql += ' AND event_id = ?';
        params.push(event_id);
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

      if (weightClassValue) {
        sql += ' AND weight_class = ?';
        params.push(weightClassValue);
      }
      
      sql += ' ORDER BY weight_class';
      const rows = await db.all(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
