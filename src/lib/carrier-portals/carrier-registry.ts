/**
 * Centralized Carrier Definitions & Registry for SmarTrack Carrier Portals.
 * Source of truth for supported carriers, adapter availability, and UI metadata.
 */

export interface CarrierDefinition {
  id: string;
  displayName: string;
  shortName: string;
  logoLetter: string;
  gradient: string;
  supported: boolean;
  adapterAvailable: boolean;
  description: string;
}

export const CARRIER_REGISTRY: CarrierDefinition[] = [
  {
    id: 'oscar',
    displayName: 'Oscar Health',
    shortName: 'Oscar',
    logoLetter: 'O',
    gradient: 'from-blue-600 to-indigo-700',
    supported: true,
    adapterAvailable: true,
    description: 'Individual & ACA Book • Playwright Automated Portal Sync & CSV Importer Ready',
  },
  {
    id: 'ambetter',
    displayName: 'Ambetter Health',
    shortName: 'Ambetter',
    logoLetter: 'A',
    gradient: 'from-emerald-600 to-teal-700',
    supported: true,
    adapterAvailable: false,
    description: 'Individual ACA & Marketbook • Multi-carrier automated sync adapter ready for onboarding',
  },
  {
    id: 'molina',
    displayName: 'Molina Healthcare',
    shortName: 'Molina',
    logoLetter: 'M',
    gradient: 'from-purple-600 to-indigo-800',
    supported: true,
    adapterAvailable: false,
    description: 'Marketplace & Medicaid Carrier • Automated portal sync integration',
  },
  {
    id: 'florida_blue',
    displayName: 'Florida Blue',
    shortName: 'Florida Blue',
    logoLetter: 'FB',
    gradient: 'from-sky-600 to-blue-800',
    supported: true,
    adapterAvailable: false,
    description: 'Blue Cross Blue Shield Florida • Individual & ACA broker portal sync',
  },
  {
    id: 'aetna',
    displayName: 'Aetna CVS Health',
    shortName: 'Aetna',
    logoLetter: 'Ae',
    gradient: 'from-rose-600 to-red-700',
    supported: true,
    adapterAvailable: false,
    description: 'ACA Marketplace & Individual Book • Portal integration ready',
  },
  {
    id: 'uhc',
    displayName: 'UnitedHealthcare',
    shortName: 'UHC',
    logoLetter: 'U',
    gradient: 'from-amber-600 to-orange-700',
    supported: true,
    adapterAvailable: false,
    description: 'UHC Individual & ACA Broker Portal • Automated connection adapter',
  },
  {
    id: 'cigna',
    displayName: 'Cigna Healthcare',
    shortName: 'Cigna',
    logoLetter: 'C',
    gradient: 'from-teal-600 to-cyan-800',
    supported: true,
    adapterAvailable: false,
    description: 'Individual Health Plans & ACA Book • Broker portal sync adapter',
  },
  {
    id: 'humana',
    displayName: 'Humana',
    shortName: 'Humana',
    logoLetter: 'H',
    gradient: 'from-lime-600 to-emerald-700',
    supported: true,
    adapterAvailable: false,
    description: 'Medicare & ACA Marketplace • Broker portal sync adapter',
  },
];

export function getCarrierDefinition(carrierId: string): CarrierDefinition | undefined {
  if (!carrierId) return undefined;
  return CARRIER_REGISTRY.find((c) => c.id.toLowerCase() === carrierId.toLowerCase());
}
