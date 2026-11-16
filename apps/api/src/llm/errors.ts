import { DomainError } from '../errors.js';

/** The provider rejected the key (401/403) or the key format is wrong for the provider. */
export class InvalidApiKeyError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'INVALID_API_KEY';
}

/** Network failure, timeout or 5xx from the provider: worth trying again. */
export class ProviderUnavailableError extends DomainError {
  readonly statusCode = 502;
  readonly code = 'PROVIDER_UNAVAILABLE';

  constructor() {
    super('Provider unreachable — try again');
  }
}
