import { formatName, calculateTotal } from './utils.js';
import { User, Product } from './models.js';

export function createUser(firstName, lastName, email) {
  const name = formatName(firstName, lastName);
  return new User(firstName, lastName, email);
}

export function getCartTotal(items) {
  return calculateTotal(items);
}

export function createProduct(name, price) {
  return new Product(name, price);
}
