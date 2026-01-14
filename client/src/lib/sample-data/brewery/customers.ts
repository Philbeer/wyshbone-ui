/**
 * Sample brewery customer data
 * Realistic pub and bar data for UK brewery customers
 */

export const breweryCustomers = [
  {
    name: "The Swan & Feather",
    type: "Freehouse",
    addressLine1: "42 North Street",
    city: "Brighton",
    postcode: "BN1 1EB",
    accountStatus: "active" as const,
    deliveryNotes: "Ring bell at side door. Cellar access through kitchen.",
  },
  {
    name: "Hop & Barrel",
    type: "Micropub",
    addressLine1: "15 Castle Street",
    city: "Canterbury",
    postcode: "CT1 2QD",
    accountStatus: "active" as const,
    deliveryNotes: "Delivery Tuesdays only. Limited cellar space.",
  },
  {
    name: "Railway Arms",
    type: "Pubco - Greene King",
    addressLine1: "Station Road",
    city: "London",
    postcode: "SE1 8SW",
    accountStatus: "active" as const,
    deliveryNotes: "Contact manager before delivery. Loading bay at rear.",
  },
  {
    name: "The Crafty Fox",
    type: "Freehouse",
    addressLine1: "78 High Street",
    city: "Lewes",
    postcode: "BN7 2DD",
    accountStatus: "active" as const,
    deliveryNotes: "Rotating guest ales. Premium positioning.",
  },
  {
    name: "Old Market Tavern",
    type: "Freehouse",
    addressLine1: "23 Market Square",
    city: "Horsham",
    postcode: "RH12 1EU",
    accountStatus: "on_hold" as const,
    deliveryNotes: "Payment terms under review. Credit hold.",
  },
];
