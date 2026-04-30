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
    action:   'stockOut',
    item_id:  payload.item_id,
    quantity: payload.quantity,
    event:    payload.event,
    memo:     payload.memo || '',
    date:     payload.date,
    user:     payload.user,
  });
}
