import { createUser, getCartTotal } from './service.js';

export function registerUser(data) {
  return createUser(data.firstName, data.lastName, data.email);
}

export function checkout(cart) {
  return getCartTotal(cart.items);
}
