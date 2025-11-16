import { API } from 'homebridge';
import { fetchSipAccounts, formatSipPeer, getSipAccountDisplayName, fetchDirectoryPeers } from './schemaService';

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
   * Endpoint to fetch directory peers for dynamic UI
   * This can be called by custom UI elements
   */
  static async getDirectoryPeersEndpoint(
    host: string,
    user: string,
    pass: string,
    protocol: string = 'https',
    verifySSL: boolean = false,
  ): Promise<Array<{ value: string; label: string }>> {
    const peers = await fetchDirectoryPeers(host, user, pass, protocol, verifySSL);
    
    const options = [
      { value: '', label: '📞 All phone numbers - Ring for any incoming call' },
    ];

    peers.forEach(peer => {
      const phoneNumber = peer.peer.split('/')[0];
      const label = `📱 ${phoneNumber} - ${peer.name}`;
      options.push({ value: peer.peer, label });
    });

    return options;
  }
}
