/**
 * api.js
 * 役割：Google Apps Script（GAS）との通信処理
 */

const GAS_URL = "https://script.google.com/macros/s/AKfycbwtfdEZr5hc1bFhBUDLzt_FBIk3CW0wTS9PPsqWFTrqy0RZmZzD8aDkI3782VcBYsP1/exec";

async function gasGet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${GAS_URL}?${query}`;
  const res = await fetch(url, { method: 'GET', mode: 'cors' });
  if (!res.ok) throw new Error(`GAS GET エラー: ${res.status}`);
  return await res.json();
}

async function apiLogin(username, password) {
  return gasGet({ action: 'login', username, password });
}

async function apiFetchItems() {
  return gasGet({ action: 'getItems' });
}

async function apiFetchTransactions() {
  return gasGet({ action: 'getTransactions' });
}

async function apiStockIn(payload) {
  return gasGet({
    action:   'stockIn',
    item_id:  payload.item_id,
    quantity: payload.quantity,
    memo:     payload.memo || '',
    date:     payload.date,
    user:     payload.user,
  });
}

async function apiStockOut(payload) {
  return gasGet({
    action:   'stockOu
