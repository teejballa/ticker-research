/**
 * Canonical site identity. Single source of truth for the production domain,
 * operator/contact details, and the legal "last updated" date so SEO metadata
 * and the legal pages can never drift apart.
 *
 * Canonical domain is ciphersearch.app (the production alias). The previous
 * cipher.tools references were retired 2026-05-25.
 */
export const SITE_NAME = 'Cipher';
export const SITE_HOST = 'ciphersearch.app';
export const SITE_URL = 'https://ciphersearch.app';

/** Legal operator + contact, used verbatim in the policy pages. */
export const OPERATOR = 'TJ Walsh';
export const CONTACT_EMAIL = 'tjameswalsh@icloud.com';
export const JURISDICTION = 'the State of California, United States';

/** Bump when any legal page's substance changes. Shown as "Last updated". */
export const LEGAL_LAST_UPDATED = 'May 25, 2026';
