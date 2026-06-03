/**
 * 称重管理路由，包含称重记录CRUD、称重合格判定、Excel导入导出等
 */
const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

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

function detectFormatFromAthlete(a) {
  if (!a) return '';
  const slots = [a.format_slot_1, a.format_slot_2, a.format_slot_3, a.format_slot_4, a.format_slot_5, a.format_slot_6];
  const FORMAT_PATTERNS = {
    'final_1': ['决赛', '', '', '', '', ''],
    'final_2': ['决赛', '决赛', '', '', '', ''],
    'prelim_final_1': ['预赛', '', '决赛', '', '', ''],
    'prelim_final_2': ['预赛', '预赛', '决赛', '决赛', '', ''],
    'prelim_semi_final_1': ['预赛', '', '复赛', '', '决赛', ''],
    'prelim_semi_final_2': ['预赛', '预赛', '复赛', '复赛', '决赛', '决赛']
  };
  const hasSlot = slots.some(s => s && String(s).trim() !== '');
  if (!hasSlot) return '';
  for (const [key, pattern] of Object.entries(FORMAT_PATTERNS)) {
    let match = true;
    for (let i = 0; i < 6; i++) {
      const slotFilled = slots[i] && String(slots[i]).trim() !== '';
      const patternActive = pattern[i] !== '';
      if (slotFilled !== patternActive) { match = false; break; }
    }
    if (match) return key;
  }
  return '';
}

function createWeighInSheet(ws, gender, athletes, eventInfo) {
  ws.columns = [
    { width: 2.82 },
    { width: 4.5 },
    { width: 8 },
    { width: 2.75 },
    { width: 20 },
    { width: 6.65 },
    { width: 12 },
    { width: 9.36 },
    { width: 9.36 },
    { width: 5.36 },
    { width: 6.45 },
  ];

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.4,
      bottom: 0.4,
      header: 0.1,
      footer: 0.1
    }
  };

  ws.pageSetup.printTitlesRow = '6:6';

  ws.mergeCells('A1:K1');
  ws.getCell('A1').value = eventInfo.name;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:K2');
  ws.getCell('A2').value = gender + ' 称重表';
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 6;

  ws.mergeCells('A4:E4');
  ws.getCell('A4').value = eventInfo.venue ? '场馆：' + eventInfo.venue : '';
  ws.getCell('A4').font = { size: 11 };
  ws.mergeCells('I4:K4');
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  ws.getCell('I4').value = '日期：' + dateStr;
  ws.getCell('I4').font = { size: 11 };
  ws.getCell('I4').alignment = { horizontal: 'right' };

  ws.getRow(5).height = 6;

  const headers = ['序号', '运动员号', '姓名', '性别', '代表队', '组别', '级别', '第一次称重(Kg)', '第二次称重(Kg)', '是否合格', '运动员签字'];
  const headerRow = ws.getRow(6);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 7.5 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  ws.getRow(6).height = 28;

  athletes.forEach((a, i) => {
    const row = ws.getRow(7 + i);
    const values = [i + 1, a.athlete_id, a.name, a.gender, a.unit, a.group_class || '', a.weight_class, '', '', '', ''];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 10 };
      cell.alignment = { horizontal: ci === 4 ? 'left' : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    row.height = 26;
  });

  const dataEndRow = 6 + athletes.length;
  const footerStartRow = dataEndRow + 1;

  ws.getRow(footerStartRow).height = 6;

  const statRow = ws.getRow(footerStartRow + 1);
  statRow.getCell(1).value = '称重运动员数：';
  statRow.getCell(1).font = { size: 11 };
  statRow.getCell(5).value = '合格人数：';
  statRow.getCell(5).font = { size: 11 };
  statRow.getCell(8).value = '不合格人数：';
  statRow.getCell(8).font = { size: 11 };

  ws.getRow(footerStartRow + 2).height = 6;

  const signRow = ws.getRow(footerStartRow + 3);
  signRow.getCell(1).value = '称重裁判员签字：';
  signRow.getCell(1).font = { size: 11 };
  signRow.getCell(5).value = '仲裁委员签字：';
  signRow.getCell(5).font = { size: 11 };
  signRow.getCell(8).value = '参赛队代表签字：';
  signRow.getCell(8).font = { size: 11 };

  ws.getRow(footerStartRow + 4).height = 6;

  const noteRow = ws.getRow(footerStartRow + 5);
  noteRow.getCell(1).value = '注：体重合格在是否合格处画"√"，不合格者画"×"';
  noteRow.getCell(1).font = { size: 10, italic: true };

  const tipsStart = footerStartRow + 6;
  const tips = [
    '称重须知：',
    '    1、称重时男运动员着内裤；女运动员着内裤、胸罩；如运动员有要求可裸体称重；',
    '    2、第一次称重不合格者，可在规定时间内有第二次称重的机会；',
    '    3、称重原始单据交技术代表，复印件交编排记录组；',
    '    4、称重体重精确到小数点后的百分位，以此为测量标准；',
    '       如54Kg以下级 53.99、54.00为合格，54Kg以上级 54.01起为合格，53.99为不合格。'
  ];
  tips.forEach((t, i) => {
    const row = ws.getRow(tipsStart + i);
    row.getCell(1).value = t;
    row.getCell(1).font = { size: 10 };
  });
}

router.post('/athletes/weighin-result', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    fs.unlinkSync(req.file.path);

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      if (row && row.some(cell => String(cell).includes('序号') || String(cell).includes('运动员号'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ success: false, error: '无法识别称重表格式' });
    }

    const headers = data[headerRowIndex].map(h => String(h).trim());
    const rows = data.slice(headerRowIndex + 1);

    const getColIndex = (keywords) => {
      for (let i = 0; i < headers.length; i++) {
        if (keywords.some(k => headers[i].includes(k))) return i;
      }
      return -1;
    };

    const colIndex = {
      index: getColIndex(['序号']),
      athleteNo: getColIndex(['运动员号', '编号']),
      name: getColIndex(['姓名', '名字']),
      gender: getColIndex(['性别']),
      unit: getColIndex(['代表队', '单位']),
      weightClass: getColIndex(['级别']),
      firstWeight: getColIndex(['第一次', '首次']),
      secondWeight: getColIndex(['第二次']),
      isQualified: getColIndex(['合格', '是否'])
    };

    const results = [];
    let qualified = 0;
    let unqualified = 0;

    const tolerance = 0.3;
    const maxLevelLimit = 6;
    const minLevelLimit = 5;

    function parseWeightClassKg(wc) {
      if (!wc) return null;
      const match = String(wc).match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : null;
    }

    function isMaxLevel(wc) {
      return String(wc).includes('+');
    }

    function autoJudgeQualified(weightClass, weight, allWeightClasses) {
      if (!weight || weight === '' || isNaN(parseFloat(weight))) return '未标注';
      const w = parseFloat(weight);
      const kg = parseWeightClassKg(weightClass);
      if (kg === null) return '未标注';

      if (isMaxLevel(weightClass)) {
        if (w > kg + maxLevelLimit) return '不合格';
        return '合格';
      }

      const isMinLevel = allWeightClasses.some(cls => {
        if (isMaxLevel(cls)) return false;
        const clsKg = parseWeightClassKg(cls);
        return clsKg !== null && clsKg < kg;
      }) && !allWeightClasses.some(cls => {
        if (isMaxLevel(cls)) return false;
        const clsKg = parseWeightClassKg(cls);
        return clsKg !== null && clsKg < kg && clsKg > 0;
      });

      if (isMinLevel && w < kg - minLevelLimit) return '不合格';

      if (w < kg - tolerance) return '不合格';
      if (w > kg + tolerance) return '不合格';
      return '合格';
    }

    const allWeightClasses = [...new Set(rows.map(row => row && row[colIndex.weightClass] ? String(row[colIndex.weightClass]).trim() : '').filter(Boolean))];

    rows.forEach((row, idx) => {
      if (!row || row.length < 5) return;
      if (!row[colIndex.athleteNo] && !row[colIndex.name]) return;

      const isQualifiedVal = colIndex.isQualified >= 0 ? String(row[colIndex.isQualified] || '') : '';
      const isQ = isQualifiedVal.includes('√') || isQualifiedVal.includes('合格') || isQualifiedVal.includes('是');
      const isUnQ = isQualifiedVal.includes('×') || isQualifiedVal.includes('不合格') || isQualifiedVal.includes('否');

      const weightClass = String(row[colIndex.weightClass] || '');
      const firstWeight = row[colIndex.firstWeight] || '';
      const secondWeight = row[colIndex.secondWeight] || '';

      let status = '未标注';
      if (isQ) { status = '合格'; qualified++; }
      else if (isUnQ) { status = '不合格'; unqualified++; }
      else if (firstWeight || secondWeight) {
        const firstResult = firstWeight ? autoJudgeQualified(weightClass, firstWeight, allWeightClasses) : '未标注';
        const secondResult = secondWeight ? autoJudgeQualified(weightClass, secondWeight, allWeightClasses) : '未标注';
        if (firstResult === '合格' || secondResult === '合格') {
          status = '合格';
          qualified++;
        } else if (firstResult === '不合格' || secondResult === '不合格') {
          status = '不合格';
          unqualified++;
        } else {
          status = '未标注';
        }
      }

      results.push({
        index: row[colIndex.index] || (idx + 1),
        athleteNo: String(row[colIndex.athleteNo] || ''),
        name: String(row[colIndex.name] || ''),
        gender: String(row[colIndex.gender] || ''),
        unit: String(row[colIndex.unit] || ''),
        weightClass,
        firstWeight,
        secondWeight,
        isQualified: status
      });
    });

    const event_id = req.body.event_id || null;
    for (const r of results) {
      try {
        const conditions = [String(r.athleteNo)];
        let sql = 'SELECT id FROM athletes WHERE athlete_id = ? AND athlete_type = \'taekwondo_kyougi\'';
        let params = [String(r.athleteNo)];
        if (event_id) {
          sql += ' AND event_id = ?';
          params.push(event_id);
        }
        const athleteExists = await db.get(sql, params);

        if (athleteExists) {
          const existingWeighing = await db.get(
            'SELECT id FROM athletes_weighing WHERE event_id = ? AND athlete_id = ?',
            [event_id || null, String(r.athleteNo)]
          );

          if (existingWeighing) {
            await db.run(
              `UPDATE athletes_weighing
               SET frist_weight_record = ?, second_weight_record = ?, athlete_weight_qualified = ?, record_time = NOW()
               WHERE event_id = ? AND athlete_id = ?`,
              [r.firstWeight || null, r.secondWeight || null, r.isQualified, event_id || null, String(r.athleteNo)]
            );
          } else {
            await db.run(
              `INSERT INTO athletes_weighing (event_id, athlete_id, frist_weight_record, second_weight_record, athlete_weight_qualified, record_time)
               VALUES (?, ?, ?, ?, ?, NOW())`,
              [event_id || null, String(r.athleteNo), r.firstWeight || null, r.secondWeight || null, r.isQualified]
            );
          }
        }
      } catch (e) {
        console.error('导入称重数据失败:', e.message);
      }
    }

    res.json({
      success: true,
      data: {
        total: results.length,
        qualified,
        unqualified,
        results
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/athletes/weighin-update', async (req, res) => {
  try {
    const { athlete_no, event_id, first_weight, second_weight, is_qualified } = req.body;
    if (!athlete_no) {
      return res.status(400).json({ success: false, error: '请提供运动员编号' });
    }

    let sql = 'SELECT id FROM athletes WHERE athlete_id = ? AND athlete_type = \'taekwondo_kyougi\'';
    const params = [String(athlete_no)];
    if (event_id) {
      sql += ' AND event_id = ?';
      params.push(event_id);
    }
    const result = await db.get(sql, params);

    if (!result) {
      return res.status(404).json({ success: false, error: '运动员不存在' });
    }

    const existingWeighing = await db.get(
      'SELECT id FROM athletes_weighing WHERE event_id = ? AND athlete_id = ?',
      [event_id || null, String(athlete_no)]
    );

    if (existingWeighing) {
      await db.run(
        `UPDATE athletes_weighing
         SET frist_weight_record = ?, second_weight_record = ?, athlete_weight_qualified = ?, record_time = NOW()
         WHERE event_id = ? AND athlete_id = ?`,
        [first_weight || null, second_weight || null, is_qualified || '未标注', event_id || null, String(athlete_no)]
      );
    } else {
      await db.run(
        `INSERT INTO athletes_weighing (event_id, athlete_id, frist_weight_record, second_weight_record, athlete_weight_qualified, record_time)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [event_id || null, String(athlete_no), first_weight || null, second_weight || null, is_qualified || '未标注']
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/athletes/weighin-data', async (req, res) => {
  try {
    const { event_id, athlete_type } = req.query;

    let targetAthleteType = athlete_type || 'taekwondo_kyougi';
    if (event_id && !athlete_type) {
      const event = await db.get('SELECT event_type FROM events WHERE event_id = ?', [event_id]);
      if (event) {
        if (event.event_type === 'chinese_wrestle') {
          targetAthleteType = 'chinese_wrestle';
        } else if (event.event_type === 'jiu_jitsu') {
          targetAthleteType = 'jiu_jitsu';
        } else if (event.event_type === 'taekwondo_poomsae') {
          targetAthleteType = 'poomsae';
        }
      }
    }

    let sql = `SELECT a.id, a.athlete_id, a.athlete_name, a.athlete_gender, a.athlete_team,
                      a.athlete_age_group, a.athlete_category, a.event_id,
                      w.frist_weight_record as firstWeight,
                      w.second_weight_record as secondWeight,
                      w.athlete_weight_qualified as isQualified
               FROM athletes a
               LEFT JOIN athletes_weighing w ON a.event_id = w.event_id AND a.athlete_id = w.athlete_id
               WHERE a.athlete_type = ?`;
    const params = [targetAthleteType];
    if (event_id) {
      sql += ' AND a.event_id = ?';
      params.push(event_id);
    }
    sql += ' ORDER BY CAST(a.athlete_id AS UNSIGNED), a.athlete_id';
    const athletes = await db.all(sql, params);

    let qualifiedCount = 0;
    let unqualifiedCount = 0;

    const results = athletes.map((a, i) => {
      const firstWeight = a.firstWeight || '';
      const secondWeight = a.secondWeight || '';
      let isQualified = a.isQualified || '未标注';

      if (isQualified === '合格') qualifiedCount++;
      else if (isQualified === '不合格') unqualifiedCount++;

      return {
        index: i + 1,
        id: a.id,
        athleteNo: a.athlete_id,
        name: a.athlete_name,
        gender: a.athlete_gender,
        unit: a.athlete_team,
        ageGroup: a.athlete_age_group,
        weightClass: a.athlete_category,
        firstWeight: firstWeight !== null ? String(firstWeight) : '',
        secondWeight: secondWeight !== null ? String(secondWeight) : '',
        isQualified
      };
    });

    res.json({ success: true, data: { total: results.length, qualified: qualifiedCount, unqualified: unqualifiedCount, results } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/athletes/remove-unqualified', async (req, res) => {
  try {
    const { athleteNos, event_id } = req.body;
    if (!Array.isArray(athleteNos) || athleteNos.length === 0) {
      return res.status(400).json({ success: false, error: '请提供要删除的运动员编号' });
    }

    let removed = 0;
    for (const no of athleteNos) {
      try {
        if (event_id) {
          await db.run('DELETE FROM athletes_weighing WHERE event_id = ? AND athlete_id = ?', [event_id, no]);
          await db.run('DELETE FROM athletes WHERE athlete_id = ? AND event_id = ? AND athlete_type = \'taekwondo_kyougi\'', [no, event_id]);
        } else {
          await db.run('DELETE FROM athletes_weighing WHERE athlete_id = ?', [no]);
          await db.run('DELETE FROM athletes WHERE athlete_id = ? AND athlete_type = \'taekwondo_kyougi\'', [no]);
        }
        removed++;
      } catch (err) {
        console.error('删除失败:', no, err.message);
      }
    }

    res.json({ success: true, data: { removed } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/athletes/weighin-export', async (req, res) => {
  try {
    const { event_id } = req.query;
    let sql = 'SELECT * FROM athletes WHERE athlete_type = \'taekwondo_kyougi\'';
    const params = [];
    if (event_id) {
      sql += ' AND event_id = ?';
      params.push(event_id);
    }
    sql += ' ORDER BY CAST(athlete_id AS UNSIGNED), athlete_id';
    const athletes = await db.all(sql, params);
    if (athletes.length === 0) {
      return res.status(400).json({ success: false, error: '没有运动员数据' });
    }

    const maleAthletes = athletes.filter(a => a.gender === '男');
    const femaleAthletes = athletes.filter(a => a.gender === '女');

    let eventInfo = { name: '跆拳道比赛', venue: '' };
    if (event_id) {
      const event = await db.get('SELECT * FROM events WHERE event_id = ?', [event_id]);
      if (event) {
        eventInfo = { name: event.event_name || '跆拳道比赛', venue: event.event_venue || '' };
      }
    }

    const workbook = new ExcelJS.Workbook();

    if (maleAthletes.length > 0) {
      const wsM = workbook.addWorksheet('男子称重表');
      createWeighInSheet(wsM, '男子', maleAthletes, eventInfo);
    }

    if (femaleAthletes.length > 0) {
      const wsF = workbook.addWorksheet('女子称重表');
      createWeighInSheet(wsF, '女子', femaleAthletes, eventInfo);
    }

    const tmpFile = path.join(__dirname, '..', 'uploads', 'weighin_' + Date.now() + '.xlsx');
    await workbook.xlsx.writeFile(tmpFile);

    res.download(tmpFile, '称重表.xlsx', (err) => {
      if (err) console.error('下载错误:', err);
      fs.unlinkSync(tmpFile);
    });
  } catch (err) {
    console.error('称重表导出错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.get('/poomsae-routine/template', async (req, res) => {
  try {
    const { event_id } = req.query;
    const workbook = new ExcelJS.Workbook();

    const poomsaeTypeOrder = ['个人', '混双', '团体'];
    const typeGenderGcClsMap = {};

    let sql = "SELECT * FROM athletes WHERE athlete_type = 'poomsae'";
    const params = [];
    if (event_id) { sql += ' AND event_id = ?'; params.push(event_id); }
    const athletes = await db.all(sql, params);

    athletes.forEach(a => {
      const gender = a.gender || '未知';
      const gc = a.group_class || '未分组';
      const cls = a.weight_class || '未分级';
      const key = gender + '/' + gc + '/' + cls;
      if (!typeGenderGcClsMap['poomsae']) typeGenderGcClsMap['poomsae'] = {};
      if (!typeGenderGcClsMap['poomsae'][key]) typeGenderGcClsMap['poomsae'][key] = [];
      typeGenderGcClsMap['poomsae'][key].push(a);
    });

    const ws = workbook.addWorksheet('品势套路配置');
    ws.columns = [
      { header: '性别', key: 'gender', width: 8 },
      { header: '组别/级别', key: 'group_class', width: 16 }
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    if (athletes.length > 0) {
      const items = typeGenderGcClsMap['poomsae'];
      if (items) {
        Object.keys(items).sort().forEach(key => {
          const [gender, gc, cls] = key.split('/');
          const row = {
            gender: gender,
            group_class: gc + '/' + cls
          };
          ws.addRow(row);
        });
      }
    } else {
      const exampleData = [
        { gender: '男', group_class: '少年/绿带' },
        { gender: '男', group_class: '少年/蓝带' },
        { gender: '女', group_class: '少年/绿带' },
        { gender: '女', group_class: '少年/蓝带' },
        { gender: '男', group_class: '初中/品位' },
        { gender: '女', group_class: '初中/品位' },
        { gender: '混合', group_class: '少年/绿带' },
        { gender: '混合', group_class: '初中/品位' }
      ];
      exampleData.forEach(row => ws.addRow(row));
    }

    const ws2 = workbook.addWorksheet('赛制说明');
    ws2.columns = [
      { header: '赛制名称', key: 'name', width: 26 },
      { header: '说明', key: 'desc', width: 50 },
      { header: '第1套', key: 's1', width: 10 },
      { header: '第2套', key: 's2', width: 10 },
      { header: '第3套', key: 's3', width: 10 },
      { header: '第4套', key: 's4', width: 10 },
      { header: '第5套', key: 's5', width: 10 },
      { header: '第6套', key: 's6', width: 10 }
    ];
    const h2 = ws2.getRow(1);
    h2.font = { bold: true };
    h2.alignment = { horizontal: 'center' };
    h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    h2.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const formatDesc = [
      { name: '决赛（1套品势）', desc: '打1轮，1套套路', s1: '决赛', s2: '', s3: '', s4: '', s5: '', s6: '' },
      { name: '决赛（2套品势）', desc: '打1轮，2套套路', s1: '决赛', s2: '决赛', s3: '', s4: '', s5: '', s6: '' },
      { name: '预赛-决赛（1套品势）', desc: '打2轮，每轮1套套路', s1: '预赛', s2: '', s3: '决赛', s4: '', s5: '', s6: '' },
      { name: '预赛-决赛（2套品势）', desc: '打2轮，每轮2套套路', s1: '预赛', s2: '预赛', s3: '决赛', s4: '决赛', s5: '', s6: '' },
      { name: '预赛-复赛-决赛（1套品势）', desc: '打3轮，每轮1套套路', s1: '预赛', s2: '', s3: '复赛', s4: '', s5: '决赛', s6: '' },
      { name: '预赛-复赛-决赛（2套品势）', desc: '打3轮，每轮2套套路', s1: '预赛', s2: '预赛', s3: '复赛', s4: '复赛', s5: '决赛', s6: '决赛' }
    ];
    formatDesc.forEach(row => ws2.addRow(row));

    const ws3 = workbook.addWorksheet('填写说明');
    ws3.getColumn(1).width = 80;
    const notes = [
      '【品势套路配置模板填写说明】',
      '',
      '1. 品势类型列：填写"个人品势"、"混双品势"或"团体品势"',
      '2. 性别列：填写"男"、"女"或"混合"（混双品势填"混合"）',
      '3. 组别/级别列：格式为"组别/级别"，如"少年/绿带"、"初中/品位"',
      '4. 赛制列：从以下6种选择填写：',
      '   - 决赛（1套品势）',
      '   - 决赛（2套品势）',
      '   - 预赛-决赛（1套品势）',
      '   - 预赛-决赛（2套品势）',
      '   - 预赛-复赛-决赛（1套品势）',
      '   - 预赛-复赛-决赛（2套品势）',
      '5. 第1套~第6套列：填写该轮次对应的品势套路名称（如"太极一章"）',
      '   - 有轮次标记的空格必须填写套路名称',
      '   - 没有轮次标记的空格留空',
      '6. 导入时会根据品势类型+性别+组别/级别匹配运动员，请确保与运动员数据一致'
    ];
    notes.forEach((n, i) => {
      const r = ws3.getRow(i + 1);
      r.getCell(1).value = n;
      if (i === 0) { r.font = { bold: true, size: 14 }; }
    });

    const tmpFile = path.join(__dirname, '..', 'uploads', 'poomsae_routine_template_' + Date.now() + '.xlsx');
    await workbook.xlsx.writeFile(tmpFile);
    res.download(tmpFile, '品势套路配置模板.xlsx', (err) => {
      if (err) console.error('下载错误:', err);
      fs.unlinkSync(tmpFile);
    });
  } catch (err) {
    console.error('品势套路模板导出错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.post('/poomsae-routine/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    const event_id = req.body.event_id || null;
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: '文件数据不足' });
    }

    let success = 0;
    let failed = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;

      const gender = String(row[0] || '').trim();
      const gcCls = String(row[1] || '').trim();

      const parts = gcCls.split('/');
      const gc = parts[0] || '未分组';
      const cls = parts.slice(1).join('/') || '未分级';

      let sql = "SELECT id FROM athletes WHERE athlete_type = 'poomsae' AND athlete_gender = ? AND athlete_age_group = ? AND athlete_category = ?";
      const params = [gender, gc, cls];
      if (event_id) { sql += ' AND event_id = ?'; params.push(event_id); }

      const matchingAthletes = await db.all(sql, params);
      if (matchingAthletes.length === 0) { failed++; continue; }

      success++;
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: { success, failed } });
  } catch (err) {
    console.error('品势套路导入错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

  return router;
};
