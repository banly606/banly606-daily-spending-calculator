(function () {
  'use strict';

  var STORAGE_KEY = 'daily-spend-items-v1';
  var DATA_VERSION = 1;
  var MS_PER_DAY = 86400000;

  var form = document.getElementById('itemForm');
  var formTitle = document.getElementById('formTitle');
  var nameInput = document.getElementById('name');
  var categoryInput = document.getElementById('category');
  var priceInput = document.getElementById('price');
  var purchaseDateInput = document.getElementById('purchaseDate');
  var endDateInput = document.getElementById('endDate');
  var formError = document.getElementById('formError');
  var submitBtn = document.getElementById('submitBtn');
  var cancelEditBtn = document.getElementById('cancelEditBtn');
  var itemList = document.getElementById('itemList');
  var itemCount = document.getElementById('itemCount');
  var emptyState = document.getElementById('emptyState');
  var chartSection = document.getElementById('chartSection');
  var chart = document.getElementById('chart');
  var exportBtn = document.getElementById('exportBtn');
  var importInput = document.getElementById('importInput');
  var modalBackdrop = document.getElementById('modalBackdrop');
  var modalTitle = document.getElementById('modalTitle');
  var modalMessage = document.getElementById('modalMessage');
  var modalConfirm = document.getElementById('modalConfirm');
  var modalCancel = document.getElementById('modalCancel');
  var notice = document.getElementById('notice');

  var items = [];
  var editingId = null;
  var pendingDeleteId = null;
  var noticeTimer = null;

  /* ---------- 工具函数 ---------- */

  function makeId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseDate(str) {
    if (!str) return null;
    var parts = String(str).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    var y = parts[0];
    var m = parts[1];
    var d = parts[2];
    var date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      return null;
    }
    return date;
  }

  function todayString() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function daysBetween(start, end) {
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  }

  function calcDays(item) {
    var start = parseDate(item.purchaseDate);
    if (!start) return 1;
    var end = item.endDate ? parseDate(item.endDate) : parseDate(todayString());
    if (!end) end = parseDate(todayString());
    return Math.max(1, daysBetween(start, end));
  }

  function formatMoney(value) {
    return value.toFixed(2);
  }

  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearError() {
    formError.hidden = true;
    formError.textContent = '';
  }

  function showNotice(message, type) {
    notice.textContent = message;
    notice.className = 'notice show' + (type === 'error' ? ' error' : '');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      notice.classList.remove('show');
    }, 2600);
  }

  /* ---------- 数据存储 ---------- */

  function loadItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (data && data.version === DATA_VERSION && Array.isArray(data.items)) {
        return data.items;
      }
    } catch (err) {
      console.warn('读取本地数据失败', err);
    }
    return [];
  }

  function saveItems() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: DATA_VERSION, items: items })
      );
    } catch (err) {
      console.warn('保存本地数据失败', err);
      showNotice('保存失败：浏览器存储不可用', 'error');
    }
  }

  function sanitizeItems(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var result = [];
    raw.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var id = typeof it.id === 'string' && it.id ? it.id : makeId();
      if (seen[id]) return;
      var name = typeof it.name === 'string' ? it.name.trim() : '';
      if (!name) return;
      var price = Number(it.price);
      if (!isFinite(price) || price <= 0) return;
      var purchaseDate = typeof it.purchaseDate === 'string' ? it.purchaseDate : '';
      if (!parseDate(purchaseDate)) return;
      var endDate = typeof it.endDate === 'string' ? it.endDate : '';
      if (endDate) {
        if (!parseDate(endDate)) endDate = '';
        else if (parseDate(endDate) < parseDate(purchaseDate)) endDate = '';
      }
      var category =
        typeof it.category === 'string' && it.category.trim()
          ? it.category.trim()
          : '其他';
      var createdAt =
        typeof it.createdAt === 'string' && it.createdAt
          ? it.createdAt
          : new Date().toISOString();
      seen[id] = true;
      result.push({
        id: id,
        name: name,
        category: category,
        price: price,
        purchaseDate: purchaseDate,
        endDate: endDate,
        createdAt: createdAt
      });
    });
    return result;
  }

  /* ---------- 渲染 ---------- */

  function render() {
    items.sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    renderList();
    renderChart();
    itemCount.textContent = items.length;
    emptyState.hidden = items.length > 0;
    chartSection.hidden = items.length === 0;
  }

  function renderList() {
    itemList.innerHTML = '';
    items.forEach(function (item) {
      var days = calcDays(item);
      var daily = item.price / days;
      var li = document.createElement('li');
      li.className = 'item';
      li.innerHTML =
        '<div class="item-head">' +
        '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="category-chip">' + escapeHtml(item.category) + '</span>' +
        '<div class="item-actions">' +
        '<button type="button" class="icon-btn edit-btn" title="编辑" aria-label="编辑 ' + escapeHtml(item.name) + '">✏️</button>' +
        '<button type="button" class="icon-btn delete-btn" title="删除" aria-label="删除 ' + escapeHtml(item.name) + '">🗑️</button>' +
        '</div>' +
        '</div>' +
        '<div class="item-stats">' +
        '<div class="stat"><span class="stat-label">日均花费</span><span class="stat-value daily">' + formatMoney(daily) + '<span class="stat-unit">元/天</span></span></div>' +
        '<div class="stat"><span class="stat-label">总价</span><span class="stat-value">' + formatMoney(item.price) + '<span class="stat-unit">元</span></span></div>' +
        '<div class="stat"><span class="stat-label">已用天数</span><span class="stat-value">' + days.toLocaleString('zh-CN') + '<span class="stat-unit">天</span></span></div>' +
        '</div>';
      li.querySelector('.edit-btn').addEventListener('click', function () {
        startEdit(item.id);
      });
      li.querySelector('.delete-btn').addEventListener('click', function () {
        requestDelete(item.id);
      });
      itemList.appendChild(li);
    });
  }

  function renderChart() {
    chart.innerHTML = '';
    var sorted = items.slice().sort(function (a, b) {
      return b.price / calcDays(b) - a.price / calcDays(a);
    });
    var max = 0;
    sorted.forEach(function (item) {
      max = Math.max(max, item.price / calcDays(item));
    });
    if (max <= 0) return;
    sorted.forEach(function (item) {
      var daily = item.price / calcDays(item);
      var percent = Math.max(2, (daily / max) * 100);
      var row = document.createElement('div');
      row.className = 'chart-row';
      row.innerHTML =
        '<div class="chart-label">' +
        '<span class="chart-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="chart-value">' + formatMoney(daily) + ' 元/天</span>' +
        '</div>' +
        '<div class="chart-track"><div class="chart-fill"></div></div>';
      var fill = row.querySelector('.chart-fill');
      chart.appendChild(row);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fill.style.width = percent + '%';
        });
      });
    });
  }

  /* ---------- 表单 ---------- */

  function validateForm() {
    var name = nameInput.value.trim();
    var price = Number(priceInput.value);
    var purchaseDate = purchaseDateInput.value;
    var endDate = endDateInput.value;

    if (!name) {
      showError('请填写物品名称。');
      nameInput.focus();
      return null;
    }
    if (!isFinite(price) || price <= 0) {
      showError('价格必须是大于 0 的数字。');
      priceInput.focus();
      return null;
    }
    if (!purchaseDate || !parseDate(purchaseDate)) {
      showError('请选择有效的购买日期。');
      purchaseDateInput.focus();
      return null;
    }
    if (endDate) {
      if (!parseDate(endDate)) {
        showError('截止日期无效。');
        endDateInput.focus();
        return null;
      }
      if (parseDate(endDate) < parseDate(purchaseDate)) {
        showError('截止日期不能早于购买日期。');
        endDateInput.focus();
        return null;
      }
    }
    return {
      name: name,
      category: categoryInput.value.trim() || '其他',
      price: price,
      purchaseDate: purchaseDate,
      endDate: endDate
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var values = validateForm();
    if (!values) return;

    if (editingId) {
      var target = items.find(function (item) {
        return item.id === editingId;
      });
      if (target) {
        target.name = values.name;
        target.category = values.category;
        target.price = values.price;
        target.purchaseDate = values.purchaseDate;
        target.endDate = values.endDate;
      }
      showNotice('已保存修改。');
    } else {
      items.push({
        id: makeId(),
        name: values.name,
        category: values.category,
        price: values.price,
        purchaseDate: values.purchaseDate,
        endDate: values.endDate,
        createdAt: new Date().toISOString()
      });
      showNotice('已添加「' + values.name + '」。');
    }

    saveItems();
    form.reset();
    resetFormMode();
    clearError();
    render();
  });

  function startEdit(id) {
    var item = items.find(function (it) {
      return it.id === id;
    });
    if (!item) return;
    editingId = id;
    nameInput.value = item.name;
    categoryInput.value = item.category;
    priceInput.value = item.price;
    purchaseDateInput.value = item.purchaseDate;
    endDateInput.value = item.endDate || '';
    formTitle.textContent = '编辑物品';
    submitBtn.textContent = '保存修改';
    cancelEditBtn.hidden = false;
    clearError();
    document.getElementById('formSection').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    nameInput.focus();
  }

  function resetFormMode() {
    editingId = null;
    formTitle.textContent = '添加物品';
    submitBtn.textContent = '添加';
    cancelEditBtn.hidden = true;
  }

  cancelEditBtn.addEventListener('click', function () {
    form.reset();
    resetFormMode();
    clearError();
  });

  /* ---------- 删除（带确认弹窗） ---------- */

  function requestDelete(id) {
    var item = items.find(function (it) {
      return it.id === id;
    });
    if (!item) return;
    pendingDeleteId = id;
    openModal(
      '确认删除',
      '确定要删除「' + escapeHtml(item.name) + '」吗？删除后无法恢复。',
      function () {
        items = items.filter(function (it) {
          return it.id !== pendingDeleteId;
        });
        saveItems();
        if (editingId === pendingDeleteId) {
          form.reset();
          resetFormMode();
        }
        render();
        showNotice('已删除「' + escapeHtml(item.name) + '」。');
      }
    );
  }

  /* ---------- 通用确认弹窗 ---------- */

  function openModal(title, message, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modalConfirm.onclick = function () {
      closeModal();
      onConfirm();
    };
    modalBackdrop.hidden = false;
    modalConfirm.focus();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
  }

  modalCancel.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', function (e) {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modalBackdrop.hidden) closeModal();
  });

  /* ---------- 导出 / 导入 ---------- */

  exportBtn.addEventListener('click', function () {
    if (items.length === 0) {
      showNotice('还没有可导出的记录。', 'error');
      return;
    }
    var blob = new Blob(
      [JSON.stringify({ version: DATA_VERSION, items: items }, null, 2)],
      { type: 'application/json' }
    );
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '日均花费备份-' + todayString().replace(/-/g, '') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotice('已导出备份文件。');
  });

  importInput.addEventListener('change', function () {
    var file = importInput.files && importInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || data.version !== DATA_VERSION) {
          throw new Error('文件格式不正确，请选择本工具导出的备份文件。');
        }
        if (!Array.isArray(data.items)) {
          throw new Error('备份文件中缺少物品数据。');
        }
        if (data.items.length === 0) {
          throw new Error('备份文件中没有任何记录。');
        }
        var cleanItems = sanitizeItems(data.items);
        if (cleanItems.length === 0) {
          throw new Error('备份文件中的记录都无效，无法导入。');
        }
        openModal(
          '导入数据',
          '导入后将覆盖当前 ' + items.length + ' 条记录，并载入文件中的 ' +
            cleanItems.length + ' 条记录。确定继续吗？',
          function () {
            items = cleanItems;
            saveItems();
            resetFormMode();
            clearError();
            render();
            showNotice('导入成功，共 ' + cleanItems.length + ' 条记录。');
          }
        );
      } catch (err) {
        showNotice(err.message, 'error');
      }
    };
    reader.onerror = function () {
      showNotice('读取文件失败，请重试。', 'error');
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  /* ---------- 初始化 ---------- */

  items = sanitizeItems(loadItems());
  render();
})();
