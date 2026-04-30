/**
 * Code.gs
 * 役割：Google Apps Script メイン処理
 * - Googleスプレッドシートの読み書きを担当するバックエンド
 * - doGet()  : データ取得リクエストを受け付ける（ログイン認証・在庫・履歴）
 * - doPost() : データ追加リクエストを受け付ける（入庫・出庫登録）
 * - CORSヘッダーを設定してフロントエンドからの fetch に対応する
 *
 * 【デプロイ手順】
 *  1. Google Apps Script エディタを開く（https://script.google.com）
 *  2. このファイルの内容を貼り付け、スプレッドシートIDを SPREADSHEET_ID に設定
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類：ウェブアプリ
 *  4. 実行するユーザー：自分 / アクセスできるユーザー：全員
 *  5. デプロイURLを取得して、フロントエンドの api.js の GAS_URL に貼り付ける
 */

// ============================================================
// 設定値
// ============================================================

/** GoogleスプレッドシートのID（URLの /d/〇〇〇/edit の部分）*/
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

/** 在庫僅少の警告閾値 */
var STOCK_WARNING_THRESHOLD = 50;

// ============================================================
// CORS ヘッダー設定
// ============================================================

/**
 * JSON レスポンスを返す共通関数
 * Content-Type と CORS ヘッダーを毎回設定する
 * @param {Object} data - JSON として返すオブジェクト
 * @returns {TextOutput}
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  // ※ GASのWebアプリはヘッダーを直接追加できないが、
  //    「全員」アクセス可・同一Googleドメインなら CORS は自動的に許可される。
  //    社外公開する場合は doOptions() を追加する（下部参照）。
}

// ============================================================
// doGet：データ取得
// ============================================================

/**
 * GET リクエストのエントリーポイント
 * クエリパラメータ action によって処理を振り分ける
 *
 * action=login           : ユーザー認証
 * action=getItems        : アイテム一覧取得
 * action=getTransactions : トランザクション一覧取得
 */
function doGet(e) {
  try {
    var action = e.parameter.action || '';

    switch (action) {
      case 'login':
        return handleLogin(e.parameter);

      case 'getItems':
        return handleGetItems();

      case 'getTransactions':
        return handleGetTransactions();

      default:
        return createJsonResponse({ success: false, message: '不正なアクション: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, message: 'サーバーエラー: ' + err.message });
  }
}

// ============================================================
// doPost：データ追加・更新
// ============================================================

/**
 * POST リクエストのエントリーポイント
 * リクエストボディの action によって処理を振り分ける
 *
 * action=stockIn  : 入庫登録
 * action=stockOut : 出庫登録
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    switch (action) {
      case 'stockIn':
        return handleStockIn(body);

      case 'stockOut':
        return handleStockOut(body);

      default:
        return createJsonResponse({ success: false, message: '不正なアクション: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, message: 'サーバーエラー: ' + err.message });
  }
}

// ============================================================
// OPTIONSリクエスト対応（プリフライト CORS）
// ※ GAS はデフォルトで OPTIONS を doGet にルーティングするため、
//   action が空の場合にも対応できるよう doGet 側でもエラーにしない。
// ============================================================

// ============================================================
// 認証処理
// ============================================================

/**
 * ユーザー認証
 * users シートの name / password を照合する
 * @param {Object} params - { username, password }
 * @returns {TextOutput} { success, user } or { success:false, message }
 */
function handleLogin(params) {
  var username = params.username || '';
  var password = params.password || '';

  if (!username || !password) {
    return createJsonResponse({ success: false, message: 'ユーザー名とパスワードを入力してください' });
  }

  var sheet = getSheet('users');
  var data  = getSheetData(sheet); // ヘッダー行を除いた2次元配列

  // ヘッダー行からカラムインデックスを取得
  var headers = getHeaders(sheet);
  var colId   = headers.indexOf('id');
  var colName = headers.indexOf('name');
  var colPass = headers.indexOf('password');

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[colName]).trim() === username &&
        String(row[colPass]).trim() === password) {
      return createJsonResponse({
        success: true,
        user: {
          id:   row[colId],
          name: row[colName],
        },
      });
    }
  }

  return createJsonResponse({ success: false, message: 'ユーザー名またはパスワードが正しくありません' });
}

// ============================================================
// アイテム取得
// ============================================================

/**
 * items シートの全データをオブジェクト配列で返す
 * @returns {TextOutput} { success, items: [{ id, name, stock }, ...] }
 */
function handleGetItems() {
  var sheet   = getSheet('items');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);

  var items = data.map(function(row) {
    return rowToObject(headers, row);
  });

  return createJsonResponse({ success: true, items: items });
}

// ============================================================
// トランザクション取得
// ============================================================

/**
 * transactions シートの全データをオブジェクト配列で返す
 * @returns {TextOutput} { success, transactions: [...] }
 */
function handleGetTransactions() {
  var sheet   = getSheet('transactions');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);

  var transactions = data.map(function(row) {
    return rowToObject(headers, row);
  });

  return createJsonResponse({ success: true, transactions: transactions });
}

// ============================================================
// 入庫登録
// ============================================================

/**
 * 入庫処理
 * 1. transactions シートに行を追加
 * 2. items シートの stock を更新
 * @param {Object} body - { item_id, quantity, memo, date, user }
 * @returns {TextOutput} { success, message }
 */
function handleStockIn(body) {
  var itemId   = String(body.item_id  || '');
  var quantity = parseInt(body.quantity, 10);
  var memo     = String(body.memo  || '');
  var date     = String(body.date  || '');
  var user     = String(body.user  || '');

  // バリデーション
  if (!itemId || isNaN(quantity) || quantity < 1 || !date) {
    return createJsonResponse({ success: false, message: '入力値が不正です' });
  }

  // トランザクション追加
  var txSheet  = getSheet('transactions');
  var newTxId  = getNextId(txSheet);
  txSheet.appendRow([newTxId, itemId, '入庫', quantity, '', memo, user, date]);

  // アイテムの在庫数を更新
  updateItemStock(itemId, quantity);

  return createJsonResponse({ success: true, message: '入庫登録が完了しました' });
}

// ============================================================
// 出庫登録
// ============================================================

/**
 * 出庫処理
 * 1. 在庫不足チェック
 * 2. transactions シートに行を追加
 * 3. items シートの stock を更新（減算）
 * @param {Object} body - { item_id, quantity, event, memo, date, user }
 * @returns {TextOutput} { success, message }
 */
function handleStockOut(body) {
  var itemId   = String(body.item_id  || '');
  var quantity = parseInt(body.quantity, 10);
  var event    = String(body.event || '');
  var memo     = String(body.memo  || '');
  var date     = String(body.date  || '');
  var user     = String(body.user  || '');

  // バリデーション
  if (!itemId || isNaN(quantity) || quantity < 1 || !event || !date) {
    return createJsonResponse({ success: false, message: '入力値が不正です' });
  }

  // 現在在庫の確認（在庫不足チェック）
  var currentStock = getCurrentStock(itemId);
  if (currentStock < quantity) {
    return createJsonResponse({
      success: false,
      message: '在庫が不足しています（現在庫: ' + currentStock + '個）',
    });
  }

  // トランザクション追加
  var txSheet = getSheet('transactions');
  var newTxId = getNextId(txSheet);
  txSheet.appendRow([newTxId, itemId, '出庫', quantity, event, memo, user, date]);

  // アイテムの在庫数を更新（減算）
  updateItemStock(itemId, -quantity);

  return createJsonResponse({ success: true, message: '出庫登録が完了しました' });
}

// ============================================================
// スプレッドシート操作ユーティリティ
// ============================================================

/**
 * シート名からシートオブジェクトを取得する
 * @param {string} sheetName
 * @returns {Sheet}
 */
function getSheet(sheetName) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('シートが見つかりません: ' + sheetName);
  return sheet;
}

/**
 * シートの1行目（ヘッダー行）を文字列配列で返す
 * @param {Sheet} sheet
 * @returns {string[]}
 */
function getHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h).trim();
  });
}

/**
 * ヘッダー行を除いた全データを2次元配列で返す
 * @param {Sheet} sheet
 * @returns {Array[]}
 */
function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/**
 * ヘッダー配列と行データ配列からオブジェクトを生成する
 * @param {string[]} headers
 * @param {Array}    row
 * @returns {Object}
 */
function rowToObject(headers, row) {
  var obj = {};
  headers.forEach(function(key, i) {
    var val = row[i];
    // Date オブジェクトは YYYY-MM-DD 文字列に変換
    if (val instanceof Date) {
      obj[key] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      obj[key] = val !== undefined && val !== null ? String(val) : '';
    }
  });
  return obj;
}

/**
 * 次の ID（最終行のID + 1）を返す
 * シートが空（ヘッダーのみ）なら 1 を返す
 * @param {Sheet} sheet
 * @returns {number}
 */
function getNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var lastId = sheet.getRange(lastRow, 1).getValue();
  return (parseInt(lastId, 10) || 0) + 1;
}

/**
 * アイテムIDを元に items シートの stock 列を増減する
 * @param {string} itemId
 * @param {number} delta - 正なら増加、負なら減少
 */
function updateItemStock(itemId, delta) {
  var sheet   = getSheet('items');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);

  var colId    = headers.indexOf('id');
  var colStock = headers.indexOf('stock');
  if (colId < 0 || colStock < 0) return;

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colId]) === String(itemId)) {
      // シート上の行番号 = データ行インデックス + 2（ヘッダー分）
      var rowNum      = i + 2;
      var currentVal  = parseInt(data[i][colStock], 10) || 0;
      var newVal      = Math.max(0, currentVal + delta);
      sheet.getRange(rowNum, colStock + 1).setValue(newVal);
      return;
    }
  }
}

/**
 * アイテムIDから現在の stock 値を返す
 * @param {string} itemId
 * @returns {number}
 */
function getCurrentStock(itemId) {
  var sheet   = getSheet('items');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);

  var colId    = headers.indexOf('id');
  var colStock = headers.indexOf('stock');
  if (colId < 0 || colStock < 0) return 0;

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colId]) === String(itemId)) {
      return parseInt(data[i][colStock], 10) || 0;
    }
  }
  return 0;
}
