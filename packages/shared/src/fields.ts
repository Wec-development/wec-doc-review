/**
 * Fields to extract per document type.
 * Mirrors fixtures/expected-fields.json so both the API and the web app share one source of truth.
 */
export const DOCUMENT_TYPES = ['invoice', 'lease', 'market_report'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const FIELD_KINDS = ['string', 'date', 'money', 'number', 'percent'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldDefinition {
  field: string;
  type: FieldKind;
}

export const EXPECTED_FIELDS: Record<DocumentType, readonly FieldDefinition[]> = {
  invoice: [
    { field: 'invoice_number', type: 'string' },
    { field: 'issue_date', type: 'date' },
    { field: 'due_date', type: 'date' },
    { field: 'vendor_name', type: 'string' },
    { field: 'total_amount', type: 'money' },
  ],
  lease: [
    { field: 'tenant_name', type: 'string' },
    { field: 'monthly_rent', type: 'money' },
    { field: 'security_deposit', type: 'money' },
    { field: 'lease_start', type: 'date' },
    { field: 'term_months', type: 'number' },
  ],
  market_report: [
    { field: 'report_quarter', type: 'string' },
    { field: 'market_area', type: 'string' },
    { field: 'vacancy_rate', type: 'percent' },
    { field: 'average_rent_1br', type: 'money' },
    { field: 'year_over_year_rent_growth', type: 'percent' },
    { field: 'median_household_income', type: 'money' },
  ],
};
