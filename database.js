const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'taekwondo_manager',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

class MySQLDatabase {
  constructor() {
    this.pool = null;
    this.db = null;
  }

  async _createIndex(conn, indexName, tableName, columns, isUnique = false) {
    try {
      const keyword = isUnique ? 'UNIQUE INDEX' : 'INDEX';
      await conn.execute(`CREATE ${keyword} ${indexName} ON ${tableName}(${columns})`);
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME' && err.code !== 'ER_DUP_ENTRY') {
        throw err;
      }
    }
  }

  async connect() {
    try {
      const createConn = await mysql.createConnection({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        charset: DB_CONFIG.charset
      });

      await createConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await createConn.end();

      this.pool = mysql.createPool(DB_CONFIG);
      this.db = this.pool;

      const originalExecute = this.pool.execute.bind(this.pool);
      this.pool.execute = async function(sql, params) {
        const safeParams = Array.isArray(params) ? params.map(p => p === undefined ? null : p) : params;
        return originalExecute(sql, safeParams);
      };

      await this.initTables();
      console.log('✅ 数据库表初始化完成');
      return this;
    } catch (err) {
      console.error('❌ 数据库连接失败:', err.message);
      throw err;
    }
  }

  async run(sql, params = []) {
    sql = sql.replace(/\?/g, (m, offset, str) => {
      const before = str.substring(0, offset);
      const after = str.substring(offset + 1);
      const quotesBefore = (before.match(/'/g) || []).length;
      if (quotesBefore % 2 === 1) return '?';
      return '?';
    });

    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const [result] = await this.pool.execute(sql, params);
      return { id: result.insertId, changes: result.affectedRows, insertId: result.insertId };
    }
    if (sql.trim().toUpperCase().startsWith('UPDATE') || sql.trim().toUpperCase().startsWith('DELETE')) {
      const [result] = await this.pool.execute(sql, params);
      return { changes: result.affectedRows };
    }
    const [result] = await this.pool.execute(sql, params);
    return { changes: result.affectedRows, insertId: result.insertId };
  }

  async get(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async all(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  async exec(sql) {
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      await this.pool.execute(stmt);
    }
  }

  async initTables() {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS events (
          event_id INT PRIMARY KEY AUTO_INCREMENT,
          event_name VARCHAR(255) NOT NULL,
          event_venue VARCHAR(255) DEFAULT NULL,
          event_date VARCHAR(50) DEFAULT NULL,
          event_type VARCHAR(50) DEFAULT '跆拳道比赛',
          event_status VARCHAR(50) DEFAULT '报名中',
          comp_start VARCHAR(50) DEFAULT NULL,
          comp_end VARCHAR(50) DEFAULT NULL,
          reg_start VARCHAR(50) DEFAULT NULL,
          reg_end VARCHAR(50) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS events_config (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT NOT NULL,
          eventconfig_win_methods TEXT DEFAULT NULL,
          eventconfig_default_rounds INT DEFAULT 3,
          eventconfig_break_duration INT DEFAULT 60,
          eventconfig_weighing_tolerance DECIMAL(5,2) DEFAULT 0.30,
          eventconfig_max_limit_tolerance INT DEFAULT 6,
          eventconfig_min_limit_tolerance INT DEFAULT 5,
          eventconfig_venue_count INT DEFAULT 1,
          eventconfig_date_count INT DEFAULT 1,
          FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS athletes (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          athlete_id VARCHAR(100) DEFAULT NULL,
          athlete_name VARCHAR(255) NOT NULL,
          athlete_gender VARCHAR(10) DEFAULT NULL,
          athlete_team VARCHAR(255) DEFAULT NULL,
          athlete_draw_num INT DEFAULT 0,
          athlete_pre_draw_num INT DEFAULT 0,
          athlete_age_group VARCHAR(100) DEFAULT NULL,
          athlete_category VARCHAR(255) DEFAULT NULL,
          athlete_rank INT DEFAULT 0,
          same_team INT DEFAULT 0,
          athlete_type VARCHAR(20) DEFAULT 'taekwondo_kyougi',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id),
          UNIQUE KEY uk_event_athlete (event_id, athlete_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_athletes_category', 'athletes', 'athlete_category');
      await this._createIndex(conn, 'idx_athletes_team', 'athletes', 'athlete_team');
      await this._createIndex(conn, 'idx_athletes_event_id', 'athletes', 'event_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS athletes_weighing (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          weighing_id VARCHAR(100) DEFAULT NULL,
          athlete_id VARCHAR(100) DEFAULT NULL,
          frist_weight_record DECIMAL(6,2) DEFAULT NULL,
          second_weight_record DECIMAL(6,2) DEFAULT NULL,
          athlete_weight_qualified VARCHAR(20) DEFAULT '未标注',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          record_time DATETIME DEFAULT NULL,
          FOREIGN KEY (event_id) REFERENCES events(event_id),
          UNIQUE KEY uk_weighing_event_athlete (event_id, athlete_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS category_mode (
          category_id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          weight_class VARCHAR(255) NOT NULL,
          category_venue VARCHAR(50) DEFAULT NULL,
          category_date_num INT DEFAULT NULL,
          category_order INT DEFAULT NULL,
          categroy_count INT DEFAULT 0,
          categroy_mode_num INT DEFAULT 1,
          categroy_mode_name VARCHAR(50) DEFAULT '单败淘汰赛',
          category_mode_description TEXT DEFAULT NULL,
          mode VARCHAR(50) DEFAULT 'single_elimination',
          mode_name VARCHAR(100) DEFAULT NULL,
          description TEXT DEFAULT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id),
          UNIQUE KEY uk_event_weight_class (event_id, weight_class),
          UNIQUE KEY uk_category_event (category_id, event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS matchs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          category_id VARCHAR(100) DEFAULT NULL,
          match_venue VARCHAR(50) DEFAULT NULL,
          match_id VARCHAR(50) DEFAULT NULL,
          match_categroy VARCHAR(255) DEFAULT NULL,
          match_round_num INT DEFAULT 1,
          match_round_name VARCHAR(100) DEFAULT NULL,
          match_category_total_rounds INT DEFAULT 1,
          blue_athlete_id VARCHAR(100) DEFAULT NULL,
          blue_athlete_name VARCHAR(255) DEFAULT NULL,
          blue_athlete_team VARCHAR(255) DEFAULT NULL,
          blue_prev_winner VARCHAR(255) DEFAULT NULL,
          red_athlete_id VARCHAR(100) DEFAULT NULL,
          red_athlete_name VARCHAR(255) DEFAULT NULL,
          red_athlete_team VARCHAR(255) DEFAULT NULL,
          red_prev_winner VARCHAR(255) DEFAULT NULL,
          match_status VARCHAR(20) DEFAULT '未开始',
          win_method VARCHAR(100) DEFAULT NULL,
          weight_class VARCHAR(255) DEFAULT NULL,
          venue VARCHAR(50) DEFAULT NULL,
          venue_no INT DEFAULT 0,
          round INT DEFAULT 1,
          total_rounds INT DEFAULT 1,
          blue_score INT DEFAULT 0,
          blue_wins INT DEFAULT 0,
          blue_draw_no INT DEFAULT 0,
          blue_name VARCHAR(255) DEFAULT NULL,
          blue_unit VARCHAR(255) DEFAULT NULL,
          red_score INT DEFAULT 0,
          red_wins INT DEFAULT 0,
          red_draw_no INT DEFAULT 0,
          red_name VARCHAR(255) DEFAULT NULL,
          red_unit VARCHAR(255) DEFAULT NULL,
          winner VARCHAR(20) DEFAULT NULL,
          bracket_match_id INT DEFAULT NULL,
          round_name VARCHAR(100) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_matchs_weight_class', 'matchs', 'weight_class');
      await this._createIndex(conn, 'idx_matchs_venue_no', 'matchs', 'venue_no');
      await this._createIndex(conn, 'idx_matchs_status', 'matchs', 'match_status');
      await this._createIndex(conn, 'idx_matchs_event_id', 'matchs', 'event_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS taekwondo_kyougi_matchs (
          id INT PRIMARY KEY AUTO_INCREMENT UNIQUE,
          event_id INT DEFAULT NULL,
          kyougi_match_venue VARCHAR(50) DEFAULT NULL,
          kyougi_match_id VARCHAR(50) DEFAULT NULL,
          kyougi_match_categroy VARCHAR(255) DEFAULT NULL,
          kyougi_match_round_num INT DEFAULT 1,
          kyougi_match_round_name VARCHAR(100) DEFAULT NULL,
          kyougi_match_category_total_rounds INT DEFAULT 1,
          kyougi_bracket_match_id INT DEFAULT NULL,
          kyougi_blue_athlete_id VARCHAR(100) DEFAULT NULL,
          kyougi_blue_athlete_name VARCHAR(255) DEFAULT NULL,
          kyougi_blue_athlete_team VARCHAR(255) DEFAULT NULL,
          kyougi_blue_prev_winner VARCHAR(255) DEFAULT NULL,
          kyougi_red_athlete_id VARCHAR(100) DEFAULT NULL,
          kyougi_red_athlete_name VARCHAR(255) DEFAULT NULL,
          kyougi_red_athlete_team VARCHAR(255) DEFAULT NULL,
          kyougi_red_prev_winner_id VARCHAR(255) DEFAULT NULL,
          kyougi_match_status VARCHAR(20) DEFAULT '未开始',
          kyougi_match_scores VARCHAR(50) DEFAULT NULL,
          kyougi_match_scores_detail JSON DEFAULT NULL,
          kyougi_win_method VARCHAR(100) DEFAULT NULL,
          kyougi_winner VARCHAR(20) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'uk_event_venue_match', 'taekwondo_kyougi_matchs', ['event_id', 'kyougi_match_venue', 'kyougi_match_id'], true);
      await this._createIndex(conn, 'idx_kyougi_match_categroy', 'taekwondo_kyougi_matchs', 'kyougi_match_categroy');
      await this._createIndex(conn, 'idx_kyougi_match_venue', 'taekwondo_kyougi_matchs', 'kyougi_match_venue');
      await this._createIndex(conn, 'idx_kyougi_match_status', 'taekwondo_kyougi_matchs', 'kyougi_match_status');
      await this._createIndex(conn, 'idx_kyougi_match_event_id', 'taekwondo_kyougi_matchs', 'event_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_participant (
          id INT PRIMARY KEY AUTO_INCREMENT,
          tournament_id INT NOT NULL DEFAULT 1,
          event_id INT DEFAULT NULL,
          category_id VARCHAR(100) DEFAULT NULL,
          name VARCHAR(255) NOT NULL,
          custom_data TEXT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_stage (
          id INT PRIMARY KEY AUTO_INCREMENT,
          tournament_id INT NOT NULL DEFAULT 1,
          event_id INT DEFAULT NULL,
          category_id VARCHAR(100) DEFAULT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          number INT NOT NULL,
          settings TEXT DEFAULT NULL,
          seeding TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_event_category (event_id, category_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_stage_event', 'bracket_stage', 'event_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_group (
          id INT PRIMARY KEY AUTO_INCREMENT,
          stage_id INT NOT NULL,
          name VARCHAR(255) NOT NULL DEFAULT '',
          number INT NOT NULL,
          FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_group_stage', 'bracket_group', 'stage_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_round (
          id INT PRIMARY KEY AUTO_INCREMENT,
          stage_id INT NOT NULL,
          group_id INT DEFAULT NULL,
          name VARCHAR(255) NOT NULL,
          number INT NOT NULL,
          FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES bracket_group(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_round_stage', 'bracket_round', 'stage_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_match (
          id INT PRIMARY KEY AUTO_INCREMENT,
          stage_id INT NOT NULL,
          round_id INT DEFAULT NULL,
          group_id INT DEFAULT NULL,
          event_id INT DEFAULT NULL,
          category_id VARCHAR(100) DEFAULT NULL,
          number INT NOT NULL,
          child_count INT NOT NULL DEFAULT 0,
          opponent1 TEXT DEFAULT NULL,
          opponent2 TEXT DEFAULT NULL,
          winner_id INT DEFAULT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          next_match_id INT DEFAULT NULL,
          FOREIGN KEY (stage_id) REFERENCES bracket_stage(id) ON DELETE CASCADE,
          FOREIGN KEY (round_id) REFERENCES bracket_round(id),
          FOREIGN KEY (group_id) REFERENCES bracket_group(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_match_stage', 'bracket_match', 'stage_id');
      await this._createIndex(conn, 'idx_match_round', 'bracket_match', 'round_id');
      await this._createIndex(conn, 'idx_match_group', 'bracket_match', 'group_id');
      await this._createIndex(conn, 'idx_match_next', 'bracket_match', 'next_match_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS bracket_match_game (
          id INT PRIMARY KEY AUTO_INCREMENT,
          stage_id INT DEFAULT NULL,
          parent_id INT DEFAULT NULL,
          match_id INT DEFAULT NULL,
          number INT NOT NULL,
          opponent1_score INT DEFAULT NULL,
          opponent2_score INT DEFAULT NULL,
          FOREIGN KEY (match_id) REFERENCES bracket_match(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_match_game_match', 'bracket_match_game', 'match_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS poomsae_groups (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          poomsae_group_id VARCHAR(100) DEFAULT NULL,
          poomsae_group_name VARCHAR(255) NOT NULL,
          poomsae_group_type VARCHAR(20) DEFAULT '个人',
          poomsae_age_group VARCHAR(100) DEFAULT '少年组',
          poomsae_group_gender VARCHAR(10) DEFAULT '男',
          poomsae_form_name_1 VARCHAR(100) DEFAULT NULL,
          poomsae_form_name_2 VARCHAR(100) DEFAULT NULL,
          poomsae_form_name_3 VARCHAR(100) DEFAULT NULL,
          poomsae_form_name_4 VARCHAR(100) DEFAULT NULL,
          poomsae_form_name_5 VARCHAR(100) DEFAULT NULL,
          poomsae_form_name_6 VARCHAR(100) DEFAULT NULL,
          poomsae_status VARCHAR(20) DEFAULT '未开始',
          name VARCHAR(255) DEFAULT NULL,
          type VARCHAR(20) DEFAULT '个人',
          gender VARCHAR(10) DEFAULT '男',
          age_group VARCHAR(100) DEFAULT '少年组',
          form_name VARCHAR(100) DEFAULT '太极一章',
          venue VARCHAR(50) DEFAULT 'A',
          comp_time VARCHAR(50) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id),
          UNIQUE KEY uk_poomsae_group (event_id, poomsae_group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_poomsae_groups_event', 'poomsae_groups', 'event_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS athletes_poomsae (
          id INT PRIMARY KEY AUTO_INCREMENT,
          event_id INT DEFAULT NULL,
          poomsae_athlete_group_id INT DEFAULT NULL,
          poomsae_athlete_id VARCHAR(100) DEFAULT NULL,
          poomsae_athlete_name VARCHAR(255) DEFAULT NULL,
          poomsae_athlete_team VARCHAR(255) DEFAULT NULL,
          poomsae_athlete_draw_num INT DEFAULT 0,
          poomsae_athlete_colored_belt VARCHAR(50) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS poomsae_matchs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          poomsae_match_id VARCHAR(100) DEFAULT NULL,
          event_id INT DEFAULT NULL,
          poomsae_venue VARCHAR(50) DEFAULT NULL,
          poomsae_match_num VARCHAR(50) DEFAULT NULL,
          poomsae_type VARCHAR(20) DEFAULT NULL,
          poomsae_group_id VARCHAR(100) DEFAULT NULL,
          poomsae_athlete_id VARCHAR(100) DEFAULT NULL,
          poomsae_athlete_name VARCHAR(255) DEFAULT NULL,
          poomsae_athlete_team VARCHAR(255) DEFAULT NULL,
          poomsae_match_status VARCHAR(20) DEFAULT 'pending',
          poomsae_round_num INT DEFAULT 1,
          poomsae_round_name VARCHAR(50) DEFAULT '决赛',
          poomsae_final_score DECIMAL(8,4) DEFAULT NULL,
          poomsae_presentation_avg DECIMAL(8,4) DEFAULT NULL,
          poomsae_accuracy_avg DECIMAL(8,4) DEFAULT NULL,
          routine VARCHAR(100) DEFAULT NULL,
          poomsae_advanced_rank INT DEFAULT NULL,
          format VARCHAR(50) DEFAULT NULL,
          venue VARCHAR(50) DEFAULT '',
          display_num INT DEFAULT 0,
          gender VARCHAR(10) DEFAULT '',
          group_class VARCHAR(100) DEFAULT '',
          weight_class VARCHAR(255) DEFAULT '',
          athlete_id INT DEFAULT NULL,
          draw_no INT DEFAULT 0,
          athlete_name VARCHAR(255) DEFAULT '',
          athlete_unit VARCHAR(255) DEFAULT '',
          status VARCHAR(20) DEFAULT 'pending',
          round INT DEFAULT 1,
          round_label VARCHAR(50) DEFAULT '决赛',
          final_score DECIMAL(8,4) DEFAULT NULL,
          accuracy_avg DECIMAL(8,4) DEFAULT NULL,
          presentation_avg DECIMAL(8,4) DEFAULT NULL,
          advance_rank INT DEFAULT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_poomsae_match_event', 'poomsae_matchs', 'event_id');
      await this._createIndex(conn, 'idx_poomsae_match_venue', 'poomsae_matchs', 'event_id, poomsae_venue');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS poomsae_scores (
          id INT PRIMARY KEY AUTO_INCREMENT,
          poomsae_scores_id VARCHAR(100) DEFAULT NULL,
          match_id INT DEFAULT NULL,
          poomase_match_id VARCHAR(100) DEFAULT NULL,
          poomase_referee_count INT DEFAULT NULL,
          poomsae_final_score DECIMAL(8,4) DEFAULT NULL,
          poomsae_presentation DECIMAL(8,4) DEFAULT NULL,
          poomsae_accuracy DECIMAL(8,4) DEFAULT NULL,
          poomsae_detail_score JSON DEFAULT NULL,
          athlete_id INT DEFAULT NULL,
          group_id INT DEFAULT NULL,
          event_id INT DEFAULT NULL,
          judge_count INT DEFAULT NULL,
          presentation_score DECIMAL(8,4) DEFAULT NULL,
          accuracy_score DECIMAL(8,4) DEFAULT NULL,
          total_score DECIMAL(8,4) DEFAULT NULL,
          judge_scores TEXT DEFAULT NULL,
          judge_no INT NOT NULL DEFAULT 0,
          accuracy DECIMAL(8,4) NOT NULL DEFAULT 0,
          presentation DECIMAL(8,4) NOT NULL DEFAULT 0,
          total DECIMAL(8,4) NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_poomsae_scores_judge (match_id, judge_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this._createIndex(conn, 'idx_poomsae_scores_match', 'poomsae_scores', 'match_id');

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS test_user (
          id INT PRIMARY KEY AUTO_INCREMENT,
          username VARCHAR(100) NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'admin',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await conn.execute(`
        INSERT INTO test_user (username, password, role)
        SELECT 'root', '123456', 'admin'
        WHERE NOT EXISTS (SELECT 1 FROM test_user WHERE username = 'root')
      `);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error('❌ 数据库初始化错误:', err.message);
      throw err;
    } finally {
      conn.release();
    }
  }

  async migrateMatchsToKyougiMatchs() {
    try {
      const oldRows = await this.all('SELECT COUNT(*) as cnt FROM matchs');
      if (!oldRows || oldRows[0].cnt === 0) {
        console.log('📋 旧matchs表无数据，跳过迁移');
        return;
      }

      const existing = await this.all('SELECT COUNT(*) as cnt FROM taekwondo_kyougi_matchs');
      if (existing && existing[0].cnt > 0) {
        console.log('📋 taekwondo_kyougi_matchs表已有数据，跳过迁移');
        return;
      }

      const oldMatches = await this.all('SELECT * FROM matchs');
      for (const m of oldMatches) {
        const scores = (m.blue_score != null && m.red_score != null)
          ? `${m.blue_score}:${m.red_score}` : null;
        await this.run(
          `INSERT INTO taekwondo_kyougi_matchs (
            event_id, kyougi_match_venue, kyougi_match_id, kyougi_match_categroy,
            kyougi_match_round_num, kyougi_match_round_name, kyougi_match_category_total_rounds,
            kyougi_bracket_match_id,
            kyougi_blue_athlete_id, kyougi_blue_athlete_name, kyougi_blue_athlete_team, kyougi_blue_prev_winner,
            kyougi_red_athlete_id, kyougi_red_athlete_name, kyougi_red_athlete_team, kyougi_red_prev_winner_id,
            kyougi_match_status, kyougi_match_scores, kyougi_win_method, kyougi_winner
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.event_id ?? null,
            m.venue_no != null ? String(m.venue_no) : (m.venue || null),
            m.match_id ?? null,
            m.weight_class ?? m.match_categroy ?? null,
            m.round ?? m.match_round_num ?? 1,
            m.round_name ?? m.match_round_name ?? null,
            m.total_rounds ?? m.match_category_total_rounds ?? 1,
            m.bracket_match_id ?? null,
            m.blue_athlete_id ?? null,
            m.blue_name ?? m.blue_athlete_name ?? null,
            m.blue_unit ?? m.blue_athlete_team ?? null,
            m.blue_prev_winner ?? null,
            m.red_athlete_id ?? null,
            m.red_name ?? m.red_athlete_name ?? null,
            m.red_unit ?? m.red_athlete_team ?? null,
            m.red_prev_winner ?? null,
            m.match_status ?? '未开始',
            scores,
            m.win_method ?? null,
            m.winner ?? null
          ]
        );
      }
      console.log(`✅ 已迁移 ${oldMatches.length} 条数据从matchs到taekwondo_kyougi_matchs`);
    } catch (err) {
      console.error('❌ 迁移matchs数据失败:', err.message);
    }
  }

  prepare(sql) {
    const pool = this.pool;
    return {
      async run(...params) {
        if (Array.isArray(params[0])) params = params[0];
        const [result] = await pool.execute(sql, params);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      },
      async get(...params) {
        if (Array.isArray(params[0])) params = params[0];
        const [rows] = await pool.execute(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async all(...params) {
        if (Array.isArray(params[0])) params = params[0];
        const [rows] = await pool.execute(sql, params);
        return rows;
      }
    };
  }

  async transaction(fn) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = MySQLDatabase;
