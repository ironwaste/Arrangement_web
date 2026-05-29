const fs = require('fs');
const file = 'd:\\bieren\\V1\\mysql-version\\TaekwondoManager_v1_test_mysql\\public\\js\\brackets.js';
let content = fs.readFileSync(file, 'utf8');

const old1 = '        _allMatchResultData = data.data || [];';
const new1 = `        _allMatchResultData = (data.data || []).map(m => {
            return {
                id: m.id,
                weight_class: m.kyougi_match_categroy,
                round: m.kyougi_match_round_num,
                round_name: m.kyougi_match_round_name,
                total_rounds: m.kyougi_match_category_total_rounds,
                bracket_match_id: m.kyougi_bracket_match_id,
                match_id: m.kyougi_match_id,
                red_athlete_id: m.kyougi_red_athlete_id,
                red_name: m.kyougi_red_athlete_name,
                red_unit: m.kyougi_red_athlete_team,
                red_prev_winner: m.kyougi_red_prev_winner_id,
                red_score: m.red_score,
                blue_athlete_id: m.kyougi_blue_athlete_id,
                blue_name: m.kyougi_blue_athlete_name,
                blue_unit: m.kyougi_blue_athlete_team,
                blue_prev_winner: m.kyougi_blue_prev_winner,
                blue_score: m.blue_score,
                match_status: m.kyougi_match_status,
                win_method: m.kyougi_win_method,
                winner: m.kyougi_winner,
                venue_no: (m.kyougi_match_venue !== null && m.kyougi_match_id !== null)
                    ? (String(m.kyougi_match_venue) + String(m.kyougi_match_id))
                    : '',
                venue: (m.kyougi_match_venue || '').charAt(0) || ''
            };
        });`;

if (content.includes(old1)) {
    content = content.replace(old1, new1);
    console.log('Replaced _allMatchResultData mapping');
} else {
    console.log('ERROR: Could not find _allMatchResultData line');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done');
