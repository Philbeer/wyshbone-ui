/**
 * Sample generic B2B customer data
 * Diverse business customers across industries
 */

export const genericCustomers = [
  {
    name: "Acme Manufacturing Ltd",
    addressLine1: "Industrial Estate, Unit 15",
    city: "Manchester",
    postcode: "M1 5AN",
    accountStatus: "active" as const,
    deliveryNotes: "Loading dock open 8am-4pm weekdays",
  },
  {
    name: "Tech Solutions UK",
    addressLine1: "Innovation Centre, 2nd Floor",
    city: "London",
    postcode: "EC2A 4BX",
    accountStatus: "active" as const,
    deliveryNotes: "Reception desk, ask for procurement team",
  },
  {
    name: "Green Gardens Landscaping",
    addressLine1: "45 Park Lane",
    city: "Bristol",
    postcode: "BS1 3LG",
    accountStatus: "active" as const,
    deliveryNotes: "Yard entrance at rear, ring buzzer",
  },
  {
    name: "Premier Logistics",
    addressLine1: "Warehouse 7, Distribution Park",
    city: "Birmingham",
    postcode: "B5 6QR",
    accountStatus: "active" as const,
    deliveryNotes: "Security gate code: 1234. Bay 3.",
  },
  {
    name: "Coastal Consultants",
    addressLine1: "Marine Building, Suite 200",
    city: "Plymouth",
    postcode: "PL1 2PP",
    accountStatus: "on_hold" as const,
    deliveryNotes: "Payment pending. Hold deliveries.",
  },
];
