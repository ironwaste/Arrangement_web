/**
 * 品势导入处理器
 * 
 * 职责：处理品势项目的Excel导入
 * 
 * Excel格式要求（品势）：
 * - 文件包含多个工作表，分别对应不同类型
 * - 个人品势工作表：命名为"个人品势"
 * - 混双品势工作表：命名为"混双品势"  
 * - 团体品势工作表：命名为"团体品势"
 * 
 * 数据格式：
 * 第1行（表头）：签号、运动员号、姓名、性别、单位、组别、段位
 * 第2行开始：数据行
 * 
 * 品势特有字段：段位（belt_level），通常作为级别使用
 */

const xlsx = require('xlsx');

/**
 * 工作表类型映射
 */
const SHEET_TYPE_MAP = {
  '个人品势': 'individual',
  '混双品势': 'mixed',
  '团体品势': 'team'
};

/**
 * 导入品势运动员数据
 * 
 * @param {Object} db - 数据库连接实例
 * @param {string} filePath - Excel文件路径
 * @param {number} eventId - 赛事ID
 * @returns {Object} - 导入结果 { success, failed, total, errors }
 */
async function importPoomsaeExcel(db, filePath, eventId) {
  console.log(`[品势导入] 开始解析文件: ${filePath}`);

  // 1. 读取Excel文件
  const workbook = xlsx.readFile(filePath);
  
  let success = 0;
  let failed = 0;
  let total = 0;
  const errors = [];

  // 2. 遍历所有工作表
  for (const sheetName of workbook.SheetNames) {
    const poomsaeType = SHEET_TYPE_MAP[sheetName];
    if (!poomsaeType) {
      console.log(`[品势导入] 跳过未知工作表: ${sheetName}`);
      continue;
    }

    console.log(`[品势导入] 处理工作表: ${sheetName}, 类型: ${poomsaeType}`);

    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      console.log(`[品势导入] 工作表 ${sheetName} 数据不足`);
      continue;
    }

    const rows = data.slice(1);

    // 3. 处理每一行数据
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      total++;

      try {
        if (poomsaeType === 'individual') {
          await importPoomsaeIndividual(db, eventId, sheetName, i, row, errors);
          success++;
        } else if (poomsaeType === 'mixed') {
          await importPoomsaeMixed(db, eventId, sheetName, i, row, errors);
          success++;
        } else if (poomsaeType === 'team') {
          await importPoomsaeTeam(db, eventId, sheetName, i, row, errors);
          success++;
        }
      } catch (err) {
        if (!err.skipCount) {
          errors.push(`Sheet"${sheetName}"第${i + 2}行错误: ${err.message}`);
        }
        failed++;
      }
    }
  }

  console.log(`[品势导入] 完成: ${success}成功, ${failed}失败, 总行数: ${total}`);

  return {
    success,
    failed,
    total,
    errors: errors.slice(0, 10)
  };
}

/**
 * 导入个人品势运动员
 * 
 * @param {Object} db - 数据库连接
 * @param {number} eventId - 赛事ID
 * @param {string} sheetName - 工作表名称
 * @param {number} rowIndex - 行索引
 * @param {Array} row - 行数据
 * @param {Array} errors - 错误数组
 */
async function importPoomsaeIndividual(db, eventId, sheetName, rowIndex, row, errors) {
  const athleteNo = String(row[1] || '');
  const name = String(row[2] || '').trim();
  const gender = String(row[3] || '').trim();
  const unit = String(row[4] || '').trim();
  const groupClass = String(row[5] || '').trim();
  const beltLevel = String(row[6] || '').trim();

  if (!name) {
    errors.push(`Sheet"${sheetName}"第${rowIndex + 2}行姓名为空`);
    const err = new Error('姓名为空');
    err.skipCount = true;
    throw err;
  }

  // 插入品势运动员表
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo, name, unit]
  );

  // 插入运动员主表
  await db.run(
    `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, 
      athlete_age_group, athlete_category, event_id, athlete_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'poomsae')`,
    [athleteNo, name, gender, unit, groupClass, beltLevel, eventId]
  );
}

/**
 * 导入混双品势运动员
 * 
 * @param {Object} db - 数据库连接
 * @param {number} eventId - 赛事ID
 * @param {string} sheetName - 工作表名称
 * @param {number} rowIndex - 行索引
 * @param {Array} row - 行数据
 * @param {Array} errors - 错误数组
 */
async function importPoomsaeMixed(db, eventId, sheetName, rowIndex, row, errors) {
  const athleteNo1 = String(row[1] || '');
  const name1 = String(row[2] || '').trim();
  const gender1 = String(row[3] || '').trim();
  const athleteNo2 = String(row[4] || '');
  const name2 = String(row[5] || '').trim();
  const gender2 = String(row[6] || '').trim();
  const unit = String(row[7] || '').trim();
  const groupClass = String(row[8] || '').trim();
  const beltLevel = String(row[9] || '').trim();

  if (!name1 || !name2) {
    errors.push(`Sheet"${sheetName}"第${rowIndex + 2}行姓名为空`);
    const err = new Error('姓名为空');
    err.skipCount = true;
    throw err;
  }

  // 分别插入两位运动员到品势表
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo1, name1, unit]
  );
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo2, name2, unit]
  );

  // 插入组合到运动员主表
  const pairName = `${name1}/${name2}`;
  await db.run(
    `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, 
      athlete_age_group, athlete_category, event_id, athlete_type)
     VALUES (?, ?, '混合', ?, ?, ?, ?, 'poomsae')`,
    [`${athleteNo1}/${athleteNo2}`, pairName, unit, groupClass, beltLevel, eventId]
  );
}

/**
 * 导入团体品势运动员
 * 
 * @param {Object} db - 数据库连接
 * @param {number} eventId - 赛事ID
 * @param {string} sheetName - 工作表名称
 * @param {number} rowIndex - 行索引
 * @param {Array} row - 行数据
 * @param {Array} errors - 错误数组
 */
async function importPoomsaeTeam(db, eventId, sheetName, rowIndex, row, errors) {
  const athleteNo1 = String(row[1] || '');
  const name1 = String(row[2] || '').trim();
  const athleteNo2 = String(row[3] || '');
  const name2 = String(row[4] || '').trim();
  const athleteNo3 = String(row[5] || '');
  const name3 = String(row[6] || '').trim();
  const gender = String(row[7] || '').trim();
  const unit = String(row[8] || '').trim();
  const groupClass = String(row[9] || '').trim();
  const beltLevel = String(row[10] || '').trim();

  if (!name1 || !name2 || !name3) {
    errors.push(`Sheet"${sheetName}"第${rowIndex + 2}行姓名为空`);
    const err = new Error('姓名为空');
    err.skipCount = true;
    throw err;
  }

  // 分别插入三位运动员到品势表
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo1, name1, unit]
  );
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo2, name2, unit]
  );
  await db.run(
    `INSERT INTO athletes_poomsae (event_id, poomsae_athlete_id, poomsae_athlete_name, poomsae_athlete_team)
     VALUES (?, ?, ?, ?)`,
    [eventId, athleteNo3, name3, unit]
  );

  // 插入团队到运动员主表
  const teamName = `${name1}/${name2}/${name3}`;
  await db.run(
    `INSERT INTO athletes (athlete_id, athlete_name, athlete_gender, athlete_team, 
      athlete_age_group, athlete_category, event_id, athlete_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'poomsae')`,
    [`${athleteNo1}/${athleteNo2}/${athleteNo3}`, teamName, gender, unit, groupClass, beltLevel, eventId]
  );
}

module.exports = {
  importPoomsaeExcel,
  importPoomsaeIndividual,
  importPoomsaeMixed,
  importPoomsaeTeam
};