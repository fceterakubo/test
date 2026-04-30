/**
 * ui.js
 * 役割：画面描画・イベント処理
 * - ダッシュボード全体の初期化（initDashboard）
 * - ナビゲーション切り替え
 * - 在庫テーブル・履歴テーブルの描画
 * - 入庫・出庫モーダルの制御と送信処理
 * - トースト通知の表示
 */

// ============================================================
// アプリ状態
// ============================================================

/** 現在のログインユーザー */
let currentUser = null;

/** キャッシュ */
let cachedItems        = [];
let cachedTransactions = [];

// ============================================================
// ダッシュボード初期化（dashboard.html から呼び出す）
// ============================================================

async function initDashboard() {
  // 未ログインチェック
  currentUser = requireLogin();
  if (!currentUser) return;

  // ユーザー名表示
  const usernameEl = document.getElementById('sidebarUsername');
  if (usernameEl) usernameEl.textContent = currentUser.name;

  // ナビゲーション
  setupNavigation();

  // モーダル
  setupModals();

  // ログアウトボタン
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('ログアウトしますか？')) logout();
  });

  // 在庫一覧ボタン
  document.getElementById('btnOpenStockIn').addEventListener('click', () => openModal('modalStockIn'));
  document.getElementById('btnOpenStockOut').addEventListener('click', () => openModal('modalStockOut'));

  // 更新ボタン
  document.getElementById('btnRefreshInventory').addEventListener('click', loadInventory);
  document.getElementById('btnRefreshHistory').addEventListener('click', loadHistory);

  // タブ内フォームの送信ボタン
  document.getElementById('btnSubmitStockIn').addEventListener('click', handleTabStockIn);
  document.getElementById('btnSubmitStockOut').addEventListener('click', handleTabStockOut);

  // モーダル内フォームの送信ボタン
  document.getElementById('btnModalSubmitStockIn').addEventListener('click', handleModalStockIn);
  document.getElementById('btnModalSubmitStockOut').addEventListener('click', handleModalStockOut);

  // 履歴フィルター
  document.getElementById('btnApplyFilter').addEventListener('click', applyHistoryFilter);
  document.getElementById('btnClearFilter').addEventListener('click', clearHistoryFilter);

  // 日付フィールドに今日の日付をセット
  const today = getTodayString();
  setDateDefaults(today);

  // 初期データ読み込み
  await loadAllData();
}

// ============================================================
// データ読み込み
// ============================================================

/** アイテムとトランザクションを一括取得して画面に反映 */
async function loadAllData() {
  await Promise.all([loadInventory(), loadHistory()]);
}

/** 在庫一覧を取得して描画 */
async function loadInventory() {
  showTableLoading('inventoryTableContainer');

  try {
    const [itemRes, txRes] = await Promise.all([
      apiFetchItems(),
      apiFetchTransactions(),
    ]);

    cachedItems        = itemRes.items        || [];
    cachedTransactions = txRes.transactions   || [];

    // アイテム選択セレクトを更新
    populateItemSelects(cachedItems);

    // 在庫計算
    const stockList = calcCurrentStocks(cachedItems, cachedTransactions);

    // サマリー更新
    const summary = calcSummary(stockList);
    updateSummaryCards(summary);

    // テーブル描画
    renderInventoryTable(stockList);

  } catch (err) {
    console.error('在庫取得エラー:', err);
    showTableError('inventoryTableContainer', '在庫データの取得に失敗しました。GASのURLを確認してください。');
    showToast('在庫データの取得に失敗しました', 'error');
  }
}

/** 履歴を取得して描画 */
async function loadHistory() {
  showTableLoading('historyTableContainer');

  try {
    const txRes = await apiFetchTransactions();
    cachedTransactions = txRes.transactions || [];

    // 履歴フィルター選択肢を更新
    populateFilterItemSelect(cachedItems);

    renderHistoryTable(cachedTransactions);

  } catch (err) {
    console.error('履歴取得エラー:', err);
    showTableError('historyTableContainer', '履歴データの取得に失敗しました。');
    showToast('履歴データの取得に失敗しました', 'error');
  }
}

// ============================================================
// ナビゲーション
// ============================================================

function setupNavigation() {
  const navItems   = document.querySelectorAll('.nav-item');
  const tabPanels  = document.querySelectorAll('.tab-panel');
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarActions = document.getElementById('topbarActions');

  const tabTitles = {
    'inventory':  '在庫一覧',
    'stock-in':   '入庫登録',
    'stock-out':  '出庫登録',
    'history':    '入出庫履歴',
  };

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;

      // アクティブ切り替え
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');

      tabPanels.forEach((p) => p.classList.remove('active'));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.add('active');

      // タイトル更新
      if (topbarTitle) topbarTitle.textContent = tabTitles[tab] || '';

      // トップバーのアクションボタンは在庫一覧のみ表示
      if (topbarActions) {
        topbarActions.style.display = (tab === 'inventory') ? 'flex' : 'none';
      }
    });
  });
}

// ============================================================
// アイテム選択セレクトの同期
// ============================================================

function populateItemSelects(items) {
  const selectIds = ['siItem', 'soItem', 'msiItem', 'msoItem'];
  selectIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- アイテムを選択 --</option>';
    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value       = item.id;
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    // 選択状態を復元
    if (current) sel.value = current;
  });
}

function populateFilterItemSelect(items) {
  const sel = document.getElementById('filterItem');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">すべて</option>';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value       = item.id;
    opt.textContent = item.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

// ============================================================
// 在庫テーブル描画
// ============================================================

function renderInventoryTable(stockList) {
  const container = document.getElementById('inventoryTableContainer');
  if (!container) return;

  if (stockList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📦</span>
        <p>アイテムが登録されていません</p>
      </div>`;
    return;
  }

  const rows = stockList.map((item) => `
    <tr>
      <td style="font-weight:600;">${escHtml(item.name)}</td>
      <td style="text-align:right; font-size:16px;">
        ${renderStockValue(item.currentStock)} 個
      </td>
      <td>${renderStockBadge(item.currentStock)}</td>
      <td style="color:var(--color-text-muted); font-size:13px;">
        入庫: +${item.inTotal.toLocaleString()} /
        出庫: -${item.outTotal.toLocaleString()}
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>アイテム名</th>
            <th style="text-align:right;">現在庫数</th>
            <th>状態</th>
            <th>内訳</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ============================================================
// サマリーカード更新
// ============================================================

function updateSummaryCards(summary) {
  setText('sumTotal',   summary.total);
  setText('sumWarning', summary.warningCount);
  setText('sumZero',    summary.zeroCount);
  setText('sumAll',     summary.totalStock.toLocaleString());
}

// ============================================================
// 履歴テーブル描画
// ============================================================

function renderHistoryTable(transactions) {
  const container = document.getElementById('historyTableContainer');
  if (!container) return;

  // 最新順にソート
  const sorted = sortTransactionsDesc(transactions);

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📊</span>
        <p>該当する履歴がありません</p>
      </div>`;
    return;
  }

  // アイテム名のマップを作成
  const itemMap = {};
  cachedItems.forEach((item) => { itemMap[String(item.id)] = item.name; });

  const rows = sorted.map((tx) => {
    const itemName = itemMap[String(tx.item_id)] || `ID:${tx.item_id}`;
    const badge = tx.type === '入庫'
      ? '<span class="badge badge-in">📥 入庫</span>'
      : '<span class="badge badge-out">📤 出庫</span>';
    return `
      <tr>
        <td style="color:var(--color-text-muted); font-size:12px;">${escHtml(tx.date || '-')}</td>
        <td style="font-weight:600;">${escHtml(itemName)}</td>
        <td>${badge}</td>
        <td style="text-align:right; font-weight:700;">${Number(tx.quantity).toLocaleString()} 個</td>
        <td>${escHtml(tx.event || '-')}</td>
        <td style="color:var(--color-text-muted); font-size:13px;">${escHtml(tx.memo || '-')}</td>
        <td style="color:var(--color-text-muted); font-size:13px;">${escHtml(tx.user || '-')}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>アイテム</th>
            <th>種別</th>
            <th style="text-align:right;">数量</th>
            <th>イベント</th>
            <th>メモ</th>
            <th>担当者</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ============================================================
// 履歴フィルター
// ============================================================

function applyHistoryFilter() {
  const itemId   = document.getElementById('filterItem').value;
  const type     = document.getElementById('filterType').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo   = document.getElementById('filterDateTo').value;

  const filtered = filterTransactions(cachedTransactions, { item_id: itemId, type, dateFrom, dateTo });
  renderHistoryTable(filtered);
}

function clearHistoryFilter() {
  document.getElementById('filterItem').value    = '';
  document.getElementById('filterType').value    = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value   = '';
  renderHistoryTable(cachedTransactions);
}

// ============================================================
// モーダル制御
// ============================================================

function setupModals() {
  // オーバーレイクリックで閉じる
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // 閉じるボタン
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // ESCキーで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.show').forEach((overlay) => {
        closeModal(overlay.id);
      });
    }
  });
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('show');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('show');
}

// ============================================================
// 入庫処理（タブ内フォーム）
// ============================================================

async function handleTabStockIn() {
  const item_id  = document.getElementById('siItem').value;
  const quantity = Number(document.getElementById('siQty').value);
  const memo     = document.getElementById('siMemo').value.trim();
  const date     = document.getElementById('siDate').value;

  if (!validateStockIn(item_id, quantity, date)) return;

  await submitStockIn({ item_id, quantity, memo, date });

  // フォームリセット
  document.getElementById('siItem').value = '';
  document.getElementById('siQty').value  = '';
  document.getElementById('siMemo').value = '';
}

// ============================================================
// 出庫処理（タブ内フォーム）
// ============================================================

async function handleTabStockOut() {
  const item_id  = document.getElementById('soItem').value;
  const quantity = Number(document.getElementById('soQty').value);
  const event    = document.getElementById('soEvent').value.trim();
  const memo     = document.getElementById('soMemo').value.trim();
  const date     = document.getElementById('soDate').value;

  if (!validateStockOut(item_id, quantity, event, date)) return;

  await submitStockOut({ item_id, quantity, event, memo, date });

  document.getElementById('soItem').value  = '';
  document.getElementById('soQty').value   = '';
  document.getElementById('soEvent').value = '';
  document.getElementById('soMemo').value  = '';
}

// ============================================================
// 入庫処理（モーダル）
// ============================================================

async function handleModalStockIn() {
  const item_id  = document.getElementById('msiItem').value;
  const quantity = Number(document.getElementById('msiQty').value);
  const memo     = document.getElementById('msiMemo').value.trim();
  const date     = document.getElementById('msiDate').value;

  if (!validateStockIn(item_id, quantity, date)) return;

  await submitStockIn({ item_id, quantity, memo, date });

  closeModal('modalStockIn');
  document.getElementById('msiItem').value = '';
  document.getElementById('msiQty').value  = '';
  document.getElementById('msiMemo').value = '';
}

// ============================================================
// 出庫処理（モーダル）
// ============================================================

async function handleModalStockOut() {
  const item_id  = document.getElementById('msoItem').value;
  const quantity = Number(document.getElementById('msoQty').value);
  const event    = document.getElementById('msoEvent').value.trim();
  const memo     = document.getElementById('msoMemo').value.trim();
  const date     = document.getElementById('msoDate').value;

  if (!validateStockOut(item_id, quantity, event, date)) return;

  await submitStockOut({ item_id, quantity, event, memo, date });

  closeModal('modalStockOut');
  document.getElementById('msoItem').value  = '';
  document.getElementById('msoQty').value   = '';
  document.getElementById('msoEvent').value = '';
  document.getElementById('msoMemo').value  = '';
}

// ============================================================
// バリデーション
// ============================================================

function validateStockIn(item_id, quantity, date) {
  if (!item_id) {
    showToast('アイテムを選択してください', 'error'); return false;
  }
  if (!quantity || quantity < 1) {
    showToast('入庫数量は1以上を入力してください', 'error'); return false;
  }
  if (!date) {
    showToast('日付を入力してください', 'error'); return false;
  }
  return true;
}

function validateStockOut(item_id, quantity, event, date) {
  if (!item_id) {
    showToast('アイテムを選択してください', 'error'); return false;
  }
  if (!quantity || quantity < 1) {
    showToast('出庫数量は1以上を入力してください', 'error'); return false;
  }
  if (!event) {
    showToast('イベント名を入力してください', 'error'); return false;
  }
  if (!date) {
    showToast('日付を入力してください', 'error'); return false;
  }
  // 在庫不足チェック
  const stockList = calcCurrentStocks(cachedItems, cachedTransactions);
  const target    = stockList.find((i) => String(i.id) === String(item_id));
  if (target && target.currentStock < quantity) {
    showToast(
      `在庫不足です（現在庫: ${target.currentStock}個）`,
      'error'
    );
    return false;
  }
  return true;
}

// ============================================================
// GAS 送信共通
// ============================================================

async function submitStockIn(payload) {
  try {
    setLoading(true);
    const result = await apiStockIn({ ...payload, user: currentUser.name });
    if (result.success) {
      showToast('入庫登録が完了しました', 'success');
      await loadAllData();
    } else {
      showToast(result.message || '入庫登録に失敗しました', 'error');
    }
  } catch (err) {
    console.error('入庫エラー:', err);
    showToast('サーバーエラーが発生しました', 'error');
  } finally {
    setLoading(false);
  }
}

async function submitStockOut(payload) {
  try {
    setLoading(true);
    const result = await apiStockOut({ ...payload, user: currentUser.name });
    if (result.success) {
      showToast('出庫登録が完了しました', 'success');
      await loadAllData();
    } else {
      showToast(result.message || '出庫登録に失敗しました', 'error');
    }
  } catch (err) {
    console.error('出庫エラー:', err);
    showToast('サーバーエラーが発生しました', 'error');
  } finally {
    setLoading(false);
  }
}

// ============================================================
// トースト通知
// ============================================================

/**
 * トースト通知を表示する
 * @param {string} message - 表示メッセージ
 * @param {'success'|'error'|'info'} type - 種別
 * @param {number} duration - 表示時間(ms) デフォルト3000
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span><span>${escHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(60px)';
    toast.style.transition = 'opacity .3s, transform .3s';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ============================================================
// ユーティリティ
// ============================================================

/** テーブルコンテナにローディングを表示 */
function showTableLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>読み込み中...
    </div>`;
}

/** テーブルコンテナにエラーを表示 */
function showTableError(containerId, message) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">⚠️</span>
      <p>${escHtml(message)}</p>
    </div>`;
}

/** 送信ボタン群を一括で disabled にする */
function setLoading(flag) {
  const btns = [
    'btnSubmitStockIn', 'btnSubmitStockOut',
    'btnModalSubmitStockIn', 'btnModalSubmitStockOut',
  ];
  btns.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = flag;
  });
}

/** getElementById して textContent をセット */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** 今日の日付を YYYY-MM-DD 形式で返す */
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

/** 日付入力フィールドにデフォルト値をセット */
function setDateDefaults(today) {
  const dateFields = ['siDate', 'soDate', 'msiDate', 'msoDate'];
  dateFields.forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

/** XSS防止用エスケープ */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
