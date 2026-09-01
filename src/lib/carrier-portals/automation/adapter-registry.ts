import { CarrierAutomationAdapter } from './carrier-adapter.interface';
import { oscarAutomationAdapter } from './adapters/oscar.adapter';
import { AmbetterAutomationAdapter } from './adapters/ambetter.adapter';

class AdapterRegistry {
  private adapters = new Map<string, CarrierAutomationAdapter>();

  constructor() {
    this.register(oscarAutomationAdapter);
    this.register(new AmbetterAutomationAdapter());
  }

  register(adapter: CarrierAutomationAdapter) {
    this.adapters.set(adapter.carrier.toLowerCase(), adapter);
  }

  getAdapter(carrier: string): CarrierAutomationAdapter | undefined {
    return this.adapters.get(carrier.toLowerCase());
  }

  hasAdapter(carrier: string): boolean {
    return this.adapters.has(carrier.toLowerCase());
  }
}

export const adapterRegistry = new AdapterRegistry();
