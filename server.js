const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { authMiddleware, generateToken } = require('./auth');

const MySQLDatabase = require('./database');
const routes = require('./routes/index');
const { MySQLStorage } = require('./storage');
const { BracketsManager } = require('brackets-manager');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const pageConfig = {
    dashboard: { title: '仪表盘', scripts: '', init: 'loadDashboard();' },
    events: { title: '赛事列表', scripts: '<script src="/js/events.js"></script>', init: 'loadEvents();' },
    athletes: { title: '运动员管理', scripts: '<script src="/js/athletes.js"></script><script src="/js/excel-filter.js"></script>', init: 'loadAthletes();' },
    weighin: { title: '称重管理', scripts: '<script src="/js/weighin.js"></script><script src="/js/excel-filter.js"></script>', init: 'loadWeighinData(); loadWeighinTolerance();' },
    brackets: { title: '跆拳道编排', scripts: '<script src="/js/excel-filter.js"></script><script src="/js/category-mode.js"></script><script src="/js/brackets.js"></script>', init: 'loadAutoArrangeData();' },
    bracketDetail: { title: '对阵图', scripts: '<script src="/js/category-mode.js"></script><script src="/js/bracket-detail.js"></script>', init: 'loadBracketClassList();' },
    bracketTest: { title: '摔跤编排', scripts: '<script src="/js/bracket-test.js"></script>', init: 'loadBracketTestPage();' },
    matches: { title: '对阵表', scripts: '<script src="/js/matches.js"></script><script src="/js/medal-board.js"></script><script src="/js/team-scores.js"></script><script src="/js/excel-filter.js"></script>', init: 'loadMatches();' },
    teamScores: { title: '团体总分', scripts: '<script src="/js/team-scores.js"></script>', init: 'loadTeamScores();' },
    medalBoard: { title: '奖牌榜', scripts: '<script src="/js/medal-board.js"></script>', init: 'loadMedalBoard();' },
    poomsae: { title: '品势编排', scripts: '<script src="/js/poomsae.js?v=' + Date.now() + '"></script>', init: 'loadPoomsaeArrangeData();' },
    poomsaeAthletes: { title: '品势运动员管理', scripts: '<script src="/js/poomsae-athletes.js?v=' + Date.now() + '"></script>', init: 'loadAthletes();' },
    poomsaeMatches: { title: '品势比赛查询', scripts: '<script src="/js/poomsae-matches.js?v=' + Date.now() + '"></script>', init: 'loadPoomsaeMatches();' }
};

function renderPage(req, res, page) {
    const config = pageConfig[page];
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.removeHeader('X-Powered-By');
    res.render('layout', {
        activePage: page,
        title: config.title,
        body: config.body || '',
        pageScripts: config.scripts,
        initCalls: config.init
    });
}

app.get('/', (req, res) => {
    const config = pageConfig.dashboard;
    res.render('layout', {
        activePage: 'dashboard',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'dashboard.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/events', (req, res) => {
    const config = pageConfig.events;
    res.render('layout', {
        activePage: 'events',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'events.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/athletes', (req, res) => {
    const config = pageConfig.athletes;
    res.render('layout', {
        activePage: 'athletes',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'athletes.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/weighin', (req, res) => {
    const config = pageConfig.weighin;
    res.render('layout', {
        activePage: 'weighin',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'weighin.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/brackets', (req, res) => {
    const config = pageConfig.brackets;
    res.render('layout', {
        activePage: 'brackets',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'taekwondo-kyougi-brackets.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/bracket-detail', (req, res) => {
    const config = pageConfig.bracketDetail;
    res.render('layout', {
        activePage: 'bracketDetail',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'bracket-detail.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/bracket-test', (req, res) => {
    const config = pageConfig.bracketTest;
    res.render('layout', {
        activePage: 'bracketTest',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'chinese-wrestle-arrange.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/matches', (req, res) => {
    const config = pageConfig.matches;
    res.render('layout', {
        activePage: 'matches',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'takewondo-kyougi-matches.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/team-scores', (req, res) => {
    const config = pageConfig.teamScores;
    res.render('layout', {
        activePage: 'teamScores',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'team-scores.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/medal-board', (req, res) => {
    const config = pageConfig.medalBoard;
    res.render('layout', {
        activePage: 'medalBoard',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'medal-board.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/poomsae', (req, res) => {
    const config = pageConfig.poomsae;
    res.render('layout', {
        activePage: 'poomsae',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'poomsae.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/poomsae-athletes', (req, res) => {
    const config = pageConfig.poomsaeAthletes;
    res.render('layout', {
        activePage: 'poomsaeAthletes',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'poomsae-athletes.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

app.get('/poomsae-matches', (req, res) => {
    const config = pageConfig.poomsaeMatches;
    res.render('layout', {
        activePage: 'poomsaeMatches',
        title: config.title,
        body: require('fs').readFileSync(path.join(__dirname, 'views', 'poomsae-matches.ejs'), 'utf8'),
        pageScripts: config.scripts,
        initCalls: config.init
    });
});

// 文件上传配置
const upload = multer({ dest: 'uploads/' });

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false }));

// 数据库实例
const db = new MySQLDatabase();

// brackets-manager 初始化
let storage = null;
let bracketsManager = null;

async function initApp() {
  try {
    await db.connect();
    await db.migrateMatchsToKyougiMatchs();
    storage = new MySQLStorage(db.pool);
    bracketsManager = new BracketsManager(storage);

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

    app.use('/api', authMiddleware);

    app.use('/api', routes(db, bracketsManager, upload));

    const server = app.listen(PORT, () => {
      console.log(`🥋 跆拳道编排系统服务器运行在 http://localhost:${PORT}`);
    });

    const WebSocketManager = require('./websocket');
    new WebSocketManager(server, db);
  } catch (err) {
    console.error('❌ 系统启动失败:', err.message);
    process.exit(1);
  }
}

initApp();

process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await db.close();
  process.exit(0);
});
