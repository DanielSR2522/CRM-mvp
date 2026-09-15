import { StructuredExtractionResult } from '@/types/commissions';

export interface IVisionExtractionProvider {
  name: string;
  isAvailable(): boolean;
  extract(fileBuffer: Buffer, mimeType: string, filename: string): Promise<StructuredExtractionResult>;
}
