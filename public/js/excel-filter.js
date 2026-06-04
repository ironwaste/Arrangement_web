const ExcelFilter = (function() {
    let activeFilterMenu = null;
    let filterStates = {};

    const TEXT_OPERATORS = [
        { value: 'equals', label: '等于' },
        { value: 'not_equals', label: '不等于' },
        { value: 'contains', label: '包含' },
        { value: 'not_contains', label: '不包含' },
        { value: 'starts_with', label: '开头是' },
        { value: 'ends_with', label: '结尾是' }
    ];

    const NUMBER_OPERATORS = [
        { value: 'equals', label: '等于' },
        { value: 'not_equals', label: '不等于' },
        { value: 'greater_equal', label: '大于等于' },
        { value: 'greater', label: '大于' },
        { value: 'less_equal', label: '小于等于' },
        { value: 'less', label: '小于' }
    ];

    function detectColumnType(values) {
        if (!values || values.length === 0) return 'text';
        let numberCount = 0;
        let totalCount = Math.min(values.length, 100);
        for (let i = 0; i < totalCount; i++) {
            const val = values[i];
            if (val !== '' && val !== null && val !== undefined && !isNaN(parseFloat(val))) {
                numberCount++;
            }
        }
        return (numberCount / totalCount) > 0.7 ? 'number' : 'text';
    }

    function getCellValues(table, colIndex) {
        const rows = table.querySelectorAll('tbody tr');
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            return cells[colIndex] ? cells[colIndex].textContent.trim() : '';
        }).filter(v => v !== '');
    }

    function getUniqueValues(table, colIndex) {
        const rows = table.querySelectorAll('tbody tr');
        const valueSet = new Set();
        Array.from(rows).forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells[colIndex]) {
                const val = cells[colIndex].textContent.trim();
                if (val !== '') valueSet.add(val);
            }
        });
        return Array.from(valueSet).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b, 'zh-CN');
        });
    }

    function createFilterMenu(th, tableId, colIndex, columnName) {
        const menu = document.createElement('div');
        menu.className = 'excel-filter-menu';
        menu.id = `filter-menu-${tableId}-${colIndex}`;

        const state = filterStates[tableId] && filterStates[tableId][colIndex] ?
            filterStates[tableId][colIndex] : { sort: null, conditions: [{ operator: 'equals', value: '' }], logic: 'and', checkedValues: null };

        const cellValues = getCellValues(document.getElementById(tableId), colIndex);
        const columnType = detectColumnType(cellValues);
        const operators = columnType === 'number' ? NUMBER_OPERATORS : TEXT_OPERATORS;

        const uniqueValues = getUniqueValues(document.getElementById(tableId), colIndex);
        const checkedValues = state.checkedValues || uniqueValues;

        const checkboxHtml = renderCheckboxList(uniqueValues, checkedValues, tableId, colIndex);

        menu.innerHTML = `
            <div class="efm-header">
                <span class="efm-title">筛选: ${columnName}</span>
                <button class="efm-close" onclick="ExcelFilter.closeMenu()">&times;</button>
            </div>
            <div class="efm-section">
                <div class="efm-sort-section">
                    <button class="efm-sort-btn ${state.sort === 'asc' ? 'active' : ''}" data-sort="asc" onclick="ExcelFilter.applySort('${tableId}', ${colIndex}, 'asc')">
                        <span class="sort-icon">↑</span> 升序排序
                    </button>
                    <button class="efm-sort-btn ${state.sort === 'desc' ? 'active' : ''}" data-sort="desc" onclick="ExcelFilter.applySort('${tableId}', ${colIndex}, 'desc')">
                        <span class="sort-icon">↓</span> 降序排序
                    </button>
                    <button class="efm-sort-btn" onclick="ExcelFilter.clearSort('${tableId}', ${colIndex})">
                        清除排序
                    </button>
                </div>
            </div>
            <div class="efm-divider"></div>
            <div class="efm-section">
                <div class="efm-filter-header">
                    <span>显示行:</span>
                    <select class="efm-logic-select" id="efm-logic-${tableId}-${colIndex}" onchange="ExcelFilter.updateLogic('${tableId}', ${colIndex})">
                        <option value="and" ${state.logic === 'and' ? 'selected' : ''}>与 (A)</option>
                        <option value="or" ${state.logic === 'or' ? 'selected' : ''}>或 (O)</option>
                    </select>
                </div>
                <div class="efm-conditions-container" id="efm-conditions-${tableId}-${colIndex}">
                    ${renderConditions(state.conditions, operators, tableId, colIndex)}
                </div>
                <button class="efm-add-condition-btn" onclick="ExcelFilter.addCondition('${tableId}', ${colIndex}, '${columnType}')">
                    + 添加条件
                </button>
            </div>
            <div class="efm-divider"></div>
            <div class="efm-section">
                <div class="efm-checkbox-header">
                    <label class="efm-select-all-label">
                        <input type="checkbox" class="efm-select-all" ${checkedValues.length === uniqueValues.length ? 'checked' : ''}
                            onchange="ExcelFilter.toggleSelectAll('${tableId}', ${colIndex}, this.checked)">
                        <span>全选/取消全选</span>
                    </label>
                    <span class="efm-checkbox-count">${checkedValues.length}/${uniqueValues.length}</span>
                </div>
                <div class="efm-checkbox-list" id="efm-checkbox-list-${tableId}-${colIndex}">
                    ${checkboxHtml}
                </div>
            </div>
            <div class="efm-divider"></div>
            <div class="efm-footer">
                <button class="efm-btn efm-btn-primary" onclick="ExcelFilter.applyFilter('${tableId}', ${colIndex})">确定</button>
                <button class="efm-btn efm-btn-default" onclick="ExcelFilter.clearFilter('${tableId}', ${colIndex})">清除</button>
                <button class="efm-btn efm-btn-default" onclick="ExcelFilter.closeMenu()">取消</button>
            </div>
            <div class="efm-tip">
                可用？代表单个字符<br>用 * 代表任意多个字符
            </div>
        `;

        return menu;
    }

    function renderConditions(conditions, operators, tableId, colIndex) {
        if (!conditions) conditions = [{ operator: 'equals', value: '' }];
        return conditions.map((cond, idx) => `
            <div class="efm-condition-row" data-index="${idx}">
                <select class="efm-operator-select" data-condition="${idx}"
                    onchange="ExcelFilter.updateConditionOperator('${tableId}', ${colIndex}, ${idx}, this.value)">
                    ${operators.map(op =>
                        `<option value="${op.value}" ${cond.operator === op.value ? 'selected' : ''}>${op.label}</option>`
                    ).join('')}
                </select>
                <input type="text" class="efm-value-input" data-condition="${idx}"
                    value="${cond.value || ''}"
                    placeholder="输入筛选值"
                    onchange="ExcelFilter.updateConditionValue('${tableId}', ${colIndex}, ${idx}, this.value)">
                ${conditions.length > 1 ? `
                    <button class="efm-remove-cond-btn" onclick="ExcelFilter.removeCondition('${tableId}', ${colIndex}, ${idx})">×</button>
                ` : ''}
            </div>
        `).join('');
    }

    function renderCheckboxList(uniqueValues, checkedValues, tableId, colIndex) {
        if (uniqueValues.length === 0) {
            return '<div style="color:#909399;font-size:12px;padding:8px;text-align:center;">无数据</div>';
        }
        return uniqueValues.map(val => {
            const escaped = val.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const isChecked = checkedValues.includes(val);
            return `<label class="efm-checkbox-item">
                <input type="checkbox" value="${escaped}" ${isChecked ? 'checked' : ''}
                    onchange="ExcelFilter.toggleCheckboxValue('${tableId}', ${colIndex}, this.value, this.checked)">
                <span class="efm-checkbox-text">${val}</span>
            </label>`;
        }).join('');
    }

    function toggleSelectAll(tableId, colIndex, isChecked) {
        const container = document.getElementById(`efm-checkbox-list-${tableId}-${colIndex}`);
        if (!container) return;
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = isChecked;
        });
        updateCheckboxCount(tableId, colIndex);
    }

    function toggleCheckboxValue(tableId, colIndex, value, isChecked) {
        updateCheckboxCount(tableId, colIndex);
        const container = document.getElementById(`efm-checkbox-list-${tableId}-${colIndex}`);
        if (!container) return;
        const allCheckboxes = container.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        const selectAll = container.closest('.efm-section').querySelector('.efm-select-all');
        if (selectAll) selectAll.checked = allChecked;
    }

    function updateCheckboxCount(tableId, colIndex) {
        const container = document.getElementById(`efm-checkbox-list-${tableId}-${colIndex}`);
        if (!container) return;
        const allCheckboxes = container.querySelectorAll('input[type="checkbox"]');
        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
        const countEl = container.closest('.efm-section').querySelector('.efm-checkbox-count');
        if (countEl) countEl.textContent = `${checkedCount}/${allCheckboxes.length}`;
    }

    function gatherCheckedValues(tableId, colIndex) {
        const container = document.getElementById(`efm-checkbox-list-${tableId}-${colIndex}`);
        if (!container) return null;
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 0) return null;
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function showMenu(th, tableId, colIndex, columnName) {
        const existingMenu = document.getElementById(`filter-menu-${tableId}-${colIndex}`);
        if (existingMenu) {
            existingMenu.remove();
            activeFilterMenu = null;
            return;
        }

        closeMenu();

        const menu = createFilterMenu(th, tableId, colIndex, columnName);
        document.body.appendChild(menu);
        activeFilterMenu = menu;

        requestAnimationFrame(() => {
            const rect = th.getBoundingClientRect();
            const menuHeight = menu.offsetHeight;
            const viewportHeight = window.innerHeight;

            let top = rect.bottom + 2;
            if (top + menuHeight > viewportHeight && rect.top - menuHeight - 2 > 0) {
                top = rect.top - menuHeight - 2;
            }

            let left = rect.left;
            if (left + menu.offsetWidth > window.innerWidth) {
                left = window.innerWidth - menu.offsetWidth - 8;
            }
            if (left < 0) left = 4;

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });

        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 10);
    }

    function handleOutsideClick(e) {
        if (!activeFilterMenu) return;

        const clickTarget = e.target;
        const isMenuClick = activeFilterMenu.contains(clickTarget);
        const isFilterIcon = clickTarget.closest('.excel-filter-icon');
        const isHeaderClick = clickTarget.closest('th');

        if (isMenuClick) return;
        if (isFilterIcon || isHeaderClick) {
            setTimeout(() => {
                if (activeFilterMenu && !document.body.contains(activeFilterMenu)) {
                    activeFilterMenu = null;
                }
            }, 0);
            return;
        }

        closeMenu();
    }

    function closeMenu() {
        document.removeEventListener('click', handleOutsideClick);
        if (activeFilterMenu) {
            if (activeFilterMenu.parentNode) {
                activeFilterMenu.remove();
            }
            activeFilterMenu = null;
        }
    }

    function initTable(tableId, options = {}) {
        const table = document.getElementById(tableId);
        if (!table) return;

        if (!filterStates[tableId]) {
            filterStates[tableId] = {};
        }

        const thead = table.querySelector('thead');
        if (!thead) return;

        const headers = thead.querySelectorAll('th');
        headers.forEach((th, index) => {
            if (options.excludeColumns && options.excludeColumns.includes(index)) return;

            const columnName = th.textContent.trim().replace(/[▼▲▶×✓]/g, '').trim();

            th.style.position = 'relative';
            th.style.cursor = 'pointer';
            th.style.whiteSpace = 'nowrap';

            let icon = th.querySelector('.excel-filter-icon');
            if (!icon) {
                icon = document.createElement('span');
                icon.className = 'excel-filter-icon';
                icon.innerHTML = '▼';
                th.appendChild(icon);
            }

            const newIcon = icon;
            const newTh = th;
            const newIndex = index;
            const newName = columnName;

            newIcon.onclick = null;
            newTh.onclick = null;

            newIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                showMenu(newTh, tableId, newIndex, newName);
            });

            newTh.addEventListener('click', function(e) {
                if (e.target === newIcon || newIcon.contains(e.target)) return;
            });
        });

        if (options.onFilterChange) {
            table._onFilterChange = options.onFilterChange;
        }
    }

    function applySort(tableId, colIndex, direction) {
        if (!filterStates[tableId]) filterStates[tableId] = {};
        if (!filterStates[tableId][colIndex]) filterStates[tableId][colIndex] = {};

        const prevState = filterStates[tableId][colIndex].sort;
        filterStates[tableId][colIndex].sort = prevState === direction ? null : direction;

        updateSortButtons(tableId, colIndex);
        applyFilterOperation(tableId);
    }

    function clearSort(tableId, colIndex) {
        if (filterStates[tableId] && filterStates[tableId][colIndex]) {
            filterStates[tableId][colIndex].sort = null;
        }
        updateSortButtons(tableId, colIndex);
        restoreOriginalOrder(tableId);
        applyFilterOperation(tableId);
    }

    function restoreOriginalOrder(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        if (!filterStates[tableId] || !filterStates[tableId].originalOrder) return;

        filterStates[tableId].originalOrder.forEach(row => {
            tbody.appendChild(row);
        });
    }

    function updateSortButtons(tableId, colIndex) {
        const menu = document.getElementById(`filter-menu-${tableId}-${colIndex}`);
        if (!menu) return;

        const state = filterStates[tableId] && filterStates[tableId][colIndex];
        const sort = state ? state.sort : null;

        menu.querySelectorAll('.efm-sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sort);
        });

        updateFilterIcon(tableId, colIndex);
    }

    function updateLogic(tableId, colIndex) {
        const logicSelect = document.getElementById(`efm-logic-${tableId}-${colIndex}`);
        if (!logicSelect) return;

        if (!filterStates[tableId]) filterStates[tableId] = {};
        if (!filterStates[tableId][colIndex]) filterStates[tableId][colIndex] = {};

        filterStates[tableId][colIndex].logic = logicSelect.value;
    }

    function updateConditionOperator(tableId, colIndex, conditionIdx, operator) {
        if (filterStates[tableId] && filterStates[tableId][colIndex] &&
            filterStates[tableId][colIndex].conditions[conditionIdx]) {
            filterStates[tableId][colIndex].conditions[conditionIdx].operator = operator;
        }
    }

    function updateConditionValue(tableId, colIndex, conditionIdx, value) {
        if (filterStates[tableId] && filterStates[tableId][colIndex] &&
            filterStates[tableId][colIndex].conditions[conditionIdx]) {
            filterStates[tableId][colIndex].conditions[conditionIdx].value = value;
        }
    }

    function addCondition(tableId, colIndex, columnType) {
        if (!filterStates[tableId]) filterStates[tableId] = {};
        if (!filterStates[tableId][colIndex]) filterStates[tableId][colIndex] = {};
        if (!filterStates[tableId][colIndex].conditions) filterStates[tableId][colIndex].conditions = [];

        const operators = columnType === 'number' ? NUMBER_OPERATORS : TEXT_OPERATORS;
        filterStates[tableId][colIndex].conditions.push({ operator: operators[0].value, value: '' });

        refreshConditionsUI(tableId, colIndex);
    }

    function removeCondition(tableId, colIndex, conditionIdx) {
        if (filterStates[tableId] && filterStates[tableId][colIndex] &&
            filterStates[tableId][colIndex].conditions) {
            filterStates[tableId][colIndex].conditions.splice(conditionIdx, 1);
            refreshConditionsUI(tableId, colIndex);
        }
    }

    function refreshConditionsUI(tableId, colIndex) {
        const container = document.getElementById(`efm-conditions-${tableId}-${colIndex}`);
        if (!container) return;

        const state = filterStates[tableId] && filterStates[tableId][colIndex];
        if (!state || !state.conditions) return;

        const cellValues = getCellValues(document.getElementById(tableId), colIndex);
        const columnType = detectColumnType(cellValues);
        const operators = columnType === 'number' ? NUMBER_OPERATORS : TEXT_OPERATORS;

        container.innerHTML = renderConditions(state.conditions, operators, tableId, colIndex);
    }

    function testCondition(value, operator, conditionValue) {
        if (conditionValue === '' || conditionValue === null || conditionValue === undefined) return true;

        const numValue = parseFloat(value);
        const numCondValue = parseFloat(conditionValue);
        const isNumeric = !isNaN(numValue) && !isNaN(numCondValue);

        switch (operator) {
            case 'equals':
                return isNumeric ? numValue === numCondValue : value === conditionValue;
            case 'not_equals':
                return isNumeric ? numValue !== numCondValue : value !== conditionValue;
            case 'contains':
                return value.toLowerCase().includes(conditionValue.toLowerCase());
            case 'not_contains':
                return !value.toLowerCase().includes(conditionValue.toLowerCase());
            case 'starts_with':
                return value.toLowerCase().startsWith(conditionValue.toLowerCase());
            case 'ends_with':
                return value.toLowerCase().endsWith(conditionValue.toLowerCase());
            case 'greater_equal':
                return isNumeric && numValue >= numCondValue;
            case 'greater':
                return isNumeric && numValue > numCondValue;
            case 'less_equal':
                return isNumeric && numValue <= numCondValue;
            case 'less':
                return isNumeric && numValue < numCondValue;
            default:
                return true;
        }
    }

    function applyFilter(tableId, colIndex) {
        gatherCurrentInputValues(tableId, colIndex);
        const checkedValues = gatherCheckedValues(tableId, colIndex);
        if (checkedValues !== null) {
            if (!filterStates[tableId]) filterStates[tableId] = {};
            if (!filterStates[tableId][colIndex]) filterStates[tableId][colIndex] = {};
            filterStates[tableId][colIndex].checkedValues = checkedValues;
        }
        applyFilterOperation(tableId);
        closeMenu();
    }

    function gatherCurrentInputValues(tableId, colIndex) {
        const container = document.getElementById(`efm-conditions-${tableId}-${colIndex}`);
        if (!container) return;

        if (!filterStates[tableId]) filterStates[tableId] = {};
        if (!filterStates[tableId][colIndex]) filterStates[tableId][colIndex] = {};

        const logicSelect = document.getElementById(`efm-logic-${tableId}-${colIndex}`);
        if (logicSelect) {
            filterStates[tableId][colIndex].logic = logicSelect.value;
        }

        const conditionRows = container.querySelectorAll('.efm-condition-row');
        const conditions = [];
        conditionRows.forEach(row => {
            const operator = row.querySelector('.efm-operator-select').value;
            const value = row.querySelector('.efm-value-input').value;
            conditions.push({ operator, value });
        });
        filterStates[tableId][colIndex].conditions = conditions;
    }

    function clearFilter(tableId, colIndex) {
        if (filterStates[tableId] && filterStates[tableId][colIndex]) {
            filterStates[tableId][colIndex] = {
                sort: null,
                conditions: [{ operator: 'equals', value: '' }],
                logic: 'and',
                checkedValues: null
            };
        }
        updateSortButtons(tableId, colIndex);
        refreshConditionsUI(tableId, colIndex);
        applyFilterOperation(tableId);
        closeMenu();
    }

    function clearAllFilters(tableId) {
        filterStates[tableId] = {};
        const table = document.getElementById(tableId);
        if (table) {
            table.querySelectorAll('.excel-filter-icon').forEach(icon => {
                icon.innerHTML = '▼';
                icon.classList.remove('has-filter');
            });
        }
        applyFilterOperation(tableId);
    }

    function applyFilterOperation(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        let hasAnyFilter = false;

        rows.forEach(row => {
            let rowVisible = true;
            const cells = row.querySelectorAll('td');

            for (let colIdx in filterStates[tableId]) {
                const state = filterStates[tableId][colIdx];
                if (!state) continue;

                const colIndex = parseInt(colIdx);
                const cell = cells[colIndex];
                if (!cell) continue;

                const cellValue = cell.textContent.trim();

                if (state.sort) {
                    hasAnyFilter = true;
                }

                if (state.checkedValues) {
                    const uniqueValues = getUniqueValues(table, colIndex);
                    const allChecked = state.checkedValues.length === uniqueValues.length;
                    if (!allChecked && uniqueValues.length > 0) {
                        hasAnyFilter = true;
                        rowVisible = rowVisible && state.checkedValues.includes(cellValue);
                    }
                }

                if (state.conditions && state.conditions.length > 0) {
                    const hasActiveConditions = state.conditions.some(c =>
                        c.value !== '' && c.value !== null && c.value !== undefined
                    );

                    if (hasActiveConditions) {
                        hasAnyFilter = true;
                        const logic = state.logic || 'and';

                        if (logic === 'and') {
                            rowVisible = rowVisible && state.conditions.every(cond =>
                                testCondition(cellValue, cond.operator, cond.value)
                            );
                        } else {
                            rowVisible = rowVisible && state.conditions.some(cond =>
                                testCondition(cellValue, cond.operator, cond.value)
                            );
                        }
                    }
                }
            }

            row.style.display = rowVisible ? '' : 'none';
        });

        for (let colIdx in filterStates[tableId]) {
            const state = filterStates[tableId][colIdx];
            if (state) {
                updateFilterIcon(tableId, parseInt(colIdx));

                if (state.sort) {
                    sortTable(tableId, parseInt(colIdx), state.sort);
                }
            }
        }

        if (table._onFilterChange) {
            table._onFilterChange(filterStates[tableId]);
        }
    }

    function sortTable(tableId, colIndex, direction) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        if (!filterStates[tableId]) filterStates[tableId] = {};
        if (!filterStates[tableId].originalOrder) {
            filterStates[tableId].originalOrder = Array.from(tbody.querySelectorAll('tr'));
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const visibleRows = rows.filter(row => row.style.display !== 'none');

        visibleRows.sort((a, b) => {
            const aCells = a.querySelectorAll('td');
            const bCells = b.querySelectorAll('td');
            const aVal = aCells[colIndex] ? aCells[colIndex].textContent.trim() : '';
            const bVal = bCells[colIndex] ? bCells[colIndex].textContent.trim() : '';

            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            const isNumeric = !isNaN(aNum) && !isNaN(bNum);

            if (isNumeric) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            } else {
                return direction === 'asc' ?
                    aVal.localeCompare(bVal, 'zh-CN') :
                    bVal.localeCompare(aVal, 'zh-CN');
            }
        });

        visibleRows.forEach(row => tbody.appendChild(row));
    }

    function updateFilterIcon(tableId, colIndex) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const thead = table.querySelector('thead');
        if (!thead) return;

        const th = thead.querySelectorAll('th')[colIndex];
        if (!th) return;

        const icon = th.querySelector('.excel-filter-icon');
        if (!icon) return;

        const state = filterStates[tableId] && filterStates[tableId][colIndex];
        if (!state) {
            icon.innerHTML = '▼';
            icon.classList.remove('has-filter');
            return;
        }

        const hasSort = state.sort !== null && state.sort !== undefined;
        const hasFilter = state.conditions && state.conditions.some(c =>
            c.value !== '' && c.value !== null && c.value !== undefined
        );
        const hasCheckboxFilter = state.checkedValues && state.checkedValues.length < getUniqueValues(document.getElementById(tableId), colIndex).length;

        if (hasSort && state.sort === 'asc') {
            icon.innerHTML = '▲';
            icon.classList.add('has-filter');
        } else if (hasSort && state.sort === 'desc') {
            icon.innerHTML = '▼';
            icon.classList.add('has-filter');
        } else if (hasFilter || hasCheckboxFilter) {
            icon.innerHTML = '▼';
            icon.classList.add('has-filter');
        } else {
            icon.innerHTML = '▼';
            icon.classList.remove('has-filter');
        }
    }

    function getFilterState(tableId) {
        return filterStates[tableId] || {};
    }

    function resetAllFilters(tableId) {
        filterStates[tableId] = {};
        const table = document.getElementById(tableId);
        if (table) {
            table.querySelectorAll('.excel-filter-icon').forEach(icon => {
                icon.innerHTML = '▼';
                icon.classList.remove('has-filter');
            });
            const tbody = table.querySelector('tbody');
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(row => {
                    row.style.display = '';
                });
            }
        }
    }

    return {
        init: initTable,
        closeMenu,
        applySort,
        clearSort,
        updateLogic,
        updateConditionOperator,
        updateConditionValue,
        addCondition,
        removeCondition,
        applyFilter,
        clearFilter,
        clearAllFilters,
        getFilterState,
        resetAllFilters,
        toggleSelectAll,
        toggleCheckboxValue
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExcelFilter;
}
