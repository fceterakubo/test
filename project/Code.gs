/**
 * Code.gs
 * 役割：Google Apps Script メイン処理
 * - doGet() で全アクションを受け付ける（CORSエラー回避のためPOST廃止）
 */

var SPREADSHEET_ID = '16qQ4nwiqmxF4U7djpmp9EKXFz3GDyRjO6crcb1j-OO0';
var STOCK_WARNING_THRESHOLD = 50;

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = e.parameter.action || '';
    switch (action) {
      case 'login':           return handleLogin(e.parameter);
      case 'getItems':        return handleGetItems();
      case 'getTransactions': return handleGetTransactions();
      case 'stockIn':         return handleStockIn(e.parameter);
      case 'stockOut':        return handleStockOut(e.parameter);
      default:
        return createJsonResponse({ success: false, message: '不正なアクション: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, message: 'サーバーエラー: ' + err.message });
  }
}

function handleLogin(params) {
  var username = params.username || '';
  var password = params.password || '';
  if (!username || !password) {
    return createJsonResponse({ success: false, message: 'ユーザー名とパスワードを入力してください' });
  }
  var sheet   = getSheet('users');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);
  var colId   = headers.indexOf('id');
  var colName = headers.indexOf('name');
  var colPass = headers.indexOf('password');
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[colName]).trim() === username &&
        String(row[colPass]).trim() === password) {
      return createJsonResponse({ success: true, user: { id: row[colId], name: row[colName] } });
    }
  }
  return createJsonResponse({ success: false, message: 'ユーザー名またはパスワードが正しくありません' });
}

function handleGetItems() {
  var sheet   = getSheet('items');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);
  var items   = data.map(function(row) { return rowToObject(headers, row); });
  return createJsonResponse({ success: true, items: items });
}

function handleGetTransactions() {
  var sheet        = getSheet('transactions');
  var headers      = getHeaders(sheet);
  var data         = getSheetData(sheet);
  var transactions = data.map(function(row) { return rowToObject(headers, row); });
  return createJsonResponse({ success: true, transactions: transactions });
}

function handleStockIn(params) {
  var itemId   = String(params.item_id  || '');
  var quantity = parseInt(params.quantity, 10
