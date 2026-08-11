export const COMMERCIAL_LINES_OF_BUSINESS = [
  "Auto (Commercial)",
  "Bond",
  "Builders Risk",
  "Business Owners",
  "Commercial Package",
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
  "Comprehensive Personal Liability",
  "Condominium",
  "Dwelling Fire",
  "Excess Flood",
  "Fine Arts",
  "Flood",
  "Homeowners",
  "Inland Marine (Personal)",
  "Jewelry",
  "Liability Gap",
  "Mobile Home",
  "Motorcycle",
  "Notary Bond",
  "Renters / HO4",
  "Scheduled Watches Policy",
  "Specialty a la Carte Homeowners Coverages",
  "Travel Trailer",
  "Umbrella (Personal)",
  "Vacant Property",
  "Watercraft (Small Boat)",
  "Wind Only Policy",
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
