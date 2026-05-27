/**
 * 柔术对阵图数据生成器 (JJBracketGenerator)
 *
 * 职责：根据运动员列表和抽签顺序，纯前端生成各赛制的对阵数据结构（matches数组）。
 * 不依赖后端API，不操作DOM，仅做数据计算。
 * 生成的match对象包含：match_num、round_num、round_name、双方运动员信息、状态等。
 *
 * 支持的赛制：
 *   - single_elimination  单败淘汰赛
 *   - double_elimination  双败淘汰赛
 *   - round_robin         单循环赛
 *   - pool_elimination    分区循环赛（上区循环 + 下区循环 + 决赛）
 *
 * 数据流向：
 *   athletes(抽签后) → JJBracketGenerator → matches[] → jiu_jitsu_matchs表 / bracketsViewer渲染
 */
class JJBracketGenerator {

    /**
     * 生成单败淘汰赛对阵数据
     * @param {Array} athletes  运动员列表，每项含 athlete_id, athlete_name, athlete_team, athlete_draw_num
     * @param {Object} options  可选配置
     * @returns {{matches:Array, rounds:number, bracketSize:number}}
     *
     * 算法：
     *   1. 计算最小2幂bracketSize（如5人→8格）
     *   2. 按抽签号排序运动员
     *   3. 使用种子位置算法将运动员分布到bracket中
     *   4. 从最后一轮到第一轮生成match记录
     *
     * 轮次命名：Final → 1/2 → 1/4 → 1/8 → ...
     */
    static generateSingleElimination(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        let bracketSize = 2;
        while (bracketSize < count) bracketSize *= 2;

        const seeded = this._seedAthletes(athletes, bracketSize);
        const totalRounds = Math.log2(bracketSize);
        const matches = [];

        let matchNum = 1;
        for (let round = totalRounds; round >= 1; round--) {
            const matchesInRound = Math.pow(2, round - 1);
            const roundName = this._getRoundName(round, totalRounds);
            for (let i = 0; i < matchesInRound; i++) {
                const blueIdx = 2 * i;
                const redIdx = 2 * i + 1;
                const blue = seeded[blueIdx];
                const red = seeded[redIdx];
                const isBye = !blue || !red;

                matches.push({
                    match_num: matchNum++,
                    round_num: totalRounds - round + 1,
                    round_name: roundName,
                    blue_athlete_id: blue ? blue.athlete_id : null,
                    blue_athlete_name: blue ? blue.athlete_name : (isBye ? 'BYE' : null),
                    blue_athlete_team: blue ? blue.athlete_team : null,
                    red_athlete_id: red ? red.athlete_id : null,
                    red_athlete_name: red ? red.athlete_name : (isBye ? 'BYE' : null),
                    red_athlete_team: red ? red.athlete_team : null,
                    match_status: isBye ? 'bye' : 'pending',
                    bracket_type: 'winners'
                });
            }
        }

        return { matches, rounds: totalRounds, bracketSize };
    }

    /**
     * 生成双败淘汰赛对阵数据
     * 基于单败淘汰赛结果扩展：胜者组(WB)保持不变，额外生成败者组(LB)场次。
     *
     * 败者组轮次命名规则（按败者组内部序号）：
     *   Rep.1 → Rep.2 → ... → Bro.m（倒数第2场）→ D.Final（最后一场=总决赛）
     * 胜者组轮次命名与单败一致：D.Final → 1/2 → 1/4 → ...
     *
     * @param {Array} athletes  运动员列表
     * @param {Object} options  可选配置
     * @returns {{matches:Array, rounds:number, bracketSize:number, winnersMatches:Array, losersMatches:Array}}
     */
    static generateDoubleElimination(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const winnersResult = this.generateSingleElimination(athletes, options);
        const winnersMatches = winnersResult.matches;

        let bracketSize = 2;
        while (bracketSize < count) bracketSize *= 2;
        const totalRounds = Math.log2(bracketSize);

        for (const m of winnersMatches) {
            if (m.round_name === 'Final') {
                m.round_name = 'D.Final';
            }
        }

        const losersMatches = [];
        let matchNum = winnersMatches.length + 1;
        const losersRounds = totalRounds - 1;

        for (let round = 1; round <= losersRounds; round++) {
            const matchesInRound = Math.pow(2, totalRounds - round - 1);
            let roundName;
            if (round === losersRounds) roundName = 'Bro.m';
            else roundName = `Rep.${round}`;
            for (let i = 0; i < matchesInRound; i++) {
                losersMatches.push({
                    match_num: matchNum++,
                    round_num: totalRounds + round,
                    round_name: roundName,
                    blue_athlete_id: null,
                    blue_athlete_name: null,
                    blue_athlete_team: null,
                    red_athlete_id: null,
                    red_athlete_name: null,
                    red_athlete_team: null,
                    match_status: 'pending',
                    bracket_type: 'losers'
                });
            }
        }

        const allMatches = [...winnersMatches, ...losersMatches];

        return {
            matches: allMatches,
            rounds: totalRounds,
            bracketSize,
            winnersMatches,
            losersMatches
        };
    }

    /**
     * 生成单循环赛对阵数据
     * 使用Berger轮转法生成每轮比赛安排。
     *
     * 轮次命名：R1, R2, R3, ... （2人时为Final）
     *
     * @param {Array} athletes  运动员列表
     * @param {Object} options  可选配置
     * @returns {{matches:Array, rounds:number, totalMatches:number}}
     */
    static generateRoundRobin(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));
        const matches = [];
        let matchNum = 1;
        const totalRounds = count <= 2 ? 1 : count - 1;

        const schedule = this._jjRoundRobinSchedule(count);
        for (let r = 0; r < schedule.length; r++) {
            let roundName;
            if (count === 2) roundName = 'Final';
            else roundName = `R${r + 1}`;
            for (let i = 0; i < schedule[r].length; i++) {
                const { seed1, seed2 } = schedule[r][i];
                const blue = seed1 <= count ? sorted[seed1 - 1] : null;
                const red = seed2 <= count ? sorted[seed2 - 1] : null;
                if (blue && red) {
                    matches.push({
                        match_num: matchNum++,
                        round_num: r + 1,
                        round_name: roundName,
                        blue_athlete_id: blue.athlete_id,
                        blue_athlete_name: blue.athlete_name,
                        blue_athlete_team: blue.athlete_team,
                        red_athlete_id: red.athlete_id,
                        red_athlete_name: red.athlete_name,
                        red_athlete_team: red.athlete_team,
                        match_status: 'pending',
                        bracket_type: 'round_robin'
                    });
                }
            }
        }

        return { matches, rounds: totalRounds, totalMatches: matches.length };
    }

    /**
     * 生成分区循环赛对阵数据
     * 将运动员分为上区和下区，各自进行循环赛，最终产生决赛。
     *
     * 分区规则（按人数）：
     *   5人: 上3下2 | 6人: 上3下3 | 7人: 上3下4 | 其他: ceil(n/2) vs floor(n/2)
     *
     * 结构：
     *   group1: 上区循环赛（zone='upper', round_name=R1,R2,...）
     *   group2: 下区循环赛（zone='lower', round_name=R1,R2,...）
     *   group3: 决赛       （zone='final', round_name='R.Final', 显示"上区第一 vs 下区第一"）
     *
     * @param {Array} athletes  运动员列表
     * @param {Object} options  可选配置
     * @returns {{matches:Array, rounds:number, upperSize:number, lowerSize:number}}
     */
    static generatePoolElimination(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

        let upperSize, lowerSize;
        if (count === 5) { upperSize = 3; lowerSize = 2; }
        else if (count === 6) { upperSize = 3; lowerSize = 3; }
        else if (count === 7) { upperSize = 3; lowerSize = 4; }
        else { upperSize = Math.ceil(count / 2); lowerSize = count - upperSize; }

        const upperAthletes = sorted.slice(0, upperSize);
        const lowerAthletes = sorted.slice(upperSize);

        const matches = [];
        let matchNum = 1;

        const upperSchedule = this._jjRoundRobinSchedule(upperSize);
        for (let r = 0; r < upperSchedule.length; r++) {
            const roundName = `R${r + 1}`;
            for (const match of upperSchedule[r]) {
                const blue = match.seed1 <= upperSize ? upperAthletes[match.seed1 - 1] : null;
                const red = match.seed2 <= upperSize ? upperAthletes[match.seed2 - 1] : null;
                if (blue && red) {
                    matches.push({
                        match_num: matchNum++,
                        round_num: r + 1,
                        round_name: roundName,
                        blue_athlete_id: blue.athlete_id,
                        blue_athlete_name: blue.athlete_name,
                        blue_athlete_team: blue.athlete_team,
                        red_athlete_id: red.athlete_id,
                        red_athlete_name: red.athlete_name,
                        red_athlete_team: red.athlete_team,
                        match_status: 'pending',
                        bracket_type: 'pool',
                        zone: 'upper'
                    });
                }
            }
        }

        if (lowerSize >= 2) {
            const lowerSchedule = this._jjRoundRobinSchedule(lowerSize);
            for (let r = 0; r < lowerSchedule.length; r++) {
                const roundName = `R${r + 1}`;
                for (const match of lowerSchedule[r]) {
                    const blue = match.seed1 <= lowerSize ? lowerAthletes[match.seed1 - 1] : null;
                    const red = match.seed2 <= lowerSize ? lowerAthletes[match.seed2 - 1] : null;
                    if (blue && red) {
                        matches.push({
                            match_num: matchNum++,
                            round_num: r + 1,
                            round_name: roundName,
                            blue_athlete_id: blue.athlete_id,
                            blue_athlete_name: blue.athlete_name,
                            blue_athlete_team: blue.athlete_team,
                            red_athlete_id: red.athlete_id,
                            red_athlete_name: red.athlete_name,
                            red_athlete_team: red.athlete_team,
                            match_status: 'pending',
                            bracket_type: 'pool',
                            zone: 'lower'
                        });
                    }
                }
            }
        }

        if (upperSize >= 2 && lowerSize >= 2) {
            matches.push({
                match_num: matchNum++,
                round_num: 999,
                round_name: 'R.Final',
                blue_athlete_id: null,
                blue_athlete_name: '上区第一',
                blue_athlete_team: '',
                red_athlete_id: null,
                red_athlete_name: '下区第一',
                red_athlete_team: '',
                match_status: 'pending',
                bracket_type: 'final',
                zone: 'final'
            });
        }

        return { matches, rounds: 1, upperSize, lowerSize };
    }

    /**
     * 种子定位算法：将运动员按抽签号分配到bracket的种子位
     * 标准种子位分布（保证最优选手最晚相遇）：
     *   2人: [0,1]  4人: [0,3,1,2]  8人: [0,7,3,4,1,6,2,5]
     * 更大尺寸通过递归计算
     * @param {Array} athletes  运动员列表（已按draw_num排序）
     * @param {number} bracketSize  bracket总格数（2的幂）
     * @returns {Array|null[]} 填充后的种子数组（null表示空位/BYE）
     */
    static _seedAthletes(athletes, bracketSize) {
        const seeded = new Array(bracketSize).fill(null);
        const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

        const positions = this._getSeedingPositions(bracketSize);
        for (let i = 0; i < Math.min(sorted.length, positions.length); i++) {
            seeded[positions[i]] = sorted[i];
        }

        return seeded;
    }

    /**
     * 计算标准种子位索引表
     * 规则：第1号种子在首位，末尾是2号种子，中间对折递归
     * @param {number} size  bracket尺寸（必须为2的幂）
     * @returns {number[]} 种子位索引数组
     */
    static _getSeedingPositions(size) {
        if (size === 2) return [0, 1];
        if (size === 4) return [0, 3, 1, 2];
        if (size === 8) return [0, 7, 3, 4, 1, 6, 2, 5];
        if (size === 16) return [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];
        const half = this._getSeedingPositions(size / 2);
        const result = [];
        for (let i = 0; i < half.length; i++) {
            result.push(half[i]);
            result.push(size - 1 - half[i]);
        }
        return result;
    }

    /**
     * 单败淘汰赛轮次名称生成器
     * @param {number} round  当前轮（从1开始，1=Final）
     * @param {number} totalRounds  总轮数
     * @returns {string} 轮次名称：Final / 1/2 / 1/4 / 1/8 / ...
     */
    static _getRoundName(round, totalRounds) {
        if (round === 1) return 'Final';
        const denominator = Math.pow(2, totalRounds - round);
        return `1/${denominator}`;
    }

    /**
     * 循环赛赛程编排（Berger轮转法）
     * 针对小规模人数（2-5）使用预定义固定编排，
     * 6人及以上使用标准Berger轮转算法。
     *
     * @param {number} n  参赛人数
     * @returns {Array<Array<{seed1:number, seed2:number}>>} 每轮的对阵表
     */
    static _jjRoundRobinSchedule(n) {
        if (n === 2) {
            return [[{ seed1: 1, seed2: 2 }]];
        }
        if (n === 3) {
            return [
                [{ seed1: 2, seed2: 3 }],
                [{ seed1: 1, seed2: 3 }],
                [{ seed1: 1, seed2: 2 }]
            ];
        }
        if (n === 4) {
            return [
                [{ seed1: 1, seed2: 4 }, { seed1: 2, seed2: 3 }],
                [{ seed1: 1, seed2: 3 }, { seed1: 2, seed2: 4 }],
                [{ seed1: 1, seed2: 2 }, { seed1: 3, seed2: 4 }]
            ];
        }
        if (n === 5) {
            return [
                [{ seed1: 2, seed2: 3 }, { seed1: 4, seed2: 5 }],
                [{ seed1: 1, seed2: 3 }, { seed1: 2, seed2: 4 }],
                [{ seed1: 1, seed2: 5 }, { seed1: 3, seed2: 4 }],
                [{ seed1: 2, seed2: 5 }, { seed1: 1, seed2: 4 }],
                [{ seed1: 1, seed2: 2 }, { seed1: 3, seed2: 5 }]
            ];
        }
        return this._bergerSchedule(n);
    }

    /**
     * Berger标准轮转法实现
     * 适用于任意人数（奇数时自动补空位）
     * 算法：固定1号位不动，其余位置顺时针轮转
     *
     * @param {number} n  参赛人数
     * @returns {Array<Array<{seed1:number, seed2:number}>>} 每轮对阵
     */
    static _bergerSchedule(n) {
        const isOdd = n % 2 !== 0;
        const effectiveN = isOdd ? n + 1 : n;
        const rounds = [];
        const positions = [];
        for (let i = 1; i <= effectiveN; i++) positions.push(i);

        for (let r = 0; r < effectiveN - 1; r++) {
            const roundMatches = [];
            for (let i = 0; i < Math.floor(effectiveN / 2); i++) {
                const seed1 = positions[i];
                const seed2 = positions[effectiveN - 1 - i];
                if (seed1 <= n && seed2 <= n) {
                    roundMatches.push({ seed1, seed2 });
                }
            }
            rounds.push(roundMatches);
            const last = positions[effectiveN - 1];
            for (let i = effectiveN - 1; i > 1; i--) {
                positions[i] = positions[i - 1];
            }
            positions[1] = last;
        }
        return rounds;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = JJBracketGenerator;
}
