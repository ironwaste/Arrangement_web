class JJBracketGenerator {
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

    static generateDoubleElimination(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const winnersResult = this.generateSingleElimination(athletes, options);
        const winnersMatches = winnersResult.matches;

        let bracketSize = 2;
        while (bracketSize < count) bracketSize *= 2;
        const totalRounds = Math.log2(bracketSize);

        const losersMatches = [];
        let matchNum = winnersMatches.length + 1;

        for (let round = 1; round <= totalRounds - 1; round++) {
            const matchesInRound = Math.pow(2, totalRounds - round - 1);
            for (let i = 0; i < matchesInRound; i++) {
                losersMatches.push({
                    match_num: matchNum++,
                    round_num: round,
                    round_name: `败者组第${round}轮`,
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

        const repechageMatches = [];
        repechageMatches.push({
            match_num: matchNum++,
            round_num: 1,
            round_name: 'Rep.（复活赛第一轮）',
            blue_athlete_id: null,
            blue_athlete_name: null,
            blue_athlete_team: null,
            red_athlete_id: null,
            red_athlete_name: null,
            red_athlete_team: null,
            match_status: 'pending',
            bracket_type: 'repechage'
        });
        repechageMatches.push({
            match_num: matchNum++,
            round_num: 2,
            round_name: 'Bro.m（复活赛第二轮）',
            blue_athlete_id: null,
            blue_athlete_name: null,
            blue_athlete_team: null,
            red_athlete_id: null,
            red_athlete_name: null,
            red_athlete_team: null,
            match_status: 'pending',
            bracket_type: 'repechage_brom'
        });

        const allMatches = [...winnersMatches, ...losersMatches, ...repechageMatches];

        return {
            matches: allMatches,
            rounds: totalRounds,
            bracketSize,
            winnersMatches,
            losersMatches,
            repechageMatches
        };
    }

    static generateRoundRobin(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const shuffled = [...athletes].sort(() => Math.random() - 0.5);
        const matches = [];
        let matchNum = 1;
        let roundNum = 1;
        const totalRounds = count - 1;

        const schedule = this._roundRobinSchedule(count);
        for (let r = 0; r < schedule.length; r++) {
            for (let i = 0; i < schedule[r].length; i++) {
                const [p1, p2] = schedule[r][i];
                const blue = p1 < count ? shuffled[p1] : null;
                const red = p2 < count ? shuffled[p2] : null;
                if (blue && red) {
                    matches.push({
                        match_num: matchNum++,
                        round_num: r + 1,
                        round_name: `赛${r + 1}`,
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

    static generatePoolElimination(athletes, options = {}) {
        const count = athletes.length;
        if (count <= 1) return { matches: [], rounds: 0 };

        const poolCount = options.poolCount || Math.max(2, Math.ceil(count / 4));
        const shuffled = [...athletes].sort(() => Math.random() - 0.5);

        const pools = [];
        for (let i = 0; i < poolCount; i++) {
            pools.push([]);
        }
        shuffled.forEach((a, idx) => {
            pools[idx % poolCount].push(a);
        });

        const matches = [];
        let matchNum = 1;

        pools.forEach((pool, poolIdx) => {
            for (let i = 0; i < pool.length; i++) {
                for (let j = i + 1; j < pool.length; j++) {
                    matches.push({
                        match_num: matchNum++,
                        round_num: 1,
                        round_name: `赛${poolIdx + 1}（小组赛）`,
                        blue_athlete_id: pool[i].athlete_id,
                        blue_athlete_name: pool[i].athlete_name,
                        blue_athlete_team: pool[i].athlete_team,
                        red_athlete_id: pool[j].athlete_id,
                        red_athlete_name: pool[j].athlete_name,
                        red_athlete_team: pool[j].athlete_team,
                        match_status: 'pending',
                        bracket_type: 'pool',
                        pool_index: poolIdx + 1
                    });
                }
            }
        });

        const elimRounds = Math.ceil(Math.log2(poolCount));
        for (let r = 1; r <= elimRounds; r++) {
            const matchesInRound = Math.pow(2, elimRounds - r);
            const roundName = r === elimRounds ? 'Final' : `赛${poolCount + r}（淘汰赛）`;
            for (let i = 0; i < matchesInRound; i++) {
                matches.push({
                    match_num: matchNum++,
                    round_num: r + 1,
                    round_name: roundName,
                    blue_athlete_id: null,
                    blue_athlete_name: null,
                    blue_athlete_team: null,
                    red_athlete_id: null,
                    red_athlete_name: null,
                    red_athlete_team: null,
                    match_status: 'pending',
                    bracket_type: 'elimination'
                });
            }
        }

        matches.push({
            match_num: matchNum++,
            round_num: elimRounds + 2,
            round_name: 'Rep.（复活赛第一轮）',
            blue_athlete_id: null,
            blue_athlete_name: null,
            blue_athlete_team: null,
            red_athlete_id: null,
            red_athlete_name: null,
            red_athlete_team: null,
            match_status: 'pending',
            bracket_type: 'repechage'
        });

        matches.push({
            match_num: matchNum++,
            round_num: elimRounds + 3,
            round_name: 'Bro.m（复活赛第二轮）',
            blue_athlete_id: null,
            blue_athlete_name: null,
            blue_athlete_team: null,
            red_athlete_id: null,
            red_athlete_name: null,
            red_athlete_team: null,
            match_status: 'pending',
            bracket_type: 'repechage_brom'
        });

        return { matches, rounds: elimRounds + 3, pools, poolCount };
    }

    static _seedAthletes(athletes, bracketSize) {
        const seeded = new Array(bracketSize).fill(null);
        const sorted = [...athletes].sort((a, b) => (a.athlete_draw_num || 999) - (b.athlete_draw_num || 999));

        const positions = this._getSeedingPositions(bracketSize);
        for (let i = 0; i < Math.min(sorted.length, positions.length); i++) {
            seeded[positions[i]] = sorted[i];
        }

        return seeded;
    }

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

    static _getRoundName(round, totalRounds) {
        if (round === 1) return 'Final';
        return `赛${totalRounds - round + 1}`;
    }

    static _roundRobinSchedule(n) {
        if (n % 2 !== 0) n++;
        const rounds = [];
        const teams = Array.from({ length: n }, (_, i) => i);
        const half = n / 2;

        for (let r = 0; r < n - 1; r++) {
            const round = [];
            for (let i = 0; i < half; i++) {
                const home = teams[i];
                const away = teams[n - 1 - i];
                if (home < n && away < n) {
                    round.push([home, away]);
                }
            }
            rounds.push(round);
            teams.splice(1, 0, teams.pop());
        }
        return rounds;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = JJBracketGenerator;
}
