/**
 * api.js
 * 役割：Google Apps Script（GAS）との通信処理
 * GASのWebアプリURLを定数として定義し、データの取得（GET）・送信（POST）を行う。
 * 全ての通信はこのファイルに集約し、他のモジュールから呼び出して使用する。
 */

// ============================================================
// GAS WebアプリのデプロイURL（デプロイ後にここを書き換える）
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// ============================================================
// 内部ユーティリティ
// ============================================================

/**
 * GAS に GET リクエストを送信し、JSONを返す
 * @param {Object} params - クエリパラメータ（action 必須）
 * @returns {Promise<Object>} レスポンスのJSONオブジェクト
 */
async function gasGet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${GAS_URL}?${query}`;

  const res = await fetch(url, {
    method: 'GET',
    // GASのWebアプリはno-corsではJSONが取れないため cors を使用
    // (デプロイ設定で「全員」アクセス可にする必要あり)
    mode: 'cors',
  });

  if (!res.ok) {
    throw new Error(`GAS GET エラー: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data;
}

/**
 * GAS に POST リクエストを送信し、JSONを返す
 * @param {Object} body - 送信するJSONオブジェクト（action 必須）
 * @returns {Promise<Object>} レスポンスのJSONオブジェクト
 */
async function gasPost(body = {}) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    mode: 'cors',
    // GASはContent-Type: application/jsonを受け付けるが
    // preflight(OPTIONS)が発生しないよう text/plain で送る方法もある。
    // ここでは標準的な application/json を使用。
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GAS POST エラー: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data;
}

// ============================================================
// 公開API関数
// ============================================================

/**
 * ユーザー認証
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: Object, message?: string}>}
 */
async function apiLogin(username, password) {
  return gasGet({ action: 'login', username, password });
}

/**
 * 全アイテム（items シート）を取得
 * @returns {Promise<{success: boolean, items: Array}>}
 */
async function apiFetchItems() {
  return gasGet({ action: 'getItems' });
}

/**
 * 全トランザクション（transactions シート）を取得
 * @returns {Promise<{success: boolean, transactions: Array}>}
 */
async function apiFetchTransactions() {
  return gasGet({ action: 'getTransactions' });
}

/**
 * 入庫登録
 * @param {Object} payload
 * @param {string|number} payload.item_id  - アイテムID
 * @param {number}        payload.quantity - 入庫数量
 * @param {string}        payload.memo     - メモ
 * @param {string}        payload.date     - 日付（YYYY-MM-DD）
 * @param {string}        payload.user     - ログインユーザー名
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function apiStockIn(payload) {
  return gasPost({
    action: 'stockIn',
    item_id:  payload.item_id,
    quantity: payload.quantity,
    memo:     payload.memo || '',
    date:     payload.date,
    user:     payload.user,
  });
}

/**
 * 出庫登録
 * @param {Object} payload
 * @param {string|number} payload.item_id  - アイテムID
 * @param {number}        payload.quantity - 出庫数量
 * @param {string}        payload.event    - イベント名
 * @param {string}        payload.memo     - メモ
 * @param {string}        payload.date     - 日付（YYYY-MM-DD）
 * @param {string}        payload.user     - ログインユーザー名
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function apiStockOut(payload) {
  return gasPost({
    action:   'stockOut',
    item_id:  payload.item_id,
    quantity: payload.quantity,
    event:    payload.event,
    memo:     payload.memo || '',
    date:     payload.date,
    user:     payload.user,
  });
}
