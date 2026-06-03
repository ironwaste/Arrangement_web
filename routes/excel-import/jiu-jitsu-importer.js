/**
 * 柔术导入处理器
 * 
 * 职责：处理柔术项目的Excel导入
 * 
 * Excel格式要求（柔术）：
 * 第1行（表头）：签号/序号、运动员号/编号、姓名/名字、性别、单位、组别、级别/体重、段位
 * 第2行开始：数据行
 * 
 * 柔术特有字段：段位（belt_level）
 */

const xlsx = require('xlsx');

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

/**
 * 导入柔术运动员数据
 * 
 * @param {Object} db - 数据库连接实例
 * @param {string} filePath - Excel文件路径
 * @param {number} eventId - 赛事ID
 * @returns {Object} - 导入结果 { success, failed, total, errors }
 */
async function importJiuJitsuExcel(db, filePath, eventId) {
  console.log(`[柔术导入] 开始解析文件: ${filePath}`);

  // 1. 读取Excel文件
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`[柔术导入] 数据总行数: ${data.length}`);

  // 2. 验证数据
  if (data.length < 2) {
    console.log('[柔术导入] 数据不足（少于2行）');
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  // 3. 解析表头并建立列映射
  const headers = data[0].map(h => String(h).trim());
  console.log(`[柔术导入] 表头: ${headers.join(', ')}`);

  const colMap = buildColumnMap(headers);
  console.log(`[柔术导入] 列映射:`, JSON.stringify(colMap));

  // 4. 解析数据行
  const rows = data.slice(1);
  const athletes = [];
  const errors = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rowNum = index + 2;

    // 跳过空行或数据不足的行
    if (!row || row.length < 5) {
      console.log(`[柔术导入] 第${rowNum}行跳过：数据不足`);
      continue;
    }

    // 解析运动员数据（包含柔术特有的段位字段）
    const athlete = parseJiuJitsuRow(row, colMap);

    // 验证必填字段
    if (!athlete.athlete_name || !athlete.athlete_gender) {
      errors.push(`第${rowNum}行：姓名或性别为空`);
      console.log(`[柔术导入] 第${rowNum}行跳过：姓名=${athlete.athlete_name}, 性别=${athlete.athlete_gender}`);
      continue;
    }

    athletes.push(athlete);
  }

  console.log(`[柔术导入] 有效数据: ${athletes.length}条`);

  // 5. 批量插入数据库
  let success = 0;
  let failed = 0;

  const hasBeltLevel = await checkColumnExists(db, 'athletes', 'belt_level');

  for (const athlete of athletes) {
    try {
      let result;
      const hasAthleteBeltLevel = athlete.belt_level !== undefined;
      
      if (hasBeltLevel && hasAthleteBeltLevel) {
        result = await db.run(
          `INSERT INTO athletes (
            athlete_id, athlete_name, athlete_gender, athlete_team, 
            athlete_age_group, athlete_category, belt_level, event_id, athlete_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            athlete.athlete_id,
            athlete.athlete_name,
            athlete.athlete_gender,
            athlete.athlete_team,
            athlete.athlete_age_group || null,
            athlete.athlete_category,
            athlete.belt_level || null,
            eventId,
            'jiu_jitsu'
          ]
        );
      } else {
        result = await db.run(
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
            'jiu_jitsu'
          ]
        );
      }
      success++;
    } catch (err) {
      failed++;
      console.error(`[柔术导入] 插入失败: ${athlete.athlete_name}, 错误: ${err.message}`);
    }
  }

  return {
    success,
    failed,
    total: athletes.length,
    errors: errors.slice(0, 10)
  };
}

/**
 * 构建柔术数据列映射
 * 
 * 柔术特有：段位字段
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
    if (header.includes('运动员号') || header.includes('编号')) {
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
    if (header.includes('段位') || header.includes('腰带') || header.includes('级别')) {
      colMap.beltLevel = index;
    }
  });

  return colMap;
}

/**
 * 解析单行柔术运动员数据
 * 
 * 包含柔术特有字段：段位（belt_level）
 * 
 * @param {Array} row - 行数据数组
 * @param {Object} colMap - 列映射
 * @returns {Object} - 运动员对象
 */
function parseJiuJitsuRow(row, colMap) {
  const athlete = {
    athlete_id: colMap.athleteNo !== undefined ? String(row[colMap.athleteNo] || '') : String(row[1] || ''),
    athlete_name: colMap.name !== undefined ? String(row[colMap.name] || '') : String(row[2] || ''),
    athlete_gender: colMap.gender !== undefined ? String(row[colMap.gender] || '') : String(row[3] || ''),
    athlete_team: colMap.unit !== undefined ? String(row[colMap.unit] || '') : String(row[4] || ''),
    athlete_age_group: colMap.group !== undefined ? String(row[colMap.group] || '') : String(row[5] || ''),
    athlete_category: colMap.weightClass !== undefined ? String(row[colMap.weightClass] || '') : String(row[6] || '')
  };
  
  if (colMap.beltLevel !== undefined) {
    athlete.belt_level = String(row[colMap.beltLevel] || '');
  }
  
  return athlete;
}

module.exports = {
  importJiuJitsuExcel,
  buildColumnMap,
  parseJiuJitsuRow
};