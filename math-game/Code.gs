/**
 * さんすうアドベンチャー（子ども向け算数ドリルゲーム）
 * 役割：スプレッドシートを DB とした API ＋ 画面配信
 *
 * 使い方：
 *   1. スプレッドシートの「拡張機能 > Apps Script」にこのファイルと index.html を貼り付ける
 *   2. setup() を一度だけ実行（シートとヘッダー・初期問題設定を作成）
 *   3. 「デプロイ > 新しいデプロイ > ウェブアプリ」で公開し、URL をスマホで開く
 */

var SPREADSHEET_ID = '1l8irkp6kqBgWXtoPgYjjH6Ek7mnRGjoM5Ay4gVGGx64';

var SHEETS = {
  settings: ['op', 'level', 'label', 'a_min', 'a_max', 'b_min', 'b_max', 'questions', 'time_limit_sec'],
  players:  ['id', 'name', 'created_at'],
  results:  ['timestamp', 'player_id', 'player_name', 'op', 'level', 'mode', 'correct', 'total', 'score', 'max_combo', 'time_sec', 'stars'],
  mistakes: ['timestamp', 'player_id', 'player_name', 'op', 'level', 'question', 'answer', 'user_answer']
};

// 初期の問題設定（setup() 実行時にシートが空なら書き込む。以後はシートを編集して調整）
// たしざん・かけざん : a（a_min〜a_max） ○ b（b_min〜b_max）
// ひきざん          : 2つの数を作り、大きいほうから小さいほうを引く（答えがマイナスにならない）
// わりざん          : b がわる数、a が答え（商）。(a×b) ÷ b = a で必ずわりきれる
var DEFAULT_SETTINGS = [
  ['add', 1, '1けたの たしざん',          1,  9,  1,  9, 10, 60],
  ['add', 2, '2けた ＋ 1けた',            10, 99, 1,  9, 10, 90],
  ['add', 3, '2けた ＋ 2けた',            10, 99, 10, 99, 10, 120],
  ['sub', 1, '10までの ひきざん',          1,  10, 1,  10, 10, 60],
  ['sub', 2, '2けた − 1けた',             10, 99, 1,  9, 10, 90],
  ['sub', 3, '2けた − 2けた',             10, 99, 10, 99, 10, 120],
  ['mul', 1, 'くく 1〜5のだん',            1,  5,  1,  9, 10, 60],
  ['mul', 2, 'くく ぜんぶ',               1,  9,  1,  9, 10, 60],
  ['mul', 3, '2けた × 1けた',             11, 19, 2,  9, 10, 120],
  ['div', 1, 'わりざん 1〜5でわる',         1,  9,  1,  5, 10, 60],
  ['div', 2, 'わりざん 1〜9でわる',         1,  9,  1,  9, 10, 90],
  ['div', 3, 'こたえが 2けたの わりざん',    10, 19, 2,  9, 10, 120]
];

// ===== エントリポイント =====

function doGet(e) {
  var params = (e && e.parameter) || {};
  // action なし → ゲーム画面を返す（GAS の URL をそのままスマホで開ける）
  if (!params.action) {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('さんすうアドベンチャー')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return createJsonResponse(handleAction(params.action, params));
}

// HtmlService 配信時に google.script.run から呼ばれる
function apiRun(action, params) {
  return handleAction(action, params || {});
}

function handleAction(action, params) {
  try {
    switch (action) {
      case 'getConfig':  return { success: true, settings: getSettings(), players: getPlayers() };
      case 'addPlayer':  return addPlayer(params);
      case 'saveResult': return saveResult(params);
      case 'getRanking': return { success: true, ranking: getRanking(params.op, params.level, params.mode) };
      case 'getBest':    return { success: true, best: getBest(params.player_id) };
      default:           return { success: false, message: '不正なアクション: ' + action };
    }
  } catch (err) {
    return { success: false, message: 'サーバーエラー: ' + err.message };
  }
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 初期設定 =====

function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEETS).forEach(function(name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  var settings = ss.getSheetByName('settings');
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, DEFAULT_SETTINGS.length, DEFAULT_SETTINGS[0].length).setValues(DEFAULT_SETTINGS);
  }
}

// ===== 読み取り =====

function getSettings() {
  return getObjects('settings').map(function(r) {
    return {
      op:             r.op,
      level:          toInt(r.level, 1),
      label:          r.label,
      a_min:          toInt(r.a_min, 1),
      a_max:          toInt(r.a_max, 9),
      b_min:          toInt(r.b_min, 1),
      b_max:          toInt(r.b_max, 9),
      questions:      toInt(r.questions, 10),
      time_limit_sec: toInt(r.time_limit_sec, 60)
    };
  }).filter(function(s) { return s.op; });
}

function getPlayers() {
  return getObjects('players').map(function(r) {
    return { id: String(r.id), name: r.name };
  });
}

function getRanking(op, level, mode) {
  var lv = toInt(level, 0);
  var rows = getObjects('results').filter(function(r) {
    return r.op === op && toInt(r.level, 0) === lv && (!mode || r.mode === mode);
  });
  // プレイヤーごとの最高スコアのみ
  var bestByPlayer = {};
  rows.forEach(function(r) {
    var score = toInt(r.score, 0);
    var cur = bestByPlayer[r.player_id];
    if (!cur || score > cur.score) {
      bestByPlayer[r.player_id] = { name: r.player_name, score: score, stars: toInt(r.stars, 0) };
    }
  });
  return Object.keys(bestByPlayer)
    .map(function(k) { return bestByPlayer[k]; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 5);
}

// プレイヤーの op/level ごとの最高星数（レベル選択画面で表示）
function getBest(playerId) {
  var best = {};
  getObjects('results').forEach(function(r) {
    if (String(r.player_id) !== String(playerId)) return;
    var key = r.op + '_' + r.level;
    best[key] = Math.max(best[key] || 0, toInt(r.stars, 0));
  });
  return best;
}

// ===== 書き込み =====

function addPlayer(params) {
  var name = String(params.name || '').trim().slice(0, 12);
  if (!name) return { success: false, message: 'なまえを いれてね' };
  return withLock(function() {
    var exists = getPlayers().filter(function(p) { return p.name === name; })[0];
    if (exists) return { success: true, player: exists };
    var sheet = getSheet('players');
    var id = String(getNextId(sheet));
    sheet.appendRow([id, name, new Date()]);
    return { success: true, player: { id: id, name: name } };
  });
}

function saveResult(params) {
  var now = new Date();
  var mistakes = [];
  try { mistakes = JSON.parse(params.mistakes || '[]'); } catch (e) { mistakes = []; }
  return withLock(function() {
    getSheet('results').appendRow([
      now, params.player_id, params.player_name, params.op, toInt(params.level, 1), params.mode,
      toInt(params.correct, 0), toInt(params.total, 0), toInt(params.score, 0),
      toInt(params.max_combo, 0), toInt(params.time_sec, 0), toInt(params.stars, 0)
    ]);
    if (mistakes.length) {
      var rows = mistakes.slice(0, 50).map(function(m) {
        // 先頭が = 等の場合に数式として解釈されないよう文字列化
        return [now, params.player_id, params.player_name, params.op, toInt(params.level, 1),
                "'" + m.question, m.answer, m.user_answer];
      });
      var sheet = getSheet('mistakes');
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { success: true };
  });
}

// ===== ユーティリティ =====

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function getSheet(sheetName) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error('シートが見つかりません: ' + sheetName + '（setup() を実行してください）');
  return sheet;
}

function getObjects(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values.shift().map(function(h) { return String(h).trim(); });
  return values.map(function(row) {
    var obj = {};
    headers.forEach(function(key, i) {
      obj[key] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] === null ? '' : row[i]);
    });
    return obj;
  });
}

function getNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var lastId = sheet.getRange(lastRow, 1).getValue();
  return (parseInt(lastId, 10) || 0) + 1;
}

function toInt(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}
