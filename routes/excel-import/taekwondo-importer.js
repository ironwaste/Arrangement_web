/**
 * 跆拳道/摔跤导入处理器
 * 
 * 职责：处理跆拳道竞技和中国式摔跤项目的Excel导入
 * 
 * Excel格式要求(竞技类通用)：
 * 第1行(表头)：签号/序号、运动员号/编号、姓名/名字、性别、单位、组别、级别/体重
 * 第2行开始：数据行
 */

const xlsx = require('xlsx');
/**
 * 导入竞技类运动员数据(跆拳道/摔跤)
 * 
 * @param {Object} db - 数据库连接实例
 * @param {string} filePath - Excel文件路径
 * @param {number} eventId - 赛事ID
 * @param {string} athleteType - 运动员类型(taekwondo_kyougi/chinese_wrestle)
 * @returns {Object} - 导入结果 { success, failed, total, errors }
 */
async function importKyougiExcel(db, filePath, eventId, athleteType = 'taekwondo_kyougi') {
  console.log(`[跆拳道导入] 开始解析文件: ${filePath}, 类型: ${athleteType}`);

  // 1. 读取Excel文件
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`[跆拳道导入] 数据总行数: ${data.length}`);

  // 2. 验证数据
  if (data.length < 2) {
    console.log('[跆拳道导入] 数据不足(少于2行)');
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  // 3. 获取当前赛事的最大athlete_id，用于自动生成
  let nextAthleteId = 1000;
  try {
    const result = await db.get(
      'SELECT MAX(CAST(athlete_id AS UNSIGNED)) as max_id FROM athletes WHERE event_id = ?',
      [eventId]
    );
    if (result && result.max_id !== null) {
      nextAthleteId = Math.max(1000, result.max_id) + 1;
    }
    console.log(`[跆拳道导入] 当前赛事最大athlete_id: ${result?.max_id || 0}, 下一个ID: ${nextAthleteId}`);
  } catch (err) {
    console.warn(`[跆拳道导入] 获取最大athlete_id失败: ${err.message}`);
  }

  // 4. 解析表头并建立列映射
  const headers = data[0].map(h => String(h).trim());
  console.log(`[跆拳道导入] 表头: ${headers.join(', ')}`);

  const colMap = buildColumnMap(headers);
  console.log(`[跆拳道导入] 列映射:`, JSON.stringify(colMap));

  // 5. 解析数据行
  const rows = data.slice(1);
  const athletes = [];
  const errors = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rowNum = index + 2; // 实际Excel行号

    // 跳过空行或数据不足的行
    if (!row || row.length < 5) {
      console.log(`[跆拳道导入] 第${rowNum}行跳过：数据不足`);
      continue;
    }

    // 解析运动员数据
    const athlete = parseAthleteRow(row, colMap);
    athlete.rowNum = rowNum;

    // 如果athlete_id为空，自动生成
    if (!athlete.athlete_id || athlete.athlete_id.trim() === '') {
      athlete.athlete_id = String(nextAthleteId++);
      console.log(`[跆拳道导入] 第${rowNum}行自动生成athlete_id: ${athlete.athlete_id}`);
    }

    // 验证必填字段
    if (!athlete.athlete_name || !athlete.athlete_gender) {
      errors.push(`第${rowNum}行：姓名或性别为空`);
      console.log(`[跆拳道导入] 第${rowNum}行跳过：姓名=${athlete.athlete_name}, 性别=${athlete.athlete_gender}`);
      continue;
    }

    athletes.push(athlete);
  }

  console.log(`[跆拳道导入] 有效数据: ${athletes.length}条`);

  // 6. 批量插入数据库
  let success = 0;
  let failed = 0;

  for (const athlete of athletes) {
    try {
      await db.run(
        `INSERT INTO athletes (
          athlete_id, athlete_name, athlete_gender, athlete_team, 
          athlete_age_group, athlete_category, event_id, athlete_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          athlete.athlete_id,
          athlete.athlete_name,
          athlete.athlete_gender,
          athlete.athlete_team,
          athlete.athlete_age_group || null,
          athlete.athlete_category,
          eventId,
          athleteType
        ]
      );
      success++;
    } catch (err) {
      failed++;
      const errorMsg = `[第${athlete.rowNum || '未知'}行] ${athlete.athlete_name}: ${err.message}`;
      console.error(`[跆拳道导入] 插入失败: ${errorMsg}`);
      if (errors.length < 10) {
        errors.push(errorMsg);
      }
    }
  }

  return {
    success,
    failed,
    total: athletes.length,
    errors: errors.slice(0, 10) // 最多返回10条错误
  };
}

/**
 * 导入称重结果数据
 * 
 * @param {Object} db - 数据库连接实例
 * @param {string} filePath - Excel文件路径
 * @param {number} eventId - 赛事ID
 * @returns {Object} - 导入结果
 */
async function importWeighinResult(db, filePath, eventId) {
  console.log(`[称重导入] 开始解析文件: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length < 2) {
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const headers = data[0].map(h => String(h).trim());
  const colMap = buildWeighinColumnMap(headers);
  const rows = data.slice(1);

  let success = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row || row.length < 3) continue;

    const athleteNo = colMap.athleteNo !== undefined ? String(row[colMap.athleteNo] || '') : String(row[0] || '');
    const weight = colMap.weight !== undefined ? parseFloat(row[colMap.weight]) : parseFloat(row[1]);
    const isQualified = colMap.isQualified !== undefined ? String(row[colMap.isQualified] || '') : String(row[2] || '');

    if (!athleteNo) continue;

    try {
      await db.run(
        'UPDATE athletes SET athlete_weight = ?, athlete_is_qualified = ? WHERE athlete_id = ? AND event_id = ?',
        [weight || null, isQualified === '合格' ? 'qualified' : 'unqualified', athleteNo, eventId]
      );
      success++;
    } catch (err) {
      failed++;
    }
  }

  return { success, failed, total: rows.length, errors: [] };
}

/**
 * 构建运动员数据列映射
 * 
 * @param {Array} headers - 表头数组
 * @returns {Object} - 列索引映射
 */
function buildColumnMap(headers) {
  const colMap = {};

  headers.forEach((header, index) => {
    if (header.includes('签号') || header.includes('序号')) {
      colMap.signNo = index;
    }
    if (header.includes('运动员号') || header.includes('编号') || header.includes('序号')) {
      colMap.athleteNo = index;
    }
    if (header.includes('姓名') || header.includes('名字')) {
      colMap.name = index;
    }
    if (header.includes('性别')) {
      colMap.gender = index;
    }
    if (header.includes('单位')) {
      colMap.unit = index;
    }
    if (header.includes('组别')) {
      colMap.group = index;
    }
    if (header.includes('级别') || header.includes('体重')) {
      colMap.weightClass = index;
    }
  });

  return colMap;
}

/**
 * 构建称重数据列映射
 * 
 * @param {Array} headers - 表头数组
 * @returns {Object} - 列索引映射
 */
function buildWeighinColumnMap(headers) {
  const colMap = {};

  headers.forEach((header, index) => {
    if (header.includes('运动员号') || header.includes('编号') || header.includes('签号')) {
      colMap.athleteNo = index;
    }
    if (header.includes('体重') || header.includes('重量')) {
      colMap.weight = index;
    }
    if (header.includes('合格') || header.includes('结果')) {
      colMap.isQualified = index;
    }
  });

  return colMap;
}

/**
 * 解析单行运动员数据
 * 
 * @param {Array} row - 行数据数组
 * @param {Object} colMap - 列映射
 * @returns {Object} - 运动员对象
 */
function parseAthleteRow(row, colMap) {
  return {
    athlete_id: colMap.athleteNo !== undefined ? String(row[colMap.athleteNo] || '') : String(row[1] || ''),
    athlete_name: colMap.name !== undefined ? String(row[colMap.name] || '') : String(row[2] || ''),
    athlete_gender: colMap.gender !== undefined ? String(row[colMap.gender] || '') : String(row[3] || ''),
    athlete_team: colMap.unit !== undefined ? String(row[colMap.unit] || '') : String(row[4] || ''),
    athlete_age_group: colMap.group !== undefined ? String(row[colMap.group] || '') : String(row[5] || ''),
    athlete_category: colMap.weightClass !== undefined ? String(row[colMap.weightClass] || '') : String(row[6] || '')
  };
}

module.exports = {
  importKyougiExcel,
  importWeighinResult,
  buildColumnMap,
  parseAthleteRow
};