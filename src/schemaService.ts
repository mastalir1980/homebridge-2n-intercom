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
  logger?: { debug: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void },
): Promise<SipAccount[]> {
  try {
    const url = `${protocol}://${host}/api/phone/config`;
    
    if (logger) {
      logger.debug(`[SIP Discovery] Starting fetch from: ${url}`);
      logger.debug(`[SIP Discovery] Using authentication: ${user} / *** (password hidden)`);
      logger.debug(`[SIP Discovery] SSL verification: ${verifySSL ? 'enabled' : 'disabled'}`);
    }
    
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
      if (logger) {
        logger.debug('[SIP Discovery] Created HTTPS agent with SSL verification disabled');
      }
    }

    if (logger) {
      logger.debug('[SIP Discovery] Sending GET request to intercom...');
    }

    const response = await axios.get<PhoneConfigResponse>(url, config);

    if (logger) {
      logger.debug(`[SIP Discovery] Response received with status: ${response.status}`);
      logger.debug(`[SIP Discovery] Response data success: ${response.data?.success}`);
      logger.debug(`[SIP Discovery] Response has accounts: ${!!response.data?.result?.accounts}`);
      logger.debug(`[SIP Discovery] Total accounts in response: ${response.data?.result?.accounts?.length || 0}`);
    }

    if (response.data && response.data.success && response.data.result?.accounts) {
      const allAccounts = response.data.result.accounts;
      
      if (logger) {
        logger.debug('[SIP Discovery] Processing accounts:');
        allAccounts.forEach((account: SipAccount, idx: number) => {
          logger.debug(`  Account ${idx + 1}: ${account.displayName || 'No name'} (${account.sipNumber || 'No number'}) - Enabled: ${account.enabled}`);
        });
      }
      
      // Filter only enabled accounts
      const enabledAccounts = allAccounts.filter((account: SipAccount) => account.enabled);
      
      if (logger) {
        logger.debug(`[SIP Discovery] Filtered ${enabledAccounts.length} enabled account(s) from ${allAccounts.length} total`);
      }
      
      return enabledAccounts;
    }

    if (logger) {
      logger.debug('[SIP Discovery] Response validation failed - no valid accounts data');
    }

    return [];
  } catch (error) {
    if (logger) {
      if (axios.isAxiosError(error)) {
        logger.error('[SIP Discovery] HTTP request failed:', error.message);
        if (error.response) {
          logger.error(`[SIP Discovery] Response status: ${error.response.status}`);
          logger.error(`[SIP Discovery] Response data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          logger.error('[SIP Discovery] No response received from intercom');
          logger.error('[SIP Discovery] Check network connectivity and intercom IP address');
        } else {
          logger.error(`[SIP Discovery] Request setup failed: ${error.message}`);
        }
      } else {
        logger.error('[SIP Discovery] Unexpected error:', error);
      }
    }
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
