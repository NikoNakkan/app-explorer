import { expect, type Page } from '@playwright/test';

// Appian's standard login page uses the field ids `un` and `pw` (FitNesse for Appian's setup step);
// labels are localised ("Username"/"Password", "Όνομα χρήστη"/"Κωδικός"). We try the ids first, then labels.
// SSO/SAML logins differ: the bootstrap prompt checks the real page and adjusts these.
// Every value below can be overridden in .env.
const USER_FIELD = new RegExp(process.env.LOGIN_USER_LABEL ?? 'χρήστη|χρηστη|username|user|email', 'i');
const PASS_FIELD = new RegExp(process.env.LOGIN_PASS_LABEL ?? 'κωδικ|password|pass', 'i');
const SUBMIT = new RegExp(process.env.LOGIN_SUBMIT_LABEL ?? 'σύνδεση|συνδεση|είσοδος|εισοδος|log ?in|sign ?in', 'i');
const LOGIN_PATH = process.env.LOGIN_PATH ?? '/suite/portal/login.jsp';
// Regex that the URL's path and query must NOT match after a successful login (i.e. we left the login page).
// Only the path is checked: a host such as auth-test.example.gr would otherwise match forever.
export const LOGIN_URL_PATTERN = new RegExp(process.env.LOGIN_URL_PATTERN ?? 'login|signin|auth', 'i');
export const onLoginPage = (url: URL): boolean => LOGIN_URL_PATTERN.test(url.pathname + url.search);

export async function login(page: Page, creds: { user: string; pass: string }): Promise<void> {
  await page.goto(LOGIN_PATH);
  await page.locator('#un').or(page.getByLabel(USER_FIELD)).first().fill(creds.user);
  await page.locator('#pw').or(page.getByLabel(PASS_FIELD)).first().fill(creds.pass);
  await page
    .getByRole('button', { name: SUBMIT })
    .or(page.locator('input[type="submit"]'))
    .first()
    .click();
  await expect(page).not.toHaveURL(onLoginPage, { timeout: 30_000 });
}
