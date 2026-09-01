import fs from 'fs';
import path from 'path';

export interface CarrierSessionStore {
  get(agentId: string, carrier: string): Promise<any | null>;
  save(agentId: string, carrier: string, sessionData: any): Promise<void>;
  delete(agentId: string, carrier: string): Promise<void>;
  exists(agentId: string, carrier: string): Promise<boolean>;
  getFilePath(agentId: string, carrier: string): string;
}

/**
 * Local file-based implementation of CarrierSessionStore.
 * Stores Playwright storageState JSON at `.carrier-sessions/<agentId>/<carrier>.json`.
 */
export class LocalCarrierSessionStore implements CarrierSessionStore {
  getFilePath(agentId: string, carrier: string): string {
    const dir = path.resolve(process.cwd(), '.carrier-sessions', agentId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${carrier}.json`);
  }

  async exists(agentId: string, carrier: string): Promise<boolean> {
    const filePath = this.getFilePath(agentId, carrier);
    return fs.existsSync(filePath);
  }

  async get(agentId: string, carrier: string): Promise<any | null> {
    const filePath = this.getFilePath(agentId, carrier);
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`[SessionStore] Error reading session file for ${agentId}/${carrier}:`, err);
      return null;
    }
  }

  async save(agentId: string, carrier: string, sessionData: any): Promise<void> {
    const filePath = this.getFilePath(agentId, carrier);
    const content = typeof sessionData === 'string' ? sessionData : JSON.stringify(sessionData, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
  }

  async delete(agentId: string, carrier: string): Promise<void> {
    const filePath = this.getFilePath(agentId, carrier);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`[SessionStore] Error deleting session file for ${agentId}/${carrier}:`, err);
      }
    }
  }
}

export const defaultSessionStore: CarrierSessionStore = new LocalCarrierSessionStore();
