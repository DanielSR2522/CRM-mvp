export const COMMERCIAL_LINES_OF_BUSINESS = [
  "Commercial Package",
  "Auto (Commercial)",
  "Bond",
  "Business Owners",
  "Commercial Property",
  "Crime",
  "Cyber Liability",
  "Directors and Officers",
  "Equipment Breakdown",
  "Errors & Emissions",
  "Event Liability",
  "Excess Liability",
  "Garage & Dealers",
  "General Liability",
  "Inland Marine (Commercial)",
  "Builders Risk",
  "Lessor's Risk",
  "Liquor Liability",
  "Malpractice",
  "Miscellaneous Professional Liability",
  "Motor Truck Cargo",
  "Ocean Marine (Commercial)",
  "Truckers",
  "Umbrella (Commercial)",
  "Workers Compensation"
];

export const PERSONAL_LINES_OF_BUSINESS = [
  "Auto (Personal)",
  "Homeowners",
  "Comprehensive Personal Liability",
  "Condominium",
  "Dwelling Fire",
  "Excess Flood",
  "Fine Arts",
  "Jewelry",
  "Flood",
  "Inland Marine (Personal)",
  "Liability Gap",
  "Specialty a la Carte Homeowners Coverages",
  "Mobile Home",
  "Motorcycle",
  "Notary Bond",
  "Renters / HO4",
  "Umbrella (Personal)",
  "Vacant Property",
  "Wind Only Policy",
  "Scheduled Watches Policy",
  "Travel Trailer",
  "Watercraft (Small Boat)",
  "Yacht"
];

export const LINES_OF_BUSINESS = [
  ...COMMERCIAL_LINES_OF_BUSINESS,
  ...PERSONAL_LINES_OF_BUSINESS
];

// Compile-time or load-time length safety check
if (LINES_OF_BUSINESS.length !== 48) {
  throw new Error(`Lines of Business array must contain exactly 48 options. Current length: ${LINES_OF_BUSINESS.length}`);
}
