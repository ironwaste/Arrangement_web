const { deleteKyougiMatchsByClass } = require('./kyougiMatchHelpers');

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

function getRoundName(roundNumber, totalRounds) {
  if (!roundNumber || !totalRounds) return null;
  if (roundNumber === totalRounds) return 'Final';
  const denominator = Math.pow(2, totalRounds - roundNumber);
  return `1/${denominator}`;
}

async function generateBracketForClass(db, manager, weightClass, athletes, event_id, forceElimination = false) {
  await deleteKyougiMatchsByClass(db, weightClass, event_id);

  const stageRow = await db.get(
    'SELECT id FROM bracket_stage WHERE event_id = ? AND category_id = ?',
    [event_id, weightClass]
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
      const methodRow = await db.prepare(
        'SELECT mode_of_competition FROM ModeOfCompetition WHERE class_ = ?'
      ).get(weightClass);
      method = methodRow?.mode_of_competition || null;
    } catch (e) {}
  }

  const roundRobinMethods = ['循环赛', '5人循环赛-1', '5人循环赛-2', '6人循环赛', '7人循环赛', 'round_robin'];
  const isRoundRobin = method && roundRobinMethods.includes(method);
  const isDivisional = ['5人循环赛-2', '6人循环赛', '7人循环赛'].includes(method);

  let stageId = '';
  let stageType = 'single_elimination';

  if (isRoundRobin && !isDivisional) {
    const rrMatches = generateRoundRobinMatches(n, method);

    const rrStage = await manager.create.stage({
      tournamentId: Number(event_id),
      name: weightClass,
      type: 'round_robin',
      seeding: cleanSeeding,
      settings: { size: n, groupCount: 1 },
    });

    // 更新 stage 的 event_id 和 category_id
    await db.prepare(
      'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
    ).run(event_id, weightClass, rrStage.id);

    const participantList = await db.prepare(
      'SELECT id, name FROM bracket_participant WHERE tournament_id = ?'
    ).all(Number(event_id));
    const updateParticipant = db.prepare(
      'UPDATE bracket_participant SET custom_data = ? WHERE id = ?'
    );
    for (let i = 0; i < cleanSeeding.length; i++) {
      const p = participantList.find(pp => pp.name === cleanSeeding[i]);
      if (p) {
        const athlete = athletes[i] || {};
        await updateParticipant.run(JSON.stringify({
          id: athlete.id != null ? athlete.id : null,
          athlete_draw_num: athlete.athlete_draw_num != null ? athlete.athlete_draw_num : (i + 1)
        }), p.id);
      }
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

      // 更新 stage 的 event_id 和 category_id
      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, weightClass, finalStage.id);

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
      const upperAthletes = cleanSeeding.slice(0, upperSize);
      const lowerAthletes = cleanSeeding.slice(upperSize, upperSize + lowerSize);

      const upperSeedingWithByes = [...upperAthletes];
      while (upperSeedingWithByes.length < upperSize) upperSeedingWithByes.push(null);

      const lowerSeedingWithByes = [...lowerAthletes];
      while (lowerSeedingWithByes.length < lowerSize) lowerSeedingWithByes.push(null);

      const upperRRStage = await manager.create.stage({
        tournamentId: Number(event_id),
        name: `${weightClass}_上区`,
        type: 'round_robin',
        seeding: upperSeedingWithByes,
        settings: { size: upperSize, groupCount: 1 },
      });

      // 更新 stage 的 event_id 和 category_id
      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, weightClass, upperRRStage.id);

      const lowerRRStage = await manager.create.stage({
        tournamentId: Number(event_id),
        name: `${weightClass}_下区`,
        type: 'round_robin',
        seeding: lowerSeedingWithByes,
        settings: { size: lowerSize, groupCount: 1 },
      });

      // 更新 stage 的 event_id 和 category_id
      await db.prepare(
        'UPDATE bracket_stage SET event_id = ?, category_id = ? WHERE id = ?'
      ).run(event_id, weightClass, lowerRRStage.id);

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

      stageId = `${upperRRStage.id},${lowerRRStage.id}`;
      stageType = 'divisional_round_robin';
    }
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
    ).run(event_id, weightClass, stage.id);

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
  generateBracketForClass
};
