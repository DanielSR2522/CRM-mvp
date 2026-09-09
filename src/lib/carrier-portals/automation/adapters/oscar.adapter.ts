import fs from 'fs';
import { CarrierAutomationAdapter, CarrierSessionStatus, CarrierSyncPayload } from '../carrier-adapter.interface';
import { validateSession, downloadBookCsv, startInteractiveLogin } from '../oscar-adapter';

export class OscarAutomationAdapter implements CarrierAutomationAdapter {
  readonly carrier = 'oscar';
  readonly supportsSessionReuse = true;

  async validateSession(agentId: string): Promise<CarrierSessionStatus> {
    return validateSession(agentId);
  }

  async startInteractiveLogin(agentId: string): Promise<CarrierSessionStatus> {
    const res = await startInteractiveLogin(agentId);
    return res?.success ? 'connected' : 'error';
  }

  async syncBook(agentId: string): Promise<CarrierSyncPayload> {
    const res = await downloadBookCsv(agentId);
    const filePath = res.downloadPath;
    const csvContent = fs.readFileSync(filePath, 'utf8');

    // Clean up local temp file after loading content
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    return {
      csvContent,
      sourceFilename: filePath,
    };
  }
}

export const oscarAutomationAdapter = new OscarAutomationAdapter();
