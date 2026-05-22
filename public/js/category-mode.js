const CategoryModeComponent = {
  currentEventId: null,
  categoryData: [],
  selectedClass: '',
  onClassSelect: null,
  onClassDoubleClick: null,

  async init(eventId, options = {}) {
    this.currentEventId = eventId;
    this.onClassSelect = options.onClassSelect || null;
    this.onClassDoubleClick = options.onClassDoubleClick || null;
    await this.loadCategoryData();
  },

  async loadCategoryData() {
    if (!this.currentEventId) {
      this.categoryData = [];
      return [];
    }

    try {
      const resp = await fetch(`${API_BASE}/category-mode/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: this.currentEventId })
      });
      const data = await resp.json();
      
      if (data.success) {
        this.categoryData = data.data || [];
        return this.categoryData;
      }
      
      const fallbackResp = await fetch(`${API_BASE}/category-mode?event_id=${this.currentEventId}`);
      const fallbackData = await fallbackResp.json();
      this.categoryData = fallbackData.data || [];
      return this.categoryData;
    } catch (err) {
      console.error('加载category_mode数据失败:', err);
      
      try {
        const currentAthleteType = currentEventType === 'jiu_jitsu' ? 'jiu_jitsu' : 'taekwondo_kyougi';
        const athleteResp = await fetch(`${API_BASE}/athletes?event_id=${this.currentEventId}&athlete_type=${currentAthleteType}`);
        const athleteData = await athleteResp.json();
        const athletes = athleteData.data || [];
        
        const classMap = new Map();
        athletes.forEach(a => {
          const wc = a.athlete_category || a.weight_class || '未分级';
          if (!classMap.has(wc)) {
            classMap.set(wc, { 
              id: null, 
              event_id: this.currentEventId, 
              weight_class: wc, 
              category_venue: '', 
              category_date_num: null, 
              categroy_count: 0,
              categroy_mode_num: 1,
              categroy_mode_name: '单败淘汰赛',
              category_mode_description: ''
            });
          }
          classMap.get(wc).categroy_count++;
        });
        
        this.categoryData = Array.from(classMap.values()).sort((a, b) => 
          a.weight_class.localeCompare(b.weight_class, 'zh-CN')
        );
        return this.categoryData;
      } catch (fallbackErr) {
        console.error('备用加载也失败:', fallbackErr);
        this.categoryData = [];
        return [];
      }
    }
  },

  renderToList(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { 
      showGenerated = false, 
      generatedClasses = new Set(),
      showCount = true,
      showVenue = false,
      showUnit = false,
      showMode = false,
      emptyText = '暂无级别数据',
      itemClickHandler = null,
      itemDoubleClickHandler = null
    } = options;

    container.innerHTML = '';

    if (this.categoryData.length === 0) {
      container.innerHTML = `<div style="color:#909399;font-size:12px;text-align:center;padding:10px;">${emptyText}</div>`;
      return;
    }

    for (const cat of this.categoryData) {
      const isGenerated = generatedClasses.has(cat.weight_class);
      if (showGenerated && isGenerated) continue;
      if (!showGenerated && isGenerated) continue;

      const li = document.createElement('li');
      li.dataset.class = cat.weight_class;
      li.dataset.id = cat.id || '';
      
      let html = `<span class="class-name">${cat.weight_class}</span>`;
      
      if (showCount) {
        html += `<span class="count">${cat.categroy_count || 0}人</span>`;
      }
      
      if (showVenue && cat.category_venue) {
        html += `<span class="venue">${cat.category_venue}</span>`;
      }
      
      if (showUnit && cat.category_date_num) {
        html += `<span class="unit">第${cat.category_date_num}单元</span>`;
      }
      
      if (showMode && cat.categroy_mode_name) {
        html += `<span class="mode">${cat.categroy_mode_name}</span>`;
      }

      li.innerHTML = html;

      li.onclick = (e) => {
        e.stopPropagation();
        this.selectedClass = cat.weight_class;
        
        container.querySelectorAll('li').forEach(item => {
          item.classList.toggle('active', item.dataset.class === cat.weight_class);
        });

        if (itemClickHandler) {
          itemClickHandler(cat, e);
        } else if (this.onClassSelect) {
          this.onClassSelect(cat, e);
        }
      };

      li.ondblclick = (e) => {
        e.stopPropagation();
        if (itemDoubleClickHandler) {
          itemDoubleClickHandler(cat, e);
        } else if (this.onClassDoubleClick) {
          this.onClassDoubleClick(cat, e);
        }
      };

      if (cat.weight_class === this.selectedClass) {
        li.classList.add('active');
      }

      container.appendChild(li);
    }
  },

  renderToTable(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
      editableFields = ['category_venue', 'category_date_num', 'category_order', 'categroy_mode_num', 'categroy_mode_name'],
      onFieldChange = null,
      onRowSelect = null
    } = options;

    let html = `
      <table class="category-mode-table" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:linear-gradient(to right,#8B0000,#00008B);color:#fff;">
            <th style="padding:8px;border:1px solid #ebeef5;">级别</th>
            <th style="padding:8px;border:1px solid #ebeef5;">人数</th>
            <th style="padding:8px;border:1px solid #ebeef5;">场地</th>
            <th style="padding:8px;border:1px solid #ebeef5;">单元</th>
            <th style="padding:8px;border:1px solid #ebeef5;">顺序</th>
            <th style="padding:8px;border:1px solid #ebeef5;">竞赛方式</th>
            <th style="padding:8px;border:1px solid #ebeef5;">备注</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const cat of this.categoryData) {
      const venueEditable = editableFields.includes('category_venue');
      const unitEditable = editableFields.includes('category_date_num');
      const orderEditable = editableFields.includes('category_order');
      const modeEditable = editableFields.includes('categroy_mode_name') || editableFields.includes('categroy_mode_num');

      html += `
        <tr data-id="${cat.id || ''}" data-class="${cat.weight_class}" style="cursor:pointer;" onmouseover="this.style.background='#f5f7fa'" onmouseout="this.style.background='#fff'">
          <td style="padding:6px;border:1px solid #ebeef5;font-weight:500;">${cat.weight_class}</td>
          <td style="padding:6px;border:1px solid #ebeef5;text-align:center;color:#409eff;font-weight:bold;">${cat.categroy_count || 0}</td>
          <td style="padding:6px;border:1px solid #ebeef5;text-align:center;">
            ${venueEditable ?
              `<input type="text" value="${cat.category_venue || ''}"
                data-field="category_venue" data-id="${cat.id}"
                style="width:50px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"
                onchange="CategoryModeComponent.handleFieldChange(this)">` :
              (cat.category_venue || '-')
            }
          </td>
          <td style="padding:6px;border:1px solid #ebeef5;text-align:center;">
            ${unitEditable ?
              `<select data-field="category_date_num" data-id="${cat.id}"
                style="width:70px;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"
                onchange="CategoryModeComponent.handleFieldChange(this)">
                <option value="">未分配</option>
                ${[1,2,3,4,5,6,7,8,9,10].map(n =>
                  `<option value="${n}" ${cat.category_date_num == n ? 'selected' : ''}>第${n}单元</option>`
                ).join('')}
              </select>` :
              (cat.category_date_num ? `第${cat.category_date_num}单元` : '-')
            }
          </td>
          <td style="padding:6px;border:1px solid #ebeef5;text-align:center;">
            ${orderEditable ?
              `<input type="number" min="1" value="${cat.category_order || ''}" data-field="category_order" data-id="${cat.id}"
                style="width:50px;text-align:center;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"
                onchange="CategoryModeComponent.handleFieldChange(this)">` :
              (cat.category_order || '-')
            }
          </td>
          <td style="padding:6px;border:1px solid #ebeef5;text-align:center;">
            ${modeEditable ?
              `<select data-field="categroy_mode_name" data-id="${cat.id}"
                style="width:100px;border:1px solid #dcdfe6;border-radius:3px;padding:2px;"
                onchange="CategoryModeComponent.handleFieldChange(this)">
                <option value="单败淘汰赛" ${cat.categroy_mode_name === '单败淘汰赛' ? 'selected' : ''}>单败淘汰赛</option>
                <option value="双败淘汰赛" ${cat.categroy_mode_name === '双败淘汰赛' ? 'selected' : ''}>双败淘汰赛</option>
                <option value="单循环赛" ${cat.categroy_mode_name === '单循环赛' ? 'selected' : ''}>单循环赛</option>
                <option value="分区循环赛" ${cat.categroy_mode_name === '分区循环赛' ? 'selected' : ''}>分区循环赛</option>
              </select>` :
              (cat.categroy_mode_name || '-')
            }
          </td>
          <td style="padding:6px;border:1px solid #ebeef5;font-size:11px;color:#909399;">
            ${cat.category_mode_description || '-'}
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    if (onRowSelect) {
      container.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('click', (e) => {
          const className = tr.dataset.class;
          const cat = this.categoryData.find(c => c.weight_class === className);
          if (cat) onRowSelect(cat, e);
        });
      });
    }
  },

  async handleFieldChange(inputElement) {
    const field = inputElement.dataset.field;
    const id = inputElement.dataset.id;
    let value = inputElement.value;

    if (!id) {
      console.warn('无法更新：缺少记录ID');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/category-mode/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      const data = await resp.json();

      if (data.success) {
        const index = this.categoryData.findIndex(c => c.id == id);
        if (index !== -1) {
          this.categoryData[index][field] = value;
        }
        console.log(`✅ 更新成功: ${field} = ${value}`);
      } else {
        alert('更新失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      console.error('更新失败:', err);
      alert('更新失败: ' + err.message);
    }
  },

  async checkBracketsGenerated() {
    if (!this.currentEventId) return false;

    try {
      const resp = await fetch(`${API_BASE}/brackets/stage-map?event_id=${this.currentEventId}`);
      const data = await resp.json();

      if (data.success && data.data && data.data.length > 0) {
        return data.data.some(item => item.stage_id);
      }
      return false;
    } catch (err) {
      console.error('检查对阵表生成状态失败:', err);
      return false;
    }
  },

  async clearAllMatchesForEvent() {
    if (!this.currentEventId) return;

    try {
      const resp = await fetch(`${API_BASE}/brackets/clear-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: this.currentEventId })
      });
      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.error || '清除对阵表失败');
      }

      console.log('✅ 已清除该赛事的所有对阵表');

      if (typeof clearBracket === 'function') {
        clearBracket();
      }
      if (typeof clearBracketCache === 'function') {
        clearBracketCache();
      }
      if (typeof generatedClasses !== 'undefined') {
        generatedClasses.clear();
      }
      if (typeof selectedBracketClass !== 'undefined') {
        selectedBracketClass = '';
      }
    } catch (err) {
      throw err;
    }
  },

  async saveBatchUpdates(items) {
    try {
      const resp = await fetch(`${API_BASE}/category-mode/batch`, {
        method: 'PUT',
        headers: { 'Content-Class': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await resp.json();

      if (data.success) {
        await this.loadCategoryData();
        return { success: true, updated: data.updated };
      } else {
        throw new Error(data.error || '批量更新失败');
      }
    } catch (err) {
      console.error('批量更新失败:', err);
      throw err;
    }
  },

  getSelectedClass() {
    return this.selectedClass;
  },

  setSelectedClass(className) {
    this.selectedClass = className;
  },

  getCategoryByClass(className) {
    return this.categoryData.find(c => c.weight_class === className);
  },

  getAllCategories() {
    return this.categoryData;
  },

  getCategoriesByUnit(unitNum) {
    return this.categoryData.filter(c => c.category_date_num == unitNum);
  },

  getCategoriesByVenue(venue) {
    return this.categoryData.filter(c => c.category_venue === venue);
  },

  getStats() {
    if (this.categoryData.length === 0) {
      return {
        totalClasses: 0,
        totalAthletes: 0,
        modeDistribution: {}
      };
    }

    const totalAthletes = this.categoryData.reduce((sum, c) => sum + (c.categroy_count || 0), 0);
    const modeDistribution = {};

    this.categoryData.forEach(c => {
      const mode = c.categroy_mode_name || '未知';
      modeDistribution[mode] = (modeDistribution[mode] || 0) + 1;
    });

    return {
      totalClasses: this.categoryData.length,
      totalAthletes,
      modeDistribution
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CategoryModeComponent;
}
