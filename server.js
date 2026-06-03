const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { authMiddleware, generateToken } = require('./auth');
const MySQLDatabase = require('./backend/database/database');
const { MySQLStorage } = require('./storage');
const { BracketsManager } = require('brackets-manager');

const TournamentService = require('./backend/services/tournamentService');
const BracketService = require('./backend/services/bracketService');
const ExportService = require('./backend/services/exportService');
const MatchRepository = require('./backend/database/repositories/matchRepository');

const TournamentController = require('./backend/controllers/tournamentController');
const ExportController = require('./backend/controllers/exportController');
const backendRoutes = require('./backend/routes');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false }));
app.use(express.static(path.join(__dirname, 'frontend'), { maxAge: 0, etag: false }));
app.use('/test', express.static(path.join(__dirname, 'test'), { maxAge: 0, etag: false }));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), { maxAge: 0, etag: false }));

let db = null;
let storage = null;

async function initApp() {
  try {
    db = new MySQLDatabase();
    await db.connect();

    storage = new MySQLStorage(db.pool);
    const bracketsManager = new BracketsManager(storage);

    const tournamentService = new TournamentService(db);
    const bracketService = new BracketService(db, storage);
    const matchRepository = new MatchRepository(db);
    const exportService = new ExportService(tournamentService, matchRepository);

    const tournamentController = new TournamentController(tournamentService, bracketService);
    const exportController = new ExportController(exportService);

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

    app.use('/api/v1', authMiddleware);
    app.use('/api/v1', backendRoutes(tournamentController, exportController));

    const routes = require('./routes/index');
    app.use('/api', authMiddleware);
    app.use('/api', routes(db, bracketsManager, upload));

    const server = app.listen(PORT, () => {
      console.log(`🥋 跆拳道编排系统服务器运行在 http://localhost:${PORT}`);
    });

    const WebSocketManager = require('./websocket');
    new WebSocketManager(server, db);
  } catch (err) {
    console.error('❌ 系统启动失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

initApp();

process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  if (db) {
    await db.close();
  }
  process.exit(0);
});