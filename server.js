/**
 * 跆拳道编排系统 - 主入口文件
 *
 * 职责：
 * 1. Express 应用初始化与中间件配置
 * 2. 页面路由（EJS 渲染）
 * 3. 数据库连接与 brackets-manager 初始化
 * 4. API 路由挂载（认证 + 业务路由）
 * 5. WebSocket 服务启动
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware, generateToken } = require('./auth');

const MySQLDatabase = require('./database');
const routes = require('./routes/index');
const jjRoutes = require('./routes/Jiu-Jitsu/jiu-jitsu-routes');
const { MySQLStorage } = require('./storage');
const { BracketsManager } = require('brackets-manager');

const app = express();
const PORT = process.env.PORT || 3000;

/* ==================== 视图引擎配置 ==================== */

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ==================== 页面配置表 ==================== */
/* 每个页面的标题、脚本、初始化函数、对应的 EJS 模板文件 */

const pageConfig = {
  dashboard:      { title: '仪表盘',       scripts: '',                                                                                                                  init: 'loadDashboard();',           view: 'dashboard.ejs' },
  events:         { title: '赛事列表',     scripts: '<script src="/js/excel-filter.js"></script><script src="/js/events.js"></script>',                                   init: 'loadEvents();',              view: 'events.ejs' },
  athletes:       { title: '运动员管理',   scripts: '<script src="/js/athletes.js"></script><script src="/js/excel-filter.js"></script>',                                 init: 'loadAthletes();',            view: 'athletes.ejs' },
  weighin:        { title: '称重管理',     scripts: '<script src="/js/weighin.js"></script><script src="/js/excel-filter.js"></script>',                                 init: 'loadWeighinData(); loadWeighinTolerance();', view: 'weighin.ejs' },
  brackets:       { title: '跆拳道编排',   scripts: '<script src="/js/excel-filter.js"></script><script src="/js/category-mode.js"></script><script src="/js/Jiu-Jitsu/jiu-jitsu-bracket-generator.js"></script><script src="/js/Jiu-Jitsu/jiu-jitsu-brackets.js"></script><script src="/js/brackets.js"></script>', init: 'loadAutoArrangeData();', view: 'taekwondo-kyougi-brackets.ejs' },
  bracketDetail:  { title: '对阵图',       scripts: '<script src="/js/category-mode.js"></script><script src="/js/Jiu-Jitsu/jiu-jitsu-bracket-generator.js"></script><script src="/js/bracket-detail.js"></script>',                          init: 'loadBracketClassList();',    view: 'bracket-detail.ejs' },
  bracketTest:    { title: '摔跤编排',     scripts: '<script src="/js/bracket-test.js"></script>',                                                                       init: 'loadBracketTestPage();',     view: 'chinese-wrestle-arrange.ejs' },
  jjBrackets:     { title: '柔术编排',     scripts: '<script src="/js/excel-filter.js"></script><script src="/js/category-mode.js"></script><script src="/js/Jiu-Jitsu/jiu-jitsu-bracket-generator.js"></script><script src="/js/Jiu-Jitsu/jiu-jitsu-brackets.js"></script><script src="/js/brackets.js"></script>', init: 'loadAutoArrangeData();', view: 'jiu-jitsu-brackets.ejs' },
  matches:        { title: '对阵表',       scripts: '<script src="/js/matches.js"></script><script src="/js/medal-board.js"></script><script src="/js/team-scores.js"></script><script src="/js/excel-filter.js"></script>', init: 'loadMatches();', view: 'takewondo-kyougi-matches.ejs' },
  jjMatches:      { title: '柔术对阵表',   scripts: '<script src="/js/Jiu-Jitsu/jiu-jitsu-matches.js"></script><script src="/js/medal-board.js"></script><script src="/js/team-scores.js"></script><script src="/js/excel-filter.js"></script>', init: 'loadMatches();', view: 'jiu-jitsu-matches.ejs' },
  teamScores:     { title: '团体总分',     scripts: '<script src="/js/team-scores.js"></script>',                                                                        init: 'loadTeamScores();',          view: 'team-scores.ejs' },
  medalBoard:     { title: '奖牌榜',       scripts: '<script src="/js/medal-board.js"></script>',                                                                        init: 'loadMedalBoard();',          view: 'medal-board.ejs' },
  poomsae:        { title: '品势编排',     scripts: `<script src="/js/poomsae.js?v=${Date.now()}"></script>`,                                                            init: 'loadPoomsaeArrangeData();',  view: 'poomsae.ejs' },
  poomsaeAthletes:{ title: '品势运动员管理', scripts: `<script src="/js/poomsae-athletes.js?v=${Date.now()}"></script>`,                                                  init: 'loadAthletes();',            view: 'poomsae-athletes.ejs' },
  poomsaeMatches: { title: '品势比赛查询', scripts: `<script src="/js/poomsae-matches.js?v=${Date.now()}"></script>`,                                                    init: 'loadPoomsaeMatches();',      view: 'poomsae-matches.ejs' }
};

/* ==================== URL 路径 → 页面键名映射 ==================== */

const urlPageMap = {
  '/':               'dashboard',
  '/events':         'events',
  '/athletes':       'athletes',
  '/weighin':        'weighin',
  '/brackets':       'brackets',
  '/bracket-detail': 'bracketDetail',
  '/bracket-test':   'bracketTest',
  '/jj-brackets':    'jjBrackets',
  '/matches':        'matches',
  '/jj-matches':     'jjMatches',
  '/team-scores':    'teamScores',
  '/medal-board':    'medalBoard',
  '/poomsae':        'poomsae',
  '/poomsae-athletes':'poomsaeAthletes',
  '/poomsae-matches':'poomsaeMatches'
};

/* ==================== 通用页面渲染 ==================== */

function renderPage(req, res, pageKey) {
  const config = pageConfig[pageKey];
  const viewPath = path.join(__dirname, 'views', config.view);
  const bodyContent = fs.readFileSync(viewPath, 'utf8');

  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  res.removeHeader('X-Powered-By');
  res.render('layout', {
    activePage: pageKey,
    title: config.title,
    body: bodyContent,
    pageScripts: config.scripts,
    initCalls: config.init
  });
}

for (const [urlPath, pageKey] of Object.entries(urlPageMap)) {
  app.get(urlPath, (req, res) => renderPage(req, res, pageKey));
}

/* ==================== 中间件配置 ==================== */

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false }));

/* ==================== 数据库与 brackets-manager 初始化 ==================== */

const db = new MySQLDatabase();

let storage = null;
let bracketsManager = null;

/* ==================== 应用启动 ==================== */

async function initApp() {
  try {
    await db.connect();

    storage = new MySQLStorage(db.pool);
    bracketsManager = new BracketsManager(storage);

    /* --- 认证相关 API（无需 authMiddleware） --- */
    app.post('/api/login', async (req, res) => {
      const { username, password } = req.body;

      try {
        const user = await db.get('SELECT * FROM test_user WHERE username = ?', [username]);

        if (user && user.password === password) {
          const token = generateToken({ username: user.username, role: user.role });
          res.json({ success: true, token, username: user.username });
        } else {
          res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
      } catch (err) {
        console.error('登录验证失败:', err.message);
        res.status(500).json({ success: false, error: '服务器内部错误' });
      }
    });

    app.get('/api/check-auth', authMiddleware, (req, res) => {
      res.json({ success: true, user: req.user });
    });

    /* --- 业务 API 路由（需认证） --- */
    app.use('/api', authMiddleware);
    app.use('/api', routes(db, bracketsManager, upload));
    app.use('/api', jjRoutes(db, bracketsManager));

    /* --- 启动 HTTP 服务 --- */
    const server = app.listen(PORT, () => {
      console.log(`🥋 跆拳道编排系统服务器运行在 http://localhost:${PORT}`);
    });

    /* --- 启动 WebSocket 服务 --- */
    const WebSocketManager = require('./websocket');
    new WebSocketManager(server, db);
  } catch (err) {
    console.error('❌ 系统启动失败:', err.message);
    process.exit(1);
  }
}

initApp();

/* ==================== 优雅关闭 ==================== */

process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await db.close();
  process.exit(0);
});
