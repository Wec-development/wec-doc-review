import { describe, expect, it } from 'vitest';
import { orderByFieldDefinitions } from './field-order.js';

describe('orderByFieldDefinitions', () => {
  it('orders values by the shared field definitions for the document type', () => {
    const values = [{ field: 'total_amount' }, { field: 'invoice_number' }, { field: 'due_date' }];
    expect(orderByFieldDefinitions('invoice', values).map((v) => v.field)).toEqual([
      'invoice_number',
      'due_date',
      'total_amount',
    ]);
  });

  it('puts fields the definitions do not know last, alphabetically', () => {
    const values = [{ field: 'zeta' }, { field: 'alpha' }, { field: 'tenant_name' }];
    expect(orderByFieldDefinitions('lease', values).map((v) => v.field)).toEqual([
      'tenant_name',
      'alpha',
      'zeta',
    ]);
  });
});
