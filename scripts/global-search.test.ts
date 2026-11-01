import { describe, expect, test } from 'bun:test';
import { searchEverything, SEARCH_LIMITS } from '../src/lib/global-search';

const orders = [
  { id: 'o1', orderNumber: 'ORD-519626', customerName: 'Tayo Sarumi', customerPhone: '+234 701 110 0001', status: 'Delivered', createdAt: '2026-07-31T10:00:00Z' },
  { id: 'o2', orderNumber: 'ORD-080918', customerName: 'Bruno Bernard', customerPhone: '08012345678', status: 'Processing', createdAt: '2026-08-02T10:00:00Z' },
  { id: 'o3', orderNumber: 'ORD-519700', customerName: 'Ada Obi', status: 'Processing', createdAt: '2026-08-05T10:00:00Z' },
];
const customers = [
  { id: 'c1', fullName: 'Tayo Sarumi', phone: '+2347011100001', email: 'tayo@example.com' },
  { id: 'c2', fullName: 'Bruno Bernard', phone: '08012345678', email: 'bruno@example.com' },
];
const products = [
  { id: 'p1', name: 'Amina Cat Eye', categories: ['Optical'], variants: [{ sku: 'AMINA-BLACK' }, { sku: 'AMINA-TORTOISE' }] },
  { id: 'p2', name: 'Atlas Aviator', categories: ['Sunglasses'], variants: [{ sku: 'ATLAS-GOLD' }] },
];
const pages = [
  { label: 'Finance', description: 'Revenue, expenses, refunds', keywords: 'finance revenue expenses' },
  { label: 'Customers', description: 'Customer profiles and history', keywords: 'customers contacts' },
];
const run = (query: string) => searchEverything({ query, orders, customers, products, pages });

describe('global search', () => {
  test('an empty query returns nothing', () => {
    expect(run('').total).toBe(0);
    expect(run('   ').total).toBe(0);
  });

  test('finds an order by a part of its number, with or without the #', () => {
    expect(run('519626').orders.map((order) => order.id)).toEqual(['o1']);
    expect(run('#ORD-0809').orders.map((order) => order.id)).toEqual(['o2']);
  });

  test('order numbers that share a prefix come back newest first', () => {
    expect(run('ord-519').orders.map((order) => order.id)).toEqual(['o3', 'o1']);
  });

  test('finds orders and customers by name, whatever the letter case', () => {
    const result = run('SARUMI');
    expect(result.orders.map((order) => order.id)).toEqual(['o1']);
    expect(result.customers.map((customer) => customer.id)).toEqual(['c1']);
  });

  test('finds a phone number however it is typed', () => {
    expect(run('701 110 0001').customers.map((customer) => customer.id)).toEqual(['c1']);
    expect(run('0801234').customers.map((customer) => customer.id)).toEqual(['c2']);
    expect(run('0801234').orders.map((order) => order.id)).toEqual(['o2']);
  });

  test('finds products by name, SKU and category', () => {
    expect(run('amina').products.map((product) => product.id)).toEqual(['p1']);
    expect(run('atlas-gold').products.map((product) => product.id)).toEqual(['p2']);
    expect(run('sunglasses').products.map((product) => product.id)).toEqual(['p2']);
  });

  test('finds pages by name and keyword', () => {
    expect(run('fin').pages.map((page) => page.label)).toEqual(['Finance']);
    expect(run('contacts').pages.map((page) => page.label)).toEqual(['Customers']);
  });

  test('each group is capped', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, orderNumber: `ORD-1000${index}`, customerName: 'Same Name' }));
    expect(searchEverything({ query: 'same', orders: many, customers: [], products: [], pages: [] }).orders).toHaveLength(SEARCH_LIMITS.orders);
  });

  test('a query that matches nothing returns an empty result', () => {
    expect(run('zzzzzz').total).toBe(0);
  });
});
