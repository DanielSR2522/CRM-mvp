export const LINES_OF_BUSINESS = [
  "Auto (Commercial)",
  "Auto (Personal)",
  "Bond",
  "Builders Risk",
  "Business Owners",
  "Commercial Package",
  "Commercial Property",
  "Comprehensive Personal Liability",
  "Condominium",
  "Crime",
  "Cyber Liability",
  "Directors and Officers",
  "Dwelling Fire",
  "Equipment Breakdown",
  "Errors & Emissions",
  "Event Liability",
  "Excess Flood",
  "Excess Liability",
  "Fine Arts",
  "Flood",
  "Garage & Dealers",
  "General Liability",
  "Homeowners",
  "Inland Marine (Commercial)",
  "Inland Marine (Personal)",
  "Jewelry",
  "Lessor's Risk",
  "Liability Gap",
  "Liquor Liability",
  "Malpractice",
  "Miscellaneous Professional Liability",
  "Mobile Home",
  "Motor Truck Cargo",
  "Motorcycle",
  "Notary Bond",
  "Ocean Marine (Commercial)",
  "Renters / HO4",
  "Scheduled Watches Policy",
  "Specialty a la Carte Homeowners Coverages",
  "Travel Trailer",
  "Truckers",
  "Umbrella (Commercial)",
  "Umbrella (Personal)",
  "Vacant Property",
  "Watercraft (Small Boat)",
  "Wind Only Policy",
  "Workers Compensation",
  "Yacht"
];

// P&C Personal and P&C Commercial expose the identical canonical 48 options
export const COMMERCIAL_LINES_OF_BUSINESS = LINES_OF_BUSINESS;
export const PERSONAL_LINES_OF_BUSINESS = LINES_OF_BUSINESS;

// Compile-time or load-time length safety check
if (LINES_OF_BUSINESS.length !== 48) {
  throw new Error(`Lines of Business array must contain exactly 48 options. Current length: ${LINES_OF_BUSINESS.length}`);
}
