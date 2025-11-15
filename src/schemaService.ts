import axios from 'axios';
import https from 'https';

export interface SipAccount {
  account: number;
  enabled: boolean;
  displayName: string;
  sipNumber: string;
  domain: string;
  domainPort: number | string;
  proxyPort: number | string;
}

export interface PhoneConfigResponse {
  success: boolean;
  result: {
    accounts: SipAccount[];
  };
}

/**
 * Fetch SIP accounts from the 2N intercom
 */
export async function fetchSipAccounts(
  host: string,
  user: string,
  pass: string,
  protocol: string = 'https',
  verifySSL: boolean = false,
): Promise<SipAccount[]> {
  try {
    const url = `${protocol}://${host}/api/phone/config`;
    
    const config = {
      auth: {
        username: user,
        password: pass,
      },
      timeout: 10000,
      httpsAgent: undefined as https.Agent | undefined,
    };

    // Configure SSL behavior
    if (!verifySSL) {
      config.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    const response = await axios.get<PhoneConfigResponse>(url, config);

    if (response.data && response.data.success && response.data.result?.accounts) {
      // Filter only enabled accounts
      return response.data.result.accounts.filter(account => account.enabled);
    }

    return [];
  } catch (error) {
    console.error('Error fetching SIP accounts:', error);
    return [];
  }
}

/**
 * Format SIP account as a peer string
 */
export function formatSipPeer(account: SipAccount): string {
  const port = account.proxyPort || account.domainPort || '';
  const portStr = port ? `:${port}` : '';
  return `sip:${account.sipNumber}@${account.domain}${portStr}`;
}

/**
 * Get display name for SIP account
 */
export function getSipAccountDisplayName(account: SipAccount): string {
  if (account.displayName) {
    return `${account.displayName} (${account.sipNumber})`;
  }
  return `${account.sipNumber}@${account.domain}`;
}
