import type { BankAccount, BankAccountSnapshot } from '@/lib/state/fyll-store';
import { getCountry, normalizeCountry, type CurrencyCode } from '@/lib/locale';

export type BankAccountFieldKey =
  | 'bankName'
  | 'accountName'
  | 'accountNumber'
  | 'routingNumber'
  | 'accountType'
  | 'sortCode'
  | 'swiftCode'
  | 'institutionNumber'
  | 'transitNumber'
  | 'branchCode'
  | 'bankCode'
  | 'bsb'
  | 'ifsc';

export type BankAccountForm = Record<BankAccountFieldKey, string> & {
  countryCode: string;
};

export type BankAccountField = {
  key: BankAccountFieldKey;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  required?: boolean;
  options?: string[];
};

export type BankAccountRegion = {
  countryCode: string;
  countryName: string;
  fields: BankAccountField[];
};

const bank = (label = 'Bank name'): BankAccountField => ({ key: 'bankName', label, placeholder: 'Enter bank name', required: true });
const holder = (label = 'Account holder name'): BankAccountField => ({ key: 'accountName', label, placeholder: 'Name on the account', required: true });
const account = (label = 'Account number', placeholder = 'Enter account number', keyboardType: BankAccountField['keyboardType'] = 'number-pad'): BankAccountField => ({ key: 'accountNumber', label, placeholder, keyboardType, required: true });

const REGION_FIELDS: Record<string, BankAccountField[]> = {
  NG: [bank(), holder('Account name'), account()],
  US: [
    bank(),
    holder(),
    { key: 'routingNumber', label: 'Routing number (ABA)', placeholder: '9-digit routing number', keyboardType: 'number-pad', required: true },
    account(),
    { key: 'accountType', label: 'Account type', placeholder: 'Choose account type', required: true, options: ['Checking', 'Savings'] },
  ],
  CA: [
    bank('Financial institution'),
    holder(),
    { key: 'institutionNumber', label: 'Institution number', placeholder: '3 digits', keyboardType: 'number-pad', required: true },
    { key: 'transitNumber', label: 'Transit number', placeholder: '5 digits', keyboardType: 'number-pad', required: true },
    account(),
  ],
  GB: [bank(), holder(), { key: 'sortCode', label: 'Sort code', placeholder: '00-00-00', required: true }, account()],
  IE: [bank(), holder(), account('IBAN', 'Enter IBAN', 'default'), { key: 'swiftCode', label: 'BIC / SWIFT', placeholder: 'Optional', required: false }],
  DE: [bank(), holder(), account('IBAN', 'Enter IBAN', 'default'), { key: 'swiftCode', label: 'BIC / SWIFT', placeholder: 'Optional', required: false }],
  FR: [bank(), holder(), account('IBAN', 'Enter IBAN', 'default'), { key: 'swiftCode', label: 'BIC / SWIFT', placeholder: 'Optional', required: false }],
  GH: [bank(), holder('Account name'), account()],
  KE: [bank(), holder(), account(), { key: 'bankCode', label: 'Bank code', placeholder: 'Optional', required: false }, { key: 'branchCode', label: 'Branch code', placeholder: 'Optional', required: false }],
  ZA: [bank(), holder(), { key: 'branchCode', label: 'Branch code', placeholder: 'Enter branch code', keyboardType: 'number-pad', required: true }, account()],
  AU: [bank(), holder(), { key: 'bsb', label: 'BSB', placeholder: '000-000', required: true }, account()],
  PH: [bank(), holder(), account(), { key: 'swiftCode', label: 'SWIFT code', placeholder: 'Optional', required: false }],
  IN: [bank(), holder(), account(), { key: 'ifsc', label: 'IFSC code', placeholder: 'e.g. HDFC0001234', required: true }],
  AE: [bank(), holder(), account('IBAN', 'Enter IBAN', 'default'), { key: 'swiftCode', label: 'SWIFT code', placeholder: 'Enter SWIFT code', required: true }],
};

const ALL_FIELD_KEYS: BankAccountFieldKey[] = [
  'bankName', 'accountName', 'accountNumber', 'routingNumber', 'accountType', 'sortCode',
  'swiftCode', 'institutionNumber', 'transitNumber', 'branchCode', 'bankCode', 'bsb', 'ifsc',
];

export const emptyBankAccountForm = (countryCode: string): BankAccountForm => ({
  countryCode: normalizeCountry(countryCode),
  bankName: '',
  accountName: '',
  accountNumber: '',
  routingNumber: '',
  accountType: '',
  sortCode: '',
  swiftCode: '',
  institutionNumber: '',
  transitNumber: '',
  branchCode: '',
  bankCode: '',
  bsb: '',
  ifsc: '',
});

export const getBankAccountRegion = (countryCode: string): BankAccountRegion => {
  const country = getCountry(normalizeCountry(countryCode));
  return {
    countryCode: country.code,
    countryName: country.name,
    fields: REGION_FIELDS[country.code] ?? [bank(), holder(), account('Account number / IBAN', 'Enter account identifier', 'default'), { key: 'swiftCode', label: 'SWIFT code', placeholder: 'Optional', required: false }],
  };
};

export const bankAccountToForm = (account: BankAccount, fallbackCountryCode: string): BankAccountForm => {
  const form = emptyBankAccountForm(account.countryCode ?? fallbackCountryCode);
  ALL_FIELD_KEYS.forEach((key) => {
    form[key] = account[key] ?? '';
  });
  return form;
};

export const bankAccountFormIsComplete = (form: BankAccountForm) => (
  getBankAccountRegion(form.countryCode).fields
    .filter((field) => field.required !== false)
    .every((field) => form[field.key].trim().length > 0)
);

export const bankAccountFromForm = ({
  id,
  form,
  currency,
  isDefault,
}: {
  id: string;
  form: BankAccountForm;
  currency: CurrencyCode;
  isDefault?: boolean;
}): BankAccount => {
  const account: BankAccount = {
    id,
    countryCode: normalizeCountry(form.countryCode),
    currency,
    bankName: form.bankName.trim(),
    accountName: form.accountName.trim(),
    accountNumber: form.accountNumber.trim(),
    isDefault,
  };
  ALL_FIELD_KEYS.forEach((key) => {
    if (key === 'bankName' || key === 'accountName' || key === 'accountNumber') return;
    const value = form[key].trim();
    if (value) account[key] = value;
  });
  return account;
};

export const getBankAccountTransferFields = (account: Pick<BankAccount, BankAccountFieldKey | 'countryCode'>) => {
  const region = getBankAccountRegion(account.countryCode ?? 'NG');
  return region.fields
    .filter((field) => field.key !== 'bankName' && field.key !== 'accountName')
    .map((field) => ({ label: field.label, value: account[field.key]?.trim() ?? '' }))
    .filter((field) => field.value);
};

export const bankAccountSnapshot = (account: BankAccount): BankAccountSnapshot => {
  const { id: _id, isDefault: _isDefault, fyllPayQr: _fyllPayQr, ...snapshot } = account;
  return snapshot;
};
