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
  /** One line telling the extractor what the field means (sent to the LLM in the prompt). */
  description: string;
}

export const EXPECTED_FIELDS: Record<DocumentType, readonly FieldDefinition[]> = {
  invoice: [
    {
      field: 'invoice_number',
      type: 'string',
      description: 'The identifier of this invoice as printed on it.',
    },
    { field: 'issue_date', type: 'date', description: 'The date the invoice was issued.' },
    { field: 'due_date', type: 'date', description: 'The date by which payment is due.' },
    {
      field: 'vendor_name',
      type: 'string',
      description: 'The company that issued the invoice (the seller), not the customer billed.',
    },
    {
      field: 'total_amount',
      type: 'money',
      description: 'The final total amount due, including tax; not the subtotal or the tax line.',
    },
  ],
  lease: [
    {
      field: 'tenant_name',
      type: 'string',
      description: 'The name of the tenant, not the landlord.',
    },
    {
      field: 'monthly_rent',
      type: 'money',
      description: 'The recurring monthly rent; not late charges, deposits or other fees.',
    },
    { field: 'security_deposit', type: 'money', description: 'The security deposit amount.' },
    {
      field: 'lease_start',
      type: 'date',
      description: 'The date the lease term begins (its commencement date).',
    },
    {
      field: 'term_months',
      type: 'number',
      description: 'The length of the initial lease term, in months.',
    },
  ],
  market_report: [
    {
      field: 'report_quarter',
      type: 'string',
      description: 'The reporting period the report covers, e.g. a quarter and year.',
    },
    {
      field: 'market_area',
      type: 'string',
      description: 'The geographic market or submarket the report covers.',
    },
    {
      field: 'vacancy_rate',
      type: 'percent',
      description: 'The overall vacancy rate for the current reporting period, not a prior one.',
    },
    {
      field: 'average_rent_1br',
      type: 'money',
      description: 'The average monthly rent for a one-bedroom unit.',
    },
    {
      field: 'year_over_year_rent_growth',
      type: 'percent',
      description: 'The year-over-year change in rent, as a percentage.',
    },
    {
      field: 'median_household_income',
      type: 'money',
      description: 'The median household income for the market area.',
    },
  ],
};
