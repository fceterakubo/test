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
  var itemSheet = getSheet('items');
  var headers   = getHeaders(itemSheet);
  var data      = getSheetData(itemSheet);
  var colId     = headers.indexOf('id');
  var colName   = headers.indexOf('name');

  var txSheet   = getSheet('transactions');
  var txHeaders = getHeaders(txSheet);
  var txData    = getSheetData(txSheet);
  var txColItemId  = txHeaders.indexOf('item_id');
  var txColType    = txHeaders.indexOf('type');
  var txColQty     = txHeaders.indexOf('quantity');

  var items = data.map(function(row) {
    var itemId = String(row[colId]);

    // トランザクションから在庫を毎回計算
    var stock = 0;
    txData.forEach(function(tx) {
      if (String(tx[txColItemId]) === itemId) {
        var qty = parseInt(tx[txColQty], 10) || 0;
        if (String(tx[txColType]) === '入庫') {
          stock += qty;
        } else if (String(tx[txColType]) === '出庫') {
          stock -= qty;
        }
      }
    });

    return {
      id:    itemId,
      name:  String(row[colName]),
      stock: stock,
    };
  });

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
  var quantity = parseInt(params.quantity, 10);
  var memo     = String(params.memo  || '');
  var date     = String(params.date  || '');
  var user     = String(params.user  || '');
  if (!itemId || isNaN(quantity) || quantity < 1 || !date) {
    return createJsonResponse({ success: false, message: '入力値が不正です' });
  }
  var txSheet = getSheet('transactions');
  var newTxId = getNextId(txSheet);
  txSheet.appendRow([newTxId, itemId, '入庫', quantity, '', memo, user, date]);
  updateItemStock(itemId, quantity);
  return createJsonResponse({ success: true, message: '入庫登録が完了しました' });
}

function handleStockOut(params) {
  var itemId   = String(params.item_id  || '');
  var quantity = parseInt(params.quantity, 10);
  var event    = String(params.event || '');
  var memo     = String(params.memo  || '');
  var date     = String(params.date  || '');
  var user     = String(params.user  || '');
  if (!itemId || isNaN(quantity) || quantity < 1 || !event || !date) {
    return createJsonResponse({ success: false, message: '入力値が不正です' });
  }
  function getCurrentStock(itemId) {
  var txSheet   = getSheet('transactions');
  var txHeaders = getHeaders(txSheet);
  var txData    = getSheetData(txSheet);
  var txColItemId = txHeaders.indexOf('item_id');
  var txColType   = txHeaders.indexOf('type');
  var txColQty    = txHeaders.indexOf('quantity');

  var stock = 0;
  txData.forEach(function(tx) {
    if (String(tx[txColItemId]) === String(itemId)) {
      var qty = parseInt(tx[txColQty], 10) || 0;
      if (String(tx[txColType]) === '入庫') {
        stock += qty;
      } else if (String(tx[txColType]) === '出庫') {
        stock -= qty;
      }
    }
  });

  return stock;
}

  var txSheet = getSheet('transactions');
  var newTxId = getNextId(txSheet);
  txSheet.appendRow([newTxId, itemId, '出庫', quantity, event, memo, user, date]);
  updateItemStock(itemId, -quantity);
  return createJsonResponse({ success: true, message: '出庫登録が完了しました' });
}

function getSheet(sheetName) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('シートが見つかりません: ' + sheetName);
  return sheet;
}

function getHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h).trim();
  });
}

function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function rowToObject(headers, row) {
  var obj = {};
  headers.forEach(function(key, i) {
    var val = row[i];
    if (val instanceof Date) {
      obj[key] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      obj[key] = val !== undefined && val !== null ? String(val) : '';
    }
  });
  return obj;
}

function getNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var lastId = sheet.getRange(lastRow, 1).getValue();
  return (parseInt(lastId, 10) || 0) + 1;
}

function updateItemStock(itemId, delta) {
  var sheet   = getSheet('items');
  var headers = getHeaders(sheet);
  var data    = getSheetData(sheet);
  var colId    = headers.indexOf('id');
  var colStock = headers.indexOf('stock');
  if (colId < 0 || colStock < 0) return;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colId]) === String(itemId)) {
      var rowNum     = i + 2;
      var currentVal = parseInt(data[i][colStock], 10) || 0;
      sheet.getRange(rowNum, colStock + 1).setValue(Math.max(0, currentVal + delta));
      return;
    }
  }
}

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
