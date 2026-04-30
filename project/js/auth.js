/**
 * auth.js
 * 役割：ログイン・ユーザー管理
 * - ログイン画面のフォーム処理（index.html）
 * - sessionStorage へのユーザー情報の保存・取得・削除
 * - ダッシュボードのアクセス制御（未ログイン時はログイン画面へリダイレクト）
 */

// sessionStorage のキー名
const SESSION_KEY = 'pamphlet_user';

// ============================================================
// セッション管理
// ============================================================

/**
 * ログイン中のユーザー情報を sessionStorage に保存する
 * @param {Object} user - { id, name } など GAS から返ったユーザー情報
 */
function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/**
 * ログイン中のユーザー情報を取得する
 * @returns {Object|null} ユーザー情報。未ログインなら null
 */
function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * セッションを削除してログアウトする
 */
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * ログイン済みかどうかを返す
 * @returns {boolean}
 */
function isLoggedIn() {
  return getSession() !== null;
}

// ============================================================
// ログイン画面の初期化（index.html から呼び出す）
// ============================================================

/**
 * index.html のログインフォームを初期化する
 * - 既にログイン済みなら dashboard.html へリダイレクト
 * - フォーム送信時に GAS で認証し、成功時にダッシュボードへ遷移
 */
function initLoginPage() {
  // 既ログイン済みなら即リダイレクト
  if (isLoggedIn()) {
    location.href = 'dashboard.html';
    return;
  }

  const form    = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const errorEl  = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // 簡易バリデーション
    if (!username || !password) {
      showLoginError('ユーザー名とパスワードを入力してください。');
      return;
    }

    // ボタンを無効化してローディング表示
    loginBtn.disabled = true;
    loginBtn.textContent = 'ログイン中...';
    errorEl.textContent = '';

    try {
      const result = await apiLogin(username, password);

      if (result.success) {
        // セッションに保存してダッシュボードへ
        saveSession(result.user);
        location.href = 'dashboard.html';
      } else {
        showLoginError(result.message || 'ユーザー名またはパスワードが正しくありません。');
      }
    } catch (err) {
      console.error('ログインエラー:', err);
      showLoginError('サーバーとの通信に失敗しました。GASのURLを確認してください。');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'ログイン';
    }
  });
}

/**
 * ログインエラーメッセージを表示する
 * @param {string} message
 */
function showLoginError(message) {
  const el = document.getElementById('loginError');
  if (el) el.textContent = message;
}

// ============================================================
// ダッシュボードのアクセス制御（dashboard.html から呼び出す）
// ============================================================

/**
 * ダッシュボードが呼ぶアクセスチェック。
 * 未ログインならログイン画面へ戻す。
 * @returns {Object|null} ログイン中のユーザー情報（未ログインなら null）
 */
function requireLogin() {
  const user = getSession();
  if (!user) {
    location.href = 'index.html';
    return null;
  }
  return user;
}

/**
 * ログアウト処理
 * セッションを削除してログイン画面へリダイレクト
 */
function logout() {
  clearSession();
  location.href = 'index.html';
}
