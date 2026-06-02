/** 自动编排调度模块，提供种子排序、循环赛/分区赛生成、对阵图创建等功能 */
const { deleteKyougiMatchsByClass } = require('./kyougiMatchHelpers');

/** 生成标准种子排序（用于淘汰赛对阵位置分配） */
function generateStandardSeedOrder(size) {
  if (size <= 1) return [1];
  let pairs = [[1, 2]];
  let currentSize = 2;
  while (currentSize < size) {
    const nextSize = currentSize * 2;
    const nextPairs = [];
    for (const [a, b] of pairs) {
      nextPairs.push([a, nextSize + 1 - a]);
      nextPairs.push([nextSize + 1 - b, b]);
    }
    pairs = nextPairs;
    currentSize = nextSize;
  }
  return pairs.flat();
}

/** 生成单循环赛对阵 */
function generateRoundRobinMatches(n, method) {
  if (n < 2) return [];
  const isOdd = n % 2 !== 0;
  const effectiveN = isOdd ? n + 1 : n;
  const rounds = effectiveN - 1;
  const matchesPerRound = Math.floor(effectiveN / 2);
  const allRounds = [];

  const positions = [];
  for (let i = 1; i <= effectiveN; i++) positions.push(i);

  for (let round = 0; round < rounds; round++) {
    const roundMatches = [];
    for (let i = 0; i < matchesPerRound; i++) {
      const seed1 = positions[i];
      const seed2 = positions[effectiveN - 1 - i];
      if (seed1 <= n && seed2 <= n) {
        roundMatches.push({ seed1, seed2 });
      }
    }
    allRounds.push(roundMatches);
    const last = positions[effectiveN - 1];
    for (let i = effectiveN - 1; i > 1; i--) {
      positions[i] = positions[i - 1];
    }
    positions[1] = last;
  }

  return allRounds;
}

/** 生成分区循环赛对阵 */
function generateDivisionalRoundRobin(n, method) {
  let upperSize, lowerSize;
  if (method === '5人循环赛-2') { upperSize = 3; lowerSize = 2; }
  else if (method === '6人循环赛') { upperSize = 3; lowerSize = 3; }
  else if (method === '7人循环赛') { upperSize = 3; lowerSize = 4; }
  else { upperSize = Math.ceil(n / 2); lowerSize = Math.floor(n / 2); }

  const upperMatches = generateRoundRobinMatches(upperSize, '循环赛');
  const lowerMatches = generateRoundRobinMatches(lowerSize, '循环赛');

  return { upperSize, lowerSize, upperMatches, lowerMatches, hasFinal: true };
}

/** 根据轮次号和总轮次计算轮次名称 */
function getRoundName(roundNumber, totalRounds) {
  if (!roundNumber || !totalRounds) return null;
  if (roundNumber === totalRounds) return 'Final';
  const denominator = Math.pow(2, totalRounds - roundNumber);
  return `1/${denominator}`;
}

async function createBergenRoundRobinMatches(db, stageId, effectiveSeeding, participantList) {
  const n = effectiveSeeding.length;
  if (n < 2) return;

  await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(stageId);
  await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(stageId);
  await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(stageId);

  const groupRow = await db.prepare('SELECT id FROM bracket_group WHERE stage_id = ?').get(stageId);
  const groupId = groupRow ? groupRow.id : null;

  const seedingToParticipant = new Map();
  for (let i = 0; i < effectiveSeeding.length; i++) {
    const p = participantList.find(pp => pp.name === effectiveSeeding[i]);
    if (p) {
      seedingToParticipant.set(i + 1, p.id);
    }
  }

  const rrMatches = generateRoundRobinMatches(n, '循环赛');

  let matchNumber = 1;
  for (let roundIdx = 0; roundIdx < rrMatches.length; roundIdx++) {
    const roundName = `R${roundIdx + 1}`;

    const roundResult = await db.prepare(
      'INSERT INTO bracket_round (stage_id, group_id, name, number) VALUES (?, ?, ?, ?)'
    ).run(stageId, groupId, roundName, roundIdx + 1);
    const roundId = roundResult.lastInsertRowid;

    for (const match of rrMatches[roundIdx]) {
      const opp1ParticipantId = seedingToParticipant.get(match.seed1);
      const opp2ParticipantId = seedingToParticipant.get(match.seed2);

      const opponent1 = opp1ParticipantId ? JSON.stringify({ id: opp1ParticipantId }) : null;
      const opponent2 = opp2ParticipantId ? JSON.stringify({ id: opp2ParticipantId }) : null;

      await db.prepare(
        'INSERT INTO bracket_match (stage_id, round_id, group_id, number, child_count, opponent1, opponent2, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(stageId, roundId, groupId, matchNumber, 0, opponent1, opponent2, 2);

      matchNumber++;
    }
  }
}

/** 为单个级别生成对阵图（支持淘汰赛/循环赛/分区赛） */
async function generateBracketForClass(db, manager, weightClass, athletes, event_id, categoryIdOverride = null, forceElimination = false) {
  if (typeof categoryIdOverride === 'boolean') {
    forceElimination = categoryIdOverride;
    categoryIdOverride = null;
  }

  await deleteKyougiMatchsByClass(db, weightClass, event_id);

  // 获取 category_id（从 category_mode 表）
  let categoryId = categoryIdOverride ? Number(categoryIdOverride) : null;
  if (!categoryId) {
    try {
      const catModeRow = await db.prepare(
        'SELECT category_id FROM category_mode WHERE event_id = ? AND weight_class = ?'
      ).get(event_id, weightClass);
      if (catModeRow) {
        categoryId = catModeRow.category_id;
      }
    } catch (e) {
      console.warn('获取 category_id 失败:', e.message);
    }
  }

  const stageRow = await db.get(
    'SELECT id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
    [event_id, categoryId]
  );

  if (stageRow && stageRow.id) {
    const oldStageIds = [stageRow.id];
    for (const oldSid of oldStageIds) {
      try {
        const matchRows = await db.prepare('SELECT opponent1, opponent2 FROM bracket_match WHERE stage_id = ?').all(Number(oldSid));
        const pIds = new Set();
        for (const m of matchRows) {
          if (m.opponent1) { try { const o = JSON.parse(m.opponent1); if (o?.id) pIds.add(o.id); } catch(e) {} }
          if (m.opponent2) { try { const o = JSON.parse(m.opponent2); if (o?.id) pIds.add(o.id); } catch(e) {} }
        }
        await db.prepare('DELETE FROM bracket_match_game WHERE stage_id = ?').run(Number(oldSid));
        await db.prepare('DELETE FROM bracket_match WHERE stage_id = ?').run(Number(oldSid));
        await db.prepare('DELETE FROM bracket_round WHERE stage_id = ?').run(Number(oldSid));
        await db.prepare('DELETE FROM bracket_group WHERE stage_id = ?').run(Number(oldSid));
        await db.prepare('DELETE FROM bracket_stage WHERE id = ?').run(Number(oldSid));
        for (const pid of pIds) { await db.prepare('DELETE FROM bracket_participant WHERE id = ?').run(pid); }
      } catch (e) {
        console.log('删除旧stage:', oldSid, e.message);
      }
    }
  }

  const cleanSeeding = [];
  const nameCount = {};
  athletes.forEach(a => {
    const baseName = (a.athlete_name || '').trim();
    if (!baseName) {
      cleanSeeding.push(null);
      return;
    }
    if (nameCount[baseName] === undefined) {
      nameCount[baseName] = 1;
    } else {
      nameCount[baseName]++;
    }
  });
  athletes.forEach(a => {
    const baseName = (a.athlete_name || '').trim();
    if (!baseName) {
      return;
    }
    if (nameCount[baseName] > 1) {
      const unit = (a.athlete_team || '').trim();
      const suffix = unit ? `${baseName}(${unit})` : `${baseName}(${nameCount[baseName]})`;
      cleanSeeding.push(suffix);
    } else {
      cleanSeeding.push(baseName);
    }
  });
  const n = cleanSeeding.filter(s => s !== null).length;
  if (n < 2) {
    throw new Error('有效运动员不足2人（去重后）');
  }

  let method = null;
  if (!forceElimination) {
    try {
      const catModeRow = await db.prepare(
        'SELECT mode, categroy_mode_name FROM category_mode WHERE event_id = ? AND weight_class = ?'
      ).get(event_id, weightClass);
      if (catModeRow) {
        const modeMap = {
          'single_elimination': '单败淘汰赛',
          'double_elimination': '双败淘汰赛',
          'round_robin': '循环赛',
          'pool_elimination': '分区循环赛'
        };
        method = catModeRow.mode ? (modeMap[catModeRow.mode] || catModeRow.categroy_mode_name) : catModeRow.categroy_mode_name;
      }
    } catch (e) {}
    if (!method) {
      try {
        const methodRow = await db.prepare(
          'SELECT mode_of_competition FROM ModeOfCompetition WHERE class_ = ?'
        ).get(weightClass);
        method = methodRow?.mode_of_competition || null;
      } catch (e) {}
    }
  }

  const roundRobinMethods = ['循环赛', '5人循环赛-1', '5人循环赛-2', '6人循环赛', '7人循环赛', 'round_robin'];
  const isRoundRobin = method && roundRobinMethods.includes(method);
  const isDivisional = ['5人循环赛-2', '6人循环赛', '7人循环赛'].includes(method);
  const isDoubleElimination = method === '双败淘汰赛';
  const isPoolElimination = method === '分区循环赛';

  let stageId = '';
  let stageType = 'single_elimination';

  if (isDoubleElimination) {
    const targetSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const seedOrderFull = generateStandardSeedOrder(targetSize);

    for (let i = n; i < targetSize; i++) {
      cleanSeeding.push(null);
    }

    const deStage = await manager.create.stage({
      tournamentId: Number(event_id),
      name: weightClass,
      type: 'double_elimination',
      seeding: cleanSeeding,
      settings: {
        manualOrdering: [seedOrderFull],
        grandFinal: 'simple',
      },
    });

    const allStageIds = [];
    const deStages = await db.all(
      'SELECT id FROM bracket_stage WHERE tournament_id = ? AND category_id IS NULL AND (name = ? OR name LIKE ? OR name LIKE ?)',
      [Number(event_id), weightClass, weightClass + '%', '%败者%']
    );
    for (const s of deStages) {
      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, categoryId, s.id);
      allStageIds.push(s.id);
    }

    for (const stageIdItem of allStageIds) {
      const matches = await db.prepare('SELECT id FROM bracket_match WHERE stage_id = ?').all(stageIdItem);
      if (matches && matches.length > 0) {
        const insertMatchGame = db.prepare(
          'INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)'
        );
        const updateChildCount = db.prepare(
          'UPDATE bracket_match SET child_count = 1 WHERE id = ?'
        );
        for (const match of matches) {
          const existing = await db.prepare('SELECT id FROM bracket_match_game WHERE parent_id = ?').get(match.id);
          if (!existing) {
            await insertMatchGame.run(stageIdItem, match.id, 1);
            await updateChildCount.run(match.id);
          }
        }
      }
    }

    for (const stageIdItem of allStageIds) {
      const stageData = await manager.get.stageData(stageIdItem);
      if (stageData?.stage?.[0]) {
        const s = stageData.stage[0];
        const size = s.settings?.size || stageData.participant?.length || 4;
        const totalRounds = Math.log2(Math.pow(2, Math.ceil(Math.log2(size))));
        const rounds = stageData.round || [];
        const stageInfo = await db.get('SELECT id, name FROM bracket_stage WHERE id = ?', [stageIdItem]);
        const isWinners = stageInfo && stageInfo.name && !stageInfo.name.includes('败者');
        for (const round of rounds) {
          const roundName = getRoundName(round.number, totalRounds);
          if (roundName && round.name !== roundName) {
            const suffix = isWinners ? roundName + '（胜者组）' : roundName + '（败者组）';
            await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [suffix, round.id]);
          }
        }
      }
    }

    for (let i = 0; i < athletes.length; i++) {
      const athlete = athletes[i] || {};
      const bracketName = cleanSeeding[i];
      if (!bracketName) continue;
      const customData = JSON.stringify({
        id: athlete.id != null ? athlete.id : null,
        athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
      });
      await db.prepare(
        `UPDATE bracket_participant SET custom_data = ? WHERE name = ?`
      ).run(customData, bracketName);
    }

    stageId = allStageIds.join(',');
    stageType = 'double_elimination';

  } else if (isRoundRobin && !isDivisional) {
    const effectiveSeeding = cleanSeeding.filter(s => s !== null);

    const rrStage = await manager.create.stage({
      tournamentId: Number(event_id),
      name: weightClass,
      type: 'round_robin',
      seeding: effectiveSeeding,
      settings: { size: n, groupCount: 1 },
    });

    await db.prepare(
      'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
    ).run(event_id, categoryId, rrStage.id);

    const participantList = await db.prepare(
      'SELECT id, name FROM bracket_participant WHERE tournament_id = ?'
    ).all(Number(event_id));

    await createBergenRoundRobinMatches(db, rrStage.id, effectiveSeeding, participantList);

    const updateParticipant = db.prepare(
      'UPDATE bracket_participant SET custom_data = ? WHERE id = ?'
    );
    let seedIdx = 0;
    for (let i = 0; i < cleanSeeding.length; i++) {
      if (cleanSeeding[i] === null) continue;
      const p = participantList.find(pp => pp.name === cleanSeeding[i]);
      if (p) {
        const athlete = athletes[i] || {};
        await updateParticipant.run(JSON.stringify({
          id: athlete.id != null ? athlete.id : null,
          athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (seedIdx + 1)
        }), p.id);
      }
      seedIdx++;
    }

    stageId = String(rrStage.id);
    stageType = 'round_robin';

  } else if (isDivisional) {
    let upperSize, lowerSize;
    if (method === '5人循环赛-2') { upperSize = 3; lowerSize = 2; }
    else if (method === '6人循环赛') { upperSize = 3; lowerSize = 3; }
    else if (method === '7人循环赛') { upperSize = 3; lowerSize = 4; }
    else { upperSize = Math.ceil(n / 2); lowerSize = Math.floor(n / 2); }

    if (athletes.length <= 2) {
      const finalStage = await manager.create.stage({
        tournamentId: Number(event_id),
        name: `${weightClass}_决赛`,
        type: 'single_elimination',
        settings: { size: 2 },
        seeding: cleanSeeding,
      });

      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, categoryId, finalStage.id);

      const participants = await db.prepare(
        'SELECT id, name FROM bracket_participant WHERE tournament_id = ?'
      ).all(Number(event_id));
      const updateParticipant = db.prepare(
        'UPDATE bracket_participant SET custom_data = ? WHERE id = ?'
      );
      for (let i = 0; i < cleanSeeding.length; i++) {
        const p = participants.find(pp => pp.name === cleanSeeding[i]);
        if (p) {
          const athlete = athletes[i] || {};
          await updateParticipant.run(JSON.stringify({
            id: athlete.id != null ? athlete.id : null,
            athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
          }), p.id);
        }
      }

      stageId = String(finalStage.id);
      stageType = 'divisional_round_robin';
    } else {
      const upperAthletes = cleanSeeding.slice(0, upperSize).filter(s => s !== null);
      const lowerAthletes = cleanSeeding.slice(upperSize, upperSize + lowerSize).filter(s => s !== null);

      const upperNum = upperAthletes.map((_, idx) => idx + 1);
      const lowerNum = lowerAthletes.map((_, idx) => upperSize + idx + 1);
      const combinedSeeding = [...upperAthletes, ...lowerAthletes];

      const divisionalStage = await manager.create.stage({
        tournamentId: Number(event_id),
        name: `${weightClass}_分区循环赛`,
        type: 'round_robin',
        seeding: combinedSeeding,
        settings: {
          groupCount: 2,
          manualOrdering: [upperNum, lowerNum],
        },
      });

      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, categoryId, divisionalStage.id);

      const participants = await db.prepare(
        'SELECT id, name FROM bracket_participant WHERE tournament_id = ?'
      ).all(Number(event_id));

      const updateParticipant = db.prepare(
        'UPDATE bracket_participant SET custom_data = ? WHERE id = ?'
      );
      for (let i = 0; i < cleanSeeding.length; i++) {
        if (cleanSeeding[i] === null) continue;
        const p = participants.find(pp => pp.name === cleanSeeding[i]);
        if (p) {
          const athlete = athletes[i] || {};
          await updateParticipant.run(JSON.stringify({
            id: athlete.id != null ? athlete.id : null,
            athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1),
            zone: i < upperSize ? 'upper' : 'lower'
          }), p.id);
        }
      }

      const finalStage = await manager.create.stage({
        tournamentId: Number(event_id),
        name: `${weightClass}_决赛`,
        type: 'round_robin',
        settings: { groupCount: 1 },
        seeding: ['上区第一', '下区第一'],
      });

      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, categoryId, finalStage.id);

      const finalMatches = await db.prepare('SELECT id FROM bracket_match WHERE stage_id = ?').all(finalStage.id);
      if (finalMatches && finalMatches.length > 0) {
        const insertMatchGame = db.prepare(
          'INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)'
        );
        const updateChildCount = db.prepare(
          'UPDATE bracket_match SET child_count = 1 WHERE id = ?'
        );
        for (const match of finalMatches) {
          const existing = await db.prepare('SELECT id FROM bracket_match_game WHERE parent_id = ?').get(match.id);
          if (!existing) {
            await insertMatchGame.run(finalStage.id, match.id, 1);
            await updateChildCount.run(match.id);
          }
        }
      }

      const finalStageData = await manager.get.stageData(finalStage.id);
      if (finalStageData?.round?.length > 0) {
        for (const round of finalStageData.round) {
          if (round.name !== 'R.Final') {
            await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', ['R.Final', round.id]);
          }
        }
      }

      stageId = `${divisionalStage.id},${finalStage.id}`;
      stageType = 'divisional_round_robin';
    }
  } else if (isPoolElimination) {
    const poolCount = Math.max(2, Math.ceil(n / 4));
    const poolSize = Math.ceil(n / poolCount);

    const effectiveSeeding = cleanSeeding.filter(s => s !== null);
    const manualOrdering = [];
    let seedOffset = 0;
    for (let pi = 0; pi < poolCount; pi++) {
      const poolSeeds = [];
      const poolCount_ = Math.min(poolSize, effectiveSeeding.length - seedOffset);
      for (let j = 0; j < poolCount_; j++) {
        poolSeeds.push(seedOffset + j + 1);
      }
      if (poolSeeds.length > 0) {
        manualOrdering.push(poolSeeds);
      }
      seedOffset += poolCount_;
    }

    const poolStage = await manager.create.stage({
      tournamentId: Number(event_id),
      name: `${weightClass}_分区循环赛`,
      type: 'round_robin',
      seeding: effectiveSeeding,
      settings: {
        groupCount: manualOrdering.length,
        manualOrdering: manualOrdering,
      },
    });

    await db.prepare(
      'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
    ).run(event_id, categoryId, poolStage.id);

    const participants = await db.prepare(
      'SELECT id, name FROM bracket_participant WHERE tournament_id = ?'
    ).all(Number(event_id));

    const updateParticipant = db.prepare(
      'UPDATE bracket_participant SET custom_data = ? WHERE id = ?'
    );
    let seedIdx = 0;
    for (let i = 0; i < cleanSeeding.length; i++) {
      if (cleanSeeding[i] === null) continue;
      const p = participants.find(pp => pp.name === cleanSeeding[i]);
      if (p) {
        const athlete = athletes[i] || {};
        let poolNum = 1;
        let cumSize = 0;
        for (let pi = 0; pi < manualOrdering.length; pi++) {
          cumSize += manualOrdering[pi].length;
          if (seedIdx < cumSize) { poolNum = pi + 1; break; }
        }
        await updateParticipant.run(JSON.stringify({
          id: athlete.id != null ? athlete.id : null,
          athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (seedIdx + 1),
          pool: poolNum
        }), p.id);
      }
      seedIdx++;
    }

    stageId = String(poolStage.id);
    stageType = 'pool_elimination';

  } else {
    const targetSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const seedOrderFull = generateStandardSeedOrder(targetSize);

    for (let i = n; i < targetSize; i++) {
      cleanSeeding.push(null);
    }

    const stage = await manager.create.stage({
      tournamentId: Number(event_id),
      name: weightClass,
      type: 'single_elimination',
      seeding: cleanSeeding,
      settings: {
        manualOrdering: [seedOrderFull],
      },
    });

    // 更新 stage 的 event_id 和 category_id
    await db.prepare(
      'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
    ).run(event_id, categoryId, stage.id);

    const matches = await db.prepare('SELECT id FROM bracket_match WHERE stage_id = ?').all(stage.id);
    if (matches && matches.length > 0) {
      const insertMatchGame = db.prepare(
        'INSERT INTO bracket_match_game (stage_id, parent_id, number) VALUES (?, ?, ?)'
      );
      const updateChildCount = db.prepare(
        'UPDATE bracket_match SET child_count = 1 WHERE id = ?'
      );
      for (const match of matches) {
        const existing = await db.prepare('SELECT id FROM bracket_match_game WHERE parent_id = ?').get(match.id);
        if (!existing) {
          await insertMatchGame.run(stage.id, match.id, 1);
          await updateChildCount.run(match.id);
        }
      }
    }

    stageId = String(stage.id);
    stageType = 'single_elimination';

    const stageData = await manager.get.stageData(stage.id);
    if (stageData?.stage?.[0]) {
      const s = stageData.stage[0];
      const size = s.settings?.size || stageData.participant?.length || 4;
      const totalRounds = Math.log2(Math.pow(2, Math.ceil(Math.log2(size))));
      const rounds = stageData.round || [];
      for (const round of rounds) {
        const roundName = getRoundName(round.number, totalRounds);
        if (roundName && round.name !== roundName) {
          await db.run('UPDATE bracket_round SET name = ? WHERE id = ?', [roundName, round.id]);
        }
      }
    }

    for (let i = 0; i < athletes.length; i++) {
      const athlete = athletes[i] || {};
      const bracketName = cleanSeeding[i];
      if (!bracketName) continue;
      const customData = JSON.stringify({
        id: athlete.id != null ? athlete.id : null,
        athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
      });
      await db.prepare(
        `UPDATE bracket_participant SET custom_data = ? WHERE name = ?`
      ).run(customData, bracketName);
    }
  }

  return { stageId, stageType };
}

module.exports = {
  generateStandardSeedOrder,
  generateRoundRobinMatches,
  generateDivisionalRoundRobin,
  getRoundName,
  createBergenRoundRobinMatches,
  generateBracketForClass
};
