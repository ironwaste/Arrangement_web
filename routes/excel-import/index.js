/**
 * Excel导入模块 - 主入口文件
 * 
 * 职责:统一管理所有Excel导入功能，根据运动员类型分发到相应的导入处理器
 * 
 * 导入类型支持:
 * - taekwondo_kyougi: 跆拳道竞技
 * - jiu_jitsu: 柔术
 * - chinese_wrestle: 中国式摔跤
 * - poomsae: 品势
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');

// 导入各类型的处理器
const taekwondoImporter = require('./taekwondo-importer');
const jiuJitsuImporter = require('./jiu-jitsu-importer');
const poomsaeImporter = require('./poomsae-importer');

/**
 * Excel导入主接口
 * 
 * @param {Object} db - 数据库连接实例
 * @param {Object} upload - multer上传中间件
 * @returns {Router} - Express路由实例
 */
module.exports = (db, upload) => {
  /**
   * POST /api/athletes/import-excel
   * 批量导入运动员数据
   * 
   * 请求参数:
   * - file: Excel文件（.xls或.xlsx格式）
   * - event_id: 赛事ID
   * - athlete_type: 运动员类型（taekwondo_kyougi/jiu_jitsu/chinese_wrestle/poomsae）
   * 
   * 响应格式:
   * {
   *   success: boolean,
   *   data: {
   *     success: number,    // 成功导入数量
   *     failed: number,     // 失败数量
   *     total: number,      // 总处理数量
   *     errors: array       // 错误信息列表（最多10条）
   *   },
   *   error: string        // 错误信息（失败时）
   * }
   */
  router.post('/athletes/import-excel', upload.single('file'), async (req, res) => {
    // 1. 验证文件上传
    if (!req.file) {
      console.log('[Excel导入] 错误:未上传文件');
      return res.status(400).json({ success: false, error: '请上传Excel文件' });
    }

    const { originalname, size, path: filePath } = req.file;
    const { event_id } = req.body;

    console.log(`[Excel导入] 开始处理: 文件=${originalname}, 大小=${size} bytes, 赛事ID=${event_id}`);

    // 2. 验证 event_id
    if (!event_id || event_id === 'null' || event_id === 'undefined') {
      console.log('[Excel导入] 错误:event_id为空');
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: '请先选择赛事' });
    }

    const eventIdNum = parseInt(event_id);
    if (isNaN(eventIdNum)) {
      console.log('[Excel导入] 错误:event_id不是有效数字');
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: '赛事ID无效' });
    }

    // 3. 检查赛事是否存在并获取赛事类型
    const eventData = await db.get('SELECT event_id, event_type FROM events WHERE event_id = ?', [eventIdNum]);
    if (!eventData) {
      console.log(`[Excel导入] 错误:赛事ID ${eventIdNum} 不存在`);
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: `赛事ID ${eventIdNum} 不存在，请先创建赛事` });
    }

    const eventType = eventData.event_type;
    console.log(`[Excel导入] 赛事类型: ${eventType}`);

    try {
      // 4. 根据赛事类型选择对应的导入处理器
      let result;

      switch (eventType) {
        case 'poomsae':
          result = await poomsaeImporter.importPoomsaeExcel(db, filePath, eventIdNum);
          break;
        case 'jiu_jitsu':
          result = await jiuJitsuImporter.importJiuJitsuExcel(db, filePath, eventIdNum);
          break;
        case 'chinese_wrestle':
          result = await taekwondoImporter.importKyougiExcel(db, filePath, eventIdNum, 'chinese_wrestle');
          break;
        case 'taekwondo_kyougi':
        case 'taekwondo':
        default:
          result = await taekwondoImporter.importKyougiExcel(db, filePath, eventIdNum, 'taekwondo_kyougi');
          break;
      }

      // 5. 清理上传文件
      fs.unlinkSync(filePath);

      // 6. 返回结果
      console.log(`[Excel导入] 完成: ${result.success}成功, ${result.failed}失败, 总行数=${result.total}`);
      
      if (result.total === 0) {
        return res.status(400).json({ 
          success: false, 
          error: '文件数据不足或表头无法识别，请检查Excel格式' 
        });
      }

      res.json({ success: true, data: result });

    } catch (err) {
      // 异常处理:清理文件并返回错误
      console.error('[Excel导入] 服务器错误:', err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/athletes/weighin-result
   * 导入称重结果数据
   * 
   * 请求参数:
   * - file: Excel文件
   * - event_id: 赛事ID
   * 
   * 响应格式:同导入接口
   */
  router.post('/athletes/weighin-result', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传Excel文件' });
    }

    const { event_id } = req.body;
    const { path: filePath } = req.file;

    // 验证 event_id
    if (!event_id || event_id === 'null' || event_id === 'undefined') {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: '请先选择赛事' });
    }

    const eventIdNum = parseInt(event_id);
    if (isNaN(eventIdNum)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: '赛事ID无效' });
    }

    // 检查赛事是否存在
    const eventExists = await db.get('SELECT event_id FROM events WHERE event_id = ?', [eventIdNum]);
    if (!eventExists) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: `赛事ID ${eventIdNum} 不存在` });
    }

    try {
      const result = await taekwondoImporter.importWeighinResult(db, filePath, eventIdNum);
      fs.unlinkSync(filePath);
      
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[称重导入] 错误:', err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

/**
 * 标准化运动员类型
 * 根据赛事类型自动推断运动员类型
 * 
 * @param {string} athleteType - 传入的运动员类型
 * @param {number} eventId - 赛事ID
 * @param {Object} db - 数据库连接
 * @returns {string} - 标准化后的运动员类型
 */
async function normalizeAthleteType(athleteType, eventId, db) {
  // 如果已经明确指定了类型，直接返回
  if (athleteType && athleteType !== 'taekwondo_kyougi') {
    return athleteType;
  }

  // 否则从赛事配置中获取类型
  if (eventId) {
    const eventTypeRow = await db.get(
      'SELECT event_type FROM events WHERE event_id = ?', 
      [eventId]
    );
    if (eventTypeRow && eventTypeRow.event_type) {
      return eventTypeRow.event_type;
    }
  }

  // 默认返回跆拳道竞技
  return 'taekwondo_kyougi';
}