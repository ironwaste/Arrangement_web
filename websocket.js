const WebSocket = require('ws');

class WebSocketManager {
  constructor(server, db) {
    this.wss = new WebSocket.Server({ server });
    this.db = db;
    this.clients = new Map(); // client -> { role, matchId }
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 新客户端连接');
      this.clients.set(ws, { role: 'unknown', matchId: null });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data);
          await this.handleMessage(ws, msg);
        } catch (err) {
          console.error('消息处理错误:', err);
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      });

      ws.on('close', () => {
        console.log('❌ 客户端断开');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket 错误:', err);
      });

      // 发送欢迎消息
      ws.send(JSON.stringify({ type: 'connected', message: '已连接到跆拳道计分服务器' }));
    });
  }

  async handleMessage(ws, msg) {
    const clientInfo = this.clients.get(ws);

    switch (msg.type) {
      case 'register':
        // 注册客户端角色：judge(裁判), display(显示板), admin(管理)
        clientInfo.role = msg.role || 'unknown';
        clientInfo.matchId = msg.matchId || null;
        ws.send(JSON.stringify({ type: 'registered', role: clientInfo.role }));
        console.log(`👤 客户端注册为: ${clientInfo.role}`);
        break;

      case 'score_update':
        // 裁判提交分数更新
        if (clientInfo.role !== 'judge') {
          ws.send(JSON.stringify({ type: 'error', message: '权限不足' }));
          return;
        }
        await this.handleScoreUpdate(msg.data);
        break;

      case 'match_start':
        // 比赛开始
        await this.handleMatchStart(msg.data);
        break;

      case 'match_end':
        // 比赛结束
        await this.handleMatchEnd(msg.data);
        break;

      case 'get_match_status':
        // 获取比赛状态
        const match = await this.db.get(
          'SELECT * FROM matches WHERE id = ?',
          [msg.matchId]
        );
        ws.send(JSON.stringify({ type: 'match_status', data: match }));
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: '未知消息类型' }));
    }
  }

  async handleScoreUpdate(data) {
    const { matchId, blueScore, redScore, blueWins, redWins, roundNo } = data;

    // 更新比赛分数
    await this.db.run(
      `UPDATE matches SET 
        blue_score = ?, red_score = ?,
        blue_wins = ?, red_wins = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blueScore, redScore, blueWins, redWins, matchId]
    );

    // 记录详细计分
    await this.db.run(
      `INSERT INTO scores (match_id, round_no, blue_points, red_points)
       VALUES (?, ?, ?, ?)`,
      [matchId, roundNo, blueScore, redScore]
    );

    // 广播给所有连接的客户端
    this.broadcast({
      type: 'score_changed',
      data: {
        matchId,
        blueScore,
        redScore,
        blueWins,
        redWins,
        roundNo,
        timestamp: Date.now()
      }
    });
  }

  async handleMatchStart(data) {
    const { matchId } = data;
    await this.db.run(
      "UPDATE matches SET match_status = '进行中', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [matchId]
    );

    this.broadcast({
      type: 'match_started',
      data: { matchId, timestamp: Date.now() }
    });
  }

  async handleMatchEnd(data) {
    const { matchId, winner, winMethod } = data;
    
    await this.db.run(
      `UPDATE matches SET 
        winner = ?, win_method = ?, match_status = '已结束',
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [winner, winMethod, matchId]
    );

    this.broadcast({
      type: 'match_ended',
      data: { matchId, winner, winMethod, timestamp: Date.now() }
    });
  }

  broadcast(message) {
    const msgStr = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }

  // 向特定角色的客户端发送消息
  broadcastToRole(role, message) {
    const msgStr = JSON.stringify(message);
    this.clients.forEach((info, client) => {
      if (info.role === role && client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }
}

module.exports = WebSocketManager;
