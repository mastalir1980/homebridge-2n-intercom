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

export interface DirectoryUser {
  uuid: string;
  owner: string;
  name: string;
  treepath: string;
  buttons: string;
  callPos: Array<{
    peer: string;
  }>;
  timestamp: number;
}

export interface DirectoryResponse {
  success: boolean;
  result: {
    series: string;
    users: DirectoryUser[];
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
 * Fetch directory button peers from the 2N intercom
 */
export async function fetchDirectoryPeers(
  host: string,
  user: string,
  pass: string,
  protocol: string = 'https',
  verifySSL: boolean = false,
  logger?: { debug: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void },
): Promise<Array<{ name: string; peer: string }>> {
  try {
    const url = `${protocol}://${host}/api/dir/query`;
    
    if (logger) {
      logger.debug(`[Directory Discovery] Starting fetch from: ${url}`);
    }
    
    const config = {
      method: 'POST',
      url: url,
      data: {},
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

    if (logger) {
      logger.debug('[Directory Discovery] Sending POST request to intercom...');
    }

    const response = await axios(config);

    if (logger) {
      logger.debug(`[Directory Discovery] Response received with status: ${response.status}`);
      logger.debug(`[Directory Discovery] Response data:`, JSON.stringify(response.data, null, 2));
    }

    if (response.data && response.data.success && response.data.result?.users) {
      const peers: Array<{ name: string; peer: string }> = [];
      const seenPeers = new Set<string>();

      const addPeer = (peerValue: string, label: string) => {
        if (!peerValue) {
          return;
        }
        const trimmedPeer = peerValue.trim();
        if (!trimmedPeer || seenPeers.has(trimmedPeer)) {
          return;
        }
        seenPeers.add(trimmedPeer);
        peers.push({
          name: label,
          peer: trimmedPeer,
        });
        if (logger) {
          logger.debug(`[Directory Discovery] Found peer: ${trimmedPeer} (${label})`);
        }
      };
      
      response.data.result.users.forEach((directoryUser: DirectoryUser) => {
        const friendlyName = directoryUser.name || directoryUser.owner || 'Directory Button';

        if (Array.isArray(directoryUser.callPos)) {
          directoryUser.callPos.forEach((callPos, index) => {
            const peerValue = (callPos && (callPos as any).peer) || (callPos as any)?.value || '';
            if (peerValue) {
              const label = `${friendlyName} (position ${index + 1})`;
              addPeer(peerValue, label);
            }
          });
        }

        if (directoryUser.buttons) {
          const buttonPeers = extractPeersFromButtons(directoryUser.buttons);
          buttonPeers.forEach((buttonPeer, index) => {
            const label = `${friendlyName} (button ${index + 1})`;
            addPeer(buttonPeer, label);
          });
        }
      });
      
      if (logger) {
        logger.debug(`[Directory Discovery] Total unique peers found: ${peers.length}`);
      }
      
      return peers;
    } else {
      if (logger) {
        logger.debug('[Directory Discovery] No users found in directory response');
      }
      return [];
    }
  } catch (error: any) {
    if (logger) {
      logger.error('[Directory Discovery] Error fetching directory:', error.message || error);
    }
    return [];
  }
}

function extractPeersFromButtons(rawButtons: string): string[] {
  if (!rawButtons || typeof rawButtons !== 'string') {
    return [];
  }

  const normalized = rawButtons.trim();
  if (!normalized) {
    return [];
  }

  const extracted: string[] = [];

  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        extracted.push(trimmed);
      }
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };

  // Try to parse JSON first (buttons may contain serialized arrays)
  try {
    const parsed = JSON.parse(normalized);
    collect(parsed);
  } catch {
    // Fall back to splitting by newline / comma / semicolon
    normalized
      .split(/[\n,;]+/)
      .map(entry => entry.trim())
      .filter(Boolean)
      .forEach(entry => extracted.push(entry));
  }

  return extracted;
}

/**
 * Format a SIP peer address from account information
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
