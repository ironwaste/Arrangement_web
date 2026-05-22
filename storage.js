/** brackets-manager 的 MySQL 存储适配器，将对阵图数据持久化到 MySQL */
const mysql = require('mysql2/promise');

class MySQLStorage {
    constructor(pool) {
        this.pool = pool;
        this._currentStageTotalRounds = null;
    }

    _serialize(obj) {
        return obj === null || obj === undefined ? null : JSON.stringify(obj);
    }

    _deserialize(str) {
        if (!str) return null;
        try {
            return JSON.parse(str);
        } catch {
            return null;
        }
    }

    _getTableName(table) {
        const map = {
            participant: 'bracket_participant',
            stage: 'bracket_stage',
            group: 'bracket_group',
            round: 'bracket_round',
            match: 'bracket_match',
            match_game: 'bracket_match_game',
        };
        return map[table];
    }

    _prepareRow(table, data) {
        const copy = { ...data };
        switch (table) {
            case 'stage':
                if (copy.settings) copy.settings = this._serialize(copy.settings);
                if (copy.seeding) copy.seeding = this._serialize(copy.seeding);
                break;
            case 'match':
                if (copy.opponent1) copy.opponent1 = this._serialize(copy.opponent1);
                if (copy.opponent2) copy.opponent2 = this._serialize(copy.opponent2);
                break;
            default:
                break;
        }
        return copy;
    }

    _parseRow(table, row) {
        if (!row) return null;
        const copy = { ...row };
        switch (table) {
            case 'stage':
                if (copy.settings) copy.settings = this._deserialize(copy.settings);
                if (copy.seeding) copy.seeding = this._deserialize(copy.seeding);
                break;
            case 'match':
                if (copy.opponent1) copy.opponent1 = this._deserialize(copy.opponent1);
                if (copy.opponent2) copy.opponent2 = this._deserialize(copy.opponent2);
                break;
            default:
                break;
        }
        return copy;
    }

    _getRoundName(roundNumber, totalRounds) {
        if (!roundNumber || !totalRounds) return null;
        if (roundNumber === totalRounds) return 'Final';
        const denominator = 2 ** (totalRounds - roundNumber);
        if (denominator >= 2) {
            return `1/${denominator}`;
        }
        return `Round ${roundNumber}`;
    }

    setCurrentStageTotalRounds(totalRounds) {
        this._currentStageTotalRounds = totalRounds;
    }

    async insert(table, value) {
        if (Array.isArray(value)) {
            return this._insertBatch(table, value);
        }
        const tableName = this._getTableName(table);
        let data = this._prepareRow(table, value);

        if (table === 'group' && (data.name === undefined || data.name === null)) {
            data.name = `Group ${data.number || ''}`;
        }
        if (table === 'round' && (data.name === undefined || data.name === null)) {
            data.name = this._getRoundName(data.number, this._currentStageTotalRounds) || `Round ${data.number || ''}`;
        }

        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(',');
        const sql = `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`;
        const [result] = await this.pool.execute(sql, Object.values(data));
        return result.insertId;
    }

    async _insertBatch(table, values) {
        for (const item of values) {
            await this.insert(table, item);
        }
        return true;
    }

    async select(table, arg1) {
        const tableName = this._getTableName(table);

        if (arg1 === undefined) {
            const [rows] = await this.pool.execute(`SELECT * FROM ${tableName}`);
            return rows.map(row => this._parseRow(table, row));
        }

        if (typeof arg1 === 'number') {
            const [rows] = await this.pool.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [arg1]);
            return this._parseRow(table, rows[0]) || null;
        }

        if (typeof arg1 === 'object' && arg1 !== null) {
            const keys = Object.keys(arg1);
            if (keys.length === 0) {
                const [rows] = await this.pool.execute(`SELECT * FROM ${tableName}`);
                return rows.map(row => this._parseRow(table, row));
            }
            const conditions = keys.map(k => `${k} = ?`).join(' AND ');
            const values = keys.map(k => arg1[k]);
            const [rows] = await this.pool.execute(`SELECT * FROM ${tableName} WHERE ${conditions}`, values);
            return rows.map(row => this._parseRow(table, row));
        }

        return null;
    }

    async update(table, id, value) {
        if (typeof id === 'object') {
            return this._updateByFilter(table, id, value);
        }
        const tableName = this._getTableName(table);
        const data = this._prepareRow(table, value);
        const keys = Object.keys(data);
        const setClause = keys.map(k => `${k} = ?`).join(',');
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
        const params = [...keys.map(k => data[k]), id];
        const [result] = await this.pool.execute(sql, params);
        return result.affectedRows > 0;
    }

    async _updateByFilter(table, filter, value) {
        const tableName = this._getTableName(table);
        const filterKeys = Object.keys(filter);
        const setKeys = Object.keys(value);
        const setClause = setKeys.map(k => `${k} = ?`).join(',');
        const whereClause = filterKeys.map(k => `${k} = ?`).join(' AND ');
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
        const params = [
            ...setKeys.map(k => this._prepareRow(table, { [k]: value[k] })[k]),
            ...filterKeys.map(k => filter[k]),
        ];
        const [result] = await this.pool.execute(sql, params);
        return result.affectedRows > 0;
    }

    async delete(table, filter) {
        const tableName = this._getTableName(table);
        if (typeof filter === 'number') {
            const [result] = await this.pool.execute(`DELETE FROM ${tableName} WHERE id = ?`, [filter]);
            return result.affectedRows > 0;
        }
        if (typeof filter === 'object' && filter !== null) {
            const keys = Object.keys(filter);
            const conditions = keys.map(k => `${k} = ?`).join(' AND ');
            const values = keys.map(k => filter[k]);
            const [result] = await this.pool.execute(`DELETE FROM ${tableName} WHERE ${conditions}`, values);
            return result.affectedRows > 0;
        }
        const [result] = await this.pool.execute(`DELETE FROM ${tableName}`);
        return result.affectedRows > 0;
    }

    async selectFirst(table, filter, assertUnique = false) {
        const rows = await this.select(table, filter);
        if (!rows || rows.length === 0) return null;
        const row = rows[0];
        if (assertUnique && rows.length > 1) {
            throw new Error(`Expected unique result for ${table} with filter ${JSON.stringify(filter)}, but got ${rows.length} rows.`);
        }
        return row;
    }

    async selectLast(table, filter, assertUnique = false) {
        const rows = await this.select(table, filter);
        if (!rows || rows.length === 0) return null;
        const row = rows[rows.length - 1];
        if (assertUnique && rows.length > 1) {
            throw new Error(`Expected unique result for ${table} with filter ${JSON.stringify(filter)}, but got ${rows.length} rows.`);
        }
        return row;
    }
}

module.exports = { MySQLStorage };
