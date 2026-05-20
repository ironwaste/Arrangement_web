const bracketPrintStyle = [
    '.brackets-viewer{--primary-background:transparent;--secondary-background:transparent;--match-background:#fff;--font-color:#303133}',
    '.brackets-viewer .opponents{min-width:120px;border:none;background:transparent}',
    '.brackets-viewer .participant{border:1px solid #dcdfe6;border-radius:3px;padding:6px 8px;min-height:28px}',
    '.brackets-viewer .seed-no{font-weight:600}',
    '.brackets-viewer .unit-tag{color:#909399;font-size:10px;margin-left:4px;font-weight:400}',
    '.brackets-viewer .name{white-space:normal;max-width:200px}'
].join('');

function extractPureName(rawName) {
    if (!rawName) return '';
    let name = rawName.trim();
    name = name.replace(/^[A-Z]:\s*/i, '');
    name = name.replace(/^#\d+\s*/, '');
    name = name.replace(/^\d+\s*/, '');
    name = name.replace(/\s*\(.*?\)\s*$/, '');
    const parts = name.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        const cleaned = part.replace(/^[A-Z]:\s*/i, '').replace(/^#\d+\s*/, '').trim();
        if (cleaned && !/^\d+$/.test(cleaned) && cleaned.length > 1) return cleaned;
    }
    return name.trim();
}
function extractUnitFromDisplayName(rawName) {
    if (!rawName) return null;
    const parts = rawName.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    let nameFound = false;
    for (const part of parts) {
        const cleaned = part.replace(/^[A-Z]:\s*/i, '').replace(/^#\d+\s*/, '').trim();
        if (cleaned && !/^\d+$/.test(cleaned) && cleaned.length > 1) {
            if (nameFound) return cleaned;
            nameFound = true;
        }
    }
    return null;
}

function findUnitForParticipant(displayName, unitMapByName, participantsData, unitMapByDrawNo, participantUnitMap) {
    const pureName = extractPureName(displayName);
    if (!pureName && !displayName) return null;

    if (participantUnitMap) {
        if (displayName && participantUnitMap.has(displayName)) return participantUnitMap.get(displayName);
        if (pureName && participantUnitMap.has(pureName)) return participantUnitMap.get(pureName);
    }

    if (unitMapByDrawNo) {
        const drawMatch = displayName.match(/^#(\d+)$/);
        if (drawMatch) {
            const drawInfo = unitMapByDrawNo.get(drawMatch[1]);
            if (drawInfo) return drawInfo.unit;
        }
    }

    const inlineUnit = extractUnitFromDisplayName(displayName);
    if (inlineUnit) return inlineUnit;

    if (participantsData) {
        for (const p of participantsData) {
            if (p.name === displayName || p.name === pureName || (p.pureName && (p.pureName === pureName || p.pureName === displayName))) {
                if (p.unit) return p.unit;
                if (p.team || p.origin_unit) return p.team || p.origin_unit;
            }
        }
    }

    if (displayName && unitMapByName.has(displayName)) return unitMapByName.get(displayName);
    if (pureName && unitMapByName.has(pureName)) return unitMapByName.get(pureName);

    for (const [key, unit] of unitMapByName) {
        if (key.includes(pureName) || pureName.includes(key)) return unit;
    }

    return null;
}

function parseVenueLabel(venueNo) {
    if (!venueNo) return { venue: 'A', no: 9999 };
    const match = venueNo.match(/^([A-Z])(\d+)$/);
    if (match) {
        return { venue: match[1], no: parseInt(match[2]) };
    }
    return { venue: 'A', no: 9999 };
}

function sortMatchesByVenueOrder(container, matchDataList) {
    if (!container || !matchDataList || matchDataList.length === 0) return;

    const matchElements = container.querySelectorAll('.match');
    if (matchElements.length === 0) return;

    const matchOrderMap = new Map();
    matchDataList.forEach((m, idx) => {
        const key = String(m.bracket_match_id);
        const venueLabel = m.venue_no || (m.venue ? `${m.venue}${m.venue_no || (idx + 1)}` : `A${2000 + (idx + 1)}`);
        const parsed = parseVenueLabel(venueLabel);
        matchOrderMap.set(key, { order: parsed.no, venue: parsed.venue, label: venueLabel });
    });

    const matchesArray = Array.from(matchElements);
    matchesArray.sort((a, b) => {
        const idA = a.getAttribute('data-match-id');
        const idB = b.getAttribute('data-match-id');
        const infoA = matchOrderMap.get(idA) || { order: 9999 };
        const infoB = matchOrderMap.get(idB) || { order: 9999 };
        return infoA.order - infoB.order;
    });

    matchesArray.forEach(matchEl => {
        const bmid = matchEl.getAttribute('data-match-id');
        const info = matchOrderMap.get(bmid);
        if (info) {
            const labelEl = matchEl.querySelector('.opponents > span:first-child');
            if (labelEl) {
                labelEl.textContent = info.label;
            }
        }
    });

    const parent = matchElements[0]?.parentElement;
    if (parent) {
        matchesArray.forEach(el => parent.appendChild(el));
    }
}

async function printBracket() {
    const container = document.getElementById('bracket-viewer-container');
    if (!container || !container.innerHTML.trim()) { alert('请先双击级别查看对阵图'); return; }

    const eventName = currentEventName || '';
    const weightClass = selectedBracketClass || '';

    let matchDataForSort = [];
    if (currentEventId && weightClass) {
        try {
            const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
            if (matchResp.success && matchResp.data) {
                matchDataForSort = matchResp.data;
            }
        } catch (e) {}
    }

    const containerClone = container.cloneNode(true);
    sortMatchesByVenueOrder(containerClone, matchDataForSort);

    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - ' + weightClass + ' - 对阵图</title>');
    d.write('<style>' + window.bracketCssText);
    d.write(bracketPrintStyle);
    d.write('@page { size: A4 portrait; margin: 15mm 10mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 10px; }');
    d.write('.print-header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #000; margin-bottom: 12px; }');
    d.write('.print-header h1 { font-size: 22pt; font-weight: bold; letter-spacing: 4px; margin-bottom: 4px; }');
    d.write('.print-header h2 { font-size: 18pt; font-weight: bold; margin-bottom: 6px; }');
    d.write('.print-header h3 { font-size: 16pt; font-weight: bold; color: #333; margin-top: 8px; margin-bottom: 0px; }');
    d.write('.brackets-viewer { transform: scale(0.8); transform-origin: top left; overflow: visible !important; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } * { overflow: visible !important; } }');
    d.write('</style></head><body>');
    d.write('<div class="print-header">');
    d.write('<h1>' + eventName + '</h1>');
    if (weightClass) {
        d.write('<h3>' + weightClass + '</h3>');
    }
    d.write('<h2>对阵图</h2>');
    d.write('</div>');
    d.write(containerClone.outerHTML);
    d.write('</body></html>');
    d.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

async function printAllBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const stageMapResp = await apiGet('/brackets/stage-map?' + getEventParam());
    const stageMaps = (stageMapResp.success && stageMapResp.data) ? stageMapResp.data : [];
    if (stageMaps.length === 0) { alert('没有已生成对阵图的级别'); return; }

    const display = document.getElementById('bracketDisplay');
    const prevHtml = display.innerHTML;
    display.innerHTML = '';

    const bracketHtmlList = [];
    for (const sm of stageMaps) {
        if (!sm.stage_id) continue;
        const cls = sm.class_name;
        const stageDataResp = await apiGet('/brackets/stage/' + sm.stage_id);
        if (!stageDataResp.success || !stageDataResp.data || !stageDataResp.data.stages || stageDataResp.data.stages.length === 0) continue;

        const data = stageDataResp.data;
        const viewerId = 'print-all-' + sm.stage_id;
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 32px;';
        const title = document.createElement('h3');
        title.style.cssText = 'text-align: center; margin: 16px 0 8px; padding: 6px 0; border-bottom: 2px solid #409eff; font-size: 15px; color: #303133;';
        title.textContent = cls;
        section.appendChild(title);
        const viewerDiv = document.createElement('div');
        viewerDiv.id = viewerId;
        viewerDiv.className = 'brackets-viewer';
        viewerDiv.style.cssText = 'overflow-x:auto;padding:16px;background:#fff;border-radius:8px;';
        section.appendChild(viewerDiv);
        display.appendChild(section);

        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await window.bracketsViewer.render(data, {
                selector: '#' + viewerId,
                clear: true,
                showRankingTable: false,
                participantOriginPlacement: 'none',
                customRoundName: (info) => {
                    if (info.roundNumber && info.roundCount) {
                        const d = Math.pow(2, info.roundCount - info.roundNumber);
                        if (d === 1) return '决赛';
                        return `1/${d}`;
                    }
                    return undefined;
                }
            });

            const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(cls));
            if (matchResp.success && matchResp.data && matchResp.data.length > 0) {
                const venueNoMap = new Map();
                let hasMapping = false;
                for (const m of matchResp.data) {
                    if (m.bracket_match_id && m.venue_no) { venueNoMap.set(String(m.bracket_match_id), m.venue_no); hasMapping = true; }
                }
                if (!hasMapping) {
                    try {
                        const rebuildResp = await apiPost('/brackets/rebuild-match-ids', { weight_class: cls, event_id: currentEventId });
                        if (rebuildResp.success && rebuildResp.data) {
                            const freshResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(cls));
                            if (freshResp.success && freshResp.data) {
                                venueNoMap.clear();
                                for (const m of freshResp.data) { if (m.bracket_match_id && m.venue_no) venueNoMap.set(String(m.bracket_match_id), m.venue_no); }
                            }
                        }
                    } catch (e) {}
                }
                viewerDiv.querySelectorAll('.match').forEach(matchEl => {
                    const bmid = matchEl.getAttribute('data-match-id');
                    const matchDataPrint = matchResp.data.find(m => String(m.bracket_match_id) === String(bmid) || String(m.id) === String(bmid));
                    
                    if (matchDataPrint) {
                        const hasVenue = matchDataPrint.venue && matchDataPrint.venue.trim() !== '';
                        const hasVenueNo = matchDataPrint.venue_no && matchDataPrint.venue_no.toString().trim() !== '';
                        
                        if (!hasVenue || !hasVenueNo) {
                            matchEl.style.display = 'none';
                            return;
                        }
                        
                        const vn = venueNoMap.get(bmid);
                        if (vn) {
                            const labelEl = matchEl.querySelector('.opponents > span:first-child');
                            if (labelEl) {
                                labelEl.textContent = vn;
                                if (/^[A-Z]\d{3,}$/.test(vn)) labelEl.classList.add('venue-highlight');
                            }
                        }
                    }
                });
            }

            const athleteRespPrint = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi&weight_class=' + encodeURIComponent(cls));
            const unitMapByNamePrint = new Map();
            const unitMapByDrawNoPrint = new Map();
            const athleteIdToUnitPrint = new Map();
            const drawNoByNameFromAthletesPrint = new Map();
            if (athleteRespPrint.success && athleteRespPrint.data) {
                for (const a of athleteRespPrint.data) {
                    const athleteName = a.name || a.athlete_name || a.contestant_name;
                    const athleteUnit = a.unit || a.athlete_team || a.team || a.athleteTeam;
                    const drawNo = a.draw_no || a.drawNo || a.athlete_draw_num;
                    if (a.id && athleteUnit) athleteIdToUnitPrint.set(a.id, athleteUnit);
                    if (athleteName && athleteUnit) {
                        unitMapByNamePrint.set(athleteName, athleteUnit);
                        unitMapByNamePrint.set(`${athleteName}(${athleteUnit})`, athleteUnit);
                        if (drawNo) unitMapByDrawNoPrint.set(String(drawNo), { name: athleteName, unit: athleteUnit });
                    }
                    if (athleteName && drawNo) {
                        drawNoByNameFromAthletesPrint.set(athleteName, drawNo);
                        if (athleteUnit) drawNoByNameFromAthletesPrint.set(`${athleteName}(${athleteUnit})`, drawNo);
                    }
                }
            }

            const participantUnitMapPrint = new Map();
            if (data.participants) {
                for (const p of data.participants) {
                    if (p.name && p.custom_data) {
                        try {
                            const custom = JSON.parse(p.custom_data);
                            if (custom.athlete_id) {
                                const u = athleteIdToUnitPrint.get(custom.athlete_id);
                                if (u) participantUnitMapPrint.set(p.name, u);
                            }
                        } catch (e) {}
                    }
                }
            }

            if (data.participants) {
                const drawNoByName = new Map();
                for (const p of data.participants) {
                    if (p.name) {
                        const fromAthletes = drawNoByNameFromAthletesPrint.get(p.name);
                        if (fromAthletes != null) {
                            drawNoByName.set(p.name, fromAthletes);
                        } else {
                            let drawNum = null;
                            if (p.custom_data) {
                                try { const cd = JSON.parse(p.custom_data); if (cd.draw_num != null) drawNum = cd.draw_num; } catch (e) {}
                            }
                            if (drawNum == null && p.origin != null) drawNum = p.origin;
                            drawNoByName.set(p.name, drawNum);
                        }
                    }
                }
                viewerDiv.querySelectorAll('.participant').forEach(el => {
                    const nameEl = el.querySelector('.name');
                    if (nameEl) {
                        const displayName = nameEl.childNodes[0]?.textContent?.trim();
                        if (displayName) {
                            const pureName = extractPureName(displayName);
                            if (pureName && pureName !== displayName && nameEl.childNodes[0]) {
                                nameEl.childNodes[0].textContent = pureName;
                            }
                            const drawNo = drawNoByName.get(displayName) || drawNoByName.get(pureName);
                            if (drawNo != null) {
                                if (!nameEl.querySelector('.seed-no')) {
                                    const span = document.createElement('span');
                                    span.className = 'seed-no';
                                    span.textContent = `${drawNo} `;
                                    nameEl.insertBefore(span, nameEl.firstChild);
                                }
                            }
                            const unit = findUnitForParticipant(displayName, unitMapByNamePrint, data.participants, unitMapByDrawNoPrint, participantUnitMapPrint);
                            if (unit && !nameEl.querySelector('.unit-tag')) {
                                const tag = document.createElement('span');
                                tag.className = 'unit-tag';
                                tag.textContent = `(${unit})`;
                                nameEl.appendChild(tag);
                            }
                        }
                    }
                });
            }

            requestAnimationFrame(() => { replaceByeText(viewerDiv); });

            let matchDataForPrintAll = [];
            try {
                const matchRespPrintAll = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(cls));
                if (matchRespPrintAll.success && matchRespPrintAll.data) {
                    matchDataForPrintAll = matchRespPrintAll.data;
                }
            } catch (e) {}

            sortMatchesByVenueOrder(viewerDiv, matchDataForPrintAll);
            bracketHtmlList.push({ cls, html: viewerDiv.outerHTML });
        } catch (e) { console.warn(`渲染 ${cls} 对阵图失败:`, e); }
    }

    if (bracketHtmlList.length === 0) {
        display.innerHTML = prevHtml;
        alert('没有可打印的对阵图');
        return;
    }

    const eventName = currentEventName || '';
    const printWindow = window.open('', '_blank');
    const d = printWindow.document;
    d.open();
    d.write('<!DOCTYPE html><html><head><title>' + eventName + ' - 全部对阵图</title>');
    d.write('<style>' + window.bracketCssText);
    d.write(bracketPrintStyle);
    d.write('@page { size: A4 portrait; margin: 15mm 10mm; }');
    d.write('body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #000; padding: 10px; }');
    d.write('.print-header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #000; margin-bottom: 16px; }');
    d.write('.print-header h1 { font-size: 22pt; font-weight: bold; letter-spacing: 4px; margin-bottom: 4px; }');
    d.write('.print-header h2 { font-size: 18pt; font-weight: bold; margin-bottom: 6px; }');
    d.write('.bracket-section { margin-bottom: 32px; page-break-after: always; }');
    d.write('.bracket-section:last-child { page-break-after: auto; }');
    d.write('.bracket-level-title { font-size: 16pt; font-weight: bold; text-align: center; margin: 16px 0 8px; padding: 6px 0; border-bottom: 2px solid #333; color: #333; }');
    d.write('.brackets-viewer { transform: scale(0.8); transform-origin: top left; overflow: visible !important; }');
    d.write('.bracket-section { overflow: visible !important; }');
    d.write('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .bracket-section { page-break-inside: avoid; overflow: visible !important; } * { overflow: visible !important; } }');
    d.write('</style></head><body>');
    d.write('<div class="print-header">');
    d.write('<h1>' + eventName + '</h1>');
    d.write('<h2>对阵图</h2>');
    d.write('</div>');
    for (const { cls, html } of bracketHtmlList) {
        d.write('<div class="bracket-section">');
        d.write('<h3 class="bracket-level-title">' + cls + ' 级别对阵图</h3>');
        d.write(html);
        d.write('</div>');
    }
    d.write('</body></html>');
    d.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

async function viewAllBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const stageMapResp = await apiGet('/brackets/stage-map?' + getEventParam());
    const stageMaps = (stageMapResp.success && stageMapResp.data) ? stageMapResp.data : [];
    if (stageMaps.length === 0) { alert('没有已生成对阵图的级别'); return; }

    const display = document.getElementById('bracketDisplay');
    display.innerHTML = '';

    for (const sm of stageMaps) {
        if (!sm.stage_id) continue;
        const cls = sm.class_name;

        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 32px;';
        const title = document.createElement('h3');
        title.style.cssText = 'text-align: center; margin: 16px 0 8px; padding: 6px 0; border-bottom: 2px solid #409eff; font-size: 15px; color: #303133;';
        title.textContent = cls;
        section.appendChild(title);

        const viewerDiv = document.createElement('div');
        viewerDiv.id = 'all-bracket-' + sm.stage_id;
        viewerDiv.className = 'brackets-viewer';
        viewerDiv.style.cssText = 'overflow-x:auto;padding:16px;background:#fff;border-radius:8px;';
        section.appendChild(viewerDiv);
        display.appendChild(section);

        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const stageDataResp = await apiGet('/brackets/stage/' + sm.stage_id);
            if (!stageDataResp.success || !stageDataResp.data || !stageDataResp.data.stages || stageDataResp.data.stages.length === 0) continue;

            const data = stageDataResp.data;

            await window.bracketsViewer.render(data, {
                selector: '#' + viewerDiv.id,
                clear: true,
                showRankingTable: false,
                participantOriginPlacement: 'none',
                customRoundName: (info) => {
                    if (info.roundNumber && info.roundCount) {
                        const d = Math.pow(2, info.roundCount - info.roundNumber);
                        if (d === 1) return '决赛';
                        return `1/${d}`;
                    }
                    return undefined;
                }
            });

            const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(cls));
            if (matchResp.success && matchResp.data && matchResp.data.length > 0) {
                const venueNoMap = new Map();
                let hasMapping = false;
                for (const m of matchResp.data) {
                    if (m.bracket_match_id && m.venue_no) { venueNoMap.set(String(m.bracket_match_id), m.venue_no); hasMapping = true; }
                }
                if (!hasMapping) {
                    try {
                        const rebuildResp = await apiPost('/brackets/rebuild-match-ids', { weight_class: cls, event_id: currentEventId });
                        if (rebuildResp.success && rebuildResp.data) {
                            const freshResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(cls));
                            if (freshResp.success && freshResp.data) {
                                venueNoMap.clear();
                                for (const m of freshResp.data) { if (m.bracket_match_id && m.venue_no) venueNoMap.set(String(m.bracket_match_id), m.venue_no); }
                            }
                        }
                    } catch (e) {}
                }
                viewerDiv.querySelectorAll('.match').forEach(matchEl => {
                    const bmid = matchEl.getAttribute('data-match-id');
                    const matchDataAll = matchResp.data.find(m => String(m.bracket_match_id) === String(bmid) || String(m.id) === String(bmid));
                    
                    if (matchDataAll) {
                        const hasVenue = matchDataAll.venue && matchDataAll.venue.trim() !== '';
                        const hasVenueNo = matchDataAll.venue_no && matchDataAll.venue_no.toString().trim() !== '';
                        
                        if (!hasVenue || !hasVenueNo) {
                            matchEl.style.display = 'none';
                            return;
                        }
                        
                        const vn = venueNoMap.get(bmid);
                        if (vn) {
                            const labelEl = matchEl.querySelector('.opponents > span:first-child');
                            if (labelEl) {
                                labelEl.textContent = vn;
                                if (/^[A-Z]\d{3,}$/.test(vn)) labelEl.classList.add('venue-highlight');
                            }
                        }
                    }
                });
            }

            const athleteRespAll = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi&weight_class=' + encodeURIComponent(cls));
            const unitMapByNameAll = new Map();
            const unitMapByDrawNoAll = new Map();
            const athleteIdToUnitAll = new Map();
            const drawNoByNameFromAthletesAll = new Map();
            if (athleteRespAll.success && athleteRespAll.data) {
                for (const a of athleteRespAll.data) {
                    const athleteName = a.name || a.athlete_name || a.contestant_name;
                    const athleteUnit = a.unit || a.athlete_team || a.team || a.athleteTeam;
                    const drawNo = a.draw_no || a.drawNo || a.athlete_draw_num;
                    if (a.id && athleteUnit) athleteIdToUnitAll.set(a.id, athleteUnit);
                    if (athleteName && athleteUnit) {
                        unitMapByNameAll.set(athleteName, athleteUnit);
                        unitMapByNameAll.set(`${athleteName}(${athleteUnit})`, athleteUnit);
                        if (drawNo) unitMapByDrawNoAll.set(String(drawNo), { name: athleteName, unit: athleteUnit });
                    }
                    if (athleteName && drawNo) {
                        drawNoByNameFromAthletesAll.set(athleteName, drawNo);
                        if (athleteUnit) drawNoByNameFromAthletesAll.set(`${athleteName}(${athleteUnit})`, drawNo);
                    }
                }
            }

            const participantUnitMapAll = new Map();
            if (data.participants) {
                for (const p of data.participants) {
                    if (p.name && p.custom_data) {
                        try {
                            const custom = JSON.parse(p.custom_data);
                            if (custom.athlete_id) {
                                const u = athleteIdToUnitAll.get(custom.athlete_id);
                                if (u) participantUnitMapAll.set(p.name, u);
                            }
                        } catch (e) {}
                    }
                }
            }

            if (data.participants) {
                const drawNoByName = new Map();
                for (const p of data.participants) {
                    if (p.name) {
                        const fromAthletes = drawNoByNameFromAthletesAll.get(p.name);
                        if (fromAthletes != null) {
                            drawNoByName.set(p.name, fromAthletes);
                        } else {
                            let drawNum = null;
                            if (p.custom_data) {
                                try { const cd = JSON.parse(p.custom_data); if (cd.draw_num != null) drawNum = cd.draw_num; } catch (e) {}
                            }
                            if (drawNum == null && p.origin != null) drawNum = p.origin;
                            drawNoByName.set(p.name, drawNum);
                        }
                    }
                }
                viewerDiv.querySelectorAll('.participant').forEach(el => {
                    const nameEl = el.querySelector('.name');
                    if (nameEl) {
                        const displayName = nameEl.childNodes[0]?.textContent?.trim();
                        if (displayName) {
                            const pureName = extractPureName(displayName);
                            if (pureName && pureName !== displayName && nameEl.childNodes[0]) {
                                nameEl.childNodes[0].textContent = pureName;
                            }
                            const drawNo = drawNoByName.get(displayName) || drawNoByName.get(pureName);
                            if (drawNo != null) {
                                if (!nameEl.querySelector('.seed-no')) {
                                    const span = document.createElement('span');
                                    span.className = 'seed-no';
                                    span.textContent = `${drawNo} `;
                                    nameEl.insertBefore(span, nameEl.firstChild);
                                }
                            }
                            const unit = findUnitForParticipant(displayName, unitMapByNameAll, data.participants, unitMapByDrawNoAll, participantUnitMapAll);
                            if (unit && !nameEl.querySelector('.unit-tag')) {
                                const tag = document.createElement('span');
                                tag.className = 'unit-tag';
                                tag.textContent = `(${unit})`;
                                nameEl.appendChild(tag);
                            }
                        }
                    }
                });
            }

            requestAnimationFrame(() => { replaceByeText(viewerDiv); });
        } catch (e) { console.warn(`渲染 ${cls} 对阵图失败:`, e); }
    }
}

async function viewBracketTree() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    const weightClass = selectedBracketClass;
    if (!weightClass) { alert('请选择级别'); return; }

    const stageIdResp = await apiGet('/brackets/stage-id/' + encodeURIComponent(weightClass) + '?' + getEventParam());
    if (stageIdResp.success && stageIdResp.data && stageIdResp.data.stage_id) {
        const stageId = stageIdResp.data.stage_id;
        const stageDataResp = await apiGet('/brackets/stage/' + stageId);
        if (stageDataResp.success && stageDataResp.data && stageDataResp.data.stages && stageDataResp.data.stages.length > 0) {
            await renderBracketViewer(stageDataResp.data, weightClass);
            return;
        }
    }

    const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
    if (matchResp.success && matchResp.data && matchResp.data.length > 0) {
        await renderBracketFromMatches(weightClass);
    } else {
        console.log(`[自动生成] 级别「${weightClass}」尚未生成对阵图，开始自动生成...`);
        try {
            const resp = await apiPost('/auto-arrange/generate-bracket', { event_id: currentEventId, weight_class: weightClass });
            if (resp.success) {
                console.log(`[自动生成] 级别「${weightClass}」对阵表生成成功`);
                clearBracketCache();
                await loadBracketClassList();
                await viewBracketTree();
                
                await autoAssignVenueNumbersForSingleClass(weightClass);
            } else {
                alert('自动生成失败: ' + (resp.error || '未知错误'));
                document.getElementById('bracketDisplay').innerHTML = '<p style="text-align: center; color: #909399; padding: 40px 0;">该级别暂无编排数据，请先生成对阵表</p>';
            }
        } catch (err) {
            alert('自动生成失败: ' + err.message);
            document.getElementById('bracketDisplay').innerHTML = '<p style="text-align: center; color: #909399; padding: 40px 0;">该级别暂无编排数据，请先生成对阵表</p>';
        }
    }
}

async function renderBracketViewer(data, weightClass) {
    if (!data.stages || data.stages.length === 0) {
        document.getElementById('bracketDisplay').innerHTML = '<p style="text-align: center; color: #909399; padding: 40px 0;">该级别尚未生成对阵表</p>';
        return;
    }

    document.getElementById('bracketDisplay').innerHTML = `
        <h3 style="margin-bottom:16px;">${weightClass} 级别对阵图</h3>
        <div id="bracket-viewer-container" class="brackets-viewer" style="overflow-x:auto;padding:16px;background:#fff;border-radius:8px;"></div>
    `;

    await new Promise(resolve => setTimeout(resolve, 100));

    if (window.bracketsViewer) {
        try {
            await window.bracketsViewer.render(data, {
                selector: '#bracket-viewer-container',
                clear: true,
                showRankingTable: false,
                participantOriginPlacement: 'none',
                customRoundName: (info) => {
                    if (info.roundNumber && info.roundCount) {
                        const denominator = Math.pow(2, info.roundCount - info.roundNumber);
                        if (denominator === 1) return '决赛';
                        return `1/${denominator}`;
                    }
                    return undefined;
                }
            });

            const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
            if (matchResp.success && matchResp.data && matchResp.data.length > 0) {
                const venueNoByBracketMatchId = new Map();
                let hasBracketMatchId = false;
                for (const m of matchResp.data) {
                    if (m.bracket_match_id && m.venue_no) { venueNoByBracketMatchId.set(String(m.bracket_match_id), m.venue_no); hasBracketMatchId = true; }
                }

                if (!hasBracketMatchId) {
                    try {
                        const rebuildResp = await apiPost('/brackets/rebuild-match-ids', { weight_class: weightClass, event_id: currentEventId });
                        if (rebuildResp.success && rebuildResp.data) {
                            const freshResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
                            if (freshResp.success && freshResp.data) {
                                venueNoByBracketMatchId.clear();
                                for (const m of freshResp.data) { if (m.bracket_match_id && m.venue_no) venueNoByBracketMatchId.set(String(m.bracket_match_id), m.venue_no); }
                            }
                        }
                    } catch (e) {}
                }

                document.querySelectorAll('#bracket-viewer-container .match').forEach(matchEl => {
                    const bmid = matchEl.getAttribute('data-match-id');
                    const matchData = matchResp.data.find(m => String(m.bracket_match_id) === String(bmid) || String(m.id) === String(bmid));
                    
                    if (matchData) {
                        const hasVenue = matchData.venue && matchData.venue.trim() !== '';
                        const hasVenueNo = matchData.venue_no && matchData.venue_no.toString().trim() !== '';
                        
                        if (!hasVenue || !hasVenueNo) {
                            matchEl.style.display = 'none';
                            return;
                        }
                        
                        const vn = venueNoByBracketMatchId.get(bmid);
                        if (vn) {
                            const labelEl = matchEl.querySelector('.opponents > span:first-child');
                            if (labelEl) {
                                labelEl.textContent = vn;
                                if (/^[A-Z]\d{3,}$/.test(vn)) labelEl.classList.add('venue-highlight');
                            }
                        }
                    }
                });
            }

            const athleteResp = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi&weight_class=' + encodeURIComponent(weightClass));
            const unitMapByName = new Map();
            const unitMapByDrawNo = new Map();
            const athleteIdToUnit = new Map();
            const drawNoByNameFromAthletes = new Map();
            if (athleteResp.success && athleteResp.data) {
                for (const a of athleteResp.data) {
                    const athleteName = a.name || a.athlete_name || a.contestant_name;
                    const athleteUnit = a.unit || a.athlete_team || a.team || a.athleteTeam;
                    const drawNo = a.draw_no || a.drawNo || a.athlete_draw_num;
                    if (a.id && athleteUnit) athleteIdToUnit.set(a.id, athleteUnit);
                    if (athleteName && athleteUnit) {
                        unitMapByName.set(athleteName, athleteUnit);
                        unitMapByName.set(`${athleteName}(${athleteUnit})`, athleteUnit);
                        if (drawNo) unitMapByDrawNo.set(String(drawNo), { name: athleteName, unit: athleteUnit });
                    }
                    if (athleteName && drawNo) {
                        drawNoByNameFromAthletes.set(athleteName, drawNo);
                        if (athleteUnit) drawNoByNameFromAthletes.set(`${athleteName}(${athleteUnit})`, drawNo);
                    }
                }
            }
            // console.log('[DEBUG] athleteIdToUnit:', Array.from(athleteIdToUnit.entries()));

            const participantUnitMap = new Map();
            if (data.participants) {
                // console.log('[DEBUG] participants 数据:', data.participants.length, '条');
                for (const p of data.participants) {
                    if (p.name && p.custom_data) {
                        try {
                            const custom = JSON.parse(p.custom_data);
                            // console.log('[DEBUG] participant:', p.name, '→ athlete_id:', custom.athlete_id, '→ unit:', athleteIdToUnit.get(custom.athlete_id));
                            if (custom.athlete_id) {
                                const u = athleteIdToUnit.get(custom.athlete_id);
                                if (u) participantUnitMap.set(p.name, u);
                            }
                        } catch (e) {}
                    }
                }
            }
            // console.log('[DEBUG] participantUnitMap:', Array.from(participantUnitMap.entries()));

            if (data.participants) {
                const drawNoByName = new Map();
                for (const p of data.participants) {
                    if (p.name) {
                        const fromAthletes = drawNoByNameFromAthletes.get(p.name);
                        if (fromAthletes != null) {
                            drawNoByName.set(p.name, fromAthletes);
                        } else {
                            let drawNum = null;
                            if (p.custom_data) {
                                try { const cd = JSON.parse(p.custom_data); if (cd.draw_num != null) drawNum = cd.draw_num; } catch (e) {}
                            }
                            if (drawNum == null && p.origin != null) drawNum = p.origin;
                            drawNoByName.set(p.name, drawNum);
                        }
                    }
                }
                document.querySelectorAll('#bracket-viewer-container .participant').forEach(el => {
                    const nameEl = el.querySelector('.name');
                    if (nameEl) {
                        const displayName = nameEl.childNodes[0]?.textContent?.trim();
                        if (displayName) {
                            const pureName = extractPureName(displayName);
                            if (pureName && pureName !== displayName && nameEl.childNodes[0]) {
                                nameEl.childNodes[0].textContent = pureName;
                            }
                            const drawNo = drawNoByName.get(displayName) || drawNoByName.get(pureName);
                            if (drawNo != null) {
                                if (!nameEl.querySelector('.seed-no')) {
                                    const span = document.createElement('span');
                                    span.className = 'seed-no';
                                    span.textContent = `${drawNo} `;
                                    nameEl.insertBefore(span, nameEl.firstChild);
                                }
                            }
                            const unit = findUnitForParticipant(displayName, unitMapByName, data.participants, unitMapByDrawNo, participantUnitMap);
                            const inlineUnit = extractUnitFromDisplayName(displayName);
                            const fromPMap = participantUnitMap ? (participantUnitMap.get(displayName) || participantUnitMap.get(pureName)) : null;
                            // console.log('[DEBUG] 匹配详情:', JSON.stringify({ displayName, pureName, inlineUnit, fromPMap, finalUnit: unit }));
                            if (unit && !nameEl.querySelector('.unit-tag')) {
                                const tag = document.createElement('span');
                                tag.className = 'unit-tag';
                                tag.textContent = `(${unit})`;
                                nameEl.appendChild(tag);
                            }
                        }
                    }
                });
            }

            requestAnimationFrame(() => { replaceByeText(document.getElementById('bracket-viewer-container')); });

            if (data.matches) {
                const matchResp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
                if (matchResp.success && matchResp.data) {
                    bracketMatchDataCache = matchResp.data;
                    bracketMatchIdMap.clear();
                    for (const m of matchResp.data) {
                        if (m.bracket_match_id) {
                            bracketMatchIdMap.set(String(m.bracket_match_id), m);
                        }
                    }
                }
            }
            attachBracketDblClick();
        } catch (err) {
            console.error('渲染对阵图失败:', err);
            document.getElementById('bracketDisplay').innerHTML = '<p style="text-align:center;color:#f56c6c;padding:20px;">渲染失败，请刷新重试</p>';
        }
    } else {
        document.getElementById('bracketDisplay').innerHTML = '<p style="text-align:center;color:#909399;padding:40px 0;">对阵图库加载失败，请刷新页面重试</p>';
    }
}

async function renderBracketFromMatches(weightClass) {
    const resp = await apiGet('/matches?' + getEventParam() + '&weight_class=' + encodeURIComponent(weightClass));
    if (resp.success && resp.data.length > 0) {
        const matches = resp.data;
        bracketMatchDataCache = matches;
        bracketMatchIdMap.clear();
        for (const m of matches) {
            if (m.bracket_match_id) {
                bracketMatchIdMap.set(String(m.bracket_match_id), m);
            }
        }
        const totalRounds = matches[0].total_rounds || 1;

        const participantMap = new Map();
        let pid = 1;
        const getParticipantId = (athleteNo, drawNo, name, unit, isBlue) => {
            const key = name + '|' + (unit || '');
            if (!participantMap.has(key)) {
                const side = isBlue ? 'B:' : 'R:';
                const nameWithUnit = unit ? `${name || '待定'} (${unit})` : (name || '待定');
                const displayName = `${athleteNo || ''}  ${drawNo || ''}  ${side} ${nameWithUnit}`;
                participantMap.set(key, { id: pid++, name: displayName });
            }
            return participantMap.get(key).id;
        };

        matches.forEach(m => {
            if (m.blue_name) getParticipantId(m.blue_athlete_no, m.blue_draw_no, m.blue_name, m.blue_unit, true);
            if (m.red_name) getParticipantId(m.red_athlete_no, m.red_draw_no, m.red_name, m.red_unit, false);
        });

        const participants = Array.from(participantMap.values());
        const participantCount = participants.length;
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(participantCount)));

        const stage = [{ id: 1, tournament_id: Number(currentEventId), name: weightClass, type: 'single_elimination', number: 1, settings: { size: bracketSize, skipFirstRound: false, grandFinal: 'none' } }];
        const group = [{ id: 1, stage_id: 1, number: 1 }];

        const getRoundName = (roundNumber, totalRounds, competitionMode) => {
            if (!roundNumber || !totalRounds) return null;
            
            if (competitionMode && (competitionMode.includes('循环赛') || competitionMode === 'round_robin')) {
                if (roundNumber === totalRounds) return '决赛';
                return `循环赛${roundNumber}`;
            }
            
            const denominator = Math.pow(2, totalRounds - roundNumber);
            if (denominator === 1) return '决赛';
            const elimRoundNum = totalRounds - roundNumber;
            return `淘汰赛${elimRoundNum}`;
        };

        let currentCompetitionMode = null;
        try {
            const modeRes = await fetch(`${API_BASE}/competition-modes?event_id=${currentEventId}&weight_class=${encodeURIComponent(weightClass)}`);
            const modeData = await modeRes.json();
            if (modeData.success && modeData.data && modeData.data.length > 0) {
                currentCompetitionMode = modeData.data[0].mode;
            }
        } catch (e) {}

        const roundData = [];
        const roundMap = new Map();
        for (let r = 1; r <= totalRounds; r++) {
            const roundName = getRoundName(r, totalRounds, currentCompetitionMode);
            roundData.push({ id: r, stage_id: 1, group_id: 1, number: r, name: roundName });
            roundMap.set(r, r);
        }

        const matchData = [];
        const matchGames = [];
        matches.forEach((m, idx) => {
            const blueId = m.blue_name ? getParticipantId(m.blue_athlete_no, m.blue_draw_no, m.blue_name, m.blue_unit, true) : null;
            const redId = m.red_name ? getParticipantId(m.red_athlete_no, m.red_draw_no, m.red_name, m.red_unit, false) : null;

            let status = 'pending';
            if (m.match_status === '进行中') status = 'running';
            if (m.match_status === '已结束') status = 'completed';

            const opponent1 = blueId ? { id: blueId, score: m.blue_score || 0 } : null;
            const opponent2 = redId ? { id: redId, score: m.red_score || 0 } : null;

            if (m.match_status === '已结束') {
                if (m.winner === '青方' && opponent1) opponent1.result = 'win';
                if (m.winner === '红方' && opponent2) opponent2.result = 'win';
            }

            const venueLabel = m.venue_no || (m.venue ? `${m.venue}${idx + 1}` : `A${2000 + (idx + 1)}`);

            matchData.push({
                id: m.id || (idx + 1), stage_id: 1, group_id: 1,
                round_id: roundMap.get(m.round) || 1, number: venueLabel,
                opponent1, opponent2, status
            });

            matchGames.push({
                id: idx + 1, stage_id: 1, parent_id: m.id || (idx + 1),
                number: 1, status,
                opponent1: opponent1 ? { ...opponent1 } : null,
                opponent2: opponent2 ? { ...opponent2 } : null
            });
        });

        await renderBracketViewer({
            stages: stage, groups: group, rounds: roundData,
            matches: matchData, matchGames: matchGames, participants: participants
        }, weightClass);
        attachBracketDblClick();
    } else {
        document.getElementById('bracketDisplay').innerHTML = '<p style="text-align: center; color: #888;">该级别暂无编排数据，请先生成对阵表</p>';
    }
}

async function viewBracketDetail() { showPanel('bracketDetail'); }

function replaceByeText(container) {
    if (!container) return;
    const participants = container.querySelectorAll('.participant');
    let replaced = 0;
    participants.forEach(p => {
        const nameEl = p.querySelector('.name');
        if (!nameEl) return;
        const text = nameEl.textContent.trim();
        if (text === 'BYE' || text === 'Bye' || text === 'bye') {
            nameEl.textContent = '轮空';
            replaced++;
        }
    });
    if (replaced > 0) console.log(`[replaceByeText] 替换了 ${replaced} 个 BYE → 轮空`);
}

function clearBracket() { document.getElementById('bracketDisplay').innerHTML = '<p style="text-align: center; color: #909399; padding: 40px 0;">双击级别查看对阵图</p>'; }

let selectedBracketClass = '';
let generatedClasses = new Set();

function _bracketCacheKey() {
    return `bracket_cache_${currentEventId || 'none'}`;
}

function saveBracketCache(stageMaps) {
    try {
        const cache = {
            stageMaps,
            selectedClass: selectedBracketClass,
            generatedClasses: [...generatedClasses],
            timestamp: Date.now()
        };
        sessionStorage.setItem(_bracketCacheKey(), JSON.stringify(cache));
    } catch (e) {}
}

function loadBracketCache() {
    try {
        const raw = sessionStorage.getItem(_bracketCacheKey());
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (Date.now() - cache.timestamp > 5 * 60 * 1000) {
            sessionStorage.removeItem(_bracketCacheKey());
            return null;
        }
        return cache;
    } catch (e) {
        return null;
    }
}

function clearBracketCache() {
    try {
        sessionStorage.removeItem(_bracketCacheKey());
    } catch (e) {}
}

function parseWeightFromClass(cls) {
    const match = String(cls).match(/(\d+(?:\.\d+)?)(?:kg|KG)?/i);
    return match ? parseFloat(match[1]) : 0;
}

function getGroupOrder(cls) {
    const orderMap = { '甲': 1, '乙': 2, '丙': 3, '丁': 4 };
    for (const key of Object.keys(orderMap)) {
        if (cls.includes(key)) {
            return orderMap[key];
        }
    }
    return 99;
}

function sortWeightClasses(classes) {
    return [...classes].sort((a, b) => {
        const hasFemaleA = a.includes('女');
        const hasFemaleB = b.includes('女');
        
        if (hasFemaleA && !hasFemaleB) return -1;
        if (!hasFemaleA && hasFemaleB) return 1;
        
        const groupA = getGroupOrder(a);
        const groupB = getGroupOrder(b);
        if (groupA !== groupB) {
            return groupA - groupB;
        }
        
        const weightA = parseWeightFromClass(a);
        const weightB = parseWeightFromClass(b);
        
        return weightA - weightB;
    });
}

async function loadBracketClassList() {
    const list = document.getElementById('bracketClassList');
    list.innerHTML = '';
    if (!currentEventId) return;

    try {
        const syncResp = await apiPost('/brackets/sync-cache', { event_id: currentEventId });
        if (syncResp.success && syncResp.data && syncResp.data.syncedClasses && syncResp.data.syncedClasses.length > 0) {
            console.log('[sync-cache] 同步了以下级别的对阵数据:', syncResp.data.syncedClasses.join(', '));
        }
    } catch (e) {
        console.warn('[sync-cache] 同步缓存失败:', e);
    }

    if (typeof CategoryModeComponent !== 'undefined') {
        await CategoryModeComponent.init(currentEventId, {
            onClassSelect: (cat) => {
                selectedBracketClass = cat.weight_class;
            },
            onClassDoubleClick: async (cat) => {
                selectedBracketClass = cat.weight_class;
                await viewBracketTree();
            }
        });
    }

    generatedClasses.clear();
    const stageMapResp = await apiGet('/brackets/stage-map?' + getEventParam());
    const stageMaps = (stageMapResp.success && stageMapResp.data) ? stageMapResp.data : [];
    stageMaps.forEach(sm => { if (sm.stage_id) generatedClasses.add(sm.class_name); });

    saveBracketCache(stageMaps);

    let allAthletes = [];
    if (typeof CategoryModeComponent !== 'undefined' && CategoryModeComponent.categoryData.length > 0) {
        const resp = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi');
        allAthletes = resp.data || [];
    } else {
        const resp = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi');
        allAthletes = resp.data || [];
    }

    // 按年龄组、级别是否生成进行分组
    const groupMap = {}; // key: age_group, value: { generated: Map<class, count>, notGenerated: Map<class, count> }
    
    allAthletes.forEach(a => {
        const group = a.athlete_age_group || '未分组';
        const cls = a.athlete_category || a.weight_class || '未分类';
        
        if (!groupMap[group]) {
            groupMap[group] = {
                generated: new Map(),
                notGenerated: new Map()
            };
        }
        
        if (generatedClasses.has(cls)) {
            groupMap[group].generated.set(cls, (groupMap[group].generated.get(cls) || 0) + 1);
        } else {
            groupMap[group].notGenerated.set(cls, (groupMap[group].notGenerated.get(cls) || 0) + 1);
        }
    });

    // 渲染分组列表
    const groups = Object.keys(groupMap).sort();
    
    groups.forEach(group => {
        const groupData = groupMap[group];
        
        // 渲染未生成的级别部分
        if (groupData.notGenerated.size > 0) {
            const notGenHeader = document.createElement('div');
            notGenHeader.className = 'class-section-header';
            notGenHeader.innerHTML = `📋 ${group} - 待生成`;
            notGenHeader.onclick = () => {
                notGenHeader.classList.toggle('collapsed');
                const wrapper = notGenHeader.nextElementSibling;
                if (wrapper) wrapper.style.display = notGenHeader.classList.contains('collapsed') ? 'none' : 'block';
            };
            list.appendChild(notGenHeader);
            
            const notGenWrapper = document.createElement('div');
            const notGenClasses = sortWeightClasses([...groupData.notGenerated.keys()]);
            notGenClasses.forEach(cls => {
                const count = groupData.notGenerated.get(cls);
                const li = document.createElement('li');
                li.dataset.class = cls;
                li.innerHTML = `<span>${cls}</span><span class="count">${count}人</span>`;
                li.onclick = () => selectBracketClass(cls);
                li.ondblclick = () => { selectBracketClass(cls); viewBracketTree(); };
                if (cls === selectedBracketClass) li.classList.add('active');
                notGenWrapper.appendChild(li);
            });
            list.appendChild(notGenWrapper);
        }
        
        // 渲染已生成的级别部分
        if (groupData.generated.size > 0) {
            const genHeader = document.createElement('div');
            genHeader.className = 'class-section-header generated';
            genHeader.innerHTML = `✅ ${group} - 已生成`;
            genHeader.onclick = () => {
                genHeader.classList.toggle('collapsed');
                const wrapper = genHeader.nextElementSibling;
                if (wrapper) wrapper.style.display = genHeader.classList.contains('collapsed') ? 'none' : 'block';
            };
            list.appendChild(genHeader);
            
            const genWrapper = document.createElement('div');
            const genClasses = sortWeightClasses([...groupData.generated.keys()]);
            genClasses.forEach(cls => {
                const count = groupData.generated.get(cls);
                const li = document.createElement('li');
                li.className = 'generated-class';
                li.dataset.class = cls;
                li.innerHTML = `<span>${cls}</span><span class="count">${count}人</span>`;
                li.onclick = () => selectBracketClass(cls);
                li.ondblclick = () => { selectBracketClass(cls); viewBracketTree(); };
                if (cls === selectedBracketClass) li.classList.add('active');
                genWrapper.appendChild(li);
            });
            list.appendChild(genWrapper);
        }
    });

    if (generatedClasses.size > 0 && !selectedBracketClass) {
        const firstGenerated = sortWeightClasses([...generatedClasses])[0];
        if (firstGenerated) {
            selectedBracketClass = firstGenerated;
            document.querySelectorAll('#bracketClassList li').forEach(li => {
                li.classList.toggle('active', li.dataset.class === firstGenerated);
            });
            await viewBracketTree();
        }
    }
}

function selectBracketClass(cls) {
    selectedBracketClass = cls;
    document.querySelectorAll('#bracketClassList li').forEach(li => { li.classList.toggle('active', li.dataset.class === cls); });
}

async function generateSelectedBracket() {
    if (!selectedBracketClass) { alert('请先选择一个级别'); return; }
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm(`确定要生成「${selectedBracketClass}」的对阵表吗？`)) return;

    try {
        const resp = await apiPost('/auto-arrange/generate-bracket', { event_id: currentEventId, weight_class: selectedBracketClass });
        if (resp.success) {
            alert(`「${selectedBracketClass}」对阵表生成成功`);
            clearBracketCache();
            await loadBracketClassList();
            await viewBracketTree();
            
            await autoAssignVenueNumbersForSingleClass(selectedBracketClass);
        } else {
            alert('生成失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('生成失败: ' + err.message);
    }
}

async function generateAllBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm('确定要生成全部级别的对阵表吗？')) return;

    try {
        const resp = await apiPost('/auto-arrange/generate-bracket', { event_id: currentEventId });
        if (resp.success) {
            const data = resp.data || {};
            clearBracketCache();
            alert(`全部对阵表生成完成！成功: ${data.generated || 0}个级别${data.errors && data.errors.length > 0 ? '，失败: ' + data.errors.length + '个' : ''}`);
            await loadBracketClassList();
            
            await autoAssignVenueNumbersForAllClasses();
        } else {
            alert('生成失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('生成失败: ' + err.message);
    }
}

async function autoAssignVenueNumbersForSingleClass(weightClass) {
    if (!currentEventId || !weightClass) return;

    try {
        const schemeRes = await fetch(`${API_BASE}/auto-arrange/scheme?event_id=${currentEventId}`);
        const schemeData = await schemeRes.json();
        if (!schemeData.success || !schemeData.data) return;

        const scheme = schemeData.data[weightClass];
        if (!scheme || !scheme.category_venue || !scheme.category_date_num || !scheme.category_order) return;

        const classData = [{
            weight_class: weightClass,
            venue: scheme.category_venue,
            unit: scheme.category_date_num,
            order: parseInt(scheme.category_order) || 1
        }];

        const res = await fetch(`${API_BASE}/matches/assign-venue-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: classData })
        });
        const result = await res.json();

        if (result.success) {
            console.log(`✅ 自动设置 ${weightClass} 场次号完成！`);
            await viewBracketTree();
        }
    } catch (e) {
        console.warn('自动设置场次号失败:', e.message);
    }
}

async function autoAssignVenueNumbersForAllClasses() {
    if (!currentEventId) return;

    try {
        const schemeRes = await fetch(`${API_BASE}/auto-arrange/scheme?event_id=${currentEventId}`);
        const schemeData = await schemeRes.json();
        if (!schemeData.success || !schemeData.data) return;

        const classData = [];
        for (const [weightClass, scheme] of Object.entries(schemeData.data)) {
            if (scheme.category_venue && scheme.category_date_num && scheme.category_order) {
                classData.push({
                    weight_class: weightClass,
                    venue: scheme.category_venue,
                    unit: scheme.category_date_num,
                    order: parseInt(scheme.category_order) || 1
                });
            }
        }

        if (classData.length === 0) return;

        const res = await fetch(`${API_BASE}/matches/assign-venue-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: currentEventId, data: classData })
        });
        const result = await res.json();

        if (result.success) {
            console.log(`✅ 自动设置全部场次号完成！已更新 ${result.updated || classData.length} 场比赛`);
        }
    } catch (e) {
        console.warn('自动设置全部场次号失败:', e.message);
    }
}

async function clearSelectedBracket() {
    if (!selectedBracketClass) { alert('请先选择一个级别'); return; }
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm(`确定要清除「${selectedBracketClass}」的对阵图吗？此操作不可恢复！`)) return;

    try {
        const resp = await apiPost('/brackets/clear', { weight_class: selectedBracketClass, event_id: currentEventId });
        if (resp.success) {
            alert(`「${selectedBracketClass}」对阵图已清除`);
            clearBracket();
            clearBracketCache();
            await loadBracketClassList();
        } else {
            alert('清除失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('清除失败: ' + err.message);
    }
}

async function clearAllBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!confirm('确定要清除全部级别的对阵图吗？此操作不可恢复！')) return;

    try {
        const resp = await apiPost('/brackets/clear-all', { event_id: currentEventId });
        if (resp.success) {
            alert('全部对阵图已清除');
            clearBracket();
            clearBracketCache();
            await loadBracketClassList();
        } else {
            alert('清除失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('清除失败: ' + err.message);
    }
}

async function resetAllBrackets() {
    if (!currentEventId) { alert('请先选择赛事'); return; }

    const hasGenerated = await checkBracketsGeneratedForEvent();
    let confirmMessage = '确定要重置吗？所有已生成级别将回到待生成状态！';
    if (hasGenerated) {
        confirmMessage = '现在已经生成对阵表，如果要进行此项操作，则该赛事所有对阵表将会被清除。确定要重置吗？';
    }

    if (!confirm(confirmMessage)) return;

    try {
        const resp = await apiPost('/brackets/clear-all', { event_id: currentEventId });
        if (resp.success) {
            clearBracket();
            clearBracketCache();
            selectedBracketClass = '';
            await loadBracketClassList();
            alert('重置成功！所有对阵表已清除');
        } else {
            alert('重置失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('重置失败: ' + err.message);
    }
}

async function checkBracketsGeneratedForEvent() {
    if (!currentEventId) return false;

    try {
        const stageMapResp = await apiGet('/brackets/stage-map?' + getEventParam());
        const stageMaps = (stageMapResp.success && stageMapResp.data) ? stageMapResp.data : [];
        return stageMaps.some(sm => sm.stage_id);
    } catch (err) {
        console.error('检查对阵表生成状态失败:', err);
        return false;
    }
}

function showBracketClassInfo(cls, allAthletes) {
    const athletes = allAthletes.filter(a => a.weight_class === cls);
    const maleCount = athletes.filter(a => a.gender === '男').length;
    const femaleCount = athletes.filter(a => a.gender === '女').length;
    const drawnCount = athletes.filter(a => a.draw_no).length;
    const undrawnCount = athletes.length - drawnCount;

    const unitMap = {};
    athletes.forEach(a => { const unit = a.unit || '未填单位'; unitMap[unit] = (unitMap[unit] || 0) + 1; });
    const unitList = Object.entries(unitMap).sort((a, b) => b[1] - a[1]).map(([unit, count]) => `  ${unit}: ${count}人`).join('\n');

    const seedList = athletes.filter(a => a.athlete_draw_num && a.athlete_draw_num > 0)
        .sort((a, b) => a.athlete_draw_num - b.athlete_draw_num).map(a => `  种子${a.athlete_draw_num}: ${a.name} (${a.unit || '-'})`).join('\n') || '  无';

    const info = `级别: ${cls}\n━━━━━━━━━━━━━━━━━━━━\n总人数: ${athletes.length}人\n  男: ${maleCount}人\n  女: ${femaleCount}人\n\n抽签状态:\n  已抽签: ${drawnCount}人\n  未抽签: ${undrawnCount}人\n\n单位分布:\n${unitList}\n\n种子选手:\n${seedList}`;
    alert(info);
}

function formatRoundName(name) {
    if (!name) return '';
    if (name === '决赛' || name === 'Final') return 'Final';
    if (name === '半决赛') return '1/2';
    const m = name.match(/(\d+)\/(\d+)决赛?/);
    if (m) return m[1] + '/' + m[2];
    return name;
}

let bracketMatchDataCache = [];
let bracketMatchIdMap = new Map();

function attachBracketDblClick() {
    const container = document.getElementById('bracket-viewer-container');
    if (!container) return;
    container.querySelectorAll('.match').forEach(matchEl => {
        matchEl.ondblclick = () => {
            const matchId = matchEl.getAttribute('data-match-id');
            if (!matchId) return;
            const matchInfo = bracketMatchIdMap.get(String(matchId)) || bracketMatchDataCache.find(m => String(m.id) === String(matchId));
            if (!matchInfo) return;
            openBracketScoreModal(matchInfo);
        };
    });
}

function openBracketScoreModal(matchInfo) {
    document.getElementById('bracketScoreMatchId').value = matchInfo.id || '';
    document.getElementById('bracketScoreWeightClass').value = selectedBracketClass || '';
    document.getElementById('bracketScoreBlueName').textContent = matchInfo.blue_name || '青方';
    document.getElementById('bracketScoreBlueUnit').textContent = matchInfo.blue_unit || '';
    document.getElementById('bracketScoreRedName').textContent = matchInfo.red_name || '红方';
    document.getElementById('bracketScoreRedUnit').textContent = matchInfo.red_unit || '';
    document.getElementById('bracketScoreBlueScore').value = matchInfo.blue_score || '';
    document.getElementById('bracketScoreRedScore').value = matchInfo.red_score || '';
    document.getElementById('bracketScoreWinner').value = matchInfo.winner || '';
    document.getElementById('bracketScoreWinMethod').value = matchInfo.win_method || '';
    selectBracketWinner(matchInfo.winner || '');
    document.getElementById('bracketScoreModal').classList.add('active');
}

function closeBracketScoreModal() {
    document.getElementById('bracketScoreModal').classList.remove('active');
}

function selectBracketWinner(side) {
    document.getElementById('bracketScoreWinner').value = side || '';
    const blue = document.getElementById('bracketWinnerBlue');
    const red = document.getElementById('bracketWinnerRed');
    if (side === '青方') {
        blue.style.background = '#409EFF';
        blue.style.color = '#fff';
        blue.style.borderColor = '#409EFF';
        red.style.background = '#fff';
        red.style.color = '#F56C6C';
        red.style.borderColor = '#dcdfe6';
    } else if (side === '红方') {
        red.style.background = '#F56C6C';
        red.style.color = '#fff';
        red.style.borderColor = '#F56C6C';
        blue.style.background = '#fff';
        blue.style.color = '#409EFF';
        blue.style.borderColor = '#dcdfe6';
    } else {
        blue.style.background = '#fff';
        blue.style.color = '#409EFF';
        blue.style.borderColor = '#dcdfe6';
        red.style.background = '#fff';
        red.style.color = '#F56C6C';
        red.style.borderColor = '#dcdfe6';
    }
}

async function resetBracketScore() {
    const matchId = document.getElementById('bracketScoreMatchId').value;
    const weightClass = document.getElementById('bracketScoreWeightClass').value;

    if (!confirm('确定要重置该比赛数据吗？比分、胜方、获胜方式将全部清空。')) return;

    try {
        const resp = await fetch(API_BASE + '/matches/' + matchId + '/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (data.success) {
            closeBracketScoreModal();
            if (weightClass) {
                await viewBracketTree();
            }
        } else {
            alert('重置失败: ' + data.error);
        }
    } catch (err) {
        alert('请求失败: ' + err.message);
    }
}

let _drawNoAthletes = [];

async function openDrawNoModal() {
    if (!currentEventId) { alert('请先选择赛事'); return; }
    if (!selectedBracketClass) { alert('请先选择一个级别'); return; }

    document.getElementById('drawNoClassName').textContent = selectedBracketClass;

    const resp = await apiGet('/athletes?' + getEventParam() + '&athlete_type=taekwondo_kyougi&weight_class=' + encodeURIComponent(selectedBracketClass));
    if (!resp.success || !resp.data || resp.data.length === 0) {
        alert('该级别没有运动员');
        return;
    }

    _drawNoAthletes = resp.data.sort((a, b) => (a.draw_no || 999) - (b.draw_no || 999));

    const tbody = document.getElementById('drawNoTableBody');
    tbody.innerHTML = '';

    _drawNoAthletes.forEach((a, idx) => {
        const tr = document.createElement('tr');
        tr.style.background = idx % 2 === 1 ? '#f0f7ed' : '';
        tr.innerHTML = `
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">${idx + 1}</td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">${a.name || '-'}</td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">${a.unit || '-'}</td>
            <td style="padding:6px 8px;border:1px solid #ebeef5;text-align:center;">
                <input type="number" min="1" value="${a.draw_no || ''}" data-athlete-id="${a.id}"
                    style="width:60px;padding:4px 6px;border:1px solid #dcdfe6;border-radius:3px;font-size:13px;text-align:center;">
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('drawNoModal').classList.add('active');
}

function closeDrawNoModal() {
    document.getElementById('drawNoModal').classList.remove('active');
}

async function saveDrawNoChanges() {
    const inputs = document.querySelectorAll('#drawNoTableBody input[data-athlete-id]');
    const updates = [];
    inputs.forEach(input => {
        const id = parseInt(input.getAttribute('data-athlete-id'));
        const drawNo = parseInt(input.value) || 0;
        updates.push({ id, draw_no: drawNo });
    });

    if (updates.length === 0) { closeDrawNoModal(); return; }

    try {
        const promises = updates.map(u =>
            fetch(API_BASE + '/athletes/' + u.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draw_no: u.draw_no })
            })
        );
        await Promise.all(promises);

        closeDrawNoModal();

        const resp = await apiPost('/auto-arrange/generate-bracket', { event_id: currentEventId });
        if (resp.success) {
            await loadBracketClassList();
            await viewBracketTree();
        } else {
            alert('刷新对阵图失败: ' + (resp.error || '未知错误'));
        }
    } catch (err) {
        alert('保存失败: ' + err.message);
    }
}

async function saveBracketScore() {
    const matchId = document.getElementById('bracketScoreMatchId').value;
    const blueScore = document.getElementById('bracketScoreBlueScore').value;
    const redScore = document.getElementById('bracketScoreRedScore').value;
    const winner = document.getElementById('bracketScoreWinner').value;
    const winMethod = document.getElementById('bracketScoreWinMethod').value;
    const weightClass = document.getElementById('bracketScoreWeightClass').value;

    if (!winner) { alert('请选择获胜方'); return; }

    try {
        const resp = await fetch(API_BASE + '/matches/' + matchId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blue_score: parseInt(blueScore) || 0,
                red_score: parseInt(redScore) || 0,
                winner: winner,
                win_method: winMethod || null,
                match_status: '已结束'
            })
        });
        const data = await resp.json();
        if (data.success) {
            closeBracketScoreModal();
            if (weightClass) {
                await viewBracketTree();
            }
        } else {
            alert('保存失败: ' + data.error);
        }
    } catch (err) {
        alert('请求失败: ' + err.message);
    }
}
