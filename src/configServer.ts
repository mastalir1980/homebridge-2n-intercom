import { API } from 'homebridge';
import { fetchSipAccounts, formatSipPeer, getSipAccountDisplayName } from './schemaService';

/**
 * This class provides custom endpoints for the Homebridge Config UI
 * to fetch dynamic data like SIP accounts
 */
export class ConfigUIServer {
  constructor(private api: API) {
    // Future: Setup custom UI endpoints if needed
    this.setupCustomUI();
  }

  private setupCustomUI(): void {
    // This would register custom UI endpoints
    // Note: This is an advanced feature and requires homebridge-config-ui-x
    try {
      // Future: Register custom endpoints here if needed
    } catch (error) {
      // Config UI X not available, that's okay
    }
  }

  /**
   * Endpoint to fetch SIP accounts
   * This can be called by custom UI elements
   */
  static async getSipAccountsEndpoint(
    host: string,
    user: string,
    pass: string,
    protocol: string = 'https',
    verifySSL: boolean = false,
  ): Promise<Array<{ value: string; label: string }>> {
    const accounts = await fetchSipAccounts(host, user, pass, protocol, verifySSL);
    
    const options = [
      { value: '', label: 'All Users (Respond to all calls)' },
    ];

    accounts.forEach(account => {
      const peer = formatSipPeer(account);
      const label = getSipAccountDisplayName(account);
      options.push({ value: peer, label });
    });

    options.push({ value: 'custom', label: 'Custom SIP Peer (Manual Entry)' });

    return options;
  }
}
