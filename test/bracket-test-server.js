const express = require('express');
const router = express.Router();

module.exports = function(db, bracketsManager) {
    router.get('/clear-test-data', async (req, res) => {
        try {
            for (const tournamentId of [997, 998, 999]) {
                await db.run('DELETE FROM bracket_match WHERE stage_id IN (SELECT id FROM bracket_stage WHERE tournament_id = ?)', [tournamentId]);
                await db.run('DELETE FROM bracket_round WHERE stage_id IN (SELECT id FROM bracket_stage WHERE tournament_id = ?)', [tournamentId]);
                await db.run('DELETE FROM bracket_group WHERE stage_id IN (SELECT id FROM bracket_stage WHERE tournament_id = ?)', [tournamentId]);
                await db.run('DELETE FROM bracket_participant WHERE tournament_id = ?', [tournamentId]);
                await db.run('DELETE FROM bracket_stage WHERE tournament_id = ?', [tournamentId]);
            }
            
            res.json({ success: true, message: '测试数据已清理' });
        } catch (err) {
            console.error('清理测试数据失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/create-pool-stage', async (req, res) => {
        try {
            const tournamentId = 999;

            console.log('开始创建分区循环赛...');
            const stage = await bracketsManager.create.stage({
                tournamentId: tournamentId,
                name: 'Groups',
                type: 'round_robin',
                seeding: [
                    'Alpha',
                    'Bravo',
                    'Charlie',
                    'Delta',
                    'Echo',
                    'Foxtrot',
                    'Golf',
                    'Hotel'
                ],
                settings: {
                    groupCount: 2,
                    seedOrdering: ['groups.effort_balanced'],
                },
            });

            console.log('Stage 创建成功，Stage ID:', stage.id);
            const stageData = await bracketsManager.get.stageData(stage.id);

            // 将 bracket-manager 返回的单数格式转换为复数格式
            const transformedData = {
                stages: stageData.stage || [],
                groups: stageData.group || [],
                rounds: stageData.round || [],
                matches: stageData.match || [],
                matchGames: stageData.match_game || [],
                participants: stageData.participant || []
            };

            res.json({
                success: true,
                message: '分区循环赛对阵图创建成功',
                tournamentId: tournamentId,
                stageId: stage.id,
                data: transformedData
            });

        } catch (err) {
            console.error('创建分区循环赛失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/get-pool-stage/:tournamentId', async (req, res) => {
        try {
            const { tournamentId } = req.params;
            
            const stages = await db.all('SELECT id FROM bracket_stage WHERE tournament_id = ?', [Number(tournamentId)]);
            if (!stages || stages.length === 0) {
                throw new Error('没有找到 stage');
            }

            const stageData = await bracketsManager.get.stageData(stages[0].id);

            // 将 bracket-manager 返回的单数格式转换为复数格式
            const transformedData = {
                stages: stageData.stage || [],
                groups: stageData.group || [],
                rounds: stageData.round || [],
                matches: stageData.match || [],
                matchGames: stageData.match_game || [],
                participants: stageData.participant || []
            };

            res.json({
                success: true,
                tournamentId: tournamentId,
                data: transformedData
            });

        } catch (err) {
            console.error('获取分区循环赛数据失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/create-single-elimination', async (req, res) => {
        try {
            const tournamentId = 998;

            console.log('开始创建单败淘汰赛...');
            const stage = await bracketsManager.create.stage({
                tournamentId: tournamentId,
                name: 'Single Elimination',
                type: 'single_elimination',
                seeding: [
                    'Alice',
                    'Bob',
                    'Charlie',
                    'David',
                    'Eve',
                    'Frank',
                    'Grace',
                    'Henry'
                ],
                settings: {
                    grandFinal: 'simple',
                },
            });

            console.log('Stage 创建成功，Stage ID:', stage.id);
            const stageData = await bracketsManager.get.stageData(stage.id);

            // 将 bracket-manager 返回的单数格式转换为复数格式
            const transformedData = {
                stages: stageData.stage || [],
                groups: stageData.group || [],
                rounds: stageData.round || [],
                matches: stageData.match || [],
                matchGames: stageData.match_game || [],
                participants: stageData.participant || []
            };

            res.json({
                success: true,
                message: '单败淘汰赛对阵图创建成功',
                tournamentId: tournamentId,
                stageId: stage.id,
                data: transformedData
            });

        } catch (err) {
            console.error('创建单败淘汰赛失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/create-double-elimination', async (req, res) => {
        try {
            const tournamentId = 997;

            console.log('开始创建双败淘汰赛...');
            const stage = await bracketsManager.create.stage({
                tournamentId: tournamentId,
                name: 'Double Elimination',
                type: 'double_elimination',
                seeding: [
                    'Team A',
                    'Team B',
                    'Team C',
                    'Team D'
                ],
                settings: {},
            });

            console.log('Stage 创建成功，Stage ID:', stage.id);
            const stageData = await bracketsManager.get.stageData(stage.id);

            // 将 bracket-manager 返回的单数格式转换为复数格式
            const transformedData = {
                stages: stageData.stage || [],
                groups: stageData.group || [],
                rounds: stageData.round || [],
                matches: stageData.match || [],
                matchGames: stageData.match_game || [],
                participants: stageData.participant || []
            };

            res.json({
                success: true,
                message: '双败淘汰赛对阵图创建成功',
                tournamentId: tournamentId,
                stageId: stage.id,
                data: transformedData
            });

        } catch (err) {
            console.error('创建双败淘汰赛失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};