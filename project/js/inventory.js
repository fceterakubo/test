/**
 * inventory.js
 * 役割：在庫ロジック（入出庫計算・在庫状態判定）
 * - transactionsシートのデータを元にアイテムごとの現在在庫を計算する
 * - 在庫状態（正常・僅少・在庫切れ）を判定してバッジ情報を返す
 * - サマリー集計（アイテム数・僅少数・在庫切れ数・総在庫数）を提供する
 */

// 在庫僅少の閾値
const STOCK_WARNING_THRESHOLD = 50;

// ============================================================
// 在庫計算
// ============================================================

/**
 * items と transactions から各アイテムの現在在庫を計算して返す
 *
 * @param {Array} items        - itemsシートの行データ配列
 *   例: [{ id: '1', name: '会社案内パンフ', stock: '500' }, ...]
 * @param {Array} transactions - transactionsシートの行データ配列
 *   例: [{ id: '1', item_id: '1', type: '出庫', quantity: '100', ... }, ...]
 * @returns {Array} 各アイテムに currentStock を付与した配列
 */
function calcCurrentStocks(items, transactions) {
  const stockMap = {};
  items.forEach((item) => {
    stockMap[String(item.id)] = {
      ...item,
      baseStock:    0,
      inTotal:      0,
      outTotal:     0,
      currentStock: 0,  // ← 初期値を0に変更
    };
  });

  transactions.forEach((tx) => {
    const key = String(tx.item_id);
    if (!stockMap[key]) return;
    const qty = Number(tx.quantity) || 0;
    if (tx.type === '入庫') {
      stockMap[key].inTotal      += qty;
      stockMap[key].currentStock += qty;
    } else if (tx.type === '出庫') {
      stockMap[key].outTotal     += qty;
      stockMap[key].currentStock -= qty;
    }
  });

  return Object.values(stockMap).map((item) => ({
    ...item,
    currentStock: Math.max(0, item.currentStock),
  }));
}

// ============================================================
// 在庫状態の判定
// ============================================================

/**
 * 現在在庫数から在庫状態を返す
 * @param {number} stock - 現在在庫数
 * @returns {'ok'|'warning'|'danger'} 状態コード
 */
function getStockStatus(stock) {
  if (stock <= 0)                      return 'danger';
  if (stock <= STOCK_WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

/**
 * 在庫状態に応じたバッジの HTML を返す
 * @param {number} stock - 現在在庫数
 * @returns {string} バッジHTML文字列
 */
function renderStockBadge(stock) {
  const status = getStockStatus(stock);
  if (status === 'danger') {
    return '<span class="badge badge-danger">⚠ 在庫切れ</span>';
  }
  if (status === 'warning') {
    return '<span class="badge badge-warning">⚠ 在庫僅少</span>';
  }
  return '<span class="badge badge-ok">✓ 正常</span>';
}

/**
 * 在庫数のテキストに CSS クラスを付与した HTML を返す
 * @param {number} stock
 * @returns {string}
 */
function renderStockValue(stock) {
  const status = getStockStatus(stock);
  const cls =
    status === 'danger'  ? 'stock-danger'  :
    status === 'warning' ? 'stock-warning' :
    'stock-ok';
  return `<span class="${cls}">${stock.toLocaleString()}</span>`;
}

// ============================================================
// サマリー集計
// ============================================================

/**
 * 在庫リストからサマリー情報を集計して返す
 * @param {Array} stockList - calcCurrentStocks() の戻り値
 * @returns {{ total: number, warningCount: number, zeroCount: number, totalStock: number }}
 */
function calcSummary(stockList) {
  let warningCount = 0;
  let zeroCount    = 0;
  let totalStock   = 0;

  stockList.forEach((item) => {
    const s = item.currentStock;
    totalStock += s;
    if (s <= 0)                       zeroCount++;
    else if (s <= STOCK_WARNING_THRESHOLD) warningCount++;
  });

  return {
    total:        stockList.length,
    warningCount,
    zeroCount,
    totalStock,
  };
}

// ============================================================
// 履歴フィルター
// ============================================================

/**
 * トランザクション配列を条件でフィルタリングして返す
 * @param {Array}  transactions - 全トランザクション配列
 * @param {Object} filters      - フィルター条件
 * @param {string} [filters.item_id]   - アイテムID（空文字で全件）
 * @param {string} [filters.type]      - '入庫'|'出庫'（空文字で全件）
 * @param {string} [filters.dateFrom]  - 開始日 YYYY-MM-DD（空文字で制限なし）
 * @param {string} [filters.dateTo]    - 終了日 YYYY-MM-DD（空文字で制限なし）
 * @returns {Array} フィルター済みトランザクション配列
 */
function filterTransactions(transactions, filters = {}) {
  return transactions.filter((tx) => {
    // アイテムIDフィルター
    if (filters.item_id && String(tx.item_id) !== String(filters.item_id)) {
      return false;
    }
    // 種別フィルター
    if (filters.type && tx.type !== filters.type) {
      return false;
    }
    // 日付範囲フィルター
    const txDate = tx.date ? tx.date.slice(0, 10) : '';
    if (filters.dateFrom && txDate < filters.dateFrom) return false;
    if (filters.dateTo   && txDate > filters.dateTo)   return false;

    return true;
  });
}

/**
 * トランザクション配列を日付の新しい順に並べ替えて返す
 * @param {Array} transactions
 * @returns {Array}
 */
function sortTransactionsDesc(transactions) {
  return [...transactions].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (db > da) return 1;
    if (db < da) return -1;
    // 同日なら ID の降順
    return Number(b.id) - Number(a.id);
  });
}
